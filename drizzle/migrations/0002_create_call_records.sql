CREATE TABLE public.call_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz NOT NULL DEFAULT now(),
  operator_id uuid,
  operator_name text,
  lead_ulid text,
  canonical_id text,
  customer_name text,
  agenda text NOT NULL,
  agenda_source text,
  outcome text NOT NULL,
  duration_sec integer,
  capture jsonb NOT NULL DEFAULT '{}'::jsonb,
  movement text,
  message_now text,
  message_sent boolean NOT NULL DEFAULT false,
  follow_up jsonb,
  follow_up_state text,
  next_step jsonb,
  stage_after text,
  waste jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_id text
);

CREATE INDEX call_records_called_at_idx ON public.call_records (called_at DESC);
CREATE INDEX call_records_canonical_idx ON public.call_records (canonical_id);
CREATE INDEX call_records_ulid_idx ON public.call_records (lead_ulid);
CREATE UNIQUE INDEX call_records_client_id_idx ON public.call_records (client_id) WHERE client_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.call_records TO authenticated;
GRANT ALL ON public.call_records TO service_role;

ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators insert their own calls"
  ON public.call_records FOR INSERT TO authenticated
  WITH CHECK (operator_id = auth.uid() OR operator_id IS NULL);

CREATE POLICY "Team can read calls"
  ON public.call_records FOR SELECT TO authenticated
  USING (operator_id = auth.uid() OR public.is_tower_ops(auth.uid()));

CREATE POLICY "Operators update their own calls"
  ON public.call_records FOR UPDATE TO authenticated
  USING (operator_id = auth.uid() OR public.is_tower_ops(auth.uid()))
  WITH CHECK (operator_id = auth.uid() OR public.is_tower_ops(auth.uid()));
