-- Persist the Flow OS commercial truth on the existing canonical lead.
-- Legacy `status` remains available as an adapter field during migration.
alter table public.leads add column if not exists pipeline_stage text not null default 'NEW';
alter table public.leads add column if not exists current_mission text not null default 'Contact customer';
alter table public.leads add column if not exists primary_blocker text;
alter table public.leads add column if not exists opportunity_score integer not null default 0;

-- Avoid a hard CHECK initially because existing deployments may contain custom
-- migration values. UI/services use the canonical stage union and audit changes.
create index if not exists leads_pipeline_stage_idx on public.leads(pipeline_stage);
