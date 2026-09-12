CREATE OR REPLACE VIEW public.flow_three_day_truth AS
WITH latest_obs AS (
  SELECT DISTINCT ON (so.lead_id)
    so.lead_id,
    so.id AS observation_id,
    so.captured_at,
    so.last_message_preview,
    so.preview_direction,
    so.unread_visible,
    so.unread_count,
    so.seen_state,
    so.color_hint,
    so.detected_label,
    so.handler_hint,
    so.stage_inference,
    so.stage_confidence
  FROM public.screenshot_observations so
  WHERE so.lead_id IS NOT NULL
    AND so.captured_at >= now() - interval '3 days'
  ORDER BY so.lead_id, so.captured_at DESC, so.created_at DESC
),
open_action AS (
  SELECT DISTINCT ON (na.lead_id)
    na.lead_id,
    na.id AS next_action_id,
    na.kind,
    na.due_at,
    na.owner_id
  FROM public.next_actions na
  WHERE na.done_at IS NULL AND na.status <> 'cancelled'
  ORDER BY na.lead_id, na.due_at
),
current_claim AS (
  SELECT wc.*
  FROM public.work_claims wc
  WHERE wc.is_current = true
)
SELECT
  l.id AS lead_id,
  l.phone,
  l.wa_name,
  l.current_owner,
  owner.full_name AS current_owner_name,
  l.status AS lead_status,
  l.current_pipeline_stage,
  l.priority,
  lo.observation_id,
  lo.captured_at AS latest_observation_at,
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
  cc.id AS claim_id,
  cc.operator_id AS current_handler,
  handler.full_name AS current_handler_name,
  cc.state AS claim_state,
  cc.expires_at AS claim_expires_at,
  cc.batch_id AS current_batch_id,
  oa.next_action_id,
  oa.kind AS next_action_kind,
  oa.due_at AS next_action_at,
  CASE
    WHEN l.current_pipeline_stage = ANY (ARRAY['CHECKED_IN'::text, 'LOST'::text]) THEN 'GREEN'::text
    WHEN l.current_owner IS NULL AND cc.id IS NULL AND oa.next_action_id IS NULL THEN 'RED'::text
    WHEN COALESCE(lo.unread_visible, false) AND cc.id IS NULL AND oa.next_action_id IS NULL THEN 'RED'::text
    WHEN oa.due_at IS NOT NULL AND oa.due_at > now() + interval '24 hours' THEN 'GREY'::text
    WHEN lo.stage_inference IS NOT NULL AND l.current_pipeline_stage IS DISTINCT FROM lo.stage_inference THEN 'AMBER'::text
    ELSE 'GREEN'::text
  END AS sync_state,
  cs.canonical_event,
  cs.conversation_stage,
  cs.waiting_on,
  cs.health AS conversation_health,
  cs.movement AS conversation_movement,
  cs.momentum AS conversation_momentum,
  cs.next_action AS compiled_next_action,
  cs.action_due_at AS compiled_action_due_at,
  cs.priority AS compiled_priority,
  cs.screenshot_status,
  cs.evidence_quality,
  cs.confidence AS compiler_confidence,
  cs.needs_review AS compiler_needs_review
FROM public.leads l
LEFT JOIN latest_obs lo ON lo.lead_id = l.id
LEFT JOIN current_claim cc ON cc.lead_id = l.id
LEFT JOIN open_action oa ON oa.lead_id = l.id
LEFT JOIN public.profiles owner ON owner.user_id = l.current_owner
LEFT JOIN public.profiles handler ON handler.user_id = cc.operator_id
LEFT JOIN public.conversation_states cs ON cs.lead_id = l.id
WHERE l.status <> 'closed' OR l.current_pipeline_stage = ANY (ARRAY['CHECKED_IN'::text, 'LOST'::text]);

ALTER VIEW public.flow_three_day_truth SET (security_invoker = true);
REVOKE ALL ON public.flow_three_day_truth FROM anon;
GRANT SELECT ON public.flow_three_day_truth TO authenticated;
GRANT ALL ON public.flow_three_day_truth TO service_role;

REVOKE EXECUTE ON FUNCTION public.any_role(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_tower_ops(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_assignment_timeline() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_lead_timeline() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_review_timeline() FROM anon, authenticated;