-- Canonical check-in readiness. Payment text/token alone must never mean checked-in.

create table if not exists public.flow_checkin_readiness (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  booking_id uuid,
  payment_verified boolean not null default false,
  payment_ref text,
  room_number text,
  bed_reference text,
  owner_approval_status text not null default 'not_required' check (owner_approval_status in ('not_required','required','pending','approved','rejected')),
  kyc_done boolean not null default false,
  agreement_done boolean not null default false,
  arrived_at timestamptz,
  keys_handed_over_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.flow_checkin_readiness enable row level security;
grant select,insert,update,delete on public.flow_checkin_readiness to authenticated;

create policy flow_checkin_readiness_read on public.flow_checkin_readiness
for select to authenticated using (true);

create policy flow_checkin_readiness_write on public.flow_checkin_readiness
for all to authenticated
using (
  public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or
  public.has_role(auth.uid(),'control_tower') or
  exists(select 1 from public.leads l where l.id=lead_id and l.current_owner=auth.uid()) or
  exists(select 1 from public.work_claims wc where wc.lead_id=lead_id and wc.operator_id=auth.uid() and wc.is_current=true)
)
with check (
  public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or
  public.has_role(auth.uid(),'control_tower') or
  exists(select 1 from public.leads l where l.id=lead_id and l.current_owner=auth.uid()) or
  exists(select 1 from public.work_claims wc where wc.lead_id=lead_id and wc.operator_id=auth.uid() and wc.is_current=true)
);

create or replace view public.flow_checkin_status as
select
  l.id lead_id,
  l.phone,
  l.wa_name,
  l.current_pipeline_stage,
  r.payment_verified,
  r.payment_ref,
  r.room_number,
  r.bed_reference,
  r.owner_approval_status,
  r.kyc_done,
  r.agreement_done,
  r.arrived_at,
  r.keys_handed_over_at,
  r.confirmed_at,
  case
    when coalesce(r.payment_verified,false)=false then 'VERIFY_PAYMENT'
    when nullif(trim(coalesce(r.room_number,r.bed_reference,'')),'') is null then 'ALLOCATE_ROOM_BED'
    when r.owner_approval_status in ('required','pending') then 'OWNER_APPROVAL'
    when r.owner_approval_status='rejected' then 'OWNER_REJECTED'
    when coalesce(r.kyc_done,false)=false then 'COMPLETE_KYC'
    when coalesce(r.agreement_done,false)=false then 'COMPLETE_AGREEMENT'
    when r.arrived_at is null then 'CONFIRM_ARRIVAL'
    when r.keys_handed_over_at is null then 'HAND_OVER_KEYS'
    when r.confirmed_at is null then 'READY_TO_CONFIRM'
    else 'CHECKED_IN'
  end next_checkin_gate,
  (
    coalesce(r.payment_verified,false)=true and
    nullif(trim(coalesce(r.room_number,r.bed_reference,'')),'') is not null and
    r.owner_approval_status in ('not_required','approved') and
    coalesce(r.kyc_done,false)=true and
    coalesce(r.agreement_done,false)=true and
    r.arrived_at is not null and
    r.keys_handed_over_at is not null
  ) ready_to_confirm
from public.leads l
left join public.flow_checkin_readiness r on r.lead_id=l.id;

grant select on public.flow_checkin_status to authenticated;

create or replace function public.confirm_flow_checkin(_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  _r public.flow_checkin_readiness;
  _lead public.leads;
begin
  select * into _lead from public.leads where id=_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND' using errcode='P0001'; end if;

  if _lead.current_owner<>auth.uid()
     and not exists(select 1 from public.work_claims wc where wc.lead_id=_lead_id and wc.operator_id=auth.uid() and wc.is_current=true)
     and not public.has_role(auth.uid(),'admin')
     and not public.has_role(auth.uid(),'manager')
     and not public.has_role(auth.uid(),'control_tower') then
    raise exception 'NOT_AUTHORIZED_TO_CONFIRM_CHECKIN' using errcode='42501';
  end if;

  select * into _r from public.flow_checkin_readiness where lead_id=_lead_id for update;
  if not found then raise exception 'CHECKIN_READINESS_NOT_STARTED' using errcode='P0001'; end if;
  if not _r.payment_verified then raise exception 'PAYMENT_NOT_VERIFIED' using errcode='P0001'; end if;
  if nullif(trim(coalesce(_r.room_number,_r.bed_reference,'')),'') is null then raise exception 'ROOM_OR_BED_REQUIRED' using errcode='P0001'; end if;
  if _r.owner_approval_status not in ('not_required','approved') then raise exception 'OWNER_APPROVAL_REQUIRED' using errcode='P0001'; end if;
  if not _r.kyc_done then raise exception 'KYC_REQUIRED' using errcode='P0001'; end if;
  if not _r.agreement_done then raise exception 'AGREEMENT_REQUIRED' using errcode='P0001'; end if;
  if _r.arrived_at is null then raise exception 'ARRIVAL_REQUIRED' using errcode='P0001'; end if;
  if _r.keys_handed_over_at is null then raise exception 'KEY_HANDOVER_REQUIRED' using errcode='P0001'; end if;

  update public.flow_checkin_readiness set confirmed_at=now(), confirmed_by=auth.uid(), updated_at=now() where lead_id=_lead_id;
  update public.leads set current_pipeline_stage='CHECKED_IN', status='closed', updated_at=now() where id=_lead_id;
  update public.next_actions set done_at=now(),status='done',updated_at=now() where lead_id=_lead_id and done_at is null and status<>'cancelled';
  update public.work_claims set is_current=false,state='completed',released_at=now(),release_reason='checked_in',updated_at=now() where lead_id=_lead_id and is_current=true;
  insert into public.audit_logs(entity,entity_id,action,next,reason)
    values('lead',_lead_id,'checked_in',jsonb_build_object('confirmed_by',auth.uid(),'confirmed_at',now()),'all check-in gates passed');

  return jsonb_build_object('ok',true,'lead_id',_lead_id,'stage','CHECKED_IN','confirmed_at',now());
end;
$$;

grant execute on function public.confirm_flow_checkin(uuid) to authenticated;
