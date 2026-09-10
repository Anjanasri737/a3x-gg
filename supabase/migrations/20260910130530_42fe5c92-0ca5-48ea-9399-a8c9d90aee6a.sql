create table if not exists public.screenshot_batches (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid references auth.users(id) on delete set null,
  source_id uuid references public.whatsapp_sources(id) on delete set null,
  whatsapp_account text,
  capture_window_start timestamptz,
  capture_window_end timestamptz,
  uploaded_at timestamptz not null default now(),
  screenshot_count integer not null default 0 check (screenshot_count >= 0),
  visible_rows_expected integer not null default 0 check (visible_rows_expected >= 0),
  rows_segmented integer not null default 0 check (rows_segmented >= 0),
  rows_reconciled integer not null default 0 check (rows_reconciled >= 0),
  unresolved_count integer not null default 0 check (unresolved_count >= 0),
  status text not null default 'processing' check (status in ('processing','incomplete','complete','review')),
  metadata jsonb not null default '{}'::jsonb,
  detected_rows_total integer not null default 0,
  expected_override integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_screenshots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.screenshot_batches(id) on delete cascade,
  source_id uuid references public.whatsapp_sources(id) on delete set null,
  whatsapp_account text,
  image_hash text,
  captured_at timestamptz,
  uploaded_at timestamptz not null default now(),
  temporary_storage_path text,
  visible_row_count integer not null default 0 check (visible_row_count >= 0),
  processing_status text not null default 'pending' check (processing_status in (
    'pending','processing','uploaded','analyzing','parsed','extracted','review','complete','failed','error'
  )),
  raw_ocr_summary jsonb not null default '{}'::jsonb,
  extraction_model text,
  extraction_version text,
  extraction_confidence numeric,
  ai_visible_row_count integer,
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  file_name text,
  reused_from_screenshot_id uuid references public.whatsapp_screenshots(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_screenshots_image_hash_idx
  on public.whatsapp_screenshots(image_hash) where image_hash is not null;

create table if not exists public.screenshot_observations (
  id uuid primary key default gen_random_uuid(),
  screenshot_id uuid not null references public.whatsapp_screenshots(id) on delete cascade,
  batch_id uuid not null references public.screenshot_batches(id) on delete cascade,
  source_id uuid references public.whatsapp_sources(id) on delete set null,
  whatsapp_account text,
  row_index integer,
  row_top_px numeric,
  row_bottom_px numeric,
  contact_name text,
  phone_raw text,
  phone_normalized text,
  lead_id uuid references public.leads(id) on delete set null,
  visible_timestamp_raw text,
  last_message_preview text,
  preview_direction text not null default 'unknown' check (preview_direction in ('incoming','outgoing','unknown')),
  unread_visible boolean,
  unread_count integer,
  seen_state text not null default 'unknown' check (seen_state in ('seen','unseen','unknown')),
  whatsapp_row_color text,
  color_hint text,
  detected_label text,
  handler_hint text,
  stage_inference text,
  stage_confidence numeric check (stage_confidence is null or (stage_confidence >= 0 and stage_confidence <= 100)),
  ocr_confidence numeric check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 100)),
  raw_text text not null default '',
  captured_at timestamptz not null default now(),
  reconciliation_state text not null default 'needs_review' check (
    reconciliation_state in ('matched_existing','new_customer','returning_cycle','duplicate_observation','needs_review','non_customer')
  ),
  reconciliation_reason text,
  movement_signal text,
  intelligence jsonb not null default '{}'::jsonb,
  operator_edited boolean not null default false,
  work_bucket text,
  primary_mission text,
  blocker_hint text,
  created_at timestamptz not null default now()
);
create index if not exists screenshot_observations_phone_idx on public.screenshot_observations(phone_normalized, captured_at desc);
create index if not exists screenshot_observations_lead_idx on public.screenshot_observations(lead_id, captured_at desc);
create index if not exists screenshot_observations_batch_idx on public.screenshot_observations(batch_id);
create index if not exists screenshot_observations_source_idx on public.screenshot_observations(source_id, captured_at desc);

create table if not exists public.flow_label_rules (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.whatsapp_sources(id) on delete cascade,
  whatsapp_account text,
  name text not null,
  color_hint text,
  seen_state text check (seen_state is null or seen_state in ('seen','unseen','unknown')),
  text_pattern text,
  inferred_label text not null,
  inferred_priority text,
  inferred_bucket text,
  rank integer not null default 100,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.draft_batches (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references auth.users(id) on delete cascade,
  target_size integer not null default 30 check (target_size between 1 and 100),
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.work_claims (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  operator_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid references public.draft_batches(id) on delete set null,
  state text not null default 'drafted' check (state in ('available','drafted','active','released','completed')),
  bucket text not null default 'TODAY' check (bucket in ('NOW','TODAY','TOUR_READY','POST_TOUR','QUOTE_DUE','RECOVERY','FUTURE','WAITING_CUSTOMER','WAITING_SUPPLY','WAITING_OWNER','LOST')),
  is_current boolean not null default true,
  claimed_at timestamptz not null default now(),
  last_meaningful_action_at timestamptz not null default now(),
  expires_at timestamptz,
  released_at timestamptz,
  release_reason text,
  next_action text,
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists work_claims_one_current_per_lead_uq on public.work_claims(lead_id) where is_current = true;
create index if not exists work_claims_operator_idx on public.work_claims(operator_id, is_current, state);

create table if not exists public.draft_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.draft_batches(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  work_claim_id uuid references public.work_claims(id) on delete set null,
  rank integer not null,
  mission text,
  why_now text,
  score numeric not null default 0,
  status text not null default 'queued' check (status in ('queued','active','completed','released','future')),
  added_at timestamptz not null default now(),
  completed_at timestamptz,
  released_at timestamptz,
  unique(batch_id, lead_id)
);
create index if not exists draft_batch_items_batch_rank_idx on public.draft_batch_items(batch_id, rank);

alter table public.next_actions add column if not exists source text;
alter table public.next_actions add column if not exists triggered_by_observation_id uuid references public.screenshot_observations(id) on delete set null;
alter table public.next_actions add column if not exists status text not null default 'open';
alter table public.next_actions add column if not exists priority text;

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

alter table public.screenshot_batches enable row level security;
alter table public.whatsapp_screenshots enable row level security;
alter table public.screenshot_observations enable row level security;
alter table public.flow_label_rules enable row level security;
alter table public.draft_batches enable row level security;
alter table public.work_claims enable row level security;
alter table public.draft_batch_items enable row level security;
alter table public.flow_checkin_readiness enable row level security;

grant select,insert,update,delete on public.screenshot_batches to authenticated;
grant select,insert,update,delete on public.whatsapp_screenshots to authenticated;
grant select,insert,update,delete on public.screenshot_observations to authenticated;
grant select,insert,update,delete on public.flow_label_rules to authenticated;
grant select,insert,update,delete on public.draft_batches to authenticated;
grant select,insert,update,delete on public.work_claims to authenticated;
grant select,insert,update,delete on public.draft_batch_items to authenticated;
grant select,insert,update,delete on public.flow_checkin_readiness to authenticated;
grant all on public.screenshot_batches, public.whatsapp_screenshots, public.screenshot_observations,
  public.flow_label_rules, public.draft_batches, public.work_claims, public.draft_batch_items,
  public.flow_checkin_readiness to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='screenshot_batches' and policyname='team_screenshot_batches') then
    create policy team_screenshot_batches on public.screenshot_batches for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='whatsapp_screenshots' and policyname='team_whatsapp_screenshots') then
    create policy team_whatsapp_screenshots on public.whatsapp_screenshots for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='screenshot_observations' and policyname='team_screenshot_observations') then
    create policy team_screenshot_observations on public.screenshot_observations for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_label_rules' and policyname='team_flow_label_rules') then
    create policy team_flow_label_rules on public.flow_label_rules for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='draft_batches' and policyname='team_draft_batches') then
    create policy team_draft_batches on public.draft_batches for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='work_claims' and policyname='team_work_claims') then
    create policy team_work_claims on public.work_claims for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='draft_batch_items' and policyname='team_draft_batch_items') then
    create policy team_draft_batch_items on public.draft_batch_items for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_checkin_readiness' and policyname='flow_checkin_readiness_read') then
    create policy flow_checkin_readiness_read on public.flow_checkin_readiness for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_checkin_readiness' and policyname='flow_checkin_readiness_write') then
    create policy flow_checkin_readiness_write on public.flow_checkin_readiness for all to authenticated
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
  end if;
end $$;

create or replace function public.claim_flow_lead(
  _lead_id uuid, _operator_id uuid, _batch_id uuid default null, _bucket text default 'TODAY',
  _ttl_minutes integer default 10, _next_action text default null, _next_action_at timestamptz default null
) returns public.work_claims language plpgsql security definer set search_path = public as $$
declare _row public.work_claims;
begin
  update public.work_claims
     set is_current=false, state='released', released_at=now(),
         release_reason=coalesce(release_reason,'idle_expired'), updated_at=now()
   where lead_id=_lead_id and is_current=true and expires_at is not null and expires_at <= now();

  select * into _row from public.work_claims where lead_id=_lead_id and is_current=true for update;
  if found then
    if _row.operator_id = _operator_id then
      update public.work_claims
         set state=case when state='drafted' then 'active' else state end,
             last_meaningful_action_at=now(),
             expires_at=now()+make_interval(mins => greatest(1,_ttl_minutes)), updated_at=now()
       where id=_row.id returning * into _row;
      return _row;
    end if;
    raise exception 'LEAD_ALREADY_CLAIMED:%', _row.operator_id using errcode='P0001';
  end if;

  insert into public.work_claims(lead_id,operator_id,batch_id,state,bucket,is_current,claimed_at,last_meaningful_action_at,expires_at,next_action,next_action_at)
  values(_lead_id,_operator_id,_batch_id,'drafted',_bucket,true,now(),now(),now()+make_interval(mins => greatest(1,_ttl_minutes)),_next_action,_next_action_at)
  returning * into _row;
  return _row;
end; $$;

create or replace function public.touch_flow_claim(_claim_id uuid, _ttl_minutes integer default 10)
returns public.work_claims language plpgsql security definer set search_path = public as $$
declare _row public.work_claims;
begin
  update public.work_claims
     set state='active', last_meaningful_action_at=now(),
         expires_at=now()+make_interval(mins => greatest(1,_ttl_minutes)), updated_at=now()
   where id=_claim_id and is_current=true returning * into _row;
  return _row;
end; $$;

create or replace function public.release_flow_claim(_claim_id uuid, _reason text default 'completed')
returns void language sql security definer set search_path = public as $$
  update public.work_claims set is_current=false,
    state=case when _reason='completed' then 'completed' else 'released' end,
    released_at=now(), release_reason=_reason, updated_at=now()
  where id=_claim_id and is_current=true;
$$;

create or replace function public.apply_flow_label_rule()
returns trigger language plpgsql security definer set search_path=public as $$
declare _rule public.flow_label_rules;
begin
  if new.detected_label is not null and btrim(new.detected_label) <> '' then return new; end if;
  select * into _rule from public.flow_label_rules r
  where r.is_enabled = true
    and (r.whatsapp_account is null or r.whatsapp_account = new.whatsapp_account)
    and (r.color_hint is null or lower(r.color_hint) = lower(coalesce(new.color_hint,'')))
    and (r.seen_state is null or r.seen_state = new.seen_state)
    and (r.text_pattern is null or coalesce(new.last_message_preview,'') ~* r.text_pattern)
  order by r.rank asc, r.created_at asc limit 1;
  if found then new.detected_label := _rule.inferred_label; end if;
  return new;
end; $$;

drop trigger if exists screenshot_observation_label_rule on public.screenshot_observations;
create trigger screenshot_observation_label_rule
before insert or update of whatsapp_account,color_hint,seen_state,last_message_preview,detected_label
on public.screenshot_observations
for each row execute function public.apply_flow_label_rule();

create or replace function public.complete_flow_item(
  _batch_item_id uuid, _claim_id uuid, _outcome text,
  _next_action_kind text default null, _next_action_at timestamptz default null, _notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _item public.draft_batch_items; _claim public.work_claims;
  _lead_id uuid; _operator_id uuid; _next_item public.draft_batch_items;
begin
  select * into _item from public.draft_batch_items where id=_batch_item_id for update;
  if not found then raise exception 'BATCH_ITEM_NOT_FOUND' using errcode='P0001'; end if;
  select * into _claim from public.work_claims where id=_claim_id and is_current=true for update;
  if not found then raise exception 'ACTIVE_CLAIM_REQUIRED' using errcode='P0001'; end if;
  if _claim.lead_id <> _item.lead_id then raise exception 'CLAIM_LEAD_MISMATCH' using errcode='P0001'; end if;
  if _claim.operator_id <> auth.uid() and not public.has_role(auth.uid(),'admin') and not public.has_role(auth.uid(),'manager') and not public.has_role(auth.uid(),'control_tower') then
    raise exception 'NOT_CURRENT_HANDLER' using errcode='42501';
  end if;

  _lead_id := _item.lead_id; _operator_id := _claim.operator_id;

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
      values(_lead_id,_operator_id,_next_action_kind,_next_action_at,_notes,'complete_next','open',
        case when _next_action_at <= now()+interval '2 hours' then 'high' else 'normal' end, auth.uid());
  elsif _outcome in ('completed','lost','booked','checked_in') then
    update public.next_actions set done_at=now(), status='done', updated_at=now()
      where lead_id=_lead_id and done_at is null and status <> 'cancelled';
  end if;

  update public.draft_batch_items
    set status=case when _outcome in ('future','waiting') then 'future' else 'completed' end,
        completed_at=case when _outcome in ('future','waiting') then null else now() end,
        released_at=now()
    where id=_batch_item_id;

  update public.work_claims
    set is_current=false, state='completed', released_at=now(), release_reason=_outcome,
        next_action=_next_action_kind, next_action_at=_next_action_at, updated_at=now()
    where id=_claim_id;

  if _outcome='lost' then
    update public.leads set current_pipeline_stage='LOST', status='closed', updated_at=now() where id=_lead_id;
  elsif _outcome='checked_in' then
    update public.leads set current_pipeline_stage='CHECKED_IN', status='closed', updated_at=now() where id=_lead_id;
  elsif _outcome='booked' then
    update public.leads set current_pipeline_stage='BOOKED', updated_at=now() where id=_lead_id;
  end if;

  select * into _next_item from public.draft_batch_items
  where batch_id=_item.batch_id and status='queued' order by rank asc limit 1 for update skip locked;
  if found then update public.draft_batch_items set status='active' where id=_next_item.id; end if;

  if not exists(select 1 from public.draft_batch_items where batch_id=_item.batch_id and status in ('queued','active')) then
    update public.draft_batches set status='completed', completed_at=now() where id=_item.batch_id;
  end if;

  return jsonb_build_object('completed_item_id',_batch_item_id,'lead_id',_lead_id,'outcome',_outcome,
    'next_item_id',_next_item.id,'next_lead_id',_next_item.lead_id);
end; $$;

create or replace function public.confirm_flow_checkin(_lead_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _r public.flow_checkin_readiness; _lead public.leads;
begin
  select * into _lead from public.leads where id=_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND' using errcode='P0001'; end if;
  if _lead.current_owner<>auth.uid()
     and not exists(select 1 from public.work_claims wc where wc.lead_id=_lead_id and wc.operator_id=auth.uid() and wc.is_current=true)
     and not public.has_role(auth.uid(),'admin') and not public.has_role(auth.uid(),'manager')
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
end; $$;

drop view if exists public.flow_revenue_leakage;
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
  from public.next_actions where done_at is null and status <> 'cancelled'
  order by lead_id,due_at asc
), current_claim as (select * from public.work_claims where is_current=true)
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
    when l.current_pipeline_stage in ('CHECKED_IN','LOST') then 'GREEN'
    when l.current_owner is null and cc.id is null and oa.next_action_id is null then 'RED'
    when coalesce(lo.unread_visible,false) and cc.id is null and oa.next_action_id is null then 'RED'
    when oa.due_at is not null and oa.due_at > now()+interval '24 hours' then 'GREY'
    when lo.stage_inference is not null and l.current_pipeline_stage is distinct from lo.stage_inference then 'AMBER'
    else 'GREEN'
  end sync_state
from public.leads l
left join latest_obs lo on lo.lead_id=l.id
left join current_claim cc on cc.lead_id=l.id
left join open_action oa on oa.lead_id=l.id
left join public.profiles owner on owner.user_id=l.current_owner
left join public.profiles handler on handler.user_id=cc.operator_id
where l.status <> 'closed' or l.current_pipeline_stage in ('CHECKED_IN','LOST');

grant select on public.flow_three_day_truth to authenticated;

create view public.flow_revenue_leakage as
with truth as (select * from public.flow_three_day_truth),
unresolved as (
  select null::uuid lead_id,o.id observation_id,o.phone_normalized phone,o.contact_name wa_name,
    null::uuid current_owner,null::text current_owner_name,null::uuid current_handler,null::text current_handler_name,
    null::text current_pipeline_stage,o.captured_at latest_observation_at,o.last_message_preview,
    'OCR_UNRESOLVED'::text leak_type,
    'Visible WhatsApp row is not linked to a canonical CRM customer'::text why_red,100::integer severity
  from public.screenshot_observations o
  where o.captured_at>=now()-interval '3 days' and o.reconciliation_state='needs_review' and o.lead_id is null
)
select t.lead_id,t.observation_id,t.phone,t.wa_name,t.current_owner,t.current_owner_name,
  t.current_handler,t.current_handler_name,t.current_pipeline_stage,t.latest_observation_at,t.last_message_preview,
  case
    when t.current_owner is null and t.current_handler is null and t.next_action_id is null then 'UNOWNED'
    when coalesce(t.unread_visible,false) and t.current_handler is null and t.next_action_id is null then 'FRESH_INBOUND_UNATTENDED'
    when t.next_action_id is null and t.current_pipeline_stage not in ('CHECKED_IN','LOST') then 'NO_NEXT_ACTION'
    when t.current_pipeline_stage='DOSSIER' and t.stage_inference in ('TOUR_SCHEDULED','TOUR_IN_PROGRESS') then 'QUALIFIED_NO_TOUR'
    when t.current_pipeline_stage='POST_VISIT' and coalesce(t.latest_observation_at,now()-interval '1 day') < now()-interval '15 minutes' then 'TOUR_NO_POST_VISIT'
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
  case when coalesce(t.unread_visible,false) then 95 when t.current_pipeline_stage in ('POST_VISIT','QUOTED','NEGOTIATION','BOOKED') then 90 else 75 end severity
from truth t
where t.sync_state='RED' or (t.sync_state='AMBER' and t.current_pipeline_stage not in ('CHECKED_IN','LOST'))
union all select * from unresolved;

grant select on public.flow_revenue_leakage to authenticated;

create or replace view public.flow_checkin_status as
select l.id lead_id,l.phone,l.wa_name,l.current_pipeline_stage,
  r.payment_verified,r.payment_ref,r.room_number,r.bed_reference,r.owner_approval_status,
  r.kyc_done,r.agreement_done,r.arrived_at,r.keys_handed_over_at,r.confirmed_at,
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
  (coalesce(r.payment_verified,false)=true
   and nullif(trim(coalesce(r.room_number,r.bed_reference,'')),'') is not null
   and r.owner_approval_status in ('not_required','approved')
   and coalesce(r.kyc_done,false)=true and coalesce(r.agreement_done,false)=true
   and r.arrived_at is not null and r.keys_handed_over_at is not null) ready_to_confirm
from public.leads l
left join public.flow_checkin_readiness r on r.lead_id=l.id;

grant select on public.flow_checkin_status to authenticated;

grant execute on function public.claim_flow_lead(uuid,uuid,uuid,text,integer,text,timestamptz) to authenticated;
grant execute on function public.touch_flow_claim(uuid,integer) to authenticated;
grant execute on function public.release_flow_claim(uuid,text) to authenticated;
grant execute on function public.complete_flow_item(uuid,uuid,text,text,timestamptz,text) to authenticated;
grant execute on function public.confirm_flow_checkin(uuid) to authenticated;