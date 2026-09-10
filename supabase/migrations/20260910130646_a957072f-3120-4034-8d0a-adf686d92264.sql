do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_screenshots_auth_insert') then
    create policy wa_screenshots_auth_insert on storage.objects for insert to authenticated with check (bucket_id='whatsapp-screenshots');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_screenshots_auth_select') then
    create policy wa_screenshots_auth_select on storage.objects for select to authenticated using (bucket_id='whatsapp-screenshots');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_screenshots_auth_update') then
    create policy wa_screenshots_auth_update on storage.objects for update to authenticated using (bucket_id='whatsapp-screenshots') with check (bucket_id='whatsapp-screenshots');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_screenshots_auth_delete') then
    create policy wa_screenshots_auth_delete on storage.objects for delete to authenticated using (bucket_id='whatsapp-screenshots');
  end if;
end $$;