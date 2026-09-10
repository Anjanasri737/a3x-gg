# Gharpayy Screenshot → Check-in Revenue Guarantee OS

## Product objective

The screenshot is not the product. The product is a **revenue guarantee system** that converts every visible WhatsApp customer into one accountable CRM customer, continuously learns how that customer's chat is moving, prevents eight operators from colliding, and does not stop until that customer is either:

1. actively being worked,
2. intentionally parked with a dated next action,
3. legitimately lost with a reason, or
4. checked in.

The operating law is:

> **If a customer is visible in WhatsApp but absent from CRM, that is revenue leakage. If the customer exists in CRM but has no owner or dated next action, that is also revenue leakage.**

The CRM must therefore reconcile WhatsApp reality against CRM reality several times every day.

---

# 1. What the supplied recording already proves we have

Do not rebuild these capabilities as separate products. Reuse them behind one customer workspace.

The recorded CRM already contains the important building blocks:

- global and local lead search,
- intent, ownership and freshness filters,
- Call C1 / qualification actions,
- Pass,
- Tour,
- note composition,
- property matching,
- qualification/profile editing,
- tour scheduling,
- tour progression,
- post-tour feedback,
- quotation generation,
- saved quotation state,
- token/payment capture,
- owner approval,
- check-in controls,
- customer drawer/workspace concepts,
- marketplace/list cards,
- Control Tower concepts,
- Flow OS draft batches.

The problem is not missing features. The problem is that these capabilities can appear as cards, drawers, pop-ups, headers and separate workflows with overlapping actions. The new system keeps the features but gives each capability **one canonical command and one canonical saved state**.

Final interaction model:

**Queue/list/card → Open / Resume → one customer workspace → one contextual primary action.**

The workspace always uses the same sections:

- Profile
- WhatsApp Intelligence
- Properties
- Tour
- Post-Tour
- Quote
- Booking / Payment
- Check-in
- Timeline

The footer shows only the next valid commercial action:

- Save Profile
- Save Shortlist
- Schedule Tour
- Confirm Tour
- Complete Tour
- Save Feedback
- Send Quote
- Record Payment
- Request Owner Approval
- Confirm Check-in

No business workflow should exist once as a drawer and again as a separate pop-up with independent state.

---

# 2. Core mental model: screenshots are observations, not leads

A screenshot can contain 10, 20, 30 or more visible WhatsApp chat rows. Every visible row is an **observation**.

One customer can appear in many screenshots:

- 10:30 AM screenshot
- 1:00 PM screenshot
- 5:00 PM screenshot
- 8:00 PM screenshot
- yesterday's screenshot
- the day before yesterday

Those are not six leads.

They are six observations attached to the same canonical customer.

For each observation permanently preserve structured intelligence:

- screenshot upload batch ID
- WhatsApp account / source number
- screenshot capture time
- row position
- visible contact name
- normalized phone if resolvable
- visible last-message preview
- incoming/outgoing hint when reliable
- visible WhatsApp timestamp
- unread state/count
- pinned/muted hints when useful
- OCR confidence
- raw extracted text
- inferred location/budget/move-in only as evidence until confirmed
- linkage to canonical customer
- change versus prior observation

The raw screenshot is temporary evidence. The structured observations are permanent operating data.

---

# 3. Zero-miss ingestion contract

Every screenshot upload must produce a reconciliation report before it is considered complete.

For each screenshot:

**A. Count visible chat rows**

Example: screenshot visually contains 21 rows.

**B. Segment 21 row candidates**

The system must create 21 observation records or 21 explicit exceptions.

**C. Account for every row**

Each row receives one outcome:

- matched existing customer
- created new customer
- returning customer / new cycle
- duplicate observation
- unresolved identity requiring review
- intentionally ignored non-customer/system row with reason

There is no silent discard state.

Therefore:

`VISIBLE ROWS = RESOLVED + REVIEW + JUSTIFIED NON-CUSTOMER`

If the equation does not reconcile, the screenshot batch is **INCOMPLETE**.

This is the first revenue guarantee.

---

# 4. Re-upload the last three days repeatedly

The operating model intentionally expects repeated uploads.

The same screenshots or newer screenshots from the same WhatsApp account may be uploaded several times per day.

Recommended checkpoints:

- start of shift / 10:30 AM
- around 1:00 PM
- around 5:00 PM
- EOD / around 8:00 PM

At every checkpoint the team can upload today's screenshots plus screenshots covering the prior three calendar days.

The engine does not treat this as duplication. It treats it as **reconciliation and movement detection**.

For every customer, compare the newest observation with prior observations:

- Was this customer seen before?
- Is the last-message preview identical?
- Did the visible timestamp change?
- Did unread count change?
- Did the customer move up in WhatsApp recency?
- Did a previously outgoing last message become a new incoming message?
- Has the chat been stagnant for hours?
- Has the same customer appeared every checkpoint with no CRM activity?
- Has CRM advanced while WhatsApp still shows an unresolved question?
- Did the customer say a future date?
- Is the customer's move-in now closer and therefore more urgent?

Each upload therefore improves the CRM's understanding instead of creating duplicate customers.

---

# 5. The three-day reconciliation matrix

For every canonical customer seen in the latest three-day screenshot horizon, compute one reconciliation state.

### GREEN — synchronized

WhatsApp observation is represented in CRM and the lead has:

- one accountable owner,
- valid commercial stage,
- current next action,
- next-action date/time when not being actively worked.

### AMBER — stale CRM

Customer exists in CRM, but WhatsApp has moved since CRM was last updated.

Examples:

- customer replied after CRM follow-up was set,
- unread count appeared,
- newer message preview exists,
- customer asks for visit but CRM remains 'contacted',
- customer says 'next week' but CRM has no future date.

Action: create **SYNC REQUIRED** item and priority interrupt.

### RED — revenue leakage

Any of these conditions:

- visible customer has no CRM identity,
- customer exists but no accountable owner,
- customer has no claim and no dated next action,
- customer has unread/new inbound and nobody is working it,
- repeated customer appears across checkpoints without meaningful CRM activity,
- tour happened but post-tour is missing,
- positive post-tour exists but quotation missing,
- payment received but booking/check-in chain incomplete.

### GREY — intentionally waiting

Valid only when all are present:

- waiting reason,
- future action date,
- accountable owner,
- customer stage/bucket,
- trigger to reactivate earlier if a fresh inbound arrives.

Grey is not ignored. Grey is scheduled.

---

# 6. One customer, one identity, one active work claim

Eight people may use the same operational universe.

They may all see the same customer in screenshots, searches and queues.

They must **not all work that customer simultaneously**.

There are three separate concepts:

### Customer ownership

The person accountable for the customer journey.

### Draft reservation

The customer is reserved inside an operator's current 30-lead batch.

### Active work claim

The operator is currently calling/chatting/updating that customer.

The hard invariant:

> One canonical lead may have only one non-expired active/drafted work claim across the eight operators.

If Operator A drafts Rahul, Operators B–H may still see Rahul for transparency, but Rahul appears as:

`CLAIMED BY A · Batch 07 · 4m ago`

They cannot unknowingly call him.

Managers can override/release with reason.

---

# 7. The 10-minute collision lock

Draft reservation and live work cannot become permanent deadlocks.

Default behavior:

- drafting creates reservation,
- opening/calling/messaging turns it active,
- meaningful activity resets the timer,
- after 10 minutes of inactivity the live claim can expire,
- manager may manually release,
- release history is preserved,
- fresh customer inbound does not allow another operator to steal a still-valid active claim.

Meaningful activity includes:

- call attempt logged,
- connected call,
- WhatsApp outbound,
- WhatsApp inbound recognized,
- dossier saved,
- property shortlist saved,
- tour scheduled,
- feedback saved,
- quote sent,
- future date set,
- valid outcome saved.

Simply opening the drawer repeatedly should not extend ownership forever.

---

# 8. Draft 30 × 30 × 30 × 30

The workday should operate in deliberate 30-customer waves, not one giant 200-lead table.

A normal operator journey:

`CAPTURE → UNDERSTAND → DRAFT 30 → WORK → LOG → MOVE → COMPLETE → NEXT`

Then:

`30 → 30 → 30 → 30`

The draft is a work portfolio, not random selection.

Each batch should balance the highest ROI opportunities available to that operator/zone.

Example composition for a 30-lead batch:

- 6 fresh strong leads
- 5 unread/replied now
- 5 qualified but tour not scheduled
- 4 tours needing confirmation / execution
- 3 post-tour without closure
- 3 quotation/negotiation opportunities
- 2 recovery/stuck leads
- 2 future leads that are now due

Exact mix can dynamically change based on available inventory and today's customer pool.

The key is that the batch contains **commercial missions**, not merely names.

Every card must answer:

- Why is this person in my 30?
- What changed?
- What is the current stage?
- What is blocking revenue?
- What is my one next action?
- By when?

---

# 9. Active tray: work approximately 13 concurrently, not 30 chaotically

A 30-lead draft is the operator's committed portfolio.

The **Active Tray** is the smaller working set, approximately 13 customers, that need immediate attention.

Why separate them:

- 30 gives enough opportunity supply.
- 13 gives cognitive control.
- Fresh replies can interrupt without destroying the full batch.

Active Tray examples:

- customer currently on call,
- customer just replied,
- tour happening shortly,
- quotation expiring,
- payment confirmation pending,
- owner approval pending,
- promised callback due now.

The system automatically replenishes the active tray from the operator's 30 as items are completed or parked.

---

# 10. Priority Interrupt: WhatsApp can reorder work without causing collision

Repeated screenshot uploads let the system discover that a previously quiet customer has replied.

Example:

Rahul was #23 in Operator A's draft.

At 1 PM screenshot refresh, Rahul now shows:

`Can I visit today at 6?`

System action:

- update WhatsApp observation,
- mark `NEW INBOUND`,
- increase urgency,
- move Rahul into Operator A's Active Tray,
- show `PRIORITY INTERRUPT`,
- keep the same claim/owner,
- recommend `Schedule Tour`.

It should not silently assign Rahul to Operator B just because B is looking at the newest queue.

---

# 11. New leads arriving during the day

New lead arrival does not require rebuilding everyone's batch.

New customer flow:

1. newest screenshot upload identifies unseen phone/customer,
2. identity engine creates canonical lead/cycle,
3. zone and feasibility signals are extracted,
4. priority score is calculated,
5. system determines eligible operator,
6. an atomic claim is created,
7. if high urgency, insert into Active Tray as Priority Interrupt,
8. otherwise add to next replenishment slot / next 30.

New leads therefore enter continuously while current batches remain stable.

---

# 12. Future dates are first-class work, not a dumping ground

A customer saying:

`I will move on 28 September`

should not stay in today's noisy active queue for 18 days.

The operator uses the same workspace action:

**Move to Future**

Mandatory fields:

- exact date or date range,
- reason,
- owner,
- next contact date,
- desired future outcome,
- known requirement snapshot.

Future lead then disappears from current Active Tray but remains in the canonical customer history.

Automatic wake-up rules:

- move-in date approaches,
- planned follow-up date arrives,
- fresh WhatsApp inbound appears earlier,
- inventory situation changes materially,
- manager manually pulls it forward.

No future state without a date.

---

# 13. What 'Complete & Next' must do

Every operator interaction should end with a disposition.

`COMPLETE & NEXT` is not merely closing a drawer.

It must atomically:

1. save CRM changes,
2. log WhatsApp/call outcome,
3. update pipeline stage if warranted,
4. create/update next action,
5. set future date if applicable,
6. release active edit lock,
7. retain ownership and history,
8. update batch progress,
9. recalculate work score,
10. open the next highest-value customer.

No lead should be closed out of the workspace without one of these end states:

- next action due now/today,
- scheduled tour,
- waiting with date,
- future with date,
- handed off with accepting owner,
- booked/check-in workflow,
- lost with reason.

---

# 14. CRM should learn from chat movement, but not hallucinate commercial stages

OCR evidence can prove that visible WhatsApp content changed.

It may infer:

- new inbound likely,
- unread appeared,
- customer resurfaced,
- preview changed,
- timestamp changed,
- chat stagnant,
- repeated visibility.

It must not automatically claim without evidence that:

- customer is qualified,
- tour is confirmed,
- property is liked,
- payment is done,
- customer checked in.

Commercial stages advance only through canonical CRM commands or trusted integrated events.

This distinction prevents screenshots from corrupting the pipeline while still letting them expose stale CRM data.

---

# 15. One customer workspace from the supplied recording

The same workspace opens from:

- screenshot reconciliation,
- Draft 30,
- Active Tray,
- global search,
- marketplace/list,
- My Work,
- Zone view,
- Tours,
- Control Tower,
- Admin review.

Header:

`Customer · Phone · Zone · Owner · Current Operator · Pipeline Stage · Last WhatsApp Movement`

Secondary actions:

- Call
- WhatsApp
- Follow-up
- More

Sections:

### Profile

Location, office/college, budget, move-in date, sharing, gender/need, duration, decision maker, special requirements.

### WhatsApp Intelligence

Latest observed preview, prior previews, unread movement, first seen, last seen, repeated appearances, screenshot evidence, CRM sync status.

### Properties

Use the existing matching capability. Keep at most the strongest options in the customer flow; do not create another independent matching state.

### Tour

Schedule / confirm / start / complete / no-show / reschedule through one tour record.

### Post-Tour

Capture liked/not liked/shortlisted, blocker, decision timing, confidence and next action.

### Quote

Create/save/send one quotation record and show clear states: draft, saved, copied, sent, viewed/accepted when available, expired.

### Booking / Payment

Record payment, payment reference, room/bed lock, booking amount, booking state.

### Check-in

Owner approval, KYC, agreement, payment completeness, room/bed, arrival, key handover, final confirmation.

### Timeline

Every screenshot observation, claim, call, WhatsApp movement, stage change, tour, quote, payment, approval and check-in event.

---

# 16. Existing buttons from the video: what survives and how

## Global/local Search

Keep. Search returns the same canonical customer regardless of which subsystem originally created them.

## Call C1 / Qualify

Keep capability, remove it as a stale card label after qualification. The visible action is generated from current stage.

## Pass

Keep as a controlled disposition, not silent abandonment. Pass requires reason and determines whether lead returns to pool, changes zone, or needs manager review.

## Tour

Keep as shortcut to the canonical Tour section. It must call the same scheduleTour command used everywhere.

## Note

Keep as Timeline note inside the workspace; do not maintain a second independent card note state.

## Property actions / PG controls

Keep global supply-management actions outside the customer transaction. Customer-specific property choices attach to the lead.

## Quotation

Keep existing quotation feature. Remove duplicate Copy / Copy Again behavior. Saved/copy/sent are statuses/events, not duplicate primary buttons.

## Collect Token & Proceed to Check-in

Split conceptually. Typing a token/payment reference cannot itself unlock check-in.

Use:

`Record Payment`

Then stage engine verifies payment, room/bed, approval and other gates before offering:

`Confirm Check-in`

## Request Owner Approval

Keep as canonical dependency action. While pending, primary action becomes `Awaiting Owner Approval` / follow-up, not `Complete check-in`.

## Complete Check-in

Only available when all configured gates pass.

---

# 17. Eight-person operating view

Every operator should see four numbers at the top:

- My Draft: `x / 30`
- Active Tray: `x / 13`
- Due Now
- New Inbound / Priority Interrupts

Then four queues:

### 1. NOW

Fresh replies, calls due, urgent move-ins, quotation/payment windows, imminent tours.

### 2. MY 30

Full committed batch.

### 3. WAITING / FUTURE

Customers intentionally parked with dates.

### 4. COMPLETED TODAY

Outcomes, tours, quotations, bookings, future dispositions, lost.

The operator should not need to hunt through 12 unrelated pages to understand today's obligations.

---

# 18. Control Tower view

Control Tower does not need to read every chat manually. It should see exceptions and leakage.

Top counters:

- screenshot batches uploaded today
- visible rows detected
- rows reconciled
- unresolved OCR rows
- unique customers in 3-day horizon
- newly discovered customers
- returning customers
- customers seen in WhatsApp but absent from CRM
- unowned leads
- claimed leads
- stale claims
- new inbound not acted on
- leads without next action
- qualified without tour
- tours without post-tour
- positive post-tour without quotation
- quotations without dated next action
- payments without booking completion
- bookings not checked in

Control Tower's job is to make all red counters reach zero or have an explicit owner + reason + recovery deadline.

---

# 19. The Revenue Leakage Queue

This should become one of the most important queues in Gharpayy.

Each card answers:

`WHO` — customer

`LEAK` — what is missing

`VALUE` — estimated opportunity / urgency

`LAST PROOF` — latest WhatsApp observation or CRM event

`WHY RED` — rule violated

`OWNER` — person accountable to fix it

`FIX` — one primary action

Examples:

- **WhatsApp-only:** visible 3 times, never created in CRM → `Resolve identity & assign`
- **Unowned:** CRM lead exists, no owner → `Assign`
- **Stale:** customer replied 42m ago, CRM says waiting → `Open reply`
- **No tour:** qualified and feasible, no scheduled tour → `Schedule tour`
- **No quote:** tour completed 38m ago, liked property, no quote → `Create quote`
- **Payment gap:** token reference saved, no verified booking → `Verify payment`
- **Check-in gap:** booked, move-in today, KYC incomplete → `Complete check-in readiness`

---

# 20. Screenshot batch reconciliation UI

When 20–30 screenshots are uploaded together, do not show 30 image cards as the main outcome.

Show:

**UPLOAD SUMMARY**

- 28 screenshots
- 486 visible rows
- 181 unique customers
- 143 existing customers updated
- 22 new customers discovered
- 9 returning cycles
- 7 unresolved identities
- 0 silent drops

Then:

### NEW / NOT IN CRM

These are immediate revenue-risk items.

### MOVED SINCE LAST UPLOAD

Customers whose WhatsApp state changed.

### STILL STUCK

Repeatedly visible, no meaningful movement.

### SYNCHRONIZED

No action needed.

### REVIEW

Low-confidence identities only.

A manager can drill from any metric to exact customers and screenshot observations.

---

# 21. Data model required

## screenshot_batches

One multi-image upload session.

Fields: uploader, WhatsApp account(s), uploaded_at, claimed capture date range, screenshot_count, visible_rows_expected, rows_segmented, rows_reconciled, status.

## screenshots

Image metadata/hash, source account, capture time, temporary storage pointer, processing state.

## screenshot_observations

One visible WhatsApp row / open-chat observation.

## customers / leads

One canonical identity.

## lead_cycles

Returning enquiry cycles without duplicating person identity.

## work_claims

Atomic eight-person collision barrier.

## draft_batches

30-lead operator portfolios.

## next_actions

Every non-terminal active/future customer needs one executable dated action.

## pipeline_state / stage_events

Canonical commercial lifecycle.

## tours / post_tour / quotations / bookings / checkins

Child records linked by canonical lead/cycle ID.

---

# 22. Atomic database rules

These cannot be left to front-end behavior.

1. Unique active claim index: one live claim per lead.
2. Draft insertion must atomically claim or skip a lead.
3. Screenshot rows cannot be marked processed until reconciliation outcome exists.
4. Future/waiting disposition cannot save without next_action_at.
5. Lost cannot save without lost reason.
6. Tour completion triggers post-tour SLA.
7. Positive post-tour triggers quote SLA.
8. Booking requires payment reference/evidence according to configured rules.
9. Check-in requires all configured gates.
10. Every override produces audit history.

---

# 23. Daily rhythm for eight operators

## 10:30 — establish truth

Upload newest screenshots + three-day coverage.

System produces reconciliation.

Control Tower resolves OCR exceptions and zero-owner leaks.

Each operator receives Draft 30 and Active Tray.

Priority: new leads, new inbound, immediate move-ins, carry-forward promises.

## 1:00 — first truth refresh

Upload again.

System detects:

- new leads since morning,
- customer replies,
- stuck chats,
- drafts not worked,
- WhatsApp/CRM mismatches.

Reorder each operator's own work; do not break active claims.

## 5:00 — recovery refresh

Upload again.

Focus:

- qualified no tour,
- tours awaiting TCM/confirmation,
- post-tour without decision,
- quotes due,
- stuck customer replies,
- future leads whose date is near.

## 8:00 — closure reconciliation

Final upload/reconciliation.

EOD may not claim zero leakage unless:

- every visible customer is accounted for,
- every active lead has owner,
- every non-terminal lead has next action/date,
- every operator's unfinished draft is intentionally carried forward/released,
- red leakage queue is zero or each exception has named owner and recovery deadline.

---

# 24. Metrics that matter

Do not celebrate OCR accuracy alone.

Measure revenue-control accuracy.

### Capture completeness

`reconciled visible rows / visible rows detected`

Target: 100% accounted, including explicit exceptions.

### CRM coverage

`canonical customers represented in CRM / unique customers seen in screenshot horizon`

Target: 100% or reviewed exception.

### Ownership coverage

`active customers with accountable owner / active customers`

Target: 100%.

### Next-action coverage

`non-terminal customers with executable next action / non-terminal customers`

Target: 100%.

### WhatsApp synchronization lag

Time between detected chat movement and CRM action.

### Collision rate

Two operators contacting same lead while one valid claim existed.

Target: zero.

### Leakage recovery

Red leakage items created vs recovered before EOD.

### Commercial conversion chain

Seen → CRM → Worked → Qualified → Tour → Post-tour → Quote → Booking → Check-in.

This lets the company see exactly where money leaked.

---

# 25. Example: one customer over three days

### Day 1, 10:30

Screenshot shows:

`Rahul · Looking for PG in Koramangala · 10:24 · unread 1`

No CRM match.

System:

- creates observation,
- resolves phone,
- creates canonical lead,
- assigns Operator A,
- inserts Rahul into Draft 30,
- sets mission `Qualify`.

### Day 1, 1:00

New screenshot shows:

`Rahul · Budget is 15k, can visit tomorrow`

System:

- matches same lead,
- records changed preview,
- raises Priority Interrupt for Operator A,
- recommendation becomes `Complete feasibility + Schedule Tour`.

Operator schedules tour tomorrow 6 PM.

### Day 2, 10:30

Rahul still visible. CRM already has scheduled tour.

System classifies synchronized, not a new lead.

### Day 2, 5:00

Screenshot shows new inbound:

`I am outside the property`

System raises tour interrupt to the same owner/TCM chain.

Tour completes.

### Day 2, 8:00

If post-tour is missing, Rahul becomes RED:

`Tour completed · Post-tour missing`

### Day 3

Post-tour says liked, but no quote within configured SLA.

RED:

`Positive post-tour · quotation missing`

Quote is sent, payment recorded, owner approval obtained, check-in completed.

The timeline now proves the entire path from first screenshot observation to checked-in customer.

---

# 26. Example: repeated screenshot with no movement

Priya appears in 10:30, 1 PM, 5 PM and 8 PM screenshots with the same last message:

`Please share photos`

CRM shows no outgoing activity.

After the second checkpoint the system should classify:

`STUCK · REQUEST UNANSWERED`

After repeated appearance it escalates:

`REVENUE LEAKAGE · 4 screenshot observations · 0 meaningful CRM actions`

Control Tower sees the exact evidence and the accountable owner.

---

# 27. Example: future lead

Aman says:

`Joining Bangalore on 5 October`

Operator selects:

`Move to Future`

CRM requires:

- move-in 5 October,
- follow-up 28 September,
- need: private room,
- area: Whitefield,
- budget,
- owner.

Aman disappears from today's Active Tray.

If Aman messages on 18 September, screenshot sync overrides the waiting schedule and raises Priority Interrupt to his owner.

---

# 28. Example: eight people cannot clash

All eight operators upload screenshots containing Neha.

Canonical identity resolution returns the same lead ID.

Operator C drafts Neha first.

Database atomically creates claim:

`Neha → Operator C → Batch C-04`

All other draft builders skip Neha automatically.

If Operator B searches Neha manually, the workspace is visible but marked:

`Currently being worked by Operator C`

B can:

- view read-only context,
- request takeover,
- add manager-visible note if permitted,
- not make a duplicate customer call through the normal action.

After valid release/expiry, Neha can be reclaimed.

---

# 29. Admin / Control Tower / Operator separation

## Operator

Needs execution simplicity:

- My 30
- Active Tray
- Priority Interrupts
- one workspace
- Complete & Next

## Control Tower

Needs truth and exceptions:

- upload/reconcile screenshots
- unresolved identities
- new/unowned leads
- collisions/stale claims
- SLA breaches
- leakage queue
- operator load
- zone shortages

## Admin

Needs system control:

- all zones/accounts/operators
- capture coverage
- leakage trends
- funnel by source/account/zone/operator/date
- claim rules
- draft mix rules
- SLA rules
- OCR confidence thresholds
- audit history
- every number drillable to exact customers.

Do not build three separate customer workflows. These roles are different lenses over the same records and commands.

---

# 30. Non-negotiable acceptance tests

The system is not done until these pass.

1. Upload 30 screenshots containing 200+ visible rows; every row is accounted for.
2. Upload the same screenshots twice; no duplicate customers are created.
3. Upload newer screenshots of the same customers; observations append and movement is detected.
4. Same customer across three days resolves to one canonical identity/cycle history.
5. A brand-new visible customer absent from CRM becomes a red leakage item until resolved/created.
6. Eight users build Draft 30 simultaneously; one lead cannot enter two active batches.
7. Active claim blocks duplicate work and expires safely after configured inactivity.
8. Fresh inbound can interrupt the current owner's queue without stealing the lead.
9. Future disposition cannot save without date and next action.
10. Re-uploading a future lead with fresh inbound reactivates it early.
11. Tour scheduled through card, queue or workspace updates the exact same tour record/state.
12. Post-tour cannot fork into a separate lead state.
13. Positive post-tour without quote appears in leakage queue.
14. Quote Copy and Copy Again do not create duplicate business actions.
15. Recording payment does not automatically imply check-in readiness.
16. Owner approval pending blocks final check-in action.
17. Check-in requires configured gates and writes canonical CHECKED_IN stage.
18. Timeline can reconstruct first screenshot → every observation → owner → actions → tour → quote → payment → approval → check-in.
19. EOD reconciliation reports exact visible customers not represented or not owned.
20. Any KPI count can drill to exact underlying customers.

---

# 31. Final operating law

There should never be ambiguity about where a customer is.

For every customer visible in WhatsApp, the system must always be able to answer:

**WHO is this?**

**WHEN did we first and last see them?**

**WHAT changed in WhatsApp?**

**ARE they in CRM?**

**WHO owns them?**

**WHO is working them right now?**

**WHICH Draft 30 are they in?**

**WHAT is the current commercial stage?**

**WHAT is blocking conversion?**

**WHAT is the next action?**

**WHEN is it due?**

**WHAT happened after the tour?**

**WAS a quotation sent?**

**WAS payment received and verified?**

**IS owner approval complete?**

**DID the customer check in?**

If any one of these required answers is missing, the system should not hide the gap. It should convert the gap into visible work.

That is the final Gharpayy Flow OS:

> **WhatsApp reality continuously reconciled into CRM reality, with one customer, one accountable path, one active worker, one next action, and zero silent revenue leakage from screenshot to check-in.**
