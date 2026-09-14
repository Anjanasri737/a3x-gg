-- Journey ladder S1..S9
INSERT INTO public.lead_journey_steps (code, ordinal, name, purpose, done_when, owner_role) VALUES
 ('S1',1,'First Contact','Reach the customer on WhatsApp','A reply or a delivered first message exists','Flow Ops'),
 ('S2',2,'Qualification','Capture move-in, location, budget, room type','All four requirement fields captured','Flow Ops'),
 ('S3',3,'Property Shared','Send matching property options','At least one property shared with price','Flow Ops'),
 ('S4',4,'Call Done','Talk to the customer and confirm intent','Call connected with an outcome recorded','Flow Ops'),
 ('S5',5,'Tour Discussed','Agree that a visit will happen','Customer agreed to visit in principle','Flow Ops'),
 ('S6',6,'Tour Scheduled','Fix date, time and tour owner','Slot confirmed with a single tour owner','Tour Team'),
 ('S7',7,'Quotation','Send the exact commercial offer','Quotation sent with rent and deposit','Closing'),
 ('S8',8,'Booking Request','Freeze the commercial snapshot','Booking ID created and approval requested','Closing'),
 ('S9',9,'Confirmed Booking','Token reconciled and room reserved','Payment received and room reserved','Closing')
ON CONFLICT (code) DO NOTHING;

-- Conversation library buckets
INSERT INTO public.conversation_library_buckets
 (bucket, family, expected_direction, waiting_on, stage, default_next_action, sla_min, priority, movement_effect, rule_confidence, observed_count, example_1, example_2, example_3, rule_reason, journey_step) VALUES
 ('NEW_ENQUIRY','Enquiry','INBOUND','GHARPAYY','S1','Reply and ask requirement',30,'HIGH','FORWARD',0.95,180,'Hi, need a room','PG chahiye Kothrud mein','Room available?','Fresh inbound enquiry with no requirement captured','S1'),
 ('REQUIREMENT_SHARED','Qualification','INBOUND','GHARPAYY','S2','Share matching properties',60,'HIGH','FORWARD',0.92,140,'Budget 9000, single room','Move in from 1st','Ladies PG near Baner','Customer shared requirement details','S2'),
 ('PROPERTY_SHARED','Property','OUTBOUND','CUSTOMER','S3','Follow up on shared options',240,'MEDIUM','HOLD',0.9,120,'Sharing 3 options','Here are photos','Rent 8500 + deposit','We shared options and are waiting','S3'),
 ('CALL_REQUESTED','Call','INBOUND','GHARPAYY','S4','Call the customer now',20,'CRITICAL','FORWARD',0.94,95,'Call me','Aap call kar lo','Phone karo please','Customer asked for a call','S4'),
 ('TOUR_INTEREST','Tour','INBOUND','GHARPAYY','S5','Fix the visit slot',45,'HIGH','FORWARD',0.93,88,'I can visit tomorrow','Visit karna hai','Aaj shaam free hoon','Customer agreed to visit','S5'),
 ('TOUR_SCHEDULED','Tour','OUTBOUND','TOUR_TEAM','S6','Confirm tour owner and remind',120,'HIGH','FORWARD',0.91,70,'Visit at 5pm confirmed','Tomorrow 11am','Slot booked','Visit slot is fixed','S6'),
 ('POST_TOUR_FEEDBACK','Closing','OUTBOUND','GHARPAYY','S7','Capture feedback and send quote',60,'CRITICAL','FORWARD',0.9,64,'How was the visit?','Liked the room?','Feedback please','Tour done, feedback pending','S7'),
 ('QUOTE_SENT','Closing','OUTBOUND','CUSTOMER','S7','Follow up on the quotation',360,'HIGH','HOLD',0.89,58,'Quote sent','Rent + deposit breakup','Offer valid 48h','Quotation is out, awaiting decision','S7'),
 ('TOKEN_PENDING','Booking','OUTBOUND','CUSTOMER','S8','Chase the token payment',180,'CRITICAL','FORWARD',0.92,44,'Token pending','Please pay to block','Payment link sent','Booking waits on the token','S8'),
 ('BOOKING_APPROVAL','Booking','OUTBOUND','OTHER_TEAM','S8','Get property approval',240,'HIGH','HOLD',0.88,26,'Approval pending','Manager to confirm room','Inventory check','Property approval pending','S8'),
 ('SUPPLY_GAP','Supply','INBOUND','SUPPLY','S3','Offer nearby alternatives',180,'MEDIUM','HOLD',0.85,52,'Nothing in budget','No single room','Area not available','No matching supply available','S3'),
 ('OBJECTION_PRICE','Objection','INBOUND','GHARPAYY','S7','Handle the price objection',90,'HIGH','HOLD',0.87,49,'Too costly','Kam ho sakta hai?','Deposit zyada hai','Price objection raised','S7'),
 ('NO_RESPONSE','Silence','OUTBOUND','CUSTOMER','S2','Re-engage with a nudge',720,'MEDIUM','STALL',0.8,110,'Seen, no reply','Delivered only','Message ignored','Customer has gone quiet','S2'),
 ('BOOKED_CONFIRMED','Booking','INBOUND','NONE','S9','Prepare check-in',1440,'LOW','FORWARD',0.97,21,'Payment done','Booked!','Token received','Booking is confirmed','S9')
ON CONFLICT (bucket) DO NOTHING;

-- 320 demo leads across four cohorts
WITH names(first_name) AS (
  SELECT unnest(ARRAY['Aarav','Riya','Divya','Tanya','Rohan','Sneha','Karan','Meera','Aditya','Pooja','Nikhil','Isha','Rahul','Neha','Vikram','Ananya','Siddharth','Kavya','Arjun','Shreya'])
), places(place) AS (
  SELECT unnest(ARRAY['Kothrud','Baner','Wakad','Hinjewadi','Viman Nagar','Kharadi','Aundh','Hadapsar','Katraj','Shivaji Nagar'])
), cohorts(cohort, cnt, min_age_min, max_age_min, lead_status, stage) AS (
  VALUES ('current',100,10,2000,'open','DOSSIER'),
         ('old',100,43200,129600,'open','DOSSIER'),
         ('expired',100,172800,432000,'expired','DOSSIER'),
         ('tour',20,60,4000,'open','TOUR_SCHEDULED')
), gen AS (
  SELECT c.cohort, c.lead_status, c.stage, g.i,
         (c.min_age_min + ((g.i * 977) % GREATEST(1, c.max_age_min - c.min_age_min)))::int AS age_min
  FROM cohorts c, generate_series(1, 100) g(i)
  WHERE g.i <= c.cnt
), built AS (
  SELECT gen.*,
    (SELECT first_name FROM names OFFSET (gen.i % 20) LIMIT 1) AS fname,
    (SELECT place FROM places OFFSET (gen.i % 10) LIMIT 1) AS place,
    CASE gen.cohort WHEN 'tour' THEN 6 ELSE 1 + ((gen.i * 7) % 9) END AS step_idx
  FROM gen
)
INSERT INTO public.leads
 (phone, wa_name, location_text, status, pipeline_stage, current_pipeline_stage, current_mission, lead_source,
  conversation_bucket, journey_step, journey_step_index, library_rows_count,
  latest_whatsapp_preview, latest_whatsapp_observation_at, last_operator_action_at, created_at, updated_at)
SELECT
  '+9198' || lpad(((CASE cohort WHEN 'current' THEN 1000000 WHEN 'old' THEN 2000000 WHEN 'expired' THEN 3000000 ELSE 4000000 END) + i)::text, 8, '0'),
  fname || ' ' || substr(md5(cohort || i::text), 1, 1) || '.',
  place || ', Pune',
  lead_status,
  CASE WHEN step_idx >= 9 THEN 'BOOKED' WHEN step_idx >= 6 THEN 'TOUR' ELSE 'NEW' END,
  CASE WHEN step_idx >= 9 THEN 'BOOKED' WHEN step_idx = 8 THEN 'NEGOTIATION' WHEN step_idx = 7 THEN 'QUOTED'
       WHEN step_idx >= 6 THEN 'TOUR_SCHEDULED' ELSE 'DOSSIER' END,
  CASE WHEN step_idx >= 7 THEN 'Close the booking' WHEN step_idx >= 5 THEN 'Confirm the tour' ELSE 'Contact customer' END,
  'WhatsApp',
  CASE step_idx WHEN 1 THEN 'NEW_ENQUIRY' WHEN 2 THEN 'REQUIREMENT_SHARED' WHEN 3 THEN 'PROPERTY_SHARED'
    WHEN 4 THEN 'CALL_REQUESTED' WHEN 5 THEN 'TOUR_INTEREST' WHEN 6 THEN 'TOUR_SCHEDULED'
    WHEN 7 THEN 'QUOTE_SENT' WHEN 8 THEN 'TOKEN_PENDING' ELSE 'BOOKED_CONFIRMED' END,
  'S' || step_idx,
  step_idx,
  2 + (i % 4),
  CASE step_idx WHEN 1 THEN 'Hi, need a room in ' || place WHEN 2 THEN 'Budget ' || (7000 + (i % 6) * 500)::text || ', single room'
    WHEN 3 THEN 'Shared 3 options in ' || place WHEN 4 THEN 'Please call me' WHEN 5 THEN 'I can visit this week'
    WHEN 6 THEN 'Visit confirmed with our team' WHEN 7 THEN 'Quotation sent — rent + deposit'
    WHEN 8 THEN 'Token pending to block the room' ELSE 'Payment done, booking confirmed' END,
  now() - (age_min || ' minutes')::interval,
  now() - ((age_min + 30) || ' minutes')::interval,
  now() - ((age_min + 2880) || ' minutes')::interval,
  now() - (age_min || ' minutes')::interval
FROM built;

-- Journey progress for every seeded lead: done up to the current step
INSERT INTO public.lead_journey_progress (lead_id, step_code, status, evidence, at)
SELECT l.id, s.code,
  CASE WHEN s.ordinal < l.journey_step_index THEN 'done'
       WHEN s.ordinal = l.journey_step_index THEN 'current' ELSE 'pending' END,
  CASE WHEN s.ordinal <= l.journey_step_index THEN 'WhatsApp evidence captured from screenshot' ELSE NULL END,
  CASE WHEN s.ordinal <= l.journey_step_index
       THEN l.latest_whatsapp_observation_at - ((l.journey_step_index - s.ordinal) * 180 || ' minutes')::interval END
FROM public.leads l CROSS JOIN public.lead_journey_steps s
WHERE l.lead_source = 'WhatsApp'
ON CONFLICT (lead_id, step_code) DO NOTHING;

-- Conversation evidence rows linked back to each lead
INSERT INTO public.conversation_library_rows
 (row_id, zone, screenshot, capture_date, display_contact, phone_e164, identity_status, visible_time,
  last_message, labels_ocr, unread_ocr, draft_detected, direction, ocr_confidence, confidence_band,
  bucket, next_action, waiting_on, priority, lead_id)
SELECT
  l.id::text || '-r' || g.n,
  split_part(l.location_text, ',', 1),
  'wa-screenshot-' || (1 + (('x' || substr(md5(l.id::text), 1, 6))::bit(24)::int % 107)) || '.jpg',
  (l.latest_whatsapp_observation_at - (g.n * 40 || ' minutes')::interval)::date,
  l.wa_name, l.phone, 'MATCHED',
  to_char(l.latest_whatsapp_observation_at - (g.n * 40 || ' minutes')::interval, 'HH12:MI AM'),
  CASE g.n WHEN 1 THEN l.latest_whatsapp_preview
           WHEN 2 THEN 'Earlier: ' || b.example_1
           ELSE 'Earlier: ' || coalesce(b.example_2, b.example_1) END,
  b.family, CASE WHEN g.n = 1 AND b.waiting_on = 'GHARPAYY' THEN '1' ELSE NULL END,
  (g.n = 1 AND b.waiting_on = 'GHARPAYY'),
  CASE WHEN g.n = 1 THEN b.expected_direction ELSE 'INBOUND' END,
  0.82 + ((g.n * 5) % 15) / 100.0,
  CASE WHEN g.n = 1 THEN 'HIGH' ELSE 'MEDIUM' END,
  l.conversation_bucket, b.default_next_action, b.waiting_on, b.priority, l.id
FROM public.leads l
JOIN public.conversation_library_buckets b ON b.bucket = l.conversation_bucket
CROSS JOIN generate_series(1, 3) g(n)
WHERE l.lead_source = 'WhatsApp'
ON CONFLICT (row_id) DO NOTHING;

-- One open next action per active lead, deadline from the bucket SLA
INSERT INTO public.next_actions (lead_id, kind, due_at, notes, status, priority, source)
SELECT l.id, b.default_next_action,
  l.latest_whatsapp_observation_at + (coalesce(b.sla_min, 120) || ' minutes')::interval,
  'Seeded from conversation evidence: ' || b.rule_reason,
  'open', b.priority, 'seed'
FROM public.leads l
JOIN public.conversation_library_buckets b ON b.bucket = l.conversation_bucket
WHERE l.lead_source = 'WhatsApp' AND l.status <> 'expired';