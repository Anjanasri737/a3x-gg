alter view public.flow_three_day_truth set (security_invoker = true);
alter view public.flow_revenue_leakage set (security_invoker = true);
alter view public.flow_checkin_status set (security_invoker = true);

revoke execute on function public.claim_flow_lead(uuid,uuid,uuid,text,integer,text,timestamptz) from anon, public;
revoke execute on function public.touch_flow_claim(uuid,integer) from anon, public;
revoke execute on function public.release_flow_claim(uuid,text) from anon, public;
revoke execute on function public.complete_flow_item(uuid,uuid,text,text,timestamptz,text) from anon, public;
revoke execute on function public.confirm_flow_checkin(uuid) from anon, public;
revoke execute on function public.apply_flow_label_rule() from anon, public;
revoke execute on function public.flow_claim_lead(uuid,uuid,text,uuid) from anon, public;
revoke execute on function public.flow_reserve_lead(uuid,uuid,text,uuid) from anon, public;
revoke execute on function public.flow_heartbeat_claim(uuid,uuid) from anon, public;
revoke execute on function public.flow_release_claim(uuid,uuid,text) from anon, public;
revoke execute on function public.flow_refresh_batch(uuid) from anon, public;
revoke execute on function public.flow_close_batch(uuid,uuid,text) from anon, public;
revoke execute on function public.flow_observation_refresh_trigger() from anon, public;

grant execute on function public.claim_flow_lead(uuid,uuid,uuid,text,integer,text,timestamptz) to authenticated;
grant execute on function public.touch_flow_claim(uuid,integer) to authenticated;
grant execute on function public.release_flow_claim(uuid,text) to authenticated;
grant execute on function public.complete_flow_item(uuid,uuid,text,text,timestamptz,text) to authenticated;
grant execute on function public.confirm_flow_checkin(uuid) to authenticated;
grant execute on function public.flow_claim_lead(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.flow_reserve_lead(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.flow_heartbeat_claim(uuid,uuid) to authenticated;
grant execute on function public.flow_release_claim(uuid,uuid,text) to authenticated;
grant execute on function public.flow_refresh_batch(uuid) to authenticated;
grant execute on function public.flow_close_batch(uuid,uuid,text) to authenticated;