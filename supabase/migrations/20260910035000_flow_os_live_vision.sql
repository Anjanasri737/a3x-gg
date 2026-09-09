-- Live WhatsApp screenshot vision extraction.
-- Additive only: preserves all existing screenshot/reconciliation data.

alter table public.whatsapp_screenshots
  add column if not exists extraction_model text,
  add column if not exists extraction_version text,
  add column if not exists extraction_confidence numeric,
  add column if not exists ai_visible_row_count integer,
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists error_message text,
  add column if not exists file_name text,
  add column if not exists reused_from_screenshot_id uuid references public.whatsapp_screenshots(id) on delete set null;

create index if not exists whatsapp_screenshots_image_hash_idx on public.whatsapp_screenshots(image_hash);

alter table public.screenshot_observations
  add column if not exists intelligence jsonb not null default '{}'::jsonb,
  add column if not exists operator_edited boolean not null default false,
  add column if not exists work_bucket text,
  add column if not exists primary_mission text,
  add column if not exists blocker_hint text;

alter table public.screenshot_batches
  add column if not exists detected_rows_total integer not null default 0,
  add column if not exists expected_override integer;

-- Private screenshot bucket. Never expose these screenshots publicly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-screenshots',
  'whatsapp-screenshots',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated direct-access policies are intentionally narrow. The normal
-- automatic analysis path uses the server-side service-role client.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_screenshots_auth_insert') then
    create policy wa_screenshots_auth_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'whatsapp-screenshots');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_screenshots_auth_select') then
    create policy wa_screenshots_auth_select on storage.objects
      for select to authenticated
      using (bucket_id = 'whatsapp-screenshots');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_screenshots_auth_update') then
    create policy wa_screenshots_auth_update on storage.objects
      for update to authenticated
      using (bucket_id = 'whatsapp-screenshots')
      with check (bucket_id = 'whatsapp-screenshots');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_screenshots_auth_delete') then
    create policy wa_screenshots_auth_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'whatsapp-screenshots');
  end if;
end $$;
