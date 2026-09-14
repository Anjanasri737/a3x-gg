ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_source text;
CREATE INDEX IF NOT EXISTS leads_lead_source_idx ON public.leads (lead_source);