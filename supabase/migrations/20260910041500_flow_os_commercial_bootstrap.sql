-- Flow OS canonical commercial chain bootstrap.
-- Idempotent: safe when the earlier commercial migration was applied, and safe
-- in Lovable environments where legacy crib_bookings does not exist.

create extension if not exists pgcrypto;

create table if not exists public.flow_quotations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  cycle_id uuid references public.lead_cycles(id) on delete set null,
  property_id text,
  property_name text,
  room_id text,
  room_label text,
  amount numeric not null,
  deposit_amount numeric,
  maintenance_amount numeric,
  discount numeric not null default 0,
  lock_in_months integer,
  notice_days integer,
  expires_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','saved','copied','sent','accepted','expired','cancelled')),
  copied_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flow_quotations_lead_idx on public.flow_quotations(lead_id,created_at desc);

create table if not exists public.flow_bookings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  cycle_id uuid references public.lead_cycles(id) on delete set null,
  quotation_id uuid references public.flow_quotations(id) on delete set null,
  property_id text,
  property_name text,
  room_id text,
  room_label text,
  bed_id text,
  amount numeric,
  payment_ref text,
  payment_evidence text,
  payment_verified boolean not null default false,
  owner_approval_required boolean not null default false,
  owner_approved boolean not null default false,
  owner_approved_at timestamptz,
  owner_approved_by uuid,
  status text not null default 'payment_pending' check (status in ('payment_pending','payment_received','verified','booked','cancelled')),
  booked_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flow_bookings_lead_idx on public.flow_bookings(lead_id,created_at desc);

create table if not exists public.flow_checkins (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  booking_id uuid not null references public.flow_bookings(id) on delete cascade,
  scheduled_for timestamptz,
  arrived_at timestamptz,
  room_allocated boolean not null default false,
  room_or_bed_label text,
  payment_complete boolean not null default false,
  owner_approval_complete boolean not null default false,
  kyc_done boolean not null default false,
  agreement_done boolean not null default false,
  keys_handed_over boolean not null default false,
  nps_score integer check (nps_score is null or nps_score between 0 and 10),
  status text not null default 'preparing' check (status in ('preparing','ready','checked_in','blocked','cancelled')),
  checked_in_at timestamptz,
  manager_override_by uuid,
  manager_override_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(booking_id)
);
create index if not exists flow_checkins_lead_idx on public.flow_checkins(lead_id,created_at desc);

alter table public.flow_quotations enable row level security;
alter table public.flow_bookings enable row level security;
alter table public.flow_checkins enable row level security;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='flow_quotations' and policyname='flow_team_quotations') then
    create policy flow_team_quotations on public.flow_quotations for all to authenticated using(true) with check(true);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='flow_bookings' and policyname='flow_team_bookings') then
    create policy flow_team_bookings on public.flow_bookings for all to authenticated using(true) with check(true);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='flow_checkins' and policyname='flow_team_checkins') then
    create policy flow_team_checkins on public.flow_checkins for all to authenticated using(true) with check(true);
  end if;
end $$;

grant select,insert,update,delete on public.flow_quotations to authenticated;
grant select,insert,update,delete on public.flow_bookings to authenticated;
grant select,insert,update,delete on public.flow_checkins to authenticated;

-- Legacy Crib linkage is optional. Never let a missing legacy table block the
-- canonical Flow OS deployment.
do $$ begin
  if to_regclass('public.crib_bookings') is not null then
    alter table public.crib_bookings add column if not exists lead_id uuid references public.leads(id) on delete set null;
    alter table public.crib_bookings add column if not exists cycle_id uuid references public.lead_cycles(id) on delete set null;
    alter table public.crib_bookings add column if not exists flow_booking_id uuid references public.flow_bookings(id) on delete set null;
    alter table public.crib_bookings add column if not exists quotation_id uuid references public.flow_quotations(id) on delete set null;
    create index if not exists crib_bookings_lead_idx on public.crib_bookings(lead_id,created_at desc);
  end if;
end $$;
