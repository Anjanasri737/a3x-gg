-- Gharpayy Flow OS 100x — canonical customer workspace actions.
-- WhatsApp intelligence may suggest a stage; only an accountable human may
-- confirm a non-terminal/non-commercial-evidence stage.

create or replace function public.confirm_flow_stage_hint(
  _lead_id uuid,
  _stage text,
  _mission text default null,
  _observation_id uuid default null
) returns public.leads
language plpgsql
security definer
set search_path=public
as $$
declare
  _lead public.leads;
  _stage_norm text := upper(trim(coalesce(_stage,'')));
  _claim public.work_claims;
begin
  select * into _lead from public.leads where id=_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND' using errcode='P0001'; end if;

  if _stage_norm not in ('NEW','DOSSIER','MATCHED','TOUR_SCHEDULED','TOUR_CONFIRMED','TOUR_IN_PROGRESS','POST_VISIT','NEGOTIATION') then
    raise exception 'STAGE_REQUIRES_CANONICAL_CAPABILITY_EVIDENCE:%',_stage_norm using errcode='P0001';
  end if;

  select * into _claim from public.work_claims where lead_id=_lead_id and is_current=true limit 1;
  if not (
    _lead.current_owner=auth.uid()
    or _claim.operator_id=auth.uid()
    or public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'manager')
    or public.has_role(auth.uid(),'control_tower')
  ) then
    raise exception 'NOT_ACCOUNTABLE_FOR_LEAD' using errcode='42501';
  end if;

  insert into public.lead_timeline(lead_id,actor,activity,prev_stage,new_stage,detail)
  values(
    _lead_id,auth.uid(),'whatsapp_stage_confirmed',_lead.current_pipeline_stage,_stage_norm,
    concat('Human confirmed WhatsApp evidence',case when _observation_id is not null then concat(' observation ',_observation_id::text) else '' end)
  );

  update public.leads
     set current_pipeline_stage=_stage_norm,
         current_mission=coalesce(nullif(trim(coalesce(_mission,'')),''),current_mission),
         last_operator_action_at=now(),
         updated_at=now()
   where id=_lead_id
   returning * into _lead;

  update public.work_claims
     set last_meaningful_action_at=now(),
         expires_at=case when state='active' then now()+interval '10 minutes' else expires_at end,
         updated_at=now()
   where lead_id=_lead_id and is_current=true and operator_id=auth.uid();

  return _lead;
end;
$$;

grant execute on function public.confirm_flow_stage_hint(uuid,text,text,uuid) to authenticated;

create or replace function public.set_flow_next_action(
  _lead_id uuid,
  _kind text,
  _due_at timestamptz,
  _notes text default null
) returns public.next_actions
language plpgsql
security definer
set search_path=public
as $$
declare
  _lead public.leads;
  _claim public.work_claims;
  _row public.next_actions;
begin
  if _due_at is null or nullif(trim(coalesce(_kind,'')),'') is null then
    raise exception 'DATED_NEXT_ACTION_REQUIRED' using errcode='P0001';
  end if;

  select * into _lead from public.leads where id=_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND' using errcode='P0001'; end if;
  select * into _claim from public.work_claims where lead_id=_lead_id and is_current=true limit 1;

  if not (
    _lead.current_owner=auth.uid()
    or _claim.operator_id=auth.uid()
    or public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'manager')
    or public.has_role(auth.uid(),'control_tower')
  ) then
    raise exception 'NOT_ACCOUNTABLE_FOR_LEAD' using errcode='42501';
  end if;

  update public.next_actions
     set done_at=now(),status='done',updated_at=now()
   where lead_id=_lead_id and done_at is null and status<>'cancelled';

  insert into public.next_actions(lead_id,owner_id,kind,due_at,notes,source,status,priority,created_by)
  values(
    _lead_id,coalesce(_lead.current_owner,auth.uid()),trim(_kind),_due_at,_notes,'unified_customer_workspace','open',
    case when _due_at<=now()+interval '2 hours' then 'high' else 'normal' end,auth.uid()
  ) returning * into _row;

  update public.leads
     set current_mission=trim(_kind),last_operator_action_at=now(),updated_at=now()
   where id=_lead_id;

  update public.work_claims
     set next_action=trim(_kind),next_action_at=_due_at,last_meaningful_action_at=now(),
         expires_at=case when state='active' then now()+interval '10 minutes' else expires_at end,
         updated_at=now()
   where lead_id=_lead_id and is_current=true and operator_id=auth.uid();

  insert into public.lead_timeline(lead_id,actor,activity,detail,next_action,deadline)
  values(_lead_id,auth.uid(),'next_action_set',coalesce(_notes,'Dated next action saved'),trim(_kind),_due_at);

  return _row;
end;
$$;

grant execute on function public.set_flow_next_action(uuid,text,timestamptz,text) to authenticated;
