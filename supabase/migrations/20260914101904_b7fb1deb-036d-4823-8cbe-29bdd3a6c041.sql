
CREATE TABLE IF NOT EXISTS public.conversation_library_buckets (
  bucket text PRIMARY KEY,
  family text NOT NULL,
  expected_direction text,
  waiting_on text,
  stage text,
  default_next_action text,
  sla_min integer,
  priority text,
  movement_effect text,
  rule_confidence numeric,
  observed_count integer NOT NULL DEFAULT 0,
  example_1 text,
  example_2 text,
  example_3 text,
  rule_reason text,
  journey_step text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.conversation_library_buckets TO authenticated;
GRANT ALL ON public.conversation_library_buckets TO service_role;
ALTER TABLE public.conversation_library_buckets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "library buckets readable by team" ON public.conversation_library_buckets FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.conversation_library_rows (
  row_id text PRIMARY KEY,
  zone text,
  screenshot text,
  capture_date date,
  display_contact text,
  phone_e164 text,
  identity_status text,
  visible_time text,
  last_message text,
  labels_ocr text,
  unread_ocr text,
  draft_detected boolean NOT NULL DEFAULT false,
  direction text,
  ocr_confidence numeric,
  confidence_band text,
  bucket text REFERENCES public.conversation_library_buckets(bucket),
  next_action text,
  waiting_on text,
  priority text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_library_rows_lead_idx ON public.conversation_library_rows(lead_id);
CREATE INDEX IF NOT EXISTS conversation_library_rows_bucket_idx ON public.conversation_library_rows(bucket);
CREATE INDEX IF NOT EXISTS conversation_library_rows_phone_idx ON public.conversation_library_rows(phone_e164);
GRANT SELECT ON public.conversation_library_rows TO authenticated;
GRANT ALL ON public.conversation_library_rows TO service_role;
ALTER TABLE public.conversation_library_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "library rows readable by team" ON public.conversation_library_rows FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.lead_journey_steps (
  code text PRIMARY KEY,
  ordinal integer NOT NULL,
  name text NOT NULL,
  purpose text NOT NULL,
  done_when text NOT NULL,
  owner_role text NOT NULL
);
GRANT SELECT ON public.lead_journey_steps TO authenticated;
GRANT ALL ON public.lead_journey_steps TO service_role;
ALTER TABLE public.lead_journey_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journey steps readable by team" ON public.lead_journey_steps FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.lead_journey_progress (
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  step_code text NOT NULL REFERENCES public.lead_journey_steps(code),
  status text NOT NULL DEFAULT 'pending',
  evidence text,
  at timestamptz,
  PRIMARY KEY (lead_id, step_code)
);
CREATE INDEX IF NOT EXISTS lead_journey_progress_lead_idx ON public.lead_journey_progress(lead_id);
GRANT SELECT, INSERT, UPDATE ON public.lead_journey_progress TO authenticated;
GRANT ALL ON public.lead_journey_progress TO service_role;
ALTER TABLE public.lead_journey_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journey progress readable by team" ON public.lead_journey_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "journey progress writable by team" ON public.lead_journey_progress FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "journey progress updatable by team" ON public.lead_journey_progress FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS conversation_bucket text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS journey_step text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS journey_step_index integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS library_rows_count integer NOT NULL DEFAULT 0;
