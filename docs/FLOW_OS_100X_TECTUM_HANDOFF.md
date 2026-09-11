# Gharpayy Flow OS 100x — Tectum Engineering Handoff

## Purpose

This document is the implementation contract for the final Gharpayy Flow OS from WhatsApp screenshot evidence to verified physical check-in.

The operating constitution is:

**WhatsApp reality → every visible row → immutable observation → one canonical customer → one active lead cycle → one accountable owner → one Draft reservation → one live handler → one canonical pipeline stage → one mission → one blocker → one dated next action → property/tour → post-tour → quotation → payment → booking/approval → physical check-in gates → CHECKED_IN.**

No new feature may create a second customer identity, second commercial pipeline, second work-claim system, or a shortcut around booking/check-in evidence.

---

## 1. Final user surfaces

### `/flow-os` — Control / outcome home

Purpose: answer **Where is revenue leaking and what should happen next?**

Shows canonical customer truth, synchronized/amber/red counts, unowned opportunities, active handlers, the OCR → check-in spine, and a Revenue Leakage Queue. Any leak tied to a lead opens the same canonical customer workspace.

Implementation:
- `src/routes/flow-os.tsx`
- `src/components/flow-os/FlowOSHome.tsx`
- `src/components/flow-os/RevenueLeakagePanel.tsx`

### `/vision` — WhatsApp Truth Sync

Purpose: answer **Did every visible WhatsApp customer enter or update CRM truth?**

The operator/control team selects 20–30+ screenshots, chooses the WhatsApp account, records the checkpoint, and enters an **independent expected visible-row count**. AI extraction is not allowed to define its own success denominator.

A batch is complete only when:

`independent_expected_rows == persisted_observations`

AND

`needs_review == 0`

AND

`AI_errors == 0`

Any positive silent-drop count is a hard failure/revenue-leak signal.

Implementation:
- `src/components/flow-os/LiveVisionSyncPage.tsx`
- `src/lib/vision/screenshots.functions.ts`
- `src/lib/vision/resolve-observation.functions.ts`

Recommended operating checkpoints: **10:30 AM, 1 PM, 5 PM, 8 PM**, keeping a rolling three-day evidence window.

### `/my-work` — operator execution

Purpose: answer **Who should I work right now?**

One active Draft 30 per operator. Up to 13 open items are in Active 13. Refill is based on current open state, never historic rank.

Implementation:
- `src/components/flow-os/FlowWorkPage.tsx`
- `src/lib/flow-os/service.ts`
- `src/lib/flow-os/drafting-algorithm.ts`

### `UnifiedCustomerWorkspace` — only canonical customer workspace for Flow OS

Purpose: answer **What is true about this customer and what is the next valid action?**

Sections:
- Profile
- WhatsApp Intelligence
- Properties
- Tour
- Booking
- Check-in
- Timeline

Quick actions:
- Call
- WhatsApp
- Dated next action
- Complete & Next when opened from Draft

Implementation:
- `src/components/flow-os/UnifiedCustomerWorkspace.tsx`
- `src/components/flow-os/CanonicalCommercialPanel.tsx`

The historic AppShell can still mount the old local drawer for legacy pages. Final routes use `LegacyOverlayGuard` so that drawer can never overlay or compete with the canonical Flow OS workspace.

---

## 2. Canonical data model

### Identity

Canonical customer/lead identity is **`public.leads.id`**.

Returning demand uses `lead_cycles`; do not create another customer record merely because a person reappears in a later screenshot.

Phone identity is normalized before matching. Ambiguous/invalid identity goes to review rather than guessing.

### Screenshot evidence

Canonical tables:
- `screenshot_batches`
- `whatsapp_screenshots`
- `screenshot_observations`

Rule: **one screenshot is evidence, not one lead. One visible chat row is an observation, not one lead.**

The same phone can appear in many screenshots and many checkpoints while linking to one canonical lead. The evidence history remains preserved.

### WhatsApp intelligence

Every observation may contain:
- seen / unseen / unknown
- unread count
- raw colour evidence
- visibly detected WhatsApp label
- last-message preview
- message direction
- visible timestamp
- visible handler hint
- OCR confidence
- inferred stage
- stage confidence
- movement signal
- suggested work bucket / mission

The AI/rule inference is **advisory evidence**. It never becomes terminal commercial truth without a valid human/capability command.

`flow_label_rules` provides account-specific colour + seen-state + message-pattern → working-label rules. Do not revive the old global colour mapping as business truth.

### Work concurrency

Canonical tables:
- `draft_batches`
- `draft_batch_items`
- `work_claims`

`work_claims` represents two related states:

**Draft reservation**
- state `drafted`
- durable while the lead remains in the operator's active Draft
- `expires_at` is null
- prevents another operator from drafting the same lead

**Live handler lease**
- state `active`
- temporary ~10-minute lease
- meaningful work renews it
- idle expiry falls back to that operator's Draft reservation if the claim belongs to a Draft

Drafting/claiming is not reassignment. A lead with `current_owner != operator` cannot be silently stolen; the DB raises `LEAD_OWNED_BY_OTHER`.

### Customer stage

The only canonical customer journey stage for new Flow OS work is:

`public.leads.current_pipeline_stage`

Valid journey:

`NEW → DOSSIER → MATCHED → TOUR_SCHEDULED → TOUR_CONFIRMED → TOUR_IN_PROGRESS → POST_VISIT → QUOTED → NEGOTIATION → BOOKED → CHECKED_IN`

`LOST` is terminal until genuine new demand creates/reopens a cycle.

WhatsApp inference may be human-confirmed for non-terminal evidence-compatible stages only. It cannot directly manufacture QUOTED, BOOKED, LOST, or CHECKED_IN.

### Commercial truth

Canonical chain:

`flow_quotations → flow_bookings → flow_checkins`

All records link back to `public.leads.id`.

Payment capture and payment verification are separate actions. Owner approval is a separate dependency when required.

Crib integration, if present in an environment, is an optional child linkage. Flow OS must deploy even if `crib_bookings` does not exist.

---

## 3. OCR / Vision algorithm

### Input

A batch contains screenshots from one WhatsApp source/account/checkpoint and an independent expected visible-row count.

Client preparation:
- image resize/compression
- SHA-256 hash
- private storage upload
- duplicate-image lookup

Exact duplicate images reuse prior extraction instead of paying for another model call.

Maximum AI analysis concurrency is 3 screenshots at a time.

### Extraction contract

The Vision model must return every visible WhatsApp inbox row top-to-bottom, including partially visible first/last rows, without inventing hidden text.

No row may be merged with another row. No one row may be split into multiple observations.

Unknown values remain null/unknown rather than guessed.

### Reconciliation

Each observation resolves to one of:
- matched existing customer
- new canonical customer
- returning cycle
- duplicate observation
- needs review
- justified non-customer

Correcting the phone in Review immediately resolves identity: match existing normalized phone or create exactly one canonical lead/cycle.

A non-customer dismissal requires a specific written reason.

### Revenue guarantee equation

The model's detected-row count is diagnostic, not the denominator.

The independent expected count is authoritative for batch balance:

`silent_drops = max(0, expected_rows - observation_count)`

Batch completion requires zero silent drops, zero unresolved rows and zero screenshot-analysis errors.

---

## 4. Rolling three-day truth

`flow_three_day_truth` projects one row per canonical lead using the latest observation from the last three days plus current owner, reservation, live handler and next action.

It intentionally distinguishes:
- **Owner** — accountable operator/team owner
- **Reservation** — whose Draft contains the customer
- **Live handler** — who is actively working the customer now

Truth colours:

**GREEN**
- terminal CHECKED_IN/legitimate LOST, or
- active record with no execution/sync breach

**AMBER**
- fresh unread inside the response grace window but not actively handled yet, or
- WhatsApp evidence disagrees with saved CRM stage

**RED**
- no owner/reservation/dated action
- unread customer left unattended after SLA
- returning demand after LOST not reopened
- unresolved visible WhatsApp row
- other explicit funnel guarantee failure

**GREY**
- intentionally future/waiting with a valid later next action

Important: lack of a recent screenshot alone does not make an active CRM lead safe/future. CRM accountability remains required.

---

## 5. Revenue leakage taxonomy

`flow_revenue_leakage` exposes actionable rows, never only aggregate counts.

Current categories include:
- OCR_UNRESOLVED
- RETURNING_CUSTOMER_UNREOPENED
- UNOWNED
- FRESH_INBOUND_UNATTENDED
- NO_NEXT_ACTION
- QUALIFIED_NO_TOUR
- TOUR_NO_POST_VISIT
- POSITIVE_NO_QUOTE
- PAYMENT_NOT_BOOKED
- BOOKED_CHECKIN_RISK
- SYNC_MISMATCH

A RED metric must drill into the exact customer or unresolved observation causing it.

---

## 6. Draft 30 / Active 13 algorithm

The portfolio engine ranks opportunities using a multi-factor commercial score built around:

**Revenue probability × urgency × feasibility × inventory × WhatsApp movement × SLA risk**

Operational inputs include:
- saved funnel stage
- inferred WhatsApp intent/stage
- unread/reply freshness
- due/overdue next action
- check-in/move-in urgency
- priority
- owner/reservation eligibility
- sync/leak status
- recovery potential

The target Draft mix is soft, not a hard quota. It aims for diversity across fresh strong, unread/replied, qualified no-tour, tour-related, post-tour, quote/negotiation, recovery and future-due opportunities. If more high-value opportunities exist, they can override the target mix.

The DB remains the final collision barrier. An app-level candidate that loses a concurrent reservation race is skipped and the portfolio continues filling.

`rebalance_flow_active_tray()` ensures up to 13 currently open items are Active regardless of historic rank. Completing rank 1–13 does not strand rank 31+ in queued state.

---

## 7. Priority Interrupt

Fresh WhatsApp movement is an interrupt for the customer’s accountable universe, not a reason to steal the lead.

Priority Interrupt must respect:
- current owner
- current Draft reservation
- current live claim

It reorders attention but does not silently reassign ownership.

---

## 8. Complete & Next

Allowed operator dispositions exposed in the final Draft UI:
- Worked → dated next action
- Future → dated next action
- Handoff → dated next action
- Booked
- Lost

Rules:
- Future/Waiting/Handoff require a next-action type and datetime.
- Lost requires a reason.
- Raw `completed` is rejected.
- UI does not offer `Checked In` as a generic disposition.
- `Booked` is refused by the DB unless a canonical booking exists, payment is verified and required owner approval is complete.
- Any server-side attempt to use `checked_in` delegates to the canonical hard check-in validation; it cannot bypass it.

After a valid completion, the claim is released and Active 13 is rebalanced.

---

## 9. Physical check-in hard gate

The only terminal commercial outcome is verified physical `CHECKED_IN`.

`flow_confirm_checkin()` re-validates every gate server-side:

1. Canonical booking exists.
2. Payment is verified (or an explicit permitted manager override already exists).
3. Required owner approval is complete (or permitted manager override).
4. Physical arrival is confirmed.
5. Room/bed is allocated **and the room/bed label is non-empty**.
6. KYC is complete.
7. Agreement is complete.
8. Keys/room handover is complete.

Only then it:
- marks `flow_checkins.status = checked_in`
- marks booking booked
- sets `leads.current_pipeline_stage = CHECKED_IN`
- closes the lead
- closes open next actions
- releases current work claim

The UI's Ready-to-Check-In indicator uses the same gate set, so UI readiness and server readiness cannot intentionally disagree.

---

## 10. Human-confirmed WhatsApp movement

`confirm_flow_stage_hint()` lets an accountable human convert WhatsApp evidence into a saved non-terminal stage.

It is intentionally not a generic `setStage()` function.

Stages requiring real business evidence must use the real capability:
- QUOTED → quotation command
- BOOKED → verified payment/booking command
- CHECKED_IN → hard check-in command
- LOST → explicit lost disposition/reason

Every human confirmation writes `lead_timeline` with the authenticated UUID actor and renews a live work lease when appropriate.

---

## 11. Dated next action

`set_flow_next_action()` is the canonical lightweight scheduler inside the customer workspace.

It requires:
- accountable user/claim or permitted manager role
- action kind
- due datetime

It closes superseded open actions, creates the new action, updates current mission, writes timeline and renews live activity.

No silent exit from active work is allowed.

---

## 12. Legacy lockdown

Historical first-generation tables are preserved for audit/data migration only:
- `flow_screenshot_batches`
- `flow_screenshot_observations`
- `flow_work_claims`
- `flow_draft_batches`
- `flow_draft_items`
- `flow_label_colour_mapping`

Final migration `20260910045000_flow_os_100x_legacy_lockdown.sql` revokes authenticated/anon mutation rights and labels them `FLOW_OS_LEGACY_READ_ONLY`.

Final clients must use:
- `screenshot_batches`
- `whatsapp_screenshots`
- `screenshot_observations`
- `flow_label_rules`
- `draft_batches`
- `draft_batch_items`
- `work_claims`
- `flow_quotations`
- `flow_bookings`
- `flow_checkins`

Do not add new features to the legacy generation.

---

## 13. CI / change-control contract

`.github/workflows/flow-os-verify.yml` runs on every `chatgpt/**` push and PR to main.

Gates:

1. install dependencies
2. `node scripts/verify-flow-os.mjs`
3. strict `npx tsc --noEmit --pretty false`
4. production `npm run build`

The static invariant verifier checks that key product guarantees remain present, including independent Vision denominator, canonical routes/workspace, no checked-in generic UI disposition, commercial stage truth, UUID timeline actor, hard physical check-in gates, booking evidence, owner-safe Drafting, Active 13 refill, safe stage hints, dated actions, three-day reservation/handler truth, OCR leakage, optional Crib linkage and legacy-table lockdown.

A PR must not merge if any gate is red.

---

## 14. Tectum acceptance scenarios

### Scenario A — zero-miss screenshot universe

Upload 30 screenshots. Enter independent expected visible rows = 438. If 417 observations are persisted, batch must remain RED/unfinished with 21 silent drops. It must never report 417/417 success just because the AI saw 417.

After all 438 rows are persisted, any unresolved identities still prevent closure. Resolve each to a lead or give a specific non-customer reason. Only 438/438 + zero unresolved + zero errors can close.

### Scenario B — repeated screenshot customer

Rahul appears in four screenshots over three checkpoints. System must retain four observations linked to one lead. Latest message/seen/label/handler evidence updates the projected truth without creating four leads.

### Scenario C — 8-person race

Two operators attempt to Draft the same eligible customer simultaneously. Exactly one `work_claims` current reservation may succeed. The loser skips and fills the Draft with another candidate.

If a lead is owned by Operator A, Operator B's Draft/claim must fail with `LEAD_OWNED_BY_OTHER` until an explicit reassignment occurs.

### Scenario D — Draft lease

Operator opens a Drafted customer. Reservation becomes active for ~10 minutes. Meaningful action renews the lease. Idle expiry returns a Draft-linked claim to durable drafted reservation, not to the global pool.

### Scenario E — Active 13 refill

Complete several Active items, then refill Draft. Up to 13 open items must become Active even when their historic rank is >13 or >30.

### Scenario F — WhatsApp stage inference

Message implies a tour stage. UI shows Saved Stage vs Hint and confidence. Accountable human can confirm a safe tour-stage hint. A message implying payment/check-in cannot directly set BOOKED/CHECKED_IN; user is directed to the canonical commercial action.

### Scenario G — booking gate

Attempt `Booked` disposition without flow_booking → rejected.
With payment record but unverified payment → rejected.
With verified payment but required owner approval pending → rejected.
With verified payment + required approval complete → accepted.

### Scenario H — check-in gate

Attempt physical check-in while any of arrival, room/bed+label, KYC, agreement or keys is missing → rejected.
Only after all hard gates pass can `CHECKED_IN` be saved.

### Scenario I — leakage drill-down

Every RED leakage row with a lead ID opens the same UnifiedCustomerWorkspace. OCR_UNRESOLVED opens/focuses review rather than pretending a customer exists.

### Scenario J — legacy isolation

Navigate final Flow OS routes after previously opening a legacy lead drawer. Legacy drawer must be cleared. Historical shadow tables are not writable by authenticated/anon clients.

---

## 15. Definition of done

Flow OS is considered shippable only when all of the following are true simultaneously:

- GitHub Flow OS invariant suite is green.
- strict TypeScript check is green.
- production build is green.
- linked Lovable/Supabase contains canonical screenshot/work/commercial tables.
- live DB function inspection confirms owner-safe claims, booking evidence, safe stage confirmation and hard physical check-in gates.
- no final route renders the old RevenueGuaranteeOS or allows persisted legacy LeadControlPanel state to compete with the unified workspace.

Do not replace this definition with visual QA alone.
