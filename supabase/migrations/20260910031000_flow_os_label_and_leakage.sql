-- Make colour/seen/message rules executable and expose named owner/handler + leakage classes.

create or replace function public.apply_flow_label_rule()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  _rule public.flow_label_rules;
begin
  if new.detected_label is not null and btrim(new.detected_label) <> '' then
    return new;
  end if;

  select * into _rule
  from public.flow_label_rules r
  where r.is_enabled = true
    and (r.whatsapp_account is null or r.whatsapp_account = new.whatsapp_account)
    and (r.color_hint is null or lower(r.color_hint) = lower(coalesce(new.color_hint,'')))
    and (r.seen_state is null or r.seen_state = new.seen_state)
    and (r.text_pattern is null or coalesce(new.last_message_preview,'') ~* r.text_pattern)
  order by r.rank asc, r.created_at asc
  limit 1;

  if found then
    new.detected_label := _rule.inferred_label;
  end if;
  return new;
end;
$$;

drop trigger if exists screenshot_observation_label_rule on public.screenshot_observations;
create trigger screenshot_observation_label_rule
before insert or update of whatsapp_account,color_hint,seen_state,last_message_preview,detected_label
on public.screenshot_observations
for each row execute function public.apply_flow_label_rule();

-- Rebuild truth view with human names and raw + inferred evidence kept separate.
drop view if exists public.flow_three_day_truth;
create view public.flow_three_day_truth as
with latest_obs as (
  select distinct on (lead_id)
    lead_id,id observation_id,captured_at,last_message_preview,preview_direction,
    unread_visible,unread_count,seen_state,color_hint,detected_label,handler_hint,
    stage_inference,stage_confidence
  from public.screenshot_observations
  where lead_id is not null and captured_at >= now()-interval '3 days'
  order by lead_id,captured_at desc,created_at desc
), open_action as (
  select distinct on (lead_id) lead_id,id next_action_id,kind,due_at,owner_id
  from public.next_actions
  where done_at is null and status <> 'cancelled'
  order by lead_id,due_at asc
), current_claim as (
  select * from public.work_claims where is_current=true
)
select
  l.id lead_id,l.phone,l.wa_name,l.current_owner,owner.full_name current_owner_name,
  l.status lead_status,l.current_pipeline_stage,l.priority,
  lo.observation_id,lo.captured_at latest_observation_at,lo.last_message_preview,
  lo.preview_direction,lo.unread_visible,lo.unread_count,lo.seen_state,lo.color_hint,
  lo.detected_label,lo.handler_hint,lo.stage_inference,lo.stage_confidence,
  cc.id claim_id,cc.operator_id current_handler,handler.full_name current_handler_name,
  cc.state claim_state,cc.expires_at claim_expires_at,cc.batch_id current_batch_id,
  oa.next_action_id,oa.kind next_action_kind,oa.due_at next_action_at,
  case
    when lo.observation_id is null then 'GREY'
    when l.current_owner is null and cc.id is null and oa.next_action_id is null then 'RED'
    when coalesce(lo.unread_visible,false) and cc.id is null and oa.next_action_id is null then 'RED'
    when l.current_pipeline_stage in ('CHECKED_IN','LOST') then 'GREEN'
    when oa.due_at is not null and oa.due_at > now()+interval '24 hours' then 'GREY'
    when lo.stage_inference is not null and l.current_pipeline_stage is distinct from lo.stage_inference then 'AMBER'
    else 'GREEN'
  end sync_state
from public.leads l
left join latest_obs lo on lo.lead_id=l.id
left join current_claim cc on cc.lead_id=l.id
left join open_action oa on oa.lead_id=l.id
left join public.profiles owner on owner.user_id=l.current_owner
left join public.profiles handler on handler.user_id=cc.operator_id;

grant select on public.flow_three_day_truth to authenticated;

create or replace view public.flow_revenue_leakage as
with truth as (select * from public.flow_three_day_truth),
unresolved as (
  select
    null::uuid lead_id,
    o.id observation_id,
    o.phone_normalized phone,
    o.contact_name wa_name,
    null::uuid current_owner,
    null::text current_owner_name,
    null::uuid current_handler,
    null::text current_handler_name,
    null::text current_pipeline_stage,
    o.captured_at latest_observation_at,
    o.last_message_preview,
    'OCR_UNRESOLVED'::text leak_type,
    'Visible WhatsApp row is not linked to a canonical CRM customer'::text why_red,
    100::integer severity
  from public.screenshot_observations o
  where o.captured_at>=now()-interval '3 days'
    and o.reconciliation_state='needs_review'
    and o.lead_id is null
)
select
  t.lead_id,t.observation_id,t.phone,t.wa_name,t.current_owner,t.current_owner_name,
  t.current_handler,t.current_handler_name,t.current_pipeline_stage,t.latest_observation_at,
  t.last_message_preview,
  case
    when t.current_owner is null and t.current_handler is null and t.next_action_id is null then 'UNOWNED'
    when coalesce(t.unread_visible,false) and t.current_handler is null and t.next_action_id is null then 'FRESH_INBOUND_UNATTENDED'
    when t.next_action_id is null and t.current_pipeline_stage not in ('CHECKED_IN','LOST') then 'NO_NEXT_ACTION'
    when t.current_pipeline_stage='DOSSIER' and t.stage_inference in ('TOUR_SCHEDULED','TOUR_IN_PROGRESS') then 'QUALIFIED_NO_TOUR'
    when t.current_pipeline_stage='POST_VISIT' and t.latest_observation_at < now()-interval '15 minutes' then 'TOUR_NO_POST_VISIT'
    when t.current_pipeline_stage='POST_VISIT' and t.stage_inference in ('QUOTED','NEGOTIATION') then 'POSITIVE_NO_QUOTE'
    when t.current_pipeline_stage in ('QUOTED','NEGOTIATION') and t.stage_inference='BOOKED' then 'PAYMENT_NOT_BOOKED'
    when t.current_pipeline_stage='BOOKED' and (t.next_action_id is null or t.next_action_at<=now()) then 'BOOKED_CHECKIN_RISK'
    when t.sync_state='AMBER' then 'SYNC_MISMATCH'
    else 'REVENUE_LEAKAGE'
  end leak_type,
  case
    when t.current_owner is null and t.current_handler is null and t.next_action_id is null then 'No accountable owner, live handler or dated next action'
    when coalesce(t.unread_visible,false) and t.current_handler is null and t.next_action_id is null then 'Fresh/unread WhatsApp inbound has nobody acting on it'
    when t.sync_state='AMBER' then 'WhatsApp message evidence and saved CRM stage disagree'
    else 'Active customer is missing a required execution guarantee'
  end why_red,
  case
    when coalesce(t.unread_visible,false) then 95
    when t.current_pipeline_stage in ('POST_VISIT','QUOTED','NEGOTIATION','BOOKED') then 90
    else 75
  end severity
from truth t
where t.sync_state='RED'
   or (t.sync_state='AMBER' and t.current_pipeline_stage not in ('CHECKED_IN','LOST'))
union all
select * from unresolved;

grant select on public.flow_revenue_leakage to authenticated;
