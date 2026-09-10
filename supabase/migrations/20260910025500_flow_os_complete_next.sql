-- Atomic disposition for Draft 30 / Active 13.
-- It prevents closing work without either a terminal outcome or a dated next action.

create or replace function public.complete_flow_item(
  _batch_item_id uuid,
  _claim_id uuid,
  _outcome text,
  _next_action_kind text default null,
  _next_action_at timestamptz default null,
  _notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _item public.draft_batch_items;
  _claim public.work_claims;
  _lead_id uuid;
  _operator_id uuid;
  _next_item public.draft_batch_items;
begin
  select * into _item from public.draft_batch_items where id = _batch_item_id for update;
  if not found then raise exception 'BATCH_ITEM_NOT_FOUND' using errcode='P0001'; end if;

  select * into _claim from public.work_claims where id = _claim_id and is_current = true for update;
  if not found then raise exception 'ACTIVE_CLAIM_REQUIRED' using errcode='P0001'; end if;
  if _claim.lead_id <> _item.lead_id then raise exception 'CLAIM_LEAD_MISMATCH' using errcode='P0001'; end if;
  if _claim.operator_id <> auth.uid() and not public.has_role(auth.uid(),'admin') and not public.has_role(auth.uid(),'manager') and not public.has_role(auth.uid(),'control_tower') then
    raise exception 'NOT_CURRENT_HANDLER' using errcode='42501';
  end if;

  _lead_id := _item.lead_id;
  _operator_id := _claim.operator_id;

  if _outcome not in ('completed','future','waiting','lost','booked','checked_in','handoff') then
    raise exception 'INVALID_OUTCOME' using errcode='P0001';
  end if;

  if _outcome in ('future','waiting','handoff') and (_next_action_at is null or nullif(trim(coalesce(_next_action_kind,'')),'') is null) then
    raise exception 'DATED_NEXT_ACTION_REQUIRED' using errcode='P0001';
  end if;

  if _outcome = 'lost' and nullif(trim(coalesce(_notes,'')),'') is null then
    raise exception 'LOST_REASON_REQUIRED' using errcode='P0001';
  end if;

  if _next_action_at is not null and nullif(trim(coalesce(_next_action_kind,'')),'') is not null then
    update public.next_actions set done_at=now(), status='done', updated_at=now()
      where lead_id=_lead_id and done_at is null and status <> 'cancelled';
    insert into public.next_actions(lead_id, owner_id, kind, due_at, notes, source, status, priority, created_by)
      values(_lead_id, _operator_id, _next_action_kind, _next_action_at, _notes, 'complete_next', 'open',
        case when _next_action_at <= now()+interval '2 hours' then 'high' else 'normal' end, auth.uid());
  elsif _outcome in ('completed','lost','booked','checked_in') then
    update public.next_actions set done_at=now(), status='done', updated_at=now()
      where lead_id=_lead_id and done_at is null and status <> 'cancelled';
  end if;

  update public.draft_batch_items
    set status = case when _outcome in ('future','waiting') then 'future' else 'completed' end,
        completed_at = case when _outcome in ('future','waiting') then null else now() end,
        released_at = now()
    where id = _batch_item_id;

  update public.work_claims
    set is_current=false,
        state='completed',
        released_at=now(),
        release_reason=_outcome,
        next_action=_next_action_kind,
        next_action_at=_next_action_at,
        updated_at=now()
    where id=_claim_id;

  if _outcome = 'lost' then
    update public.leads set current_pipeline_stage='LOST', status='closed', updated_at=now() where id=_lead_id;
  elsif _outcome = 'checked_in' then
    update public.leads set current_pipeline_stage='CHECKED_IN', status='closed', updated_at=now() where id=_lead_id;
  elsif _outcome = 'booked' then
    update public.leads set current_pipeline_stage='BOOKED', updated_at=now() where id=_lead_id;
  end if;

  select * into _next_item
  from public.draft_batch_items
  where batch_id=_item.batch_id and status='queued'
  order by rank asc
  limit 1
  for update skip locked;

  if found then
    update public.draft_batch_items set status='active' where id=_next_item.id;
  end if;

  if not exists(select 1 from public.draft_batch_items where batch_id=_item.batch_id and status in ('queued','active')) then
    update public.draft_batches set status='completed', completed_at=now() where id=_item.batch_id;
  end if;

  return jsonb_build_object(
    'completed_item_id', _batch_item_id,
    'lead_id', _lead_id,
    'outcome', _outcome,
    'next_item_id', _next_item.id,
    'next_lead_id', _next_item.lead_id
  );
end;
$$;

grant execute on function public.complete_flow_item(uuid,uuid,text,text,timestamptz,text) to authenticated;
