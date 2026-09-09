-- GHARPAYY FLOW OS — Screenshot -> Check-in Revenue Guarantee foundation
-- Additive migration designed to coexist with the current app while creating
-- canonical persistence for OCR observations, work claims, drafting and check-in.

create extension if not exists pgcrypto;

-- ---------- Core enums ----------
do $$ begin
  create type public.flow_claim_state as enum ('available','drafted','active','released','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.flow_bucket as enum ('NOW','TODAY','TOUR_READY','POST_TOUR','QUOTE_DUE','RECOVERY','FUTURE','WAITING_CUSTOMER','WAITING_SUPPLY','WAITING_OWNER','LOST');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.flow_resolution_type as enum ('existing','new','returning','duplicate_observation','review','non_customer');
exception when duplicate_object then null; end $$;

-- ---------- Core operational tables used by the current Tower ----------
create table if not exists public.profiles (
  user_id uuid primary key default gen_random_uuid(),
  full_name text,
  phone text,
  zone_id uuid,
  performer_category text default 'B',
  is_clocked_in boolean not null default true,
  is_available boolean not null default true,
  is_restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  inventory_strength integer not null default 3 check (inventory_strength between 0 and 5),
  is_serviceable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_zone_id_fkey;
alter table public.profiles add constraint profiles_zone_id_fkey foreign key (zone_id) references public.zones(id) on delete set null;

create table if not exists public.whatsapp_sources (
  id uuid primary key default gen_random_uuid(),
  wa_number text,
  label text not null,
  campaign text,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  public_ulid text unique,
  phone text,
  phone_e164 text,
  wa_name text,
  name text,
  email text,
  current_owner uuid,
  zone_id uuid references public.zones(id) on delete set null,
  location_text text,
  budget numeric,
  movein_bucket text,
  movein_date date,
  location_score numeric not null default 0,
  movein_score numeric not null default 0,
  score numeric not null default 0,
  priority text default 'active',
  status text not null default 'open',
  pipeline_stage text not null default 'NEW',
  disposition text,
  next_action_at timestamptz,
  next_action_kind text,
  last_whatsapp_movement_at timestamptz,
  last_whatsapp_preview text,
  last_seen_state text,
  last_color_cue text,
  last_semantic_label text,
  observed_handler_hint text,
  canonical_handler_name text,
  checkin_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_future_requires_next_action check (
    disposition not in ('FUTURE','WAITING') or next_action_at is not null
  )
);

create unique index if not exists leads_phone_e164_unique_not_null on public.leads(phone_e164) where phone_e164 is not null and phone_e164 <> '';
create index if not exists leads_pipeline_stage_idx on public.leads(pipeline_stage);
create index if not exists leads_current_owner_idx on public.leads(current_owner);
create index if not exists leads_next_action_idx on public.leads(next_action_at);
create index if not exists leads_movein_idx on public.leads(movein_date);

create table if not exists public.lead_cycles (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  cycle_no integer not null default 1,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  open_reason text,
  close_reason text,
  created_at timestamptz not null default now(),
  unique (lead_id, cycle_no)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  cycle_id uuid references public.lead_cycles(id) on delete set null,
  owner_id uuid,
  previous_owner uuid,
  priority text,
  state text not null default 'pending_accept',
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  first_action_at timestamptz,
  sla_deadline_accept timestamptz,
  sla_deadline_first_action timestamptz,
  reassign_reason text,
  reassigned_at timestamptz
);

create index if not exists assignments_lead_idx on public.assignments(lead_id, assigned_at desc);
create index if not exists assignments_owner_state_idx on public.assignments(owner_id, state);

create table if not exists public.next_actions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid,
  kind text not null,
  due_at timestamptz not null,
  done_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists next_actions_due_idx on public.next_actions(due_at) where done_at is null;
create index if not exists next_actions_lead_idx on public.next_actions(lead_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor uuid,
  actor_name text,
  entity text not null,
  entity_id uuid,
  action text not null,
  prev jsonb,
  next jsonb,
  reason text,
  at timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity, entity_id, at desc);

create table if not exists public.lead_timeline (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid,
  actor_name text,
  kind text not null,
  text text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_timeline_lead_idx on public.lead_timeline(lead_id, created_at desc);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.inbound_conversations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.whatsapp_sources(id) on delete set null,
  wa_name text,
  phone text,
  first_message text,
  last_message text,
  conversation_link text,
  received_at timestamptz not null default now(),
  captured_at timestamptz,
  captured_by uuid,
  lead_id uuid references public.leads(id) on delete set null,
  cycle_id uuid references public.lead_cycles(id) on delete set null
);
create index if not exists inbound_conversations_phone_idx on public.inbound_conversations(phone);
create index if not exists inbound_conversations_lead_idx on public.inbound_conversations(lead_id, received_at desc);

create table if not exists public.duplicate_matches (
  id uuid primary key default gen_random_uuid(),
  phone text,
  existing_lead_id uuid references public.leads(id) on delete cascade,
  new_conversation_id uuid references public.inbound_conversations(id) on delete cascade,
  resolution text,
  created_at timestamptz not null default now()
);

create table if not exists public.workload_points (
  user_id uuid primary key,
  points numeric not null default 0,
  max_points numeric not null default 25,
  uncontacted integer not null default 0,
  overdue_followups integer not null default 0,
  tours_no_outcome integer not null default 0,
  positive_no_quote integer not null default 0,
  active_no_next_action integer not null default 0,
  state text not null default 'available',
  updated_at timestamptz not null default now()
);

-- ---------- Screenshot reconciliation ----------
create table if not exists public.screenshot_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid,
  whatsapp_account text,
  capture_from timestamptz,
  capture_to timestamptz,
  screenshot_count integer not null default 0,
  visible_rows_expected integer not null default 0,
  segmented_rows integer not null default 0,
  reconciled_rows integer not null default 0,
  unresolved_rows integer not null default 0,
  justified_exclusions integer not null default 0,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint screenshot_batch_counts_nonnegative check (
    screenshot_count >= 0 and visible_rows_expected >= 0 and segmented_rows >= 0 and reconciled_rows >= 0 and unresolved_rows >= 0 and justified_exclusions >= 0
  )
);

create table if not exists public.screenshots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.screenshot_batches(id) on delete cascade,
  source_id uuid references public.whatsapp_sources(id) on delete set null,
  whatsapp_account text,
  screenshot_hash text,
  captured_at timestamptz,
  storage_path text,
  visible_row_count integer,
  processing_state text not null default 'uploaded',
  created_at timestamptz not null default now()
);
create unique index if not exists screenshots_hash_account_unique on public.screenshots(screenshot_hash, whatsapp_account) where screenshot_hash is not null;

create table if not exists public.screenshot_observations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.screenshot_batches(id) on delete cascade,
  screenshot_id uuid not null references public.screenshots(id) on delete cascade,
  source_id uuid references public.whatsapp_sources(id) on delete set null,
  whatsapp_account text,
  captured_at timestamptz not null default now(),
  row_index integer,
  row_top_px integer,
  row_bottom_px integer,
  contact_name text,
  phone_raw text,
  phone_e164 text,
  last_message_preview text,
  visible_timestamp_raw text,
  seen_state text not null default 'unknown',
  unread_count integer,
  color_cue text,
  raw_label_cue text,
  semantic_label text,
  observed_handler_hint text,
  ocr_confidence text not null default 'low',
  raw_text text not null default '',
  movement_signal text,
  resolved_lead_id uuid references public.leads(id) on delete set null,
  resolution_type public.flow_resolution_type,
  review_state text not null default 'pending',
  warnings jsonb not null default '[]'::jsonb,
  observation_fingerprint text,
  created_at timestamptz not null default now()
);
create unique index if not exists screenshot_observation_fingerprint_unique on public.screenshot_observations(observation_fingerprint) where observation_fingerprint is not null;
create index if not exists screenshot_observations_lead_idx on public.screenshot_observations(resolved_lead_id, captured_at desc);
create index if not exists screenshot_observations_batch_idx on public.screenshot_observations(batch_id);
create index if not exists screenshot_observations_phone_idx on public.screenshot_observations(phone_e164);

create table if not exists public.reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  observation_id uuid references public.screenshot_observations(id) on delete set null,
  event_type text not null,
  severity text not null default 'info',
  reason text,
  payload jsonb,
  owner_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reconciliation_events_open_idx on public.reconciliation_events(severity, created_at desc) where resolved_at is null;

-- ---------- Drafting and collision control ----------
create table if not exists public.draft_batches (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  target_size integer not null default 30,
  state text not null default 'active',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists draft_batches_operator_idx on public.draft_batches(operator_id, created_at desc);

create table if not exists public.work_claims (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  operator_id uuid not null,
  batch_id uuid references public.draft_batches(id) on delete set null,
  claim_state public.flow_claim_state not null default 'drafted',
  bucket public.flow_bucket not null default 'TODAY',
  claimed_at timestamptz not null default now(),
  last_meaningful_action_at timestamptz not null default now(),
  expires_at timestamptz,
  released_at timestamptz,
  release_reason text,
  next_action text,
  next_action_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists one_live_claim_per_lead on public.work_claims(lead_id) where claim_state in ('drafted','active');
create index if not exists work_claims_operator_idx on public.work_claims(operator_id, claim_state, claimed_at desc);
create index if not exists work_claims_expiry_idx on public.work_claims(expires_at) where claim_state in ('drafted','active');

-- ---------- Booking / check-in persistence ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  cycle_id uuid references public.lead_cycles(id) on delete set null,
  property_id text,
  room_id text,
  bed_id text,
  amount numeric,
  payment_ref text,
  payment_verified boolean not null default false,
  owner_approval_required boolean not null default false,
  owner_approved boolean not null default false,
  booked_at timestamptz not null default now(),
  status text not null default 'booked',
  created_at timestamptz not null default now()
);
create index if not exists bookings_lead_idx on public.bookings(lead_id, booked_at desc);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  arrived_at timestamptz,
  room_allocated boolean not null default false,
  payment_verified boolean not null default false,
  owner_approval_complete boolean not null default false,
  kyc_done boolean not null default false,
  agreement_done boolean not null default false,
  keys_handed_over boolean not null default false,
  nps_score integer check (nps_score is null or (nps_score between 0 and 10)),
  checked_in_at timestamptz,
  manager_override_by uuid,
  manager_override_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checkins_lead_idx on public.checkins(lead_id, created_at desc);

create table if not exists public.crib_bookings (
  id uuid primary key default gen_random_uuid(),
  token text unique default encode(gen_random_bytes(12), 'hex'),
  lead_id uuid references public.leads(id) on delete set null,
  cycle_id uuid references public.lead_cycles(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  quotation_id uuid,
  property_id text,
  property_name text,
  room_type_id text,
  tenant_name text not null,
  country_code text not null default '+91',
  tenant_phone text not null,
  agreement_start_date date not null default current_date,
  rent_cycle text not null default 'monthly',
  monthly_rent numeric not null default 0,
  security_deposit numeric not null default 0,
  maintenance_amount numeric not null default 0,
  agreement_duration integer not null default 11,
  lock_in_period integer not null default 3,
  notice_period integer not null default 1,
  due_type text not null default 'day_of_month',
  due_value text not null default '5',
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Settings defaults ----------
insert into public.system_settings(key, value) values
  ('flow_os.claim_expiry_minutes', '10'::jsonb),
  ('flow_os.draft_batch_size', '30'::jsonb),
  ('flow_os.active_tray_cap', '13'::jsonb),
  ('flow_os.color_label_rules', '[]'::jsonb)
on conflict (key) do nothing;

-- ---------- Atomic claim functions ----------
create or replace function public.claim_lead(
  p_lead_id uuid,
  p_operator_id uuid,
  p_batch_id uuid default null,
  p_claim_state public.flow_claim_state default 'drafted',
  p_ttl_minutes integer default 10
) returns public.work_claims
language plpgsql
as $$
declare
  v_claim public.work_claims;
begin
  update public.work_claims
     set claim_state='released', released_at=now(), release_reason='expired before reclaim'
   where lead_id=p_lead_id
     and claim_state in ('drafted','active')
     and coalesce(expires_at, last_meaningful_action_at + make_interval(mins => p_ttl_minutes)) <= now();

  insert into public.work_claims(lead_id, operator_id, batch_id, claim_state, claimed_at, last_meaningful_action_at, expires_at)
  values (p_lead_id, p_operator_id, p_batch_id, p_claim_state, now(), now(), now() + make_interval(mins => p_ttl_minutes))
  returning * into v_claim;

  return v_claim;
exception when unique_violation then
  raise exception 'LEAD_ALREADY_CLAIMED';
end;
$$;

create or replace function public.release_claim(
  p_claim_id uuid,
  p_operator_id uuid,
  p_reason text
) returns boolean
language plpgsql
as $$
begin
  update public.work_claims
     set claim_state='released', released_at=now(), release_reason=p_reason
   where id=p_claim_id and operator_id=p_operator_id and claim_state in ('drafted','active');
  if not found then return false; end if;
  insert into public.audit_logs(actor, entity, entity_id, action, reason)
  values (p_operator_id, 'work_claim', p_claim_id, 'released', p_reason);
  return true;
end;
$$;

create or replace function public.expire_stale_claims(p_now timestamptz default now())
returns integer
language plpgsql
as $$
declare v_count integer;
begin
  update public.work_claims
     set claim_state='released', released_at=p_now, release_reason='stale claim expiry'
   where claim_state in ('drafted','active')
     and coalesce(expires_at, last_meaningful_action_at + interval '10 minutes') <= p_now;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.create_draft_batch(
  p_operator_id uuid,
  p_target_size integer default 30,
  p_ttl_minutes integer default 10
) returns uuid
language plpgsql
as $$
declare
  v_batch uuid;
  v_lead record;
begin
  perform public.expire_stale_claims(now());
  insert into public.draft_batches(operator_id, target_size)
  values (p_operator_id, greatest(1, p_target_size))
  returning id into v_batch;

  for v_lead in
    select l.id
      from public.leads l
     where l.status <> 'closed'
       and l.pipeline_stage <> 'LOST'
       and not exists (
         select 1 from public.work_claims c
          where c.lead_id=l.id and c.claim_state in ('drafted','active')
       )
     order by
       case when l.last_seen_state='unseen' then 0 else 1 end,
       coalesce(l.next_action_at, '9999-12-31'::timestamptz),
       coalesce(l.movein_date, '9999-12-31'::date),
       l.score desc,
       l.updated_at asc
     for update skip locked
     limit greatest(1, p_target_size)
  loop
    begin
      perform public.claim_lead(v_lead.id, p_operator_id, v_batch, 'drafted', p_ttl_minutes);
    exception when others then
      null;
    end;
  end loop;

  return v_batch;
end;
$$;

-- ---------- Check-in gate function ----------
create or replace function public.confirm_checkin(p_checkin_id uuid, p_actor uuid default null, p_override_reason text default null)
returns boolean
language plpgsql
as $$
declare
  c public.checkins;
begin
  select * into c from public.checkins where id=p_checkin_id for update;
  if not found then raise exception 'CHECKIN_NOT_FOUND'; end if;

  if not (c.room_allocated and c.payment_verified and c.owner_approval_complete and c.kyc_done and c.agreement_done and c.keys_handed_over) then
    if p_override_reason is null or length(trim(p_override_reason)) < 5 then
      raise exception 'CHECKIN_GATES_INCOMPLETE';
    end if;
    update public.checkins set manager_override_by=p_actor, manager_override_reason=p_override_reason where id=p_checkin_id;
  end if;

  update public.checkins set checked_in_at=coalesce(checked_in_at, now()), updated_at=now() where id=p_checkin_id;
  update public.leads set pipeline_stage='CHECKED_IN', status='closed', disposition='CHECKED_IN', next_action_at=null, updated_at=now() where id=c.lead_id;
  insert into public.audit_logs(actor, entity, entity_id, action, reason) values (p_actor, 'checkin', p_checkin_id, 'confirmed', p_override_reason);
  return true;
end;
$$;

-- ---------- Demo seed: only if empty, clearly operational placeholders ----------
insert into public.zones(code,name,inventory_strength)
select * from (values
 ('KORA','Koramangala',4),('WFD','Whitefield',4),('MWB','Marathahalli / Bellandur',4),('YPR','Yeshwanthpur',3),('MTP','Manyata / Nagawara',3)
) as z(code,name,inventory_strength)
where not exists (select 1 from public.zones);

