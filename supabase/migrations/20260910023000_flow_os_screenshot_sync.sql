-- Gharpayy Flow OS — Screenshot / WhatsApp truth reconciliation + 8-person work claims
-- Additive migration. Existing lead/tower/pipeline tables are preserved.

create extension if not exists pgcrypto;

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
  processing_status text not null default 'pending' check (processing_status in ('pending','processing','parsed','review','complete','failed')),
  raw_ocr_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists whatsapp_screenshots_exact_hash_uq
  on public.whatsapp_screenshots(coalesce(source_id::text, whatsapp_account, ''), image_hash)
  where image_hash is not null;

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

-- Advisory, denormalized convenience fields for fast card reads. Commercial truth remains in the canonical pipeline.
alter table public.leads add column if not exists latest_whatsapp_observation_at timestamptz;
alter table public.leads add column if not exists latest_whatsapp_preview text;
alter table public.leads add column if not exists whatsapp_sync_state text;
alter table public.leads add column if not exists whatsapp_seen_state text;
alter table public.leads add column if not exists inferred_stage text;
alter table public.leads add column if not exists inferred_label text;

-- Atomic claim RPC. Expired claims are retired before a new claim is attempted.
create or replace function public.claim_flow_lead(
  _lead_id uuid,
  _operator_id uuid,
  _batch_id uuid default null,
  _bucket text default 'TODAY',
  _ttl_minutes integer default 10,
  _next_action text default null,
  _next_action_at timestamptz default null
) returns public.work_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.work_claims;
begin
  update public.work_claims
     set is_current = false,
         state = 'released',
         released_at = now(),
         release_reason = coalesce(release_reason, 'idle_expired'),
         updated_at = now()
   where lead_id = _lead_id
     and is_current = true
     and expires_at is not null
     and expires_at <= now();

  select * into _row from public.work_claims where lead_id = _lead_id and is_current = true for update;
  if found then
    if _row.operator_id = _operator_id then
      update public.work_claims
         set state = case when state = 'drafted' then 'active' else state end,
             last_meaningful_action_at = now(),
             expires_at = now() + make_interval(mins => greatest(1, _ttl_minutes)),
             updated_at = now()
       where id = _row.id
       returning * into _row;
      return _row;
    end if;
    raise exception 'LEAD_ALREADY_CLAIMED:%', _row.operator_id using errcode = 'P0001';
  end if;

  insert into public.work_claims(lead_id, operator_id, batch_id, state, bucket, is_current, claimed_at, last_meaningful_action_at, expires_at, next_action, next_action_at)
  values (_lead_id, _operator_id, _batch_id, 'drafted', _bucket, true, now(), now(), now() + make_interval(mins => greatest(1, _ttl_minutes)), _next_action, _next_action_at)
  returning * into _row;
  return _row;
end;
$$;

create or replace function public.touch_flow_claim(_claim_id uuid, _ttl_minutes integer default 10)
returns public.work_claims
language plpgsql
security definer
set search_path = public
as $$
declare _row public.work_claims;
begin
  update public.work_claims
     set state = 'active', last_meaningful_action_at = now(), expires_at = now() + make_interval(mins => greatest(1, _ttl_minutes)), updated_at = now()
   where id = _claim_id and is_current = true
   returning * into _row;
  return _row;
end;
$$;

create or replace function public.release_flow_claim(_claim_id uuid, _reason text default 'completed')
returns void
language sql
security definer
set search_path = public
as $$
  update public.work_claims set is_current=false, state=case when _reason='completed' then 'completed' else 'released' end,
    released_at=now(), release_reason=_reason, updated_at=now() where id=_claim_id and is_current=true;
$$;

-- Three-day truth view. It exposes evidence and accountability without pretending an inferred stage is saved commercial truth.
create or replace view public.flow_three_day_truth as
with latest_obs as (
  select distinct on (lead_id)
    lead_id, id observation_id, captured_at, last_message_preview, preview_direction, unread_visible, unread_count,
    seen_state, color_hint, detected_label, handler_hint, stage_inference, stage_confidence
  from public.screenshot_observations
  where lead_id is not null and captured_at >= now() - interval '3 days'
  order by lead_id, captured_at desc, created_at desc
), open_action as (
  select distinct on (lead_id) lead_id, id next_action_id, kind, due_at, owner_id
  from public.next_actions
  where done_at is null and status <> 'cancelled'
  order by lead_id, due_at asc
), current_claim as (
  select * from public.work_claims where is_current=true
)
select
  l.id lead_id,
  l.phone,
  l.wa_name,
  l.current_owner,
  l.status lead_status,
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
  oa.next_action_id,
  oa.kind next_action_kind,
  oa.due_at next_action_at,
  case
    when lo.observation_id is null then 'GREY'
    when l.current_owner is null and cc.id is null and oa.next_action_id is null then 'RED'
    when coalesce(lo.unread_visible,false) and cc.id is null and oa.next_action_id is null then 'RED'
    when oa.due_at is not null and oa.due_at > now() + interval '24 hours' then 'GREY'
    when lo.stage_inference is not null and l.inferred_stage is distinct from lo.stage_inference then 'AMBER'
    else 'GREEN'
  end sync_state
from public.leads l
left join latest_obs lo on lo.lead_id=l.id
left join current_claim cc on cc.lead_id=l.id
left join open_action oa on oa.lead_id=l.id;

grant select, insert, update, delete on public.screenshot_batches, public.whatsapp_screenshots, public.screenshot_observations, public.flow_label_rules, public.draft_batches, public.work_claims, public.draft_batch_items to authenticated;
grant select on public.flow_three_day_truth to authenticated;
grant execute on function public.claim_flow_lead(uuid,uuid,uuid,text,integer,text,timestamptz) to authenticated;
grant execute on function public.touch_flow_claim(uuid,integer) to authenticated;
grant execute on function public.release_flow_claim(uuid,text) to authenticated;

alter table public.screenshot_batches enable row level security;
alter table public.whatsapp_screenshots enable row level security;
alter table public.screenshot_observations enable row level security;
alter table public.flow_label_rules enable row level security;
alter table public.draft_batches enable row level security;
alter table public.work_claims enable row level security;
alter table public.draft_batch_items enable row level security;

-- Operators can work records they create/claim; control tower/admin/manager can review all.
create policy screenshot_batches_read on public.screenshot_batches for select to authenticated using (true);
create policy screenshot_batches_write on public.screenshot_batches for all to authenticated using (uploader_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'control_tower')) with check (uploader_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'control_tower'));
create policy whatsapp_screenshots_read on public.whatsapp_screenshots for select to authenticated using (true);
create policy whatsapp_screenshots_write on public.whatsapp_screenshots for all to authenticated using (true) with check (true);
create policy screenshot_observations_read on public.screenshot_observations for select to authenticated using (true);
create policy screenshot_observations_write on public.screenshot_observations for all to authenticated using (true) with check (true);
create policy flow_label_rules_read on public.flow_label_rules for select to authenticated using (true);
create policy flow_label_rules_write on public.flow_label_rules for all to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'control_tower')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'control_tower'));
create policy draft_batches_read on public.draft_batches for select to authenticated using (operator_id=auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'control_tower'));
create policy draft_batches_write on public.draft_batches for all to authenticated using (operator_id=auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'control_tower')) with check (operator_id=auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'control_tower'));
create policy work_claims_read on public.work_claims for select to authenticated using (true);
create policy work_claims_write on public.work_claims for all to authenticated using (operator_id=auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'control_tower')) with check (operator_id=auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'control_tower'));
create policy draft_batch_items_read on public.draft_batch_items for select to authenticated using (true);
create policy draft_batch_items_write on public.draft_batch_items for all to authenticated using (true) with check (true);
