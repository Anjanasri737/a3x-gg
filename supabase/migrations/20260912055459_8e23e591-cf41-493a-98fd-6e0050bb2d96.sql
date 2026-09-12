REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.any_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tower_ops(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_flow_lead(uuid, uuid, uuid, text, integer, text, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_flow_item(uuid, uuid, text, text, timestamp with time zone, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_flow_checkin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flow_claim_lead(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flow_close_batch(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flow_heartbeat_claim(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flow_refresh_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flow_release_claim(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flow_reserve_lead(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_flow_claim(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_flow_claim(uuid, integer) TO authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;