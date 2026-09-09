-- Draft reservation persists with the batch; live active editing uses a 10-minute idle lock.

alter table public.flow_work_claims drop constraint if exists flow_work_claims_state_check;
alter table public.flow_work_claims
  add constraint flow_work_claims_state_check
  check (state in ('reserved','active','released','expired','completed','taken_over'));

-- Existing rows created by earlier migration are safe; they remain active.
drop index if exists public.flow_one_active_claim_per_lead;
create unique index if not exists flow_one_open_claim_per_lead
  on public.flow_work_claims(lead_id) where state in ('reserved','active');

create unique index if not exists flow_one_open_batch_per_operator
  on public.flow_draft_batches(operator_id) where status='open';

create or replace function public.flow_reserve_lead(
  p_lead_id uuid,
  p_operator_id uuid,
  p_operator_name text,
  p_batch_id uuid
)
returns table(ok boolean, claim_id uuid, current_operator text, reason text)
language plpgsql security definer set search_path=public as $$
declare v_claim public.flow_work_claims%rowtype;
begin
  -- Only live active work expires automatically. Batch reservations do not.
  update public.flow_work_claims
     set state='reserved', last_meaningful_activity_at=now()
   where lead_id=p_lead_id and state='active' and operator_id=p_operator_id and expires_at <= now();

  select * into v_claim from public.flow_work_claims
   where lead_id=p_lead_id and state in ('reserved','active') limit 1;

  if v_claim.id is not null and v_claim.operator_id <> p_operator_id then
    return query select false,v_claim.id,v_claim.operator_name,'reserved by another operator';
    return;
  end if;

  if v_claim.id is not null then
    update public.flow_work_claims set draft_batch_id=p_batch_id where id=v_claim.id;
    return query select true,v_claim.id,p_operator_name,'already reserved';
    return;
  end if;

  insert into public.flow_work_claims(lead_id,operator_id,operator_name,draft_batch_id,state,expires_at)
  values(p_lead_id,p_operator_id,p_operator_name,p_batch_id,'reserved',now()+interval '10 minutes')
  returning * into v_claim;
  return query select true,v_claim.id,p_operator_name,'reserved';
end; $$;

-- Open / Resume converts the operator's own reservation into an active 10-minute lock.
create or replace function public.flow_claim_lead(
  p_lead_id uuid,
  p_operator_id uuid,
  p_operator_name text,
  p_batch_id uuid default null
)
returns table(ok boolean, claim_id uuid, current_operator text, reason text)
language plpgsql security definer set search_path=public as $$
declare v_claim public.flow_work_claims%rowtype;
begin
  update public.flow_work_claims
     set state='reserved'
   where lead_id=p_lead_id and state='active' and expires_at <= now();

  select * into v_claim from public.flow_work_claims
   where lead_id=p_lead_id and state in ('reserved','active') limit 1;

  if v_claim.id is not null and v_claim.operator_id <> p_operator_id then
    return query select false,v_claim.id,v_claim.operator_name,'already handled/reserved';
    return;
  end if;

  if v_claim.id is not null then
    update public.flow_work_claims
       set state='active', last_meaningful_activity_at=now(), expires_at=now()+interval '10 minutes',
           draft_batch_id=coalesce(p_batch_id,draft_batch_id)
     where id=v_claim.id;
    update public.leads set current_handler_id=p_operator_id,current_handler_name=p_operator_name where id=p_lead_id;
    return query select true,v_claim.id,p_operator_name,'activated';
    return;
  end if;

  insert into public.flow_work_claims(lead_id,operator_id,operator_name,draft_batch_id,state)
  values(p_lead_id,p_operator_id,p_operator_name,p_batch_id,'active') returning * into v_claim;
  update public.leads set current_handler_id=p_operator_id,current_handler_name=p_operator_name where id=p_lead_id;
  return query select true,v_claim.id,p_operator_name,'claimed';
end; $$;

create or replace function public.flow_release_claim(p_claim_id uuid,p_operator_id uuid,p_reason text default 'completed')
returns boolean language plpgsql security definer set search_path=public as $$
declare v_lead uuid;
begin
  select lead_id into v_lead from public.flow_work_claims where id=p_claim_id;
  update public.flow_work_claims
     set state=case when p_reason='completed' then 'completed' else 'released' end,
         released_at=now(),release_reason=p_reason
   where id=p_claim_id and operator_id=p_operator_id and state in ('active','reserved');
  if found then
    update public.leads set current_handler_id=null,current_handler_name=null where id=v_lead and current_handler_id=p_operator_id;
    return true;
  end if;
  return false;
end; $$;

create or replace function public.flow_close_batch(p_batch_id uuid,p_operator_id uuid,p_reason text default 'batch closed')
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.flow_draft_batches set status='completed',closed_at=now()
   where id=p_batch_id and operator_id=p_operator_id and status='open';
  if not found then return false; end if;
  update public.flow_work_claims
     set state='released',released_at=now(),release_reason=p_reason
   where draft_batch_id=p_batch_id and operator_id=p_operator_id and state in ('reserved','active');
  update public.leads l set current_handler_id=null,current_handler_name=null
   where current_handler_id=p_operator_id and exists(
     select 1 from public.flow_draft_items i where i.batch_id=p_batch_id and i.lead_id=l.id
   );
  return true;
end; $$;

grant execute on function public.flow_reserve_lead(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.flow_close_batch(uuid,uuid,text) to authenticated;
