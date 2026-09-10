-- Gharpayy Flow OS — Screenshot/WhatsApp → Check-in Revenue Guarantee
-- Additive migration. Existing public.leads.id remains the canonical lead identity.

create extension if not exists pgcrypto;

-- ---------- Canonical lead sync fields ----------
alter table public.leads add column if not exists last_wa_message text;
alter table public.leads add column if not exists last_wa_seen_at timestamptz;
alter table public.leads add column if not exists wa_seen_state text default 'unknown';
alter table public.leads add column if not exists wa_unread_count integer default 0;
alter table public.leads add column if not exists wa_label_colour text;
alter table public.leads add column if not exists wa_label_name text;
alter table public.leads add column if not exists current_handler_id uuid;
alter table public.leads add column if not exists current_handler_name text;
alter table public.leads add column if not exists suggested_stage text;
alter table public.leads add column if not exists suggested_mission text;
alter table public.leads add column if not exists suggestion_confidence numeric(4,3);
alter table public.leads add column if not exists suggestion_evidence text;
alter table public.leads add column if not exists sync_state text default 'unknown';

-- ---------- Screenshot batch ----------
create table if not exists public.flow_screenshot_batches (
  id uuid primary key default gen_random_uuid(),
  wa_source_id uuid null references public.whatsapp_sources(id) on delete set null,
  wa_account_label text,
  capture_from timestamptz,
  capture_to timestamptz,
  uploaded_by uuid,
  uploaded_by_name text,
  screenshot_count integer not null default 0 check (screenshot_count >= 0),
  visible_rows_expected integer not null default 0 check (visible_rows_expected >= 0),
  rows_segmented integer not null default 0 check (rows_segmented >= 0),
  rows_reconciled integer not null default 0 check (rows_reconciled >= 0),
  unresolved_rows integer not null default 0 check (unresolved_rows >= 0),
  status text not null default 'processing' check (status in ('processing','review','balanced','incomplete')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flow_screenshot_observations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.flow_screenshot_batches(id) on delete cascade,
  screenshot_key text not null,
  screenshot_hash text,
  row_index integer not null,
  row_top_px integer,
  row_bottom_px integer,
  wa_source_id uuid null references public.whatsapp_sources(id) on delete set null,
  wa_account_label text,
  captured_at timestamptz not null default now(),
  contact_name text,
  phone_raw text,
  phone_e164 text,
  last_message text,
  preview_direction text default 'unknown' check (preview_direction in ('incoming','outgoing','unknown')),
  visible_timestamp_raw text,
  seen_state text not null default 'unknown' check (seen_state in ('seen','unseen','unknown')),
  unread_count integer not null default 0 check (unread_count >= 0),
  row_colour text,
  label_colour text,
  label_name text,
  handler_id uuid,
  handler_name text,
  ocr_confidence numeric(4,3),
  raw_text text,
  previous_observation_id uuid references public.flow_screenshot_observations(id) on delete set null,
  movement_signal text,
  suggested_stage text,
  suggested_mission text,
  suggestion_confidence numeric(4,3),
  suggestion_evidence text,
  resolution text not null default 'pending' check (resolution in (
    'pending','matched_existing','new_lead','returning_cycle','duplicate_observation','identity_review','non_customer'
  )),
  resolution_reason text,
  lead_id uuid references public.leads(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(batch_id, screenshot_key, row_index)
);

create index if not exists flow_observation_phone_idx on public.flow_screenshot_observations(phone_e164, captured_at desc);
create index if not exists flow_observation_lead_idx on public.flow_screenshot_observations(lead_id, captured_at desc);
create index if not exists flow_observation_batch_idx on public.flow_screenshot_observations(batch_id, row_index);
create index if not exists flow_observation_resolution_idx on public.flow_screenshot_observations(resolution);

-- ---------- Eight-person collision barrier ----------
create table if not exists public.flow_work_claims (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  operator_id uuid not null,
  operator_name text,
  draft_batch_id uuid,
  state text not null default 'active' check (state in ('active','released','expired','completed','taken_over')),
  claimed_at timestamptz not null default now(),
  last_meaningful_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  released_at timestamptz,
  release_reason text,
  takeover_requested_by uuid,
  takeover_requested_by_name text,
  takeover_requested_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists flow_one_active_claim_per_lead
  on public.flow_work_claims(lead_id) where state = 'active';
create index if not exists flow_work_claim_operator_idx on public.flow_work_claims(operator_id, state, expires_at);

-- ---------- Draft 30 / Active 13 ----------
create table if not exists public.flow_draft_batches (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  operator_name text,
  target_size integer not null default 30,
  active_tray_size integer not null default 13,
  status text not null default 'open' check (status in ('open','completed','abandoned')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table public.flow_work_claims
  drop constraint if exists flow_work_claims_draft_batch_id_fkey;
alter table public.flow_work_claims
  add constraint flow_work_claims_draft_batch_id_fkey
  foreign key (draft_batch_id) references public.flow_draft_batches(id) on delete set null;

create table if not exists public.flow_draft_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.flow_draft_batches(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  position integer not null,
  roi_score numeric(8,2) not null default 0,
  roi_reasons text[] not null default '{}',
  state text not null default 'drafted' check (state in ('drafted','active','done','future','released','passed')),
  is_priority_interrupt boolean not null default false,
  disposition text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(batch_id, lead_id),
  unique(batch_id, position)
);
create index if not exists flow_draft_items_batch_idx on public.flow_draft_items(batch_id, state, position);

-- ---------- Configurable WhatsApp colour/label meaning ----------
create table if not exists public.flow_label_colour_mapping (
  id uuid primary key default gen_random_uuid(),
  colour_key text not null unique,
  wa_label_name text,
  crm_label text not null,
  suggested_stage text,
  suggested_mission text,
  active boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.flow_label_colour_mapping(colour_key, wa_label_name, crm_label, suggested_stage, suggested_mission)
values
  ('green','Unread / New','New inbound','NEW','Call / reply now'),
  ('blue','Tour','Tour','TOUR_SCHEDULED','Confirm or execute tour'),
  ('yellow','Follow-up','Follow-up due','DOSSIER','Complete next action'),
  ('purple','Booking','Booking intent','NEGOTIATION','Close booking'),
  ('grey','Future','Future','FUTURE','Wait until dated follow-up')
on conflict (colour_key) do nothing;

-- ---------- Batch reconciliation ----------
create or replace function public.flow_refresh_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segmented integer;
  v_reconciled integer;
  v_unresolved integer;
  v_expected integer;
  v_status text;
begin
  select count(*),
         count(*) filter (where resolution <> 'pending'),
         count(*) filter (where resolution in ('pending','identity_review'))
    into v_segmented, v_reconciled, v_unresolved
    from public.flow_screenshot_observations
   where batch_id = p_batch_id;

  select visible_rows_expected into v_expected
    from public.flow_screenshot_batches where id = p_batch_id;

  v_status := case
    when v_expected = 0 then 'processing'
    when v_segmented < v_expected then 'incomplete'
    when v_reconciled < v_expected then 'review'
    when v_segmented = v_expected and v_reconciled = v_expected then 'balanced'
    else 'review'
  end;

  update public.flow_screenshot_batches
     set rows_segmented = v_segmented,
         rows_reconciled = v_reconciled,
         unresolved_rows = v_unresolved,
         status = v_status,
         updated_at = now()
   where id = p_batch_id;
end;
$$;

create or replace function public.flow_observation_refresh_trigger()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.flow_refresh_batch(coalesce(new.batch_id, old.batch_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists flow_observation_refresh on public.flow_screenshot_observations;
create trigger flow_observation_refresh
after insert or update of resolution or delete on public.flow_screenshot_observations
for each row execute function public.flow_observation_refresh_trigger();

-- ---------- Atomic claim commands ----------
create or replace function public.flow_claim_lead(
  p_lead_id uuid,
  p_operator_id uuid,
  p_operator_name text,
  p_batch_id uuid default null
)
returns table(ok boolean, claim_id uuid, current_operator text, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.flow_work_claims%rowtype;
begin
  update public.flow_work_claims
     set state='expired', released_at=now(), release_reason='idle timeout'
   where lead_id=p_lead_id and state='active' and expires_at <= now();

  select * into v_claim from public.flow_work_claims
   where lead_id=p_lead_id and state='active' limit 1;

  if v_claim.id is not null and v_claim.operator_id <> p_operator_id then
    return query select false, v_claim.id, v_claim.operator_name, 'already claimed';
    return;
  end if;

  if v_claim.id is not null then
    update public.flow_work_claims
       set last_meaningful_activity_at=now(), expires_at=now()+interval '10 minutes', draft_batch_id=coalesce(p_batch_id,draft_batch_id)
     where id=v_claim.id;
    update public.leads set current_handler_id=p_operator_id, current_handler_name=p_operator_name where id=p_lead_id;
    return query select true, v_claim.id, p_operator_name, 'resumed';
    return;
  end if;

  insert into public.flow_work_claims(lead_id,operator_id,operator_name,draft_batch_id)
  values(p_lead_id,p_operator_id,p_operator_name,p_batch_id)
  returning * into v_claim;
  update public.leads set current_handler_id=p_operator_id, current_handler_name=p_operator_name where id=p_lead_id;
  return query select true, v_claim.id, p_operator_name, 'claimed';
end;
$$;

create or replace function public.flow_heartbeat_claim(p_claim_id uuid, p_operator_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.flow_work_claims
     set last_meaningful_activity_at=now(), expires_at=now()+interval '10 minutes'
   where id=p_claim_id and operator_id=p_operator_id and state='active';
  return found;
end; $$;

create or replace function public.flow_release_claim(p_claim_id uuid, p_operator_id uuid, p_reason text default 'completed')
returns boolean language plpgsql security definer set search_path=public as $$
declare v_lead uuid;
begin
  select lead_id into v_lead from public.flow_work_claims where id=p_claim_id;
  update public.flow_work_claims
     set state=case when p_reason='completed' then 'completed' else 'released' end,
         released_at=now(), release_reason=p_reason
   where id=p_claim_id and operator_id=p_operator_id and state='active';
  if found then
    update public.leads set current_handler_id=null,current_handler_name=null where id=v_lead;
    return true;
  end if;
  return false;
end; $$;

-- ---------- RLS ----------
alter table public.flow_screenshot_batches enable row level security;
alter table public.flow_screenshot_observations enable row level security;
alter table public.flow_work_claims enable row level security;
alter table public.flow_draft_batches enable row level security;
alter table public.flow_draft_items enable row level security;
alter table public.flow_label_colour_mapping enable row level security;

-- Existing app has role-based Supabase auth. Authenticated teammates can see shared operating truth.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_screenshot_batches' and policyname='flow_team_batches') then
    create policy flow_team_batches on public.flow_screenshot_batches for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_screenshot_observations' and policyname='flow_team_observations') then
    create policy flow_team_observations on public.flow_screenshot_observations for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_work_claims' and policyname='flow_team_claims') then
    create policy flow_team_claims on public.flow_work_claims for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_draft_batches' and policyname='flow_team_drafts') then
    create policy flow_team_drafts on public.flow_draft_batches for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_draft_items' and policyname='flow_team_draft_items') then
    create policy flow_team_draft_items on public.flow_draft_items for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_label_colour_mapping' and policyname='flow_team_labels') then
    create policy flow_team_labels on public.flow_label_colour_mapping for all to authenticated using (true) with check (true);
  end if;
end $$;

grant select,insert,update,delete on public.flow_screenshot_batches to authenticated;
grant select,insert,update,delete on public.flow_screenshot_observations to authenticated;
grant select,insert,update,delete on public.flow_work_claims to authenticated;
grant select,insert,update,delete on public.flow_draft_batches to authenticated;
grant select,insert,update,delete on public.flow_draft_items to authenticated;
grant select,insert,update,delete on public.flow_label_colour_mapping to authenticated;
grant execute on function public.flow_claim_lead(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.flow_heartbeat_claim(uuid,uuid) to authenticated;
grant execute on function public.flow_release_claim(uuid,uuid,text) to authenticated;
grant execute on function public.flow_refresh_batch(uuid) to authenticated;
