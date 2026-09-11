-- Gharpayy Flow OS 10x final invariants.
-- Canonical work tables: draft_batches, draft_batch_items, work_claims.
-- Canonical commercial chain: flow_quotations -> flow_bookings -> flow_checkins.
-- Canonical customer journey stage: leads.current_pipeline_stage.

-- ---------------------------------------------------------------------------
-- 1. One unfinished Draft 30 per operator. Keep newest batch if historic
-- duplicates exist, then release claims tied to abandoned duplicates.
-- ---------------------------------------------------------------------------
with ranked as (
  select id, operator_id,
         row_number() over (partition by operator_id order by created_at desc, id desc) as rn
  from public.draft_batches
  where status='active'
), abandoned as (
  update public.draft_batches d
     set status='abandoned', completed_at=coalesce(completed_at,now())
    from ranked r
   where d.id=r.id and r.rn>1
  returning d.id
)
update public.work_claims wc
   set is_current=false,
       state='released',
       released_at=now(),
       release_reason='duplicate_open_batch_retired',
       updated_at=now()
 where wc.batch_id in (select id from abandoned)
   and wc.is_current=true;

create unique index if not exists draft_batches_one_active_operator_uq
  on public.draft_batches(operator_id) where status='active';

-- ---------------------------------------------------------------------------
-- 2. Draft reservation != live activity lock.
-- reserve_flow_lead() creates a durable reservation (expires_at NULL).
-- claim_flow_lead() activates the same reservation for a 10 minute live lock.
-- An expired active lock falls back to drafted when it belongs to a batch.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_flow_lead(
  _lead_id uuid,
  _operator_id uuid,
  _batch_id uuid,
  _bucket text default 'TODAY',
  _next_action text default null,
  _next_action_at timestamptz default null
) returns public.work_claims
language plpgsql
security definer
set search_path=public
as $$
declare _row public.work_claims;
begin
  -- Direct live claims can expire. Batch claims fall back to reservation.
  update public.work_claims
     set state=case when batch_id is null then 'released' else 'drafted' end,
         is_current=case when batch_id is null then false else true end,
         expires_at=null,
         released_at=case when batch_id is null then now() else released_at end,
         release_reason=case when batch_id is null then coalesce(release_reason,'idle_expired') else release_reason end,
         updated_at=now()
   where lead_id=_lead_id and is_current=true and state='active'
     and expires_at is not null and expires_at<=now();

  select * into _row from public.work_claims
   where lead_id=_lead_id and is_current=true for update;

  if found then
    if _row.operator_id<>_operator_id then
      raise exception 'LEAD_ALREADY_CLAIMED:%',_row.operator_id using errcode='P0001';
    end if;
    update public.work_claims
       set batch_id=coalesce(batch_id,_batch_id),
           bucket=coalesce(_bucket,bucket),
           next_action=coalesce(_next_action,next_action),
           next_action_at=coalesce(_next_action_at,next_action_at),
           -- reserve never turns an existing active claim backwards.
           state=case when state='active' then 'active' else 'drafted' end,
           expires_at=case when state='active' then expires_at else null end,
           updated_at=now()
     where id=_row.id returning * into _row;
    return _row;
  end if;

  insert into public.work_claims(
    lead_id,operator_id,batch_id,state,bucket,is_current,claimed_at,
    last_meaningful_action_at,expires_at,next_action,next_action_at
  ) values(
    _lead_id,_operator_id,_batch_id,'drafted',coalesce(_bucket,'TODAY'),true,now(),
    now(),null,_next_action,_next_action_at
  ) returning * into _row;
  return _row;
end;
$$;

grant execute on function public.reserve_flow_lead(uuid,uuid,uuid,text,text,timestamptz) to authenticated;

create or replace function public.claim_flow_lead(
  _lead_id uuid,
  _operator_id uuid,
  _batch_id uuid default null,
  _bucket text default 'TODAY',
  _ttl_minutes integer default 10,
  _next_action text default null,
  _next_action_at timestamptz default null
) returns public.work_claims
language plpgsql
security definer
set search_path=public
as $$
declare _row public.work_claims;
begin
  update public.work_claims
     set state=case when batch_id is null then 'released' else 'drafted' end,
         is_current=case when batch_id is null then false else true end,
         expires_at=null,
         released_at=case when batch_id is null then now() else released_at end,
         release_reason=case when batch_id is null then coalesce(release_reason,'idle_expired') else release_reason end,
         updated_at=now()
   where lead_id=_lead_id and is_current=true and state='active'
     and expires_at is not null and expires_at<=now();

  select * into _row from public.work_claims
   where lead_id=_lead_id and is_current=true for update;

  if found then
    if _row.operator_id<>_operator_id then
      raise exception 'LEAD_ALREADY_CLAIMED:%',_row.operator_id using errcode='P0001';
    end if;
    update public.work_claims
       set state='active',
           batch_id=coalesce(_batch_id,batch_id),
           bucket=coalesce(_bucket,bucket),
           last_meaningful_action_at=now(),
           expires_at=now()+make_interval(mins=>least(60,greatest(1,_ttl_minutes))),
           next_action=coalesce(_next_action,next_action),
           next_action_at=coalesce(_next_action_at,next_action_at),
           updated_at=now()
     where id=_row.id returning * into _row;
    return _row;
  end if;

  insert into public.work_claims(
    lead_id,operator_id,batch_id,state,bucket,is_current,claimed_at,
    last_meaningful_action_at,expires_at,next_action,next_action_at
  ) values(
    _lead_id,_operator_id,_batch_id,'active',coalesce(_bucket,'TODAY'),true,now(),
    now(),now()+make_interval(mins=>least(60,greatest(1,_ttl_minutes))),_next_action,_next_action_at
  ) returning * into _row;
  return _row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Canonical check-in command. No text/token/stage shortcut can equal
-- CHECKED_IN. Arrival is a hard gate as well as payment/approval/room/KYC/
-- agreement/keys.
-- ---------------------------------------------------------------------------
create or replace function public.flow_confirm_checkin(
  p_checkin_id uuid,
  p_actor_id uuid,
  p_actor_name text
) returns table(ok boolean,reason text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_checkin public.flow_checkins%rowtype;
  v_booking public.flow_bookings%rowtype;
begin
  select * into v_checkin from public.flow_checkins where id=p_checkin_id for update;
  if v_checkin.id is null then return query select false,'check-in record not found'; return; end if;
  select * into v_booking from public.flow_bookings where id=v_checkin.booking_id for update;
  if v_booking.id is null then return query select false,'booking record not found'; return; end if;

  if not v_booking.payment_verified and not (v_checkin.manager_override_by is not null and coalesce(v_checkin.manager_override_reason,'')<>'') then
    return query select false,'payment not verified'; return;
  end if;
  if v_booking.owner_approval_required and not v_booking.owner_approved and not (v_checkin.manager_override_by is not null and coalesce(v_checkin.manager_override_reason,'')<>'') then
    return query select false,'owner approval pending'; return;
  end if;
  if v_checkin.arrived_at is null then return query select false,'arrival not confirmed'; return; end if;
  if not v_checkin.room_allocated or nullif(trim(coalesce(v_checkin.room_or_bed_label,'')),'') is null then
    return query select false,'room/bed not allocated'; return;
  end if;
  if not v_checkin.kyc_done then return query select false,'KYC incomplete'; return; end if;
  if not v_checkin.agreement_done then return query select false,'agreement incomplete'; return; end if;
  if not v_checkin.keys_handed_over then return query select false,'keys not handed over'; return; end if;

  update public.flow_checkins
     set payment_complete=true,
         owner_approval_complete=(not v_booking.owner_approval_required or v_booking.owner_approved),
         status='checked_in',checked_in_at=coalesce(checked_in_at,now()),updated_at=now()
   where id=p_checkin_id;
  update public.flow_bookings
     set status='booked',booked_at=coalesce(booked_at,now()),updated_at=now()
   where id=v_booking.id;
  update public.leads
     set current_pipeline_stage='CHECKED_IN',status='closed',updated_at=now()
   where id=v_checkin.lead_id;
  update public.next_actions
     set done_at=now(),status='done',updated_at=now()
   where lead_id=v_checkin.lead_id and done_at is null and status<>'cancelled';
  update public.work_claims
     set is_current=false,state='completed',expires_at=null,released_at=now(),
         release_reason='checked_in',updated_at=now()
   where lead_id=v_checkin.lead_id and is_current=true;
  return query select true,'checked in';
end;
$$;

grant execute on function public.flow_confirm_checkin(uuid,uuid,text) to authenticated;

-- Compatibility wrapper for the later readiness helper. It now delegates to
-- the canonical commercial flow_checkins record instead of maintaining a
-- second terminal command path.
create or replace function public.confirm_flow_checkin(_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_checkin_id uuid;
  v_ok boolean;
  v_reason text;
begin
  select id into v_checkin_id from public.flow_checkins
   where lead_id=_lead_id and status not in ('cancelled')
   order by created_at desc limit 1;
  if v_checkin_id is null then raise exception 'CHECKIN_READINESS_NOT_STARTED' using errcode='P0001'; end if;
  select ok,reason into v_ok,v_reason
    from public.flow_confirm_checkin(v_checkin_id,auth.uid(),auth.uid()::text);
  if not coalesce(v_ok,false) then raise exception 'CHECKIN_NOT_READY:%',coalesce(v_reason,'unknown') using errcode='P0001'; end if;
  return jsonb_build_object('ok',true,'lead_id',_lead_id,'stage','CHECKED_IN');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Complete & Next cannot manufacture BOOKED/CHECKED_IN, and cannot silently
-- complete work without a terminal outcome or dated next action.
-- ---------------------------------------------------------------------------
create or replace function public.complete_flow_item(
  _batch_item_id uuid,
  _claim_id uuid,
  _outcome text,
  _next_action_kind text default null,
  _next_action_at timestamptz default null,
  _notes text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  _item public.draft_batch_items;
  _claim public.work_claims;
  _lead_id uuid;
  _operator_id uuid;
  _next_item public.draft_batch_items;
  _booking public.flow_bookings;
  _checkin_id uuid;
  _ok boolean;
  _reason text;
begin
  select * into _item from public.draft_batch_items where id=_batch_item_id for update;
  if not found then raise exception 'BATCH_ITEM_NOT_FOUND' using errcode='P0001'; end if;
  select * into _claim from public.work_claims where id=_claim_id and is_current=true for update;
  if not found then raise exception 'ACTIVE_OR_RESERVED_CLAIM_REQUIRED' using errcode='P0001'; end if;
  if _claim.lead_id<>_item.lead_id then raise exception 'CLAIM_LEAD_MISMATCH' using errcode='P0001'; end if;
  if _claim.operator_id<>auth.uid()
     and not public.has_role(auth.uid(),'admin')
     and not public.has_role(auth.uid(),'manager')
     and not public.has_role(auth.uid(),'control_tower') then
    raise exception 'NOT_CURRENT_HANDLER' using errcode='42501';
  end if;

  _lead_id:=_item.lead_id;
  _operator_id:=_claim.operator_id;

  if _outcome not in ('future','waiting','lost','booked','checked_in','handoff') then
    raise exception 'INVALID_OUTCOME_USE_EXPLICIT_NEXT_ACTION_OR_TERMINAL_STATE' using errcode='P0001';
  end if;
  if _outcome in ('future','waiting','handoff') and
     (_next_action_at is null or nullif(trim(coalesce(_next_action_kind,'')),'') is null) then
    raise exception 'DATED_NEXT_ACTION_REQUIRED' using errcode='P0001';
  end if;
  if _outcome='lost' and nullif(trim(coalesce(_notes,'')),'') is null then
    raise exception 'LOST_REASON_REQUIRED' using errcode='P0001';
  end if;

  if _outcome='booked' then
    select * into _booking from public.flow_bookings
     where lead_id=_lead_id order by created_at desc limit 1;
    if _booking.id is null then raise exception 'BOOKING_RECORD_REQUIRED' using errcode='P0001'; end if;
    if not _booking.payment_verified then raise exception 'PAYMENT_VERIFICATION_REQUIRED' using errcode='P0001'; end if;
    if _booking.owner_approval_required and not _booking.owner_approved then
      raise exception 'OWNER_APPROVAL_REQUIRED' using errcode='P0001';
    end if;
    update public.flow_bookings set status='booked',booked_at=coalesce(booked_at,now()),updated_at=now() where id=_booking.id;
    update public.leads set current_pipeline_stage='BOOKED',updated_at=now() where id=_lead_id;
  elsif _outcome='checked_in' then
    select id into _checkin_id from public.flow_checkins
     where lead_id=_lead_id and status<>'cancelled' order by created_at desc limit 1;
    if _checkin_id is null then raise exception 'CHECKIN_RECORD_REQUIRED' using errcode='P0001'; end if;
    select ok,reason into _ok,_reason
      from public.flow_confirm_checkin(_checkin_id,auth.uid(),auth.uid()::text);
    if not coalesce(_ok,false) then
      raise exception 'CHECKIN_NOT_READY:%',coalesce(_reason,'unknown') using errcode='P0001';
    end if;
  elsif _outcome='lost' then
    update public.leads set current_pipeline_stage='LOST',status='closed',updated_at=now() where id=_lead_id;
  end if;

  if _outcome in ('future','waiting','handoff') then
    update public.next_actions set done_at=now(),status='done',updated_at=now()
      where lead_id=_lead_id and done_at is null and status<>'cancelled';
    insert into public.next_actions(lead_id,owner_id,kind,due_at,notes,source,status,priority,created_by)
    values(_lead_id,_operator_id,_next_action_kind,_next_action_at,_notes,'complete_next','open',
      case when _next_action_at<=now()+interval '2 hours' then 'high' else 'normal' end,auth.uid());
  elsif _outcome in ('lost','booked','checked_in') then
    update public.next_actions set done_at=now(),status='done',updated_at=now()
      where lead_id=_lead_id and done_at is null and status<>'cancelled';
  end if;

  update public.draft_batch_items
     set status=case when _outcome in ('future','waiting') then 'future' else 'completed' end,
         completed_at=case when _outcome in ('future','waiting') then null else now() end,
         released_at=now()
   where id=_batch_item_id;
  update public.work_claims
     set is_current=false,state='completed',expires_at=null,released_at=now(),
         release_reason=_outcome,next_action=_next_action_kind,next_action_at=_next_action_at,updated_at=now()
   where id=_claim_id;

  select * into _next_item from public.draft_batch_items
   where batch_id=_item.batch_id and status='queued'
   order by rank asc limit 1 for update skip locked;
  if found then update public.draft_batch_items set status='active' where id=_next_item.id; end if;

  if not exists(select 1 from public.draft_batch_items where batch_id=_item.batch_id and status in ('queued','active')) then
    update public.draft_batches set status='completed',completed_at=now() where id=_item.batch_id;
  end if;

  return jsonb_build_object(
    'completed_item_id',_batch_item_id,'lead_id',_lead_id,'outcome',_outcome,
    'next_item_id',_next_item.id,'next_lead_id',_next_item.lead_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Explicitly document legacy generations for tooling. We do not drop them
-- because a historical environment may have applied them, but final clients
-- must never write them.
-- ---------------------------------------------------------------------------
comment on table public.work_claims is 'FLOW_OS_CANONICAL: one current reservation/active claim per canonical lead. Use reserve_flow_lead + claim_flow_lead.';
comment on table public.draft_batches is 'FLOW_OS_CANONICAL: operator Draft 30 batches. One active batch per operator.';
comment on table public.flow_checkins is 'FLOW_OS_CANONICAL: final check-in evidence and status. Use flow_confirm_checkin.';
comment on function public.complete_flow_item(uuid,uuid,text,text,timestamptz,text) is 'FLOW_OS_CANONICAL: Complete & Next; terminal states require real booking/check-in evidence.';
