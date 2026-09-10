-- Exact image hashes are evidence for AI-call reuse, not identity constraints.
-- The same screenshot may legitimately be uploaded again in a later batch/day.
-- Keep the normal hash index for lookup, but remove the old uniqueness barrier.

drop index if exists public.whatsapp_screenshots_exact_hash_uq;

create index if not exists whatsapp_screenshots_image_hash_idx
  on public.whatsapp_screenshots(image_hash)
  where image_hash is not null;
