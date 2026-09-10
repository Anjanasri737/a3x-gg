# Gharpayy Screenshot Reconciliation + 8-Operator Work OS

## 0. The operating law

A WhatsApp screenshot is not an import file. It is a reconciliation snapshot of the market at that moment.

The system must guarantee four things:

1. **Every visible WhatsApp row becomes an observation.** Nothing is silently dropped because the phone is hidden, OCR is uncertain, the same chat appeared yesterday, or the lead is already in CRM.
2. **Every observation is accounted for.** It is either linked to an existing lead, creates a new lead, is a duplicate observation of the same lead, is explicitly non-lead/internal, or sits in a visible review queue.
3. **Every active lead is accounted for operationally.** It has an accountable owner and a dated next action, or it is being worked right now under one live lock.
4. **Eight people can work the same shared WhatsApp universe without double-calling, double-messaging or creating eight versions of the same customer.**

If a lead is visible on WhatsApp but does not exist anywhere in CRM, that is acquisition leakage.

If a lead exists in CRM but nobody owns its next action, that is ownership leakage.

If someone owns it but the next action is overdue and nobody is working it, that is execution leakage.

The Control Tower should measure these as revenue leakage, not as housekeeping errors.

---

# 1. What the current recording already gets right

The screen recording already contains most of the interaction primitives needed for the final product. Do not rebuild them in parallel.

## Reuse the lead header

Keep one identity header with:

- customer name / phone
- current business stage
- qualification/priority badge
- area
- budget
- move/check-in date
- owner
- recency / freshness
- History

## Reuse the top action strip

The recording already shows the correct universal actions:

- **Log Activity**
- **Call**
- **WhatsApp**
- **Follow-up**
- **Pitch PG**
- **History / more actions**

These become canonical commands, not route-specific buttons.

`Call` from Leads, My Work, Control Tower, Closing or Post-tour must execute the same underlying command and write the same event.

## Reuse one progressive lead body

The current drawer already has the correct journey grammar:

- **Dossier**
- **Tour**
- **Post-tour**
- **Quote / Book**
- **Check-in**

Keep this as the one Lead Command Center.

Do not create a different drawer for OCR leads, a different popup for drafting, another modal for post-tour and another page for booking. Role/context can change what is emphasized, but not the underlying lead component.

## Reuse the existing micro-features

Keep the useful controls already visible in the recording:

- qualification gates
- location & commute
- lifestyle
- deal read
- who is coming
- call-attempt log
- picked / not picked
- call duration/outcome
- exact words / notes
- primary objection
- properties pitched
- special instructions / quick chips
- Schedule Tour
- overall tour experience
- post-tour outcome
- next property
- reassign lead
- quick note
- activity history
- copy lead summary
- close/drop lead

The problem is not lack of features. The problem is that these features need one identity, one state machine, one activity log and one work-claim model underneath them.

---

# 2. Screenshot ingestion must become a 100% coverage system

## The wrong model

`Upload screenshot -> OCR -> create some leads`

This is unsafe because anything OCR misses simply disappears.

## The correct model

`Upload screenshot -> detect visible chat rows -> create one immutable observation for every row -> reconcile every observation -> update/create CRM identity -> compute movement since previous upload -> create work/review exceptions`

### One screenshot row = one observation

For every visible WhatsApp row preserve, when readable:

- screenshot ID
- screenshot hash
- WhatsApp source/account
- screenshot captured time
- row index / visual position
- contact name exactly as displayed
- phone number if visible
- normalized phone if available
- last-message preview exactly as displayed
- whether preview appears incoming/outgoing/unknown
- raw visible date/time/weekday text
- unread indicator/count
- pin/mute indicators if readable
- OCR confidence per field or row
- raw OCR text
- warnings

Do not require the phone number for the observation to exist.

If only `Rohit` + `Need room from Monday` + `Yesterday` can be read, preserve those fields. The identity remains unresolved until phone/context resolves it.

**Never turn OCR uncertainty into data deletion.**

---

# 3. Two separate completion metrics

A batch can be fully covered even when identity review is pending.

## Coverage %

Every visible WhatsApp row must have exactly one explicit reconciliation result:

- linked existing lead
- created new lead
- duplicate observation
- review required
- explicit non-lead
- system/internal chat

Coverage should be:

`accounted visible rows / total visible rows`

The target is always **100%**.

## Resolution %

Measures whether review-required observations have been resolved to a canonical identity/disposition.

Coverage can be 100% while Resolution is 97%. That is acceptable temporarily because the missing 3% is visible in a queue.

What is never acceptable is 97% coverage, because the remaining 3% has disappeared from the system.

---

# 4. Rolling 3-day WhatsApp mirror

The screenshots should be re-uploaded multiple times through the day, and the operating window should keep reconciling the last three days of visible WhatsApp activity.

A practical operating cadence is the same cadence the team already understands:

- morning/start-of-day capture
- 1 PM capture
- 5 PM capture
- 8 PM/EOD capture

Additional uploads are allowed at any time.

Every upload is not a fresh CRM import. It is another observation set against the same canonical leads.

## Example

### Monday morning

Screenshot shows:

`Rahul | Need a PG near Bellandur | 10:22`

System:

- observation O1
- Rahul resolved to lead L101
- last WhatsApp observation = 10:22
- movement = FIRST_SEEN for this reconciliation history

### Monday 1 PM

Same Rahul row shows:

`Rahul | Can I visit at 6? | 12:54`

System:

- observation O2
- same lead L101
- does not create another lead
- movement = PREVIEW/TIME CHANGED
- if evidence shows a customer reply, update last customer activity
- pull Rahul up in today's work priority

### Monday 5 PM

Same row shows:

`Rahul | You: Sharing the location | 4:12`

System:

- observation O3
- same lead L101
- operator-side activity is visible
- keep full timeline
- if CRM has no corresponding activity, create a reconciliation exception: `WhatsApp moved but CRM activity missing`

### Tuesday

Rahul says:

`Will decide on Friday`

Operator schedules a future action for Friday.

The lead leaves Today's Work but not the CRM.

### Wednesday

Rahul unexpectedly messages:

`Can I come today instead?`

The three-day screenshot reconciliation sees the movement and **wakes the lead early**. The Friday future action is no longer allowed to hide a fresh inbound reply.

This is what it means for CRM to learn from WhatsApp movement.

---

# 5. CRM learns through observations, not dangerous guessing

There are three levels of truth.

## Level 1 — visual fact

Safe to store automatically:

- preview text changed
- visible timestamp changed
- unread count changed
- contact moved/appeared in a newer screenshot
- exact name/number/preview text

## Level 2 — strong operational inference

May update activity/priority when confidence is sufficient:

- likely customer replied
- likely operator replied
- chat became active again
- future lead woke early
- previously unseen customer appeared

These should retain confidence and source evidence.

## Level 3 — commercial truth

Must not be guessed from a weak WhatsApp preview:

- tour completed
- customer definitely liked property
- quote accepted
- payment received
- booked
- checked in

Those continue to require the canonical CRM commands/evidence.

The OCR layer may suggest the next action, but it must not silently advance the commercial pipeline into BOOKED/CHECKED_IN.

---

# 6. New leads arriving while eight people are working

New WhatsApp leads may appear at any time between screenshot runs.

At the next upload:

1. new visible row is detected
2. immutable observation is created
3. identity resolution runs
4. if phone is high-confidence and no lead exists -> create canonical lead/cycle
5. if lead already exists -> attach observation to that lead
6. if identity is uncertain -> create a Review Required item; never discard it
7. lead enters the global Work Pool according to urgency

If direct/extension/WhatsApp capture has already created the lead earlier, screenshot reconciliation must attach to that same lead, not create another.

The screenshot system therefore serves two jobs:

- intake safety net
- continuous reconciliation/audit of whether the CRM still matches WhatsApp

---

# 7. The key concurrency model for eight people

Do not use one generic `owner` field to solve everything.

Separate three concepts.

## A. Primary owner — accountability

`primary_owner_id`

Who is ultimately accountable for this customer/cycle.

This can survive across days.

## B. Draft reservation — batch coordination

`draft_reserved_by`

Which operator's current 30-lead draft contains the lead.

This prevents the same lead from appearing in two active drafts.

It is temporary and should clear when the batch item is classified/completed/released.

## C. Live work claim — collision protection

`live_worker_id + state + expires_at`

Who is allowed to perform an action on the lead right now.

Examples:

- AVAILABLE
- DRAFTING
- IN WORK
- CALLING
- FOLLOW-UP ACTIVE
- WAITING FOR CUSTOMER
- NEXT ACTION SCHEDULED
- COMPLETED

A live claim is a short lease with heartbeat/expiry, not permanent ownership.

### Why all three are required

Rahul may belong to Zone Owner Aditi.

Rahul may currently sit inside Kunal's Draft #2.

At this exact second Kunal may be calling Rahul.

Those are three different facts.

If another operator opens Rahul while Kunal is calling, show:

> **Kunal is calling this lead now · 01:42**
>
> CRM is read-only until the live claim releases.

The second operator can:

- view history
- add a non-conflicting internal note if allowed
- request takeover

They cannot start another call or send another WhatsApp message.

---

# 8. Drafting: 30 leads at a time

Drafting is rapid classification and reservation, not deep selling.

## Draft rule

- one open draft per operator
- default/minimum draft size: 30
- classification SLA: 300 seconds
- operator should read, understand, mark and move
- no long conversation while still drafting the batch
- next draft stays blocked until the current draft's 30 items all have a disposition

A batch is considered **classified** when every lead has:

- disposition
- current priority/stage understood
- next action or safe parked state

It does **not** mean every customer has been converted before another batch can be drafted.

## Fast drafting choices

Each lead should be classifiable with one tap into something like:

- CALL NOW
- WHATSAPP NOW
- TOUR READY
- POST-TOUR
- FOLLOW-UP TODAY
- WAITING CUSTOMER
- FUTURE DATE
- NEEDS SUPPLY
- LOST / NON-LEAD
- REVIEW REQUIRED

Then the existing Lead Command Center handles detailed execution.

---

# 9. Draft selection must optimize ROI, not randomness

Do not give all best leads to one person and all bad leads to another.

Do not simply take the newest 30.

Do not let operators cherry-pick only easy customers.

The drafting engine should build a deliberate portfolio.

## Ranking signals

Use, in order of operational value:

1. **Fresh inbound WhatsApp movement** — customer just replied or chat changed materially.
2. **Overdue next action / SLA risk.**
3. **Stage value** — post-tour/quote/booking-ready work has more immediate revenue value than generic nurture.
4. **Move-in urgency.**
5. **Location/budget/supply feasibility.**
6. **Tour readiness.**
7. **Previous attempts and contactability.**
8. **Lead age / freshness.**
9. **Future-date eligibility.**
10. **Zone/account/operator suitability.**
11. **Quality mix** — strong, medium and recovery work should all be represented.

## Suggested portfolio shape

The exact mix can be configurable, but a good 30 should contain a deliberate combination of:

- fresh/urgent
- good warm follow-ups
- tour-ready
- post-tour / quote-ready
- stuck but recoverable
- a smaller recovery/low-confidence slice

The objective is not a cosmetically high lead-quality score. The objective is maximum tours, quotations, bookings and check-ins per 30 drafted customers.

---

# 10. Active execution tray

A 30-lead draft should not force the operator to keep 30 live conversations mentally open.

After classification, the system can surface the highest-priority immediate subset as an **Active Tray**.

The existing operating design uses a small active tray (for example 13) while the rest remain safely dispositioned behind next actions.

The Active Tray should continuously refill as actions are completed.

Example:

- 30 drafted
- 13 require immediate calls/messages/tour work
- 7 are waiting on customer
- 6 have future dated follow-up
- 4 need supply/manager resolution

Only the immediate leads occupy the operator's active attention.

---

# 11. Lead execution loop — reuse the recorded drawer

When the operator starts working one lead, open the same lead drawer from the recording.

## Header

Always show:

- identity
- source/WhatsApp account
- owner
- live worker
- stage
- area
- budget
- move/check-in date
- last WhatsApp movement
- next action/SLA

## Action strip

### Log Activity

Universal entry point for any activity that does not already have a dedicated command.

Every action event stores:

- actor
- timestamp
- lead ID
- cycle ID
- action type
- before/after where relevant
- source/evidence

### Call

Before call starts:

- acquire live claim `CALLING`
- if another operator holds it, block the call

After call:

reuse the existing recording module:

- picked?
- duration
- outcome
- what did lead say / exact words
- objection
- next action

Release/transition the live claim based on result.

### WhatsApp

Before opening/sending:

- acquire live claim `IN_WORK`
- show the last observed WhatsApp preview/time
- on send/log, write activity

Later screenshot uploads reconcile whether WhatsApp actually moved.

### Follow-up

Never create a floating note such as `follow later`.

Require:

- date/time
- reason
- owner of next action

Then lead becomes `NEXT_ACTION_SCHEDULED` or `FUTURE_DATE` as appropriate.

### Pitch PG

Reuse current property pitching/matching UI.

All pitched properties stay attached to the same lead/cycle.

### History

Reuse the existing menu concepts:

- Lead History & Service
- Quick Note
- Activity History
- Reassign Lead
- Copy Lead Summary
- Close / Drop

History is append-only truth. Never rewrite yesterday because today's screenshot changed.

---

# 12. Future-date handling

Future is not a dumping ground.

A lead may enter future only with:

- explicit future reason
- next action date/time
- next action owner

Examples:

- moving next month
- wants callback Friday
- parents visit next week
- salary date
- waiting for office confirmation

## Future rules

1. Future lead exits normal Today's Work until due.
2. It remains visible in CRM and screenshot reconciliation.
3. On due date it re-enters the draft/work pool automatically.
4. If a new inbound WhatsApp movement appears before the due date, it wakes immediately.
5. If the future date is moved, record why; never overwrite history silently.
6. Future without a date or owner is leakage.

---

# 13. Waiting for customer

`WAITING_CUSTOMER` must be different from `FUTURE_DATE`.

Waiting means we already acted and the ball is with the customer.

It still requires a fallback next action.

Example:

- WhatsApp sent 2:10 PM
- waiting for customer
- fallback: call tomorrow 11 AM if no reply

If a screenshot at 5 PM shows an unread/new customer reply, the lead wakes immediately and enters active work.

---

# 14. Reconciliation exceptions — the real Control Tower

The new Control Tower should not merely show lead counts. It should show what WhatsApp proves that CRM has failed to account for.

## P0 leakage queues

### A. Visible on WhatsApp, missing from CRM

High-confidence lead-like observation with no `lead_id` and no explicit exemption.

### B. Active lead, no owner

Lead is open but nobody is accountable.

### C. Active lead, no next action

Nobody knows what happens next.

### D. WhatsApp moved, CRM did not

New screenshot proves conversation changed after the latest CRM action.

### E. Two operators attempting same lead

Live-claim collision or duplicate action attempt.

### F. Future lead woke early

New inbound movement occurred before scheduled future date.

### G. New lead appeared after last draft

Needs assignment/drafting now.

### H. OCR review unresolved

Potential revenue row exists, but identity is uncertain.

These are revenue-risk exceptions and should be treated above routine dashboard metrics.

---

# 15. Upload/reconciliation screen

A screenshot batch should show a receipt like this:

## Upload batch #R-2041

**Screenshots:** 24

**Visible rows detected:** 186

**Coverage:** 100%

Then split:

- existing leads updated
- new leads created
- repeated observations attached
- review required
- explicit non-leads/internal chats
- chats with new movement
- future leads woken
- active leads with no owner
- active leads with no next action
- live collisions prevented
- unaccounted rows

The only acceptable value for **unaccounted rows** is zero.

The batch may still have review-required rows; they are visible work, not missing data.

---

# 16. Admin / manager view for eight operators

The manager should see a single coordination board.

For each operator:

- current draft number
- `x / 30 classified`
- drafting elapsed time
- active tray count
- current live lead
- calls in progress
- next actions due
- waiting-customer count
- future count
- overdue count
- completed actions
- collisions attempted/prevented

For the team:

- unique WhatsApp chats seen last 3 days
- unique CRM leads attached
- new since latest upload
- unresolved review
- active no owner
- active no next action
- WhatsApp/CRM mismatch
- total active live claims
- leakage count

The manager should be able to click any leakage number directly into the exact lead/observation.

---

# 17. Database additions

## `screenshot_upload_batches`

- id
- source_id / WhatsApp account
- uploaded_by
- uploaded_at
- intended_capture_window
- screenshot_count
- visible_row_count
- accounted_row_count
- review_count
- leakage_count
- coverage_pct
- status

## `screenshot_files`

- id
- batch_id
- capture_at
- screenshot_hash
- storage_path
- processed_at
- OCR provider/version
- raw retention expiry

Raw screenshots may be temporary; structured observations must remain permanent.

## `screenshot_observations`

One row per visible WhatsApp row per screenshot:

- id
- screenshot_id
- row_index
- source_id
- contact_name_raw
- phone_raw
- phone_e164
- preview_raw
- preview_direction
- visible_timestamp_raw
- unread_count
- confidence
- raw_text
- resolved_lead_id
- resolution_state
- resolution_reason
- created_at

Put a uniqueness guard around `(screenshot_id, row_index)` so a visible row cannot silently disappear during processing retries.

## `conversation_observation_links`

Connect repeated observations to one canonical lead/conversation and preserve movement calculations.

## `draft_batches`

- id
- operator_id
- opened_at
- closed_at
- target_size
- classification_sla_seconds
- status

## `draft_batch_items`

- batch_id
- lead_id
- rank
- reason_selected
- disposition
- disposition_reason
- next_action_at
- classified_at

Unique open reservation per `lead_id`.

## `live_work_claims`

- lead_id
- operator_id
- batch_id
- claim_state
- claimed_at
- heartbeat_at
- expires_at

Enforce only one unexpired live claim per lead.

---

# 18. Automatic rules that prevent clashes

## Rule 1 — one lead in one open draft

If Rahul is reserved in Operator A's open 30, Rahul cannot be drafted into Operator B's 30.

## Rule 2 — one live worker

Even if Operator B can view Rahul, only the live claim holder can Call/WhatsApp or perform conflicting state changes.

## Rule 3 — lock expiry

If browser closes/network dies and heartbeat stops, lock expires automatically after a short safe timeout.

Call integrations may extend the lease while the call is active.

## Rule 4 — terminal leads disappear from active drafting

BOOKED/CHECKED_IN/LOST leads do not enter generic active batches unless a specific recovery/support workflow asks for them.

## Rule 5 — screenshot upload never steals a live lead

A fresh customer message can raise priority, but it does not reassign the lead away from someone currently working it.

It adds an alert to the current worker.

## Rule 6 — screenshot upload may wake a safely parked lead

If no live claim exists and a future/waiting lead receives fresh inbound activity, it becomes draft/work eligible immediately.

---

# 19. What should happen when the same screenshot is re-uploaded

Do not create duplicate work.

Use screenshot hash/image similarity to detect exact re-upload.

If exact duplicate:

- record that it was re-submitted if audit is needed
- reuse prior OCR result
- do not duplicate observations/leads/actions

If visually similar but captured later:

- process as a new screenshot
- attach new observations
- compare movements

The system should dedupe evidence without deduping time.

---

# 20. What should happen when the same customer appears 20 times

Example:

Rahul appears across:

- 4 Monday screenshots
- 4 Tuesday screenshots
- 4 Wednesday screenshots
- different list positions
- different message previews

Correct output:

- one canonical lead
- one active cycle unless business rules open another cycle
- twelve immutable WhatsApp observations
- movement history between observations
- one activity timeline
- one current owner
- one current live worker at most
- one current next action

Incorrect output:

- 12 Rahul leads
- 12 work items without linking
- latest screenshot overwriting old history

---

# 21. What should happen when phone is not visible

Never discard the row.

Never invent a number.

Create an unresolved observation carrying:

- WhatsApp account
- contact display name
- preview
- visible time
- screenshot context
- confidence

Use name + source/account + repeated context as a **possible identity hint**, not an automatic identity guarantee.

If later screenshot/chat capture reveals the phone, merge the observation history into the now-resolved canonical lead.

This preserves revenue opportunities that would otherwise vanish simply because WhatsApp did not expose the number in that screenshot.

---

# 22. Same drawer, different stage

The orange **Next Step** bar in the recording should remain the dominant CTA.

It changes with stage:

- OCR Review -> Resolve Identity
- New -> Start/Complete Dossier
- Qualified -> Pitch Best 2 Properties
- Matched -> Schedule Tour
- Tour Scheduled -> Confirm Tour
- Tour Done -> Capture Post-tour Outcome
- Positive Post-tour -> Send Quote
- Negotiation -> Resolve Current Blocker
- Payment Ready -> Confirm Booking
- Booked -> Prepare/Complete Check-in

The operator does not choose which workflow screen to open. The lead's canonical stage decides the mission.

---

# 23. EOD truth test

At EOD the system must answer:

### WhatsApp completeness

- How many unique chats were visible across the rolling three-day uploads?
- How many were already known CRM leads?
- How many new leads appeared?
- How many are unresolved review items?
- How many high-confidence lead-like rows remain without CRM identity?

### Work completeness

- How many active leads have no owner?
- How many active leads have no dated next action?
- How many next actions are overdue?
- How many live claims are stuck?
- How many leads changed on WhatsApp but were never acted/logged in CRM?

### Commercial completeness

- tours scheduled/done without post-tour outcome
- positive post-tour without quote
- quote without next action
- payment evidence without booking
- booked customer without check-in readiness

A day is operationally clean only when the uncontrolled leakage queues are zero or explicitly manager-approved exceptions.

---

# 24. Acceptance tests before calling this production-ready

## OCR completeness

1. Upload 30 screenshots containing many repeated WhatsApp rows.
2. Every visually detectable row creates one observation.
3. Exact duplicate screenshot does not duplicate work.
4. Same phone across screenshots resolves to one lead.
5. No-phone row remains Review Required; it is not dropped.
6. Later phone evidence can resolve earlier observations.

## Rolling learning

7. Re-upload the same three-day set later with changed previews.
8. CRM records movement without creating duplicate leads.
9. Future lead with fresh inbound movement wakes early.
10. WhatsApp movement without CRM activity creates an exception.

## Eight-person concurrency

11. Eight operators open the system simultaneously.
12. Same lead cannot enter two open draft batches.
13. Same lead cannot have two unexpired live claims.
14. Second operator attempting Call sees the active worker and is blocked.
15. Expired/dead lock becomes reclaimable.

## Drafting

16. Operator receives 30 deliberately ranked/mixed leads.
17. Operator cannot open another draft until the current 30 are classified.
18. Every classified item has an explicit disposition.
19. FUTURE_DATE requires date/time and accountable owner.
20. WAITING_CUSTOMER still has fallback next action.

## End-to-end

21. Lead moves through the existing Dossier/Tour/Post-tour/Quote/Book/Check-in drawer.
22. Buttons Log Activity/Call/WhatsApp/Follow-up/Pitch PG write to one activity timeline.
23. Tour/Post-tour/Quote/Booking actions use canonical domain commands.
24. Final CHECKED_IN lead still retains every screenshot observation and acquisition source.

## Leakage gate

25. Reconciliation batch cannot report 100% coverage if any visible row is unaccounted.
26. High-confidence visible potential lead without lead/review/exemption shows as red revenue leakage.
27. Active lead with no owner or no next action shows as red operational leakage.

---

# 25. Final product model

The final mental model should be extremely simple:

```text
WHATSAPP REALITY
    ↓
ROLLING SCREENSHOT OBSERVATIONS
    ↓
100% ROW ACCOUNTING
    ↓
ONE CUSTOMER / ONE LEAD ID
    ↓
ONE ACTIVE CYCLE
    ↓
ONE ACCOUNTABLE OWNER
    ↓
ONE DRAFT RESERVATION AT MOST
    ↓
ONE LIVE WORKER AT MOST
    ↓
ONE PIPELINE STAGE
    ↓
ONE PRIMARY BLOCKER
    ↓
ONE NEXT ACTION + DATE
    ↓
DOSSIER → TOUR → POST-TOUR → QUOTE → BOOKING → CHECK-IN
```

The screenshot system protects against acquisition leakage.

The drafting system protects against work allocation leakage.

The live-claim system protects against operator collision.

The next-action engine protects against follow-up leakage.

The canonical pipeline protects against process fragmentation.

The Check-in state proves the revenue journey actually finished.
