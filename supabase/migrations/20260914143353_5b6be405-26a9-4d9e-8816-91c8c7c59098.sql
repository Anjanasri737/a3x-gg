CREATE TABLE IF NOT EXISTS public.e2e_lead_execution (
  lead_id TEXT PRIMARY KEY,
  where_state TEXT,
  channel TEXT,
  when_bucket TEXT,
  follow_up_at TIMESTAMPTZ,
  owner_id TEXT,
  owner_name TEXT,
  claimed_at TIMESTAMPTZ,
  ownership_mode TEXT,
  verified JSONB NOT NULL DEFAULT '{}'::jsonb,
  urgency TEXT,
  probability TEXT,
  situation TEXT,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  last_outcome TEXT,
  tour_gate JSONB NOT NULL DEFAULT '{}'::jsonb,
  visit_status TEXT,
  booking_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.e2e_lead_timeline (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS e2e_lead_timeline_lead_idx ON public.e2e_lead_timeline (lead_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.e2e_lead_execution TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.e2e_lead_execution TO anon;
GRANT ALL ON public.e2e_lead_execution TO service_role;
GRANT SELECT, INSERT ON public.e2e_lead_timeline TO authenticated;
GRANT SELECT, INSERT ON public.e2e_lead_timeline TO anon;
GRANT ALL ON public.e2e_lead_timeline TO service_role;

ALTER TABLE public.e2e_lead_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2e_lead_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "e2e execution readable by everyone" ON public.e2e_lead_execution;
CREATE POLICY "e2e execution readable by everyone" ON public.e2e_lead_execution FOR SELECT USING (true);
DROP POLICY IF EXISTS "e2e execution writable by everyone" ON public.e2e_lead_execution;
CREATE POLICY "e2e execution writable by everyone" ON public.e2e_lead_execution FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "e2e execution updatable by everyone" ON public.e2e_lead_execution;
CREATE POLICY "e2e execution updatable by everyone" ON public.e2e_lead_execution FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "e2e timeline readable by everyone" ON public.e2e_lead_timeline;
CREATE POLICY "e2e timeline readable by everyone" ON public.e2e_lead_timeline FOR SELECT USING (true);
DROP POLICY IF EXISTS "e2e timeline appendable by everyone" ON public.e2e_lead_timeline;
CREATE POLICY "e2e timeline appendable by everyone" ON public.e2e_lead_timeline FOR INSERT WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS update_e2e_lead_execution_updated_at ON public.e2e_lead_execution;
CREATE TRIGGER update_e2e_lead_execution_updated_at BEFORE UPDATE ON public.e2e_lead_execution FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();