-- Gharpayy Flow OS 100x — lock historical first-generation Flow tables.
-- We preserve old data for audit/migration, but final clients must not create a
-- second CRM by writing the superseded flow_* generation.

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'flow_screenshot_batches',
    'flow_screenshot_observations',
    'flow_work_claims',
    'flow_draft_batches',
    'flow_draft_items',
    'flow_label_colour_mapping'
  ]
  LOOP
    IF to_regclass('public.' || rel) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM authenticated', rel);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM anon', rel);
      EXECUTE format('COMMENT ON TABLE public.%I IS %L', rel,
        'FLOW_OS_LEGACY_READ_ONLY: superseded by screenshot_batches/screenshot_observations/work_claims/draft_batches/draft_batch_items/flow_label_rules. Do not build new features here.');
    END IF;
  END LOOP;
END $$;

-- Revoke authenticated access to the old claim/batch commands if they exist.
DO $$
BEGIN
  IF to_regprocedure('public.flow_claim_lead(uuid,uuid,text,uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.flow_claim_lead(uuid,uuid,text,uuid) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.flow_claim_lead(uuid,uuid,text,uuid) FROM anon;
  END IF;
  IF to_regprocedure('public.flow_reserve_lead(uuid,uuid,text,uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.flow_reserve_lead(uuid,uuid,text,uuid) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.flow_reserve_lead(uuid,uuid,text,uuid) FROM anon;
  END IF;
  IF to_regprocedure('public.flow_close_batch(uuid,uuid,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.flow_close_batch(uuid,uuid,text) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.flow_close_batch(uuid,uuid,text) FROM anon;
  END IF;
END $$;

-- Canonical generation declarations for database introspection / engineering handoff.
comment on table public.screenshot_batches is 'FLOW_OS_CANONICAL: immutable multi-screenshot reconciliation batches.';
comment on table public.whatsapp_screenshots is 'FLOW_OS_CANONICAL: private screenshot evidence and extraction metadata.';
comment on table public.screenshot_observations is 'FLOW_OS_CANONICAL: every visible WhatsApp row is an observation, not a lead.';
comment on table public.flow_label_rules is 'FLOW_OS_CANONICAL: account-specific colour/seen/message evidence mapping.';
comment on table public.draft_batches is 'FLOW_OS_CANONICAL: one active Draft 30 per operator.';
comment on table public.draft_batch_items is 'FLOW_OS_CANONICAL: ordered portfolio membership; Active 13 is a state, not historical rank.';
comment on table public.work_claims is 'FLOW_OS_CANONICAL: durable Draft reservation plus temporary live handling lease.';
comment on table public.flow_quotations is 'FLOW_OS_CANONICAL: quotations linked to public.leads.id.';
comment on table public.flow_bookings is 'FLOW_OS_CANONICAL: payment/booking truth linked to public.leads.id.';
comment on table public.flow_checkins is 'FLOW_OS_CANONICAL: physical check-in evidence; terminal command is flow_confirm_checkin.';
