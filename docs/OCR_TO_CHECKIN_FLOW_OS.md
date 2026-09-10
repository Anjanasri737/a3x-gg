# Gharpayy Flow OS — OCR to Check-in Golden Spine

## Outcome

One screenshot can contain many chats. Many screenshots can contain the same customer. The product must convert that noisy input into exactly one canonical customer/lead journey and keep the same identity, state, owner, history, next action and booking context all the way through check-in.

The operator experience should be:

> Upload screenshots → OCR extracts chats → duplicates collapse → lead is created/attached → system drafts/assigns → one next action → qualify → match → tour → post-tour → quote → negotiation → booking → check-in.

No parallel lead models. No parallel stage systems. No new drawer per workflow.

---

## 1. What already exists in this repository

### Intake / Control Tower

- `src/components/tower/FastCapturePage.tsx`
- `src/lib/tower/engine.ts`
- Supabase tables such as `inbound_conversations`, `leads`, `lead_cycles`, `assignments`, `next_actions`, `duplicate_matches` and `audit_logs`.
- Current fast capture manually selects a conversation, zone and move-in bucket and calls `createAndAssign()`.

This is the strongest production-shaped first-mile implementation in the repository and should survive.

### Lead identity

- `src/lib/lead-identity/types.ts`
- `src/lib/lead-identity/store.ts`
- `src/components/leads/DirectLeadForm.tsx`

This layer has useful normalization/dedup concepts and a ULID, but it is currently a persisted Zustand/mock layer rather than the same Supabase `leads` record used by Control Tower.

### Closing pipeline

- `src/lib/pipeline/stage-config.ts`
- `src/lib/pipeline/stage-engine.ts`
- `src/lib/pipeline/types.ts`
- `src/lib/pipeline/store.ts`

This is the correct lifecycle spine. It already defines:

`NEW → DOSSIER → MATCHED → TOUR_SCHEDULED → TOUR_CONFIRMED → TOUR_IN_PROGRESS → POST_VISIT → QUOTED → NEGOTIATION → BOOKED → CHECKED_IN`

plus `LOST`.

Keep this state machine. Do not create another sales lifecycle.

### Older lead/tour/booking store

- `src/lib/types.ts`
- `src/lib/store.ts`
- `src/routes/leads.tsx`

This is a second legacy lead universe with its own `LeadStage`, tours, post-tour updates and bookings. It should become a compatibility/view adapter during migration and then be retired.

### Booking agreement / Crib Booking

- `src/cribbooking/types.ts`
- `src/cribbooking/store.ts`

This provides useful booking/agreement terms and a shareable confirmation, but the current `CribBooking` has no canonical lead ID or pipeline booking ID. It must become a child record of the same lead journey, not a new terminal customer record.

---

## 2. Current structural failures

### Failure A — multiple lead identities

Today the repository can represent the same customer as:

1. Supabase `leads.id` in Control Tower.
2. `UnifiedLead.ulid` in `lead-identity`.
3. Legacy `Lead.id` in `src/lib/store.ts`.
4. A `CribBooking` identified by tenant phone/name instead of lead ID.

This guarantees eventual drift.

### Failure B — multiple status systems

The same customer can simultaneously have:

- `LifecycleState`
- `LeadStageTag`
- free-form `UnifiedLead.stage`
- legacy `LeadStage`
- `PipelineStage`
- `CribStatus`
- database `leads.status`

Only `PipelineStage` should decide the customer journey.

Other statuses may remain only when they describe a different entity, for example an agreement can be `draft/sent/signed` while the lead itself remains `BOOKED`.

### Failure C — OCR is not the first-class intake path

The repository has inbound WhatsApp capture, but no canonical provider-agnostic screenshot OCR contract. Screenshot uploads therefore risk becoming another one-off ingestion path.

The new `src/lib/flow-os/ocr-contract.ts` solves the boundary:

- one screenshot → zero or more conversation candidates
- candidates from many screenshots → grouped by normalized phone
- same number visible repeatedly → one canonical conversation candidate
- uncertain/no-phone candidates → review queue
- confirmed candidate → existing `ParsedLeadDraft` contract for dedupe/identity

### Failure D — pipeline is local while Tower is database-backed

The Closing Engine is currently a persisted Zustand layer keyed by lead ID, while Tower works directly against Supabase. This means stage history can diverge from assignment history and database lead status.

The final state machine must live in the database. Client state should be a cache/view, not the source of truth.

### Failure E — booking/check-in continuity is incomplete

`PipelineState` defines `booking` and `checkIn`, but the current pipeline store exposes `setBooking()` and does not expose an equivalent `setCheckIn()` mutation. Separately, `crib_bookings` is not linked in its TypeScript model to the lead.

The journey is therefore strongest up to booking and weakest at the actual terminal outcome.

---

## 3. Golden lifecycle

The new end-to-end product lifecycle is:

1. `OCR_RECEIVED`
2. `OCR_PARSED`
3. `IDENTITY_RESOLVED`
4. `NEW`
5. `DOSSIER`
6. `MATCHED`
7. `TOUR_SCHEDULED`
8. `TOUR_CONFIRMED`
9. `TOUR_IN_PROGRESS`
10. `POST_VISIT`
11. `QUOTED`
12. `NEGOTIATION`
13. `BOOKED`
14. `CHECKED_IN`

`LOST` is an alternate terminal state and must require a reason + objection evidence.

The first three intake states are defined in `src/lib/flow-os/lifecycle.ts`. After `IDENTITY_RESOLVED`, execution hands into the existing `PipelineStage` engine. This avoids creating another CRM state machine.

---

## 4. Golden identity rule

### One customer, one canonical lead

The system must resolve identity in this order:

1. normalized phone exact match
2. known WhatsApp identity / source linkage
3. strong secondary evidence if phone is absent
4. manual review when identity remains ambiguous

A screenshot is evidence. A screenshot is not a lead.

A chat is evidence. A chat is not a separate lead when the same customer already exists.

A returning enquiry opens a new `lead_cycle`; it does not create another customer.

### Canonical keys

Use the Supabase `leads.id` as the database primary key.

If a public/external-safe ULID is needed, add it as `leads.ulid UNIQUE NOT NULL`, but never maintain a separate lead store around it.

All downstream records must contain `lead_id`:

- OCR extraction / inbound conversation
- cycle
- assignment
- call / WhatsApp activity
- next action
- property match
- tour
- post-tour result
- quotation
- negotiation event
- payment
- booking
- crib/agreement
- check-in
- issue/support record
- audit event

---

## 5. OCR intake design

### Batch upload

Control Tower/Admin can upload 1–30 screenshots in one batch.

The backend creates:

`ocr_batches`

- `id`
- `source_id`
- `uploaded_by`
- `uploaded_at`
- `status`
- `screenshot_count`
- `candidate_count`
- `resolved_count`
- `review_count`

`ocr_screenshots`

- `id`
- `batch_id`
- `storage_path`
- `ocr_provider`
- `ocr_raw`
- `processed_at`
- `error`

`ocr_candidates`

- `id`
- `screenshot_id`
- `contact_name`
- `phone_raw`
- `phone_e164`
- `first_visible_message`
- `last_visible_message`
- `raw_text`
- `confidence`
- `resolution_state`
- `resolved_lead_id`

### Automatic grouping

Before creating any lead:

- normalize all phones
- merge repeated candidates across screenshots
- retain every screenshot reference as evidence
- preserve the newest/last visible message
- mark low-confidence extraction for review

Expected result:

> 30 screenshots containing 170 visible chat rows may resolve into 128 unique customers, not 170 leads.

### Review only exceptions

Human review should only see:

- missing phone
- contradictory phone/name
- low OCR confidence
- possible duplicate
- two possible existing leads

High-confidence rows should flow automatically.

---

## 6. Handoff from OCR into the existing Tower

Do not bypass `createAndAssign()` logic.

The final intake service should conceptually do:

```text
OCR batch
  → group candidates
  → resolve identity
  → create/attach inbound_conversation
  → create/open lead_cycle
  → score priority
  → determine zone
  → create assignment
  → start SLA
  → create next action
  → initialize pipeline at NEW/DOSSIER
```

The current Tower already does much of dedupe, cycle creation, assignment, SLA and audit in `src/lib/tower/engine.ts`. Refactor it into a shared server service so manual WhatsApp capture, screenshot OCR and future direct integrations all call the same command.

Recommended command:

```ts
resolveInboundLead({
  sourceType,
  sourceRecordId,
  phone,
  name,
  location,
  moveIn,
  rawEvidence,
})
```

It returns:

```ts
{
  leadId,
  cycleId,
  assignmentId,
  pipelineStage,
  nextAction,
  duplicateResolution,
}
```

---

## 7. One lead command center

Every screen should open the same lead component by `lead_id`.

Never create separate lead detail implementations for:

- Leads
- My Work
- Control Tower
- Tours
- Closing
- Bookings
- Review Queue

The shell can change by role, but the lead command component is shared.

### Always visible

1. Customer identity
2. Current `PipelineStage`
3. Current mission
4. Primary blocker
5. One primary CTA
6. SLA
7. owner / live work lock
8. best two property matches

### Context, collapsed unless needed

- dossier
- communication summary
- source screenshots
- past conversations
- property history
- previous tours
- quote history

### Record, collapsed

- full audit trail
- assignment history
- cycles
- evidence
- overrides

---

## 8. Stage → primary action

| Stage | Mission | Primary CTA |
|---|---|---|
| OCR_RECEIVED | extract chats | Process OCR |
| OCR_PARSED | resolve uncertain fields | Review OCR |
| IDENTITY_RESOLVED | attach/create canonical lead | Create/Attach |
| NEW | start qualification | Start Dossier |
| DOSSIER | establish feasibility | Complete Dossier |
| MATCHED | find best viable supply | Match Properties |
| TOUR_SCHEDULED | lock plan | Schedule/Finalize Tour |
| TOUR_CONFIRMED | protect attendance | Confirm Tour |
| TOUR_IN_PROGRESS | complete visit | Run Tour |
| POST_VISIT | identify decision + blocker | Capture Outcome |
| QUOTED | send dated commercial offer | Send Quote |
| NEGOTIATION | eliminate primary blocker | Resolve Blocker |
| BOOKED | validate money + room + terms | Verify Booking |
| CHECKED_IN | complete arrival handover | Complete Check-in |

The CRM should not ask operators which workflow they want. Stage decides the workflow.

---

## 9. One blocker rule

Every active lead may have many notes but exactly one `primary_blocker`.

Recommended enum:

- `NONE`
- `UNREACHABLE`
- `LOCATION`
- `BUDGET`
- `INVENTORY`
- `MOVE_IN_DATE`
- `PARENT_APPROVAL`
- `COMPANY_APPROVAL`
- `COMPARING`
- `TOUR_ATTENDANCE`
- `PRICE`
- `PROPERTY`
- `PAYMENT`
- `KYC`
- `AGREEMENT`
- `CHECKIN_LOGISTICS`
- `UNKNOWN`

Changing the blocker should create an audit event.

The next-action engine uses stage + blocker + SLA + inventory + last activity to choose one primary CTA.

---

## 10. Drafting / My 30

OCR intake should not dump 150 leads directly onto an operator.

After resolution, eligible leads enter a drafting engine.

A 30-lead batch should intentionally mix:

- high-intent / urgent
- warm follow-up
- tour-ready
- post-tour
- stuck/recovery
- fresh qualified

The batch is a work queue, not ownership truth.

Each item still points to the same `lead_id`.

Flow:

`Start My 30 → Lead 1 → primary action → outcome → next action persisted → Lead 2`

No returning to lists between normal actions.

---

## 11. Tours

Tour creation must be one domain command used everywhere:

```text
scheduleTour(leadId, propertyIds, startAt, coordinator)
```

It must atomically:

- create/update tour
- advance pipeline
- create reminders
- create owner/TCM handoff
- attach property sequence
- create next action
- write audit event

No route should independently mutate a lead stage to `tour-scheduled`.

The legacy `src/lib/store.ts` currently does this and must be migrated behind the canonical command.

---

## 12. Post-tour

Post-tour must end in a decision, not a form submission.

Minimum result:

- decision
- primary blocker
- property liked
- probability / intent
- next action

If positive, quote SLA starts immediately.

If alternative required, return to property matching without creating another lead or losing tour history.

---

## 13. Quote and negotiation

Quotation belongs to the same lead/cycle and should include:

- property
- room/bed
- rent
- deposit
- maintenance
- fees
- discount
- expiry
- created_by
- sent_at
- viewed_at if available
- status

One active commercial offer should be designated `current_quote_id`.

Negotiation events append history. They do not replace truth.

---

## 14. Booking and Crib Booking

`CribBooking` should be renamed conceptually to an agreement/booking-terms child entity, not treated as the booking source of truth.

Required linkage additions:

- `lead_id`
- `cycle_id`
- `booking_id`
- `quotation_id`
- `property_id`
- `room_id` / `bed_id` where applicable

Booking command must atomically verify:

1. payment reference
2. amount
3. property
4. room/bed lock
5. move-in date
6. commercial terms
7. owner notification
8. next action for check-in

Only then advance `NEGOTIATION → BOOKED`.

The shareable Crib link remains useful as the customer-facing agreement/confirmation surface.

---

## 15. Check-in

Check-in is not merely a date field.

Create a canonical `checkins` record or persist the full object under the pipeline domain with:

- `lead_id`
- `booking_id`
- `scheduled_at`
- `arrived_at`
- `property_id`
- `room_id` / `bed_id`
- `kyc_status`
- `agreement_status`
- `payment_clearance_status`
- `key_handover_at`
- `inventory_handover_status`
- `issue_status`
- `completed_by`
- `completed_at`
- `nps_score`

### Entry gate to CHECKED_IN

Do not mark checked in until:

- customer physically/operationally arrived
- KYC complete or approved exception
- agreement complete or approved exception
- room/bed is the booked allocation
- required payment clearance is valid
- handover is recorded

### Terminal output

When `CHECKED_IN`:

- close active sales next actions
- release sales workload points
- close lead cycle as won
- preserve full acquisition attribution
- start resident/support lifecycle separately

Do not continue changing the sales pipeline after this point.

---

## 16. Database migration target

The final source-of-truth model should center on:

### `leads`

Identity + current projection only:

- `id`
- `ulid`
- normalized contact identity
- current owner
- current zone
- current priority
- `current_pipeline_stage`
- `primary_blocker`
- `current_next_action_id`
- `active_cycle_id`
- `last_activity_at`

### Event/child tables

- `lead_cycles`
- `inbound_conversations`
- `ocr_batches`
- `ocr_screenshots`
- `ocr_candidates`
- `assignments`
- `lead_activities`
- `next_actions`
- `lead_dossiers`
- `property_matches`
- `tours`
- `post_visit_results`
- `quotations`
- `negotiation_events`
- `payments`
- `bookings`
- `crib_bookings` / `agreements`
- `checkins`
- `audit_logs`

Current-stage fields on `leads` are projections for speed. History lives in child/event tables.

---

## 17. Refactor map

### Keep and promote

- `src/lib/pipeline/stage-config.ts` → canonical sales lifecycle
- `src/lib/pipeline/stage-engine.ts` → gates/SLA rules
- `src/lib/tower/engine.ts` → basis for server-side intake/assignment service
- lead normalization/dedup algorithms from `src/lib/lead-identity/*`
- Crib Booking customer-facing agreement functions

### Merge into canonical services

- `src/lib/lead-identity/store.ts`
- `src/lib/pipeline/store.ts`
- `src/lib/store.ts`
- route-level tour mutations
- route-level lead stage mutations

### Retire as sources of truth

- legacy `LeadStage`
- free-form `UnifiedLead.stage`
- localStorage pipeline as authoritative state
- mock lead/tour/booking arrays

### Keep as view concepts only

- boards
- stacks
- tables
- My 30
- Control Tower exception views
- Closing board
- booking list

A view can be different. The underlying command/state cannot be different.

---

## 18. Migration sequence

### P0 — identity and lifecycle lock

1. Add `ulid`, `current_pipeline_stage`, `primary_blocker`, `active_cycle_id` to Supabase `leads`.
2. Backfill all existing leads.
3. Make PipelineStage the only sales stage enum.
4. Add bridge adapters for legacy screens.
5. Prevent direct stage mutation outside pipeline commands.

### P0 — OCR first mile

1. Add OCR batch/screenshot/candidate tables.
2. Build upload endpoint and OCR provider adapter.
3. Use `groupOcrCandidates()` before lead creation.
4. Create Review Exceptions queue.
5. Feed resolved candidates into shared intake command.

### P1 — execution commands

Create server-side canonical commands:

- `resolveInboundLead`
- `claimLead`
- `recordContact`
- `updateDossier`
- `matchProperties`
- `scheduleTour`
- `confirmTour`
- `completeTour`
- `recordPostVisit`
- `sendQuotation`
- `recordNegotiation`
- `confirmBooking`
- `completeCheckIn`
- `markLost`

Each command writes audit + stage + next action in one transaction.

### P1 — universal Lead Command Center

Replace repeated drawers/modals with one shared component driven by `current_pipeline_stage`.

### P2 — retire old stores

Once route parity is verified, remove the mock/parallel stores and their duplicate status types.

---

## 19. Non-negotiable invariants

1. One phone/customer cannot silently create two active leads.
2. Every inbound conversation attaches to a lead or remains explicitly unresolved.
3. Every active lead has one current pipeline stage.
4. Every active lead has one owner or sits in an explicit exception queue.
5. Every active lead has one next action.
6. Every stage transition is audited.
7. No screen directly invents its own stage transition.
8. Tour/quote/booking/check-in records always contain `lead_id`.
9. Booking cannot exist without payment evidence or an explicit approved exception.
10. Check-in cannot exist without a booking.
11. Returning customers create a new cycle, not a new identity.
12. A screenshot is evidence, never the source of customer truth.

---

## 20. Golden-path acceptance test

A production E2E test should prove this exact journey:

1. Upload 10 screenshots.
2. OCR extracts 48 visible chat candidates.
3. Same customer appears in 3 screenshots.
4. System resolves those 3 rows to one phone and one lead.
5. Existing customer opens a new lead cycle instead of a duplicate lead.
6. New customer receives one lead ID.
7. Assignment is created with SLA.
8. Operator accepts/claims.
9. Dossier completes.
10. Two properties are matched.
11. Tour is scheduled.
12. Tour is confirmed.
13. Tour completes.
14. Post-tour outcome records `PRICE` as blocker.
15. Quote is sent inside SLA.
16. Negotiation records an approved offer.
17. Payment is recorded.
18. Booking locks one room/bed.
19. Agreement/Crib link references the same lead + booking.
20. Customer arrives.
21. KYC/agreement/handover complete.
22. Pipeline becomes `CHECKED_IN`.
23. Lead cycle closes as won.
24. No duplicate customer, no parallel status and no orphan booking exists.

If this test passes, the architecture is unified.

---

## 21. Product rule

The system should always be able to answer these seven questions from one lead ID:

1. Who is the customer?
2. Where did this customer come from?
3. Who owns the customer right now?
4. What stage are they in?
5. What is blocking conversion?
6. What must happen next and by when?
7. Did they finally check in?

If any screen answers one of those questions differently, that screen is wrong.
