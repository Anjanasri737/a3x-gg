# Movement CARE + Movement OS: 4-Checkpoint Result System

## Outcome
Turn Movement CARE, Movement OS, Booking Flow Split, and Admin Movement Control into one result system using the same customer identity, activity history, daily commitment, and booking state.

An operator starts the day by choosing FIND, SCHEDULE, COMPLETE, or CLOSE; works customers individually or through a rolling 30-row draft; and reports progress at 10:30 AM, 1 PM, 5 PM, and 8 PM. Admin sees the identical state, diagnoses the first real bottleneck, opens the affected customers, and assigns recovery without leaving the control screen.

## Build

### 1. One customer, one shared state
- Use the existing canonical customer ID everywhere: Draft Vision, Movement CARE, Movement OS, Admin, and Booking Flow Split.
- Resolve existing customers by canonical ID before creating anything; selecting or opening a customer must never create a duplicate.
- Make Admin Movement customer clicks open the same Booking Flow Split record and current operator state.
- Keep one append-only activity history for calls, drafts, qualification, properties, tours, handoffs, payments, debriefs, and checkpoints.

### 2. Daily result commitment
- Keep the required FIND / SCHEDULE / COMPLETE / CLOSE choice before work begins.
- Capture role, promised result count, named must-win customers, properties intended for closing, blockers, and support needed.
- Preserve Flow Ops and TCM playbooks with exact steps, proof, acceptance gate, receiver, and what does not count.
- Remove the forbidden word “target” from all user-facing Movement CARE, Movement OS, and checkpoint copy; use “commitment,” “expected result,” or “goal.”

### 3. Four checkpoints on one scorecard
- Add one daily scorecard per person with four snapshots: C1 10:30 AM, C2 1 PM, C3 5 PM, C4 8 PM.
- Repeat the same role KPI spine at every checkpoint; do not create four different forms.
- Flow Ops: fresh and active leads, calls, connected calls, replied chats, qualified customers, tours, quotations, untouched customers, and missing next actions.
- TCM: tours received/accepted/rejected/confirmed/completed, unconfirmed tours, no-show/rescheduled, post-tour feedback, high-intent customers, closing handoffs, bookings, and property/room blockers.
- Calculate previous, current, movement since last checkpoint, expected pace, gap, attainment, and status automatically.
- Default pace: C1 baseline, C2 30%, C3 70%, C4 100%, with centrally configurable percentages.
- Values already known from calls, WhatsApp, Movement, tours, booking, and property inventory remain read-only.

### 4. Auto-reason and recovery
- Diagnose the first upstream bottleneck instead of asking operators to guess.
- Cover Flow Ops reasons: low call volume, low connect rate, low qualification rate, qualified customers not moved to tour, and quotations not sent.
- Cover TCM reasons: tours pending/rejected, tour confirmation gap, no-show/reschedule loss, post-tour feedback pending, post-tour closing gap, and property/room blockers.
- Every reason shows severity, exact affected customer IDs, recommended action, recovery owner, and due time.
- “Disagree with reason” preserves the system reason, requires a structured override and note, and requires manager acknowledgement.
- Missing or late checkpoints stay visibly missing; never invent a value or movement.
- Unresolved red C4 cases automatically become tomorrow’s carry-forward with owner, next action, due time, and source checkpoint.

### 5. Operator workspace
- Keep Movement OS on the left and Booking Flow Split on the right with the selected customer synchronized.
- Keep rolling drafts: start the clock with 30 empty rows, add one-by-one while working, add a new lead, remove, replace, or fill all 30 manually.
- Keep connected-call outcomes and connection rate, property selection per customer, and property-level tours/bookings progress.
- After every completed draft, require: what is done, what went well, what went badly, and other problems/help needed.
- Generate a live WhatsApp-ready update and let the operator copy it; record copied/not-copied state.
- Add the four-checkpoint scorecard and recovery work directly into the operator workspace rather than as a separate page.

### 6. Admin Movement Control
- Add checkpoint completion, role cards, people grid, reason counts, and recovery queue to Admin.
- The landing view answers: who is behind, what changed, why, which customers caused it, who owns recovery, and when it is due.
- Person 360 shows each KPI on one row across C1→C4 with movement, expected pace, gap, reason, interventions, notes, and affected customers.
- Preserve Founder vs Team Admin: Team Admin remains limited by zone and WhatsApp account; founder-only powers remain gated.
- Add an 8 PM closure summary with misses, unresolved urgent cases, carry-forward, owner/due, and copy-ready leadership update.

## Technical details
- Extend the existing Movement event/store model rather than creating a second checkpoint truth store.
- Introduce typed daily scorecard, snapshot, metric result, reason result, override, recovery, and carry-forward records.
- Derive KPI values from existing events and customer state; write only human context and acknowledged overrides.
- Keep all selection and drill-down APIs keyed by canonical customer ID.
- Add deterministic tests for checkpoint movement and all supplied auto-reason acceptance cases.

## Verification
- Confirm 8 calls at C1 and 28 at C2 shows current 28 and movement +20.
- Confirm a 70-call goal at C2 shows expected pace 21.
- Confirm each supplied Flow Ops and TCM bottleneck produces the specified reason and opens the exact customer cohort.
- Confirm missing C2 stays missing and produces no fake movement.
- Confirm unresolved red C4 work appears in tomorrow’s carry-forward.
- Run an end-to-end demo: start a rolling 30-row draft, add and replace customers, log calls, choose properties, complete a draft, copy its WhatsApp update, submit all checkpoints, and inspect the same customer and recovery in Admin Booking Flow Split.
- Open Admin Vision, Drafts, Movement, Booking Flow, Tours, Closing, Booking, Check-in, Leakage, People, and Audit; confirm each shows real, non-duplicated records and consistent totals.
