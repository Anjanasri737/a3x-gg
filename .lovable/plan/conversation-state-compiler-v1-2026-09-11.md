# Conversation State Compiler V1

Build a screenshot-derived compiler that converts immutable WhatsApp evidence into operational CRM state. The first release is based on the uploaded 107-screenshot / 931-row corpus, not a generic real-estate intent catalogue.

## Product rules

- Screenshot text remains evidence; it never directly becomes authoritative customer status.
- One customer can have unlimited observations. Repeated phone numbers resolve to one customer while every screenshot appearance remains auditable.
- A compilation produces four independent layers: semantic event, conversation state, execution policy, and evidence health.
- Primary events describe the conversation state. `CALL_ATTEMPTED`, `CONTEXT_FROM_CALL`, property type, and legacy tags are modifiers, not competing primary buckets.
- Incoming short replies such as “yes”, “no”, “ok”, “sure”, and “done” require prior-question context. Without context, return `CONTEXT_REQUIRED`; never guess.
- Missing screenshots and unchanged screenshots are separate: `SCREENSHOT_NOT_RECEIVED` means unknown state; `NO_MOVEMENT` means fresh evidence confirms no progress.
- Compiler output stays advisory until an explicit CRM action confirms a commercial stage change. Low-confidence evidence cannot close, merge, book, or otherwise make destructive changes.

## 1. Canonical V1 library from real screenshots

Create a versioned rule library for the dominant observed families:

- Welcome and qualification: `WELCOME_SENT`, `PROPERTY_TYPE_REQUIRED`, `LOCATION_REQUIRED`, `OFFICE_LOCATION_REQUIRED`, `BUDGET_REQUIRED`, `MOVEIN_REQUIRED`, `ROOM_TYPE_REQUIRED`, `CITY_PRESENCE_REQUIRED`.
- Location: `LOCATION_SHARED`, `LOCATION_FEASIBILITY_PENDING`, `LOCATION_FEASIBLE`, `LOCATION_REJECTED`, `LOCATION_REOPTIMIZATION_REQUIRED`.
- Budget/commercials: `BUDGET_SHARED`, `RENT_FEASIBILITY_PENDING`, `BUDGET_ACCEPTED`, `BUDGET_OBJECTION`, `BUDGET_CEILING_CHANGED`, `BUDGET_SUPPLY_GAP`.
- Property: `OPTIONS_AVAILABLE`, `PROPERTY_SHARED`, `PROPERTY_REVIEW_PENDING`, `PROPERTY_INTERESTED`, `PROPERTY_REJECTED_PRICE`, `PROPERTY_LOCATION_ACCEPTED`, `REMATCH_REQUIRED`.
- Visit: `VISIT_INVITE_SENT`, `VISIT_AVAILABILITY_PENDING`, `VISIT_DAY_IDENTIFIED`, `VISIT_TIME_PENDING`, `VISIT_TIME_CONFIRMED`, `TOUR_SCHEDULED`, `CUSTOMER_ON_WAY`, `CUSTOMER_REACHED`, `TOUR_COMPLETED`.
- Recovery/closure: `RECOVERY_STILL_LOOKING`, `CLOSURE_CHECK`, `PLAN_CHANGE_CHECK`, `REVIVED`, `FOUND_STAY`.
- Handoff: `HANDOFF_REQUIRED`, `HANDOFF_INITIATED`, `HANDOFF_PENDING_ACCEPTANCE`, `HANDOFF_ACCEPTED`, `NEW_OWNER_CONTACTED_CUSTOMER`, `HANDOFF_COMPLETE`.
- Supply and internal promises: `SUPPLY_GAP`, `OPTIONS_AVAILABLE`, `CHECKING_DETAILS`, `TEAM_PROMISE_UNFULFILLED`, `PROMISED_CALLBACK`.
- Draft execution: `UNSENT_DRAFT`, `DRAFT_STALE`, `UNSENT_RESPONSE_OVERDUE`.
- Safe fallback: `CONTEXT_REQUIRED`, `NEW_PATTERN_DETECTED`.

Each rule stores version, family, deterministic patterns, examples from the corpus, direction constraints, prior-state constraints, modifiers, entity extractors, resulting stage, waiting party, action, owner role, SLA, priority, transitions, confidence threshold, and review threshold.

## 2. Three-layer compiler

Replace the current flat keyword inference on screenshot ingestion with a dedicated compiler:

1. **Deterministic phrase matcher** — normalized exact/regex patterns for known Gharpayy language and OCR noise.
2. **Semantic variant matcher** — maps paraphrases into existing canonical families without inventing a new family.
3. **Context resolver** — resolves short replies and shells such as “Works?” using previous observations, direction, saved requirement facts, and prior canonical state.

If confidence remains insufficient, produce `NEW_PATTERN_DETECTED` and route it for review. Do not force a match.

Compiler output includes:

- Primary event, event family, modifiers, extracted entities, rule/version, confidence, and reasons.
- Stage, waiting on, blocker, intent, health, canonical movement, and momentum score.
- Next action, owner role, due time, SLA status, and priority (`CUSTOMER_REACHED` is P0/immediate).
- Screenshot heartbeat, evidence completeness, and automation safety.

## 3. Entity and legacy-label parsing

- Extract budget ceilings/operators, locations, rejected locations, office/college location, move-in dates/windows, room type, amenities, and supply constraints from observed text.
- Decompose raw WhatsApp labels into source marker, person tags, legacy urgency, acquisition state, and age modifier while preserving the exact raw labels.
- Never treat legacy `IMMEDIATE`, person labels, or combined WhatsApp labels as current CRM truth.
- Feed safely extracted facts into Customer Truth as proposed updates; require review below the configured confidence threshold.

## 4. Persistence and history

Add production tables/fields with grants and row-level access for:

- Versioned conversation rules and phrase examples.
- Immutable compilation results attached to screenshot observations.
- Current compiled state per customer/requirement.
- Entity proposals and accepted/rejected corrections.
- State transitions with movement magnitude and original/current rule interpretations.
- New-pattern clusters and admin decisions.

Backfill all existing screenshot observations through V1 while retaining the original OCR text and prior interpretation. Reclassification creates a new versioned interpretation rather than silently rewriting history.

## 5. Action policy and heartbeat

- Calculate `waiting_on`: Customer, Gharpayy, Supply, Tour Team, Closing, Other Team, External, or None.
- Create contextual next actions and timers from the canonical event.
- Add internal SLA escalation for promises, drafts, and handoffs.
- Add screenshot heartbeat states: due at 20h, not received at 24h, critical at 48h.
- Compare canonical states across observations to derive `NO_MOVEMENT`, `PROGRESSED`, `MOVED_WITH_BLOCKER`, `REVIVED_BY_SUPPLY`, `STRONG_PROGRESS`, or regression, plus a momentum score.
- Keep automatic action creation idempotent so reprocessing the same observation cannot duplicate tasks.

## 6. Operator and Control Tower experience

**Operator view** stays simple: customer, operational state, key facts, waiting party, plain-language reason, next action, SLA, and only relevant actions such as Call, WhatsApp, Schedule Tour, Rematch, or Handoff.

**Control Tower** adds live queues and counts for:

- Waiting on Gharpayy, location feasibility, property review, visit opportunity, budget objection, handoff pending, supply gap, unsent drafts, screenshot missing, unchanged over 24h, number/identity review, and classification review.
- Rule-library screen showing observed count, variants, conversion/movement, policy, and active version.
- New-pattern clusters that can be mapped once to an existing family or promoted into a versioned rule.
- Evidence-quality and compiler-accuracy reporting, including operator corrections and wrongly automated Draft Ready decisions.

## 7. Integration

- Wire the compiler into screenshot row persistence, manual observation correction, identity resolution, Flow OS lead cards, work queues, lead history, and Control Tower.
- Preserve the existing rule that screenshot evidence cannot directly advance authoritative CRM stages.
- Retire duplicate in-memory/keyword classifiers where they conflict, using one shared compiler for live ingestion, backfill, and UI recomputation.
- Keep current draft claims and exclusive ownership unchanged; compiled state improves prioritization but does not bypass locks.

## 8. Verification

- Build a fixture suite from sanitized real corpus phrases, including compound messages, OCR noise, direction differences, short replies, “Works?”, drafts, labels, repeated customers, and unchanged/missing screenshot cases.
- Assert primary event + modifiers + entities + waiting party + action/SLA for every V1 family.
- Test transition and momentum logic across ordered observations.
- Test idempotent reprocessing, rule-version history, low-confidence safety, deduplication, and claim compatibility.
- Run the 931-row backfill in report-only mode first; review unknown/low-confidence clusters before enabling action creation.
- Verify the live screenshot upload path, operator queue, lead history, rule library, and Control Tower in browser on desktop and the current mobile viewport.
