CREATE TABLE public.conversation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  canonical_event text NOT NULL,
  event_family text NOT NULL,
  positive_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  negative_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  semantic_examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_directions text[] NOT NULL DEFAULT ARRAY['incoming','outgoing','unknown']::text[],
  required_previous_events text[] NOT NULL DEFAULT '{}'::text[],
  forbidden_previous_events text[] NOT NULL DEFAULT '{}'::text[],
  modifiers_to_add text[] NOT NULL DEFAULT '{}'::text[],
  entity_extractors text[] NOT NULL DEFAULT '{}'::text[],
  stage_after text NOT NULL,
  waiting_on text NOT NULL,
  blocker text,
  default_next_action text NOT NULL,
  default_owner_role text NOT NULL,
  sla_minutes integer,
  priority text NOT NULL DEFAULT 'P2',
  movement_effect integer NOT NULL DEFAULT 0,
  success_transitions text[] NOT NULL DEFAULT '{}'::text[],
  failure_transitions text[] NOT NULL DEFAULT '{}'::text[],
  confidence_threshold numeric NOT NULL DEFAULT 0.75,
  human_review_below numeric NOT NULL DEFAULT 0.65,
  observed_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'gharpayy_screenshot_corpus',
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_key, version)
);
GRANT SELECT ON public.conversation_rules TO authenticated;
GRANT ALL ON public.conversation_rules TO service_role;
ALTER TABLE public.conversation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view conversation rules" ON public.conversation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tower can create conversation rules" ON public.conversation_rules FOR INSERT TO authenticated WITH CHECK (public.is_tower_ops(auth.uid()));
CREATE POLICY "Tower can update conversation rules" ON public.conversation_rules FOR UPDATE TO authenticated USING (public.is_tower_ops(auth.uid())) WITH CHECK (public.is_tower_ops(auth.uid()));

CREATE TABLE public.conversation_compilations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.screenshot_observations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  requirement_id uuid,
  compiler_version text NOT NULL,
  rule_id uuid REFERENCES public.conversation_rules(id) ON DELETE SET NULL,
  rule_version integer,
  canonical_event text NOT NULL,
  event_family text NOT NULL,
  modifiers text[] NOT NULL DEFAULT '{}'::text[],
  extracted_entities jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_labels text[] NOT NULL DEFAULT '{}'::text[],
  parsed_labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversation_stage text NOT NULL,
  waiting_on text NOT NULL,
  blocker text,
  intent text NOT NULL,
  health text NOT NULL,
  movement text NOT NULL,
  momentum integer NOT NULL DEFAULT 0,
  next_action text NOT NULL,
  next_action_owner text NOT NULL,
  action_due_at timestamptz,
  sla_status text NOT NULL,
  priority text NOT NULL,
  screenshot_due_at timestamptz,
  screenshot_status text NOT NULL,
  evidence_quality integer NOT NULL,
  confidence numeric NOT NULL,
  automation_safe boolean NOT NULL DEFAULT false,
  needs_review boolean NOT NULL DEFAULT false,
  reasons text[] NOT NULL DEFAULT '{}'::text[],
  original_interpretation jsonb,
  active_interpretation boolean NOT NULL DEFAULT true,
  compiled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(observation_id, compiler_version)
);
GRANT SELECT ON public.conversation_compilations TO authenticated;
GRANT ALL ON public.conversation_compilations TO service_role;
ALTER TABLE public.conversation_compilations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view conversation compilations" ON public.conversation_compilations FOR SELECT TO authenticated USING (true);

CREATE TABLE public.conversation_states (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  requirement_id uuid,
  latest_observation_id uuid REFERENCES public.screenshot_observations(id) ON DELETE SET NULL,
  latest_compilation_id uuid REFERENCES public.conversation_compilations(id) ON DELETE SET NULL,
  canonical_event text NOT NULL,
  event_family text NOT NULL,
  modifiers text[] NOT NULL DEFAULT '{}'::text[],
  extracted_entities jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversation_stage text NOT NULL,
  waiting_on text NOT NULL,
  blocker text,
  intent text NOT NULL,
  health text NOT NULL,
  movement text NOT NULL,
  momentum integer NOT NULL DEFAULT 0,
  next_action text NOT NULL,
  next_action_owner text NOT NULL,
  action_due_at timestamptz,
  sla_status text NOT NULL,
  priority text NOT NULL,
  last_screenshot_at timestamptz,
  screenshot_due_at timestamptz,
  screenshot_status text NOT NULL,
  evidence_quality integer NOT NULL,
  confidence numeric NOT NULL,
  automation_safe boolean NOT NULL DEFAULT false,
  needs_review boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.conversation_states TO authenticated;
GRANT ALL ON public.conversation_states TO service_role;
ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view conversation states" ON public.conversation_states FOR SELECT TO authenticated USING (true);

CREATE TABLE public.conversation_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_compilation_id uuid REFERENCES public.conversation_compilations(id) ON DELETE SET NULL,
  to_compilation_id uuid NOT NULL REFERENCES public.conversation_compilations(id) ON DELETE CASCADE,
  from_event text,
  to_event text NOT NULL,
  movement text NOT NULL,
  momentum_delta integer NOT NULL DEFAULT 0,
  blocker text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(to_compilation_id)
);
GRANT SELECT ON public.conversation_transitions TO authenticated;
GRANT ALL ON public.conversation_transitions TO service_role;
ALTER TABLE public.conversation_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view conversation transitions" ON public.conversation_transitions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.conversation_pattern_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_pattern text NOT NULL UNIQUE,
  representative_text text NOT NULL,
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  suggested_family text,
  status text NOT NULL DEFAULT 'new',
  mapped_rule_id uuid REFERENCES public.conversation_rules(id) ON DELETE SET NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text
);
GRANT SELECT, INSERT, UPDATE ON public.conversation_pattern_clusters TO authenticated;
GRANT ALL ON public.conversation_pattern_clusters TO service_role;
ALTER TABLE public.conversation_pattern_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view pattern clusters" ON public.conversation_pattern_clusters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can submit pattern clusters" ON public.conversation_pattern_clusters FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Tower can classify pattern clusters" ON public.conversation_pattern_clusters FOR UPDATE TO authenticated USING (public.is_tower_ops(auth.uid())) WITH CHECK (public.is_tower_ops(auth.uid()));

CREATE INDEX conversation_compilations_lead_time_idx ON public.conversation_compilations(lead_id, compiled_at DESC);
CREATE INDEX conversation_compilations_event_idx ON public.conversation_compilations(canonical_event, waiting_on, health);
CREATE INDEX conversation_states_queue_idx ON public.conversation_states(waiting_on, priority, action_due_at);
CREATE INDEX conversation_states_screenshot_idx ON public.conversation_states(screenshot_status, last_screenshot_at);
CREATE INDEX conversation_transitions_lead_time_idx ON public.conversation_transitions(lead_id, occurred_at DESC);
CREATE INDEX conversation_patterns_status_idx ON public.conversation_pattern_clusters(status, occurrence_count DESC);

CREATE TRIGGER conversation_rules_updated_at BEFORE UPDATE ON public.conversation_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER conversation_states_updated_at BEFORE UPDATE ON public.conversation_states FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.conversation_rules
(rule_key, canonical_event, event_family, positive_patterns, semantic_examples, modifiers_to_add, entity_extractors, stage_after, waiting_on, blocker, default_next_action, default_owner_role, sla_minutes, priority, movement_effect, success_transitions, failure_transitions, confidence_threshold, human_review_below, observed_count)
VALUES
('welcome_sent','WELCOME_SENT','QUALIFICATION','["thank you for connecting with gharpayy","thankyou for connecting with gharpayy"]','["Thank you for connecting with Gharpayy"]','{}','{}','NEW','CUSTOMER','Requirement not captured','Qualify requirement','SALES',120,'P2',1,ARRAY['LOCATION_REQUIRED','BUDGET_REQUIRED','MOVEIN_REQUIRED'],ARRAY[]::text[],0.86,0.68,119),
('location_required','LOCATION_REQUIRED','LOCATION','["which location","preferred location","exact office location","exact college location","share your office"]','["In which location?","Could you share your office?"]','{}',ARRAY['location','office_location'],'REQUIREMENT_VALIDATION','CUSTOMER','Location missing','Get exact location','SALES',120,'P2',1,ARRAY['LOCATION_SHARED','LOCATION_FEASIBILITY_PENDING'],ARRAY[]::text[],0.82,0.65,22),
('location_feasibility','LOCATION_FEASIBILITY_PENDING','LOCATION','["check if location is feasible","is this location okay","please check this location","have you checked the location"]','["Check if location is feasible for you?"]','{}',ARRAY['location'],'REQUIREMENT_VALIDATION','CUSTOMER',NULL,'Follow up on this location','SALES',120,'P2',1,ARRAY['LOCATION_FEASIBLE','LOCATION_REJECTED'],ARRAY['LOCATION_REOPTIMIZATION_REQUIRED'],0.84,0.66,70),
('budget_required','BUDGET_REQUIRED','BUDGET','["max budget","maximum budget","what is your budget"]','["What is your max budget?"]','{}',ARRAY['budget'],'REQUIREMENT_VALIDATION','CUSTOMER','Budget missing','Get maximum budget','SALES',120,'P2',1,ARRAY['BUDGET_SHARED'],ARRAY[]::text[],0.84,0.66,40),
('rent_feasibility','RENT_FEASIBILITY_PENDING','BUDGET','["rent and amenities feasible","check the rent and amenities","does the rent work"]','["Is rent and amenities feasible for you?"]','{}',ARRAY['budget','amenities'],'PROPERTY_EVALUATION','CUSTOMER',NULL,'Follow up on rent and amenities','SALES',120,'P2',2,ARRAY['BUDGET_ACCEPTED','PROPERTY_INTERESTED'],ARRAY['BUDGET_OBJECTION'],0.84,0.66,40),
('movein_required','MOVEIN_REQUIRED','QUALIFICATION','["move-in date","move in date","when exactly do you need","when do you need it"]','["When exactly do you need it?"]','{}',ARRAY['movein_date'],'REQUIREMENT_VALIDATION','CUSTOMER','Move-in date missing','Get move-in date','SALES',120,'P2',1,ARRAY[]::text[],ARRAY[]::text[],0.84,0.66,14),
('city_presence','CITY_PRESENCE_REQUIRED','QUALIFICATION','["currently in blr","currently in bangalore","are you in bangalore"]','["Are you currently in BLR?"]','{}',ARRAY['city_presence'],'REQUIREMENT_VALIDATION','CUSTOMER','City presence unknown','Confirm current city','SALES',120,'P2',1,ARRAY[]::text[],ARRAY[]::text[],0.84,0.66,8),
('property_review','PROPERTY_REVIEW_PENDING','PROPERTY','["check this property","go through the property","check these two options","new 1bhk option available"]','["Did you go through the properties?"]','{}',ARRAY['property'],'PROPERTY_EVALUATION','CUSTOMER',NULL,'Get property-specific feedback','SALES',120,'P1',2,ARRAY['PROPERTY_INTERESTED','TOUR_INTENT'],ARRAY['PROPERTY_REJECTED_PRICE','REMATCH_REQUIRED'],0.82,0.64,28),
('options_available','OPTIONS_AVAILABLE','PROPERTY','["other great options","available there too","good flat-like pg","good flat like pg"]','["We have other options available there too"]','{}',ARRAY['property_type'],'MATCHING','GHARPAYY',NULL,'Share the strongest matching options','SALES',30,'P1',2,ARRAY['PROPERTY_SHARED','PROPERTY_REVIEW_PENDING'],ARRAY[]::text[],0.80,0.64,44),
('visit_availability','VISIT_AVAILABILITY_PENDING','VISIT','["available for a visit","coming for visit","want to visit","visit today"]','["When are you available for a visit?"]','{}',ARRAY['visit_date','visit_time'],'VISIT_PLANNING','CUSTOMER',NULL,'Confirm visit day and time','TOUR_TEAM',60,'P1',4,ARRAY['VISIT_DAY_IDENTIFIED','VISIT_TIME_CONFIRMED','TOUR_SCHEDULED'],ARRAY[]::text[],0.84,0.66,22),
('customer_reached','CUSTOMER_REACHED','VISIT','["reached","outside the property","at the property","downstairs"]','["Reached?"]','{}',ARRAY['property'],'TOUR_IN_PROGRESS','TOUR_TEAM',NULL,'Support the live visit now','TOUR_TEAM',0,'P0',5,ARRAY['TOUR_COMPLETED'],ARRAY[]::text[],0.90,0.72,1),
('recovery_still_looking','RECOVERY_STILL_LOOKING','RECOVERY','["still looking","are you still looking"]','["Are you still looking for flats?"]','{}',ARRAY['property_type'],'RECOVERY','CUSTOMER',NULL,'Confirm whether requirement is active','SALES',240,'P2',0,ARRAY['REVIVED'],ARRAY['FOUND_STAY'],0.84,0.66,36),
('closure_check','CLOSURE_CHECK','RECOVERY','["got a stay","found a stay","were you able to find"]','["Got a stay?"]','{}','{}','RECOVERY','CUSTOMER',NULL,'Confirm active or found elsewhere','SALES',240,'P2',0,ARRAY['REVIVED'],ARRAY['FOUND_STAY'],0.84,0.66,18),
('handoff_pending','HANDOFF_PENDING_ACCEPTANCE','HANDOFF','["text them they will assist","contact our flats team","text the central team"]','["Text them, they will assist you"]','{}',ARRAY['handoff_contact'],'HANDOFF','OTHER_TEAM','Handoff not accepted','Get receiving team acceptance','OTHER_TEAM',10,'P1',0,ARRAY['HANDOFF_ACCEPTED'],ARRAY['HANDOFF_SLA_BREACH'],0.84,0.66,26),
('supply_gap','SUPPLY_GAP','SUPPLY','["do not have any option","don''t have any option","no available options","get back once we find"]','["We will get back once we find any"]','{}',ARRAY['location','budget','amenities','room_type'],'SUPPLY_MATCHING','SUPPLY','Matching inventory unavailable','Find matching inventory','SUPPLY',240,'P1',-1,ARRAY['OPTIONS_AVAILABLE'],ARRAY[]::text[],0.84,0.66,6),
('checking_details','CHECKING_DETAILS','INTERNAL_PROMISE','["checking and getting you details","checking and getting details"]','["Checking and getting you details"]','{}','{}','MATCHING','GHARPAYY','Details promised but not yet supplied','Send promised details','SALES',30,'P1',0,ARRAY['PROPERTY_SHARED'],ARRAY['TEAM_PROMISE_UNFULFILLED'],0.88,0.70,1),
('promised_callback','PROMISED_CALLBACK','INTERNAL_PROMISE','["we will connect back","connect back shortly","call you back"]','["We will connect back shortly"]','{}','{}','FOLLOW_UP','GHARPAYY','Callback promised','Call customer','SALES',30,'P1',0,ARRAY[]::text[],ARRAY['TEAM_PROMISE_UNFULFILLED'],0.86,0.68,1),
('unsent_draft','UNSENT_DRAFT','DRAFT','["draft:"]','["Draft: Would you like to explore other options"]','{}','{}','FOLLOW_UP','GHARPAYY','Response composed but not sent','Review and send draft','SALES',30,'P1',0,ARRAY[]::text[],ARRAY['DRAFT_STALE','UNSENT_RESPONSE_OVERDUE'],0.95,0.80,3)
ON CONFLICT (rule_key, version) DO NOTHING;