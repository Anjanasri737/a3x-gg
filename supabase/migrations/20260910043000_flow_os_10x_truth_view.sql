-- Flow OS 10x truth projection.
-- Separates accountability owner, Draft reservation and live handler.
-- Adds the fields required to explain Draft 30 decisions without another CRM.

alter table public.leads add column if not exists current_mission text;
alter table public.leads add column if not exists primary_blocker text;
alter table public.leads add column if not exists last_operator_action_at timestamptz;
alter table public.leads add column if not exists lead_source text;

-- Keep the final projection deterministic; leakage depends on truth.
drop view if exists public.flow_revenue_leakage;
drop view if exists public.flow_three_day_truth;

create view public.flow_three_day_truth as
with latest_obs as (
  select distinct on (lead_id)
    lead_id,id observation_id,captured_at,last_message_preview,preview_direction,
    unread_visible,unread_count,seen_state,color_hint,detected_label,handler_hint,
    stage_inference,stage_confidence,movement_signal,ocr_confidence,whatsapp_account
  from public.screenshot_observations
  where lead_id is not null and captured_at>=now()-interval '3 days'
  order by lead_id,captured_at desc,created_at desc
), open_action as (
  select distinct on (lead_id) lead_id,id next_action_id,kind,due_at,owner_id,priority
  from public.next_actions
  where done_at is null and status<>'cancelled'
  order by lead_id,due_at asc
), current_claim as (
  select * from public.work_claims where is_current=true
)
select
  l.id lead_id,
  l.phone,
  l.wa_name,
  l.location_text,
  l.movein_date,
  l.lead_source,
  l.score opportunity_score,
  l.current_owner,
  owner.full_name current_owner_name,
  l.status lead_status,
  l.current_pipeline_stage,
  l.current_mission,
  l.primary_blocker,
  l.last_operator_action_at,
  l.priority,
  lo.observation_id,
  lo.captured_at latest_observation_at,
  lo.last_message_preview,
  lo.preview_direction,
  lo.unread_visible,
  lo.unread_count,
  lo.seen_state,
  lo.color_hint,
  lo.detected_label,
  lo.handler_hint,
  lo.stage_inference,
  lo.stage_confidence,
  lo.movement_signal,
  lo.ocr_confidence,
  lo.whatsapp_account,
  cc.id claim_id,
  case when cc.state='active' and (cc.expires_at is null or cc.expires_at>now()) then cc.operator_id end current_handler,
  case when cc.state='active' and (cc.expires_at is null or cc.expires_at>now()) then handler.full_name end current_handler_name,
  case when cc.state in ('drafted','active') then cc.operator_id end reservation_operator,
  case when cc.state in ('drafted','active') then handler.full_name end reservation_operator_name,
  cc.state claim_state,
  case when cc.state='active' then cc.expires_at end claim_expires_at,
  cc.batch_id current_batch_id,
  oa.next_action_id,
  oa.kind next_action_kind,
  oa.due_at next_action_at,
  oa.priority next_action_priority,
  case
    when l.current_pipeline_stage='CHECKED_IN' then 'GREEN'
    -- A previously lost customer replying again is new commercial reality.
    when l.current_pipeline_stage='LOST' and coalesce(lo.unread_visible,false)
      and (l.last_operator_action_at is null or lo.captured_at>l.last_operator_action_at) then 'RED'
    when l.current_pipeline_stage='LOST' then 'GREEN'
    -- No owner, no batch reservation and no dated work is true leakage.
    when l.current_owner is null and cc.id is null and oa.next_action_id is null then 'RED'
    -- Fresh unread has a 15 minute response window before it becomes RED.
    when coalesce(lo.unread_visible,false)
      and not (cc.state='active' and (cc.expires_at is null or cc.expires_at>now()))
      and (oa.next_action_id is null or oa.due_at>now()+interval '15 minutes')
      and lo.captured_at<=now()-interval '15 minutes' then 'RED'
    when coalesce(lo.unread_visible,false)
      and not (cc.state='active' and (cc.expires_at is null or cc.expires_at>now())) then 'AMBER'
    when oa.due_at is not null and oa.due_at>now()+interval '24 hours' then 'GREY'
    when lo.stage_inference is not null and l.current_pipeline_stage is distinct from lo.stage_inference then 'AMBER'
    else 'GREEN'
  end sync_state
from public.leads l
left join latest_obs lo on lo.lead_id=l.id
left join current_claim cc on cc.lead_id=l.id
left join open_action oa on oa.lead_id=l.id
left join public.profiles owner on owner.user_id=l.current_owner
left join public.profiles handler on handler.user_id=cc.operator_id
where l.status<>'closed' or l.current_pipeline_stage in ('CHECKED_IN','LOST');

grant select on public.flow_three_day_truth to authenticated;

create view public.flow_revenue_leakage as
with truth as (select * from public.flow_three_day_truth),
unresolved as (
  select
    null::uuid lead_id,o.id observation_id,o.phone_normalized phone,o.contact_name wa_name,
    null::text location_text,null::date movein_date,null::text lead_source,null::integer opportunity_score,
    null::uuid current_owner,null::text current_owner_name,null::uuid current_handler,null::text current_handler_name,
    null::uuid reservation_operator,null::text reservation_operator_name,
    null::text current_pipeline_stage,o.captured_at latest_observation_at,o.last_message_preview,
    o.whatsapp_account,o.ocr_confidence,
    'OCR_UNRESOLVED'::text leak_type,
    'Visible WhatsApp row is not linked to one canonical CRM customer'::text why_red,
    100::integer severity
  from public.screenshot_observations o
  where o.captured_at>=now()-interval '3 days'
    and o.reconciliation_state='needs_review' and o.lead_id is null
)
select
  t.lead_id,t.observation_id,t.phone,t.wa_name,t.location_text,t.movein_date,t.lead_source,t.opportunity_score,
  t.current_owner,t.current_owner_name,t.current_handler,t.current_handler_name,
  t.reservation_operator,t.reservation_operator_name,t.current_pipeline_stage,t.latest_observation_at,
  t.last_message_preview,t.whatsapp_account,t.ocr_confidence,
  case
    when t.current_pipeline_stage='LOST' and coalesce(t.unread_visible,false) then 'RETURNING_CUSTOMER_UNREOPENED'
    when t.current_owner is null and t.reservation_operator is null and t.next_action_id is null then 'UNOWNED'
    when coalesce(t.unread_visible,false) and t.current_handler is null and t.latest_observation_at<=now()-interval '15 minutes' then 'FRESH_INBOUND_UNATTENDED'
    when t.next_action_id is null and t.current_pipeline_stage not in ('CHECKED_IN','LOST') and t.reservation_operator is null then 'NO_NEXT_ACTION'
    when t.current_pipeline_stage in ('DOSSIER','MATCHED') and t.stage_inference in ('TOUR_SCHEDULED','TOUR_CONFIRMED','TOUR_IN_PROGRESS') then 'QUALIFIED_NO_TOUR'
    when t.current_pipeline_stage in ('TOUR_IN_PROGRESS','TOUR_CONFIRMED') and t.stage_inference='POST_VISIT' then 'TOUR_NO_POST_VISIT'
    when t.current_pipeline_stage='POST_VISIT' and t.stage_inference in ('QUOTED','NEGOTIATION') then 'POSITIVE_NO_QUOTE'
    when t.current_pipeline_stage in ('QUOTED','NEGOTIATION') and t.stage_inference='BOOKED' then 'PAYMENT_NOT_BOOKED'
    when t.current_pipeline_stage='BOOKED' and (t.next_action_id is null or t.next_action_at<=now()) then 'BOOKED_CHECKIN_RISK'
    when t.sync_state='AMBER' then 'SYNC_MISMATCH'
    else 'REVENUE_LEAKAGE'
  end leak_type,
  case
    when t.current_pipeline_stage='LOST' and coalesce(t.unread_visible,false) then 'Fresh WhatsApp inbound exists after the CRM was marked lost'
    when t.current_owner is null and t.reservation_operator is null and t.next_action_id is null then 'No accountable owner, Draft reservation or dated next action'
    when coalesce(t.unread_visible,false) and t.current_handler is null then 'Fresh WhatsApp reply has no live handler inside the response SLA'
    when t.sync_state='AMBER' then 'WhatsApp evidence and saved CRM execution state disagree'
    else 'Active customer is missing a required conversion guarantee'
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
