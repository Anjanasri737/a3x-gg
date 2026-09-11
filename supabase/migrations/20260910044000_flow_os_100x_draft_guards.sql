-- Gharpayy Flow OS 100x — final Draft 30 / Active 13 guards.
-- The database, not the UI, is the collision and tray invariant.

-- ---------------------------------------------------------------------------
-- 1. Rebalance an active Draft so up to 13 currently open items are active.
-- Historical rank must never prevent newly refilled items from entering Active 13.
-- ---------------------------------------------------------------------------
create or replace function public.rebalance_flow_active_tray(
  _batch_id uuid,
  _target integer default 13
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  _need integer;
  _promoted integer := 0;
begin
  _target := least(30, greatest(1, coalesce(_target,13)));

  select greatest(0, _target - count(*))::integer
    into _need
    from public.draft_batch_items
   where batch_id=_batch_id and status='active';

  if _need <= 0 then return 0; end if;

  with candidates as (
    select id
      from public.draft_batch_items
     where batch_id=_batch_id and status='queued'
     order by rank asc, added_at asc, id asc
     limit _need
     for update skip locked
  )
  update public.draft_batch_items i
     set status='active'
    from candidates c
   where i.id=c.id;

  get diagnostics _promoted = row_count;
  return _promoted;
end;
$$;

grant execute on function public.rebalance_flow_active_tray(uuid,integer) to authenticated;

-- Rebalance automatically whenever a refill inserts a new Draft item. This
-- means rank 31+ can still become active if fewer than 13 active items remain.
create or replace function public.flow_after_draft_item_insert()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.rebalance_flow_active_tray(new.batch_id,13);
  return new;
end;
$$;

drop trigger if exists trg_flow_after_draft_item_insert on public.draft_batch_items;
create trigger trg_flow_after_draft_item_insert
after insert on public.draft_batch_items
for each row execute function public.flow_after_draft_item_insert();

-- Heal any active batches created before this guard existed.
do $$
declare r record;
begin
  for r in select id from public.draft_batches where status='active' loop
    perform public.rebalance_flow_active_tray(r.id,13);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Reservation may never steal an accountable owner's lead. Reassignment is
-- a separate explicit Control Tower/admin action; Drafting is not reassignment.
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
declare
  _row public.work_claims;
  _owner uuid;
begin
  select current_owner into _owner from public.leads where id=_lead_id;
  if not found then raise exception 'LEAD_NOT_FOUND' using errcode='P0001'; end if;
  if _owner is not null and _owner<>_operator_id then
    raise exception 'LEAD_OWNED_BY_OTHER:%',_owner using errcode='P0001';
  end if;

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
declare
  _row public.work_claims;
  _owner uuid;
begin
  select current_owner into _owner from public.leads where id=_lead_id;
  if not found then raise exception 'LEAD_NOT_FOUND' using errcode='P0001'; end if;
  if _owner is not null and _owner<>_operator_id then
    raise exception 'LEAD_OWNED_BY_OTHER:%',_owner using errcode='P0001';
  end if;

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

grant execute on function public.claim_flow_lead(uuid,uuid,uuid,text,integer,text,timestamptz) to authenticated;

comment on function public.rebalance_flow_active_tray(uuid,integer) is 'FLOW_OS_100X: keep up to 13 open items active regardless of historical rank.';
comment on function public.reserve_flow_lead(uuid,uuid,uuid,text,text,timestamptz) is 'FLOW_OS_100X: Draft reservation; cannot steal a differently-owned lead.';
