-- Persist real screenshot files as auditable evidence. OCR extraction remains a
-- separate provider adapter and must never mark a batch balanced by itself.

create table if not exists public.flow_screenshots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.flow_screenshot_batches(id) on delete cascade,
  screenshot_key text not null,
  original_file_name text,
  mime_type text,
  byte_size bigint,
  sha256 text,
  storage_path text not null,
  captured_at timestamptz,
  processing_state text not null default 'uploaded' check (processing_state in ('uploaded','extracting','extracted','review','failed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(batch_id, screenshot_key)
);
create index if not exists flow_screenshots_batch_idx on public.flow_screenshots(batch_id, created_at);
create index if not exists flow_screenshots_hash_idx on public.flow_screenshots(sha256) where sha256 is not null;

alter table public.flow_screenshots enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='flow_screenshots' and policyname='flow_team_screenshots') then
    create policy flow_team_screenshots on public.flow_screenshots for all to authenticated using (true) with check (true);
  end if;
end $$;
grant select,insert,update,delete on public.flow_screenshots to authenticated;

-- Private evidence bucket. Screenshots may contain personal customer data and
-- are never public assets.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'flow-screenshot-evidence',
  'flow-screenshot-evidence',
  false,
  15728640,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set public=false;

-- Team members can upload/read evidence. Paths are scoped under their batch id;
-- the app still controls which rows/users may act on the resulting lead.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='flow_evidence_read') then
    create policy flow_evidence_read on storage.objects for select to authenticated
      using (bucket_id='flow-screenshot-evidence');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='flow_evidence_insert') then
    create policy flow_evidence_insert on storage.objects for insert to authenticated
      with check (bucket_id='flow-screenshot-evidence');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='flow_evidence_update') then
    create policy flow_evidence_update on storage.objects for update to authenticated
      using (bucket_id='flow-screenshot-evidence') with check (bucket_id='flow-screenshot-evidence');
  end if;
end $$;
