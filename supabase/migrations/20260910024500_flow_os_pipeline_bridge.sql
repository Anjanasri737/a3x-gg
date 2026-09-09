-- Bridge the existing Closing Engine PipelineStage into the canonical Supabase lead record.
-- The stored stage is commercial truth. WhatsApp stage_inference remains advisory evidence.

alter table public.leads
  add column if not exists current_pipeline_stage text not null default 'DOSSIER';

create index if not exists leads_current_pipeline_stage_idx
  on public.leads(current_pipeline_stage);

create or replace view public.flow_three_day_truth as
with latest_obs as (
  select distinct on (lead_id)
    lead_id, id observation_id, captured_at, last_message_preview, preview_direction,
    unread_visible, unread_count, seen_state, color_hint, detected_label,
    handler_hint, stage_inference, stage_confidence
  from public.screenshot_observations
  where lead_id is not null and captured_at >= now() - interval '3 days'
  order by lead_id, captured_at desc, created_at desc
), open_action as (
  select distinct on (lead_id)
    lead_id, id next_action_id, kind, due_at, owner_id
  from public.next_actions
  where done_at is null and status <> 'cancelled'
  order by lead_id, due_at asc
), current_claim as (
  select * from public.work_claims where is_current = true
)
select
  l.id lead_id,
  l.phone,
  l.wa_name,
  l.current_owner,
  l.status lead_status,
  l.current_pipeline_stage,
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
  cc.id claim_id,
  cc.operator_id current_handler,
  cc.state claim_state,
  cc.expires_at claim_expires_at,
  cc.batch_id current_batch_id,
  oa.next_action_id,
  oa.kind next_action_kind,
  oa.due_at next_action_at,
  case
    when lo.observation_id is null then 'GREY'
    when l.current_owner is null and cc.id is null and oa.next_action_id is null then 'RED'
    when coalesce(lo.unread_visible,false) and cc.id is null and oa.next_action_id is null then 'RED'
    when l.current_pipeline_stage in ('CHECKED_IN','LOST') then 'GREEN'
    when oa.due_at is not null and oa.due_at > now() + interval '24 hours' then 'GREY'
    when lo.stage_inference is not null and l.current_pipeline_stage is distinct from lo.stage_inference then 'AMBER'
    else 'GREEN'
  end sync_state
from public.leads l
left join latest_obs lo on lo.lead_id = l.id
left join current_claim cc on cc.lead_id = l.id
left join open_action oa on oa.lead_id = l.id;

grant select on public.flow_three_day_truth to authenticated;
