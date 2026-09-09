-- Expand the screenshot processing state machine for the live AI Vision path.
alter table public.whatsapp_screenshots
  drop constraint if exists whatsapp_screenshots_processing_status_check;

alter table public.whatsapp_screenshots
  add constraint whatsapp_screenshots_processing_status_check
  check (processing_status in (
    'pending',
    'processing',
    'uploaded',
    'analyzing',
    'parsed',
    'extracted',
    'review',
    'complete',
    'failed',
    'error'
  ));
