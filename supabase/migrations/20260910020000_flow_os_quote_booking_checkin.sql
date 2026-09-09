-- Canonical commercial child records linked to the existing public.leads.id.
-- These replace the idea of separate disconnected CRMs for quote/booking/check-in.

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
create index if not exists flow_quotations_lead_idx on public.flow_quotations(lead_id, created_at desc);

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
create index if not exists flow_bookings_lead_idx on public.flow_bookings(lead_id, created_at desc);

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
create index if not exists flow_checkins_lead_idx on public.flow_checkins(lead_id, created_at desc);

-- Link the existing Crib booking surface to the same lead/cycle/commercial chain.
alter table public.crib_bookings add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.crib_bookings add column if not exists cycle_id uuid references public.lead_cycles(id) on delete set null;
alter table public.crib_bookings add column if not exists flow_booking_id uuid references public.flow_bookings(id) on delete set null;
alter table public.crib_bookings add column if not exists quotation_id uuid references public.flow_quotations(id) on delete set null;
create index if not exists crib_bookings_lead_idx on public.crib_bookings(lead_id, created_at desc);

-- Check-in may complete only when all configured hard gates pass.
create or replace function public.flow_confirm_checkin(p_checkin_id uuid,p_actor_id uuid,p_actor_name text)
returns table(ok boolean,reason text)
language plpgsql security definer set search_path=public as $$
declare
  v_checkin public.flow_checkins%rowtype;
  v_booking public.flow_bookings%rowtype;
begin
  select * into v_checkin from public.flow_checkins where id=p_checkin_id;
  if v_checkin.id is null then return query select false,'check-in record not found'; return; end if;
  select * into v_booking from public.flow_bookings where id=v_checkin.booking_id;
  if v_booking.id is null then return query select false,'booking record not found'; return; end if;

  if not v_booking.payment_verified and not (v_checkin.manager_override_by is not null and coalesce(v_checkin.manager_override_reason,'') <> '') then
    return query select false,'payment not verified'; return;
  end if;
  if v_booking.owner_approval_required and not v_booking.owner_approved and not (v_checkin.manager_override_by is not null and coalesce(v_checkin.manager_override_reason,'') <> '') then
    return query select false,'owner approval pending'; return;
  end if;
  if not v_checkin.room_allocated then return query select false,'room/bed not allocated'; return; end if;
  if not v_checkin.kyc_done then return query select false,'KYC incomplete'; return; end if;
  if not v_checkin.agreement_done then return query select false,'agreement incomplete'; return; end if;
  if not v_checkin.keys_handed_over then return query select false,'keys not handed over'; return; end if;

  update public.flow_checkins
     set payment_complete=true,
         owner_approval_complete=(not v_booking.owner_approval_required or v_booking.owner_approved),
         status='checked_in',checked_in_at=now(),updated_at=now()
   where id=p_checkin_id;
  update public.flow_bookings set status='booked',booked_at=coalesce(booked_at,now()),updated_at=now() where id=v_booking.id;
  update public.leads
     set pipeline_stage='CHECKED_IN',current_mission='Resident handover complete',primary_blocker=null,last_operator_action_at=now()
   where id=v_checkin.lead_id;
  update public.next_actions set done_at=now(),updated_at=now() where lead_id=v_checkin.lead_id and done_at is null;
  insert into public.lead_timeline(lead_id,activity,actor,new_stage,detail)
  values(v_checkin.lead_id,'checked_in',p_actor_name,'CHECKED_IN','Check-in gates completed');
  return query select true,'checked in';
end; $$;

-- RLS: shared operating truth for authenticated team. Role-specific UI/commands
-- remain responsible for stricter product permissions while migration is phased.
alter table public.flow_quotations enable row level security;
alter table public.flow_bookings enable row level security;
alter table public.flow_checkins enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_quotations' and policyname='flow_team_quotations') then
    create policy flow_team_quotations on public.flow_quotations for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_bookings' and policyname='flow_team_bookings') then
    create policy flow_team_bookings on public.flow_bookings for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_checkins' and policyname='flow_team_checkins') then
    create policy flow_team_checkins on public.flow_checkins for all to authenticated using (true) with check (true);
  end if;
end $$;
grant select,insert,update,delete on public.flow_quotations to authenticated;
grant select,insert,update,delete on public.flow_bookings to authenticated;
grant select,insert,update,delete on public.flow_checkins to authenticated;
grant execute on function public.flow_confirm_checkin(uuid,uuid,text) to authenticated;
