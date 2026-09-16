# Gharpayy Booking Flow — from WhatsApp screenshot to qualified lead

A new single flow (`/booking-flow`) that starts where the real work starts — WhatsApp screenshots — and carries a lead through capture, daily division of work, and qualification, with two ways to use it.

## Two modes

**Guided mode (default, for the normal person)**
- One question on screen at a time, in fixed order. No skipping.
- Each answer unlocks the next question; the screen always states the goal ("Qualify this lead", "Confirm the channel") and the deadline.
- Cannot leave a lead without an owner, a next step and a time.

**Expert mode (toggle in the header)**
- Same data, dense one-screen layout: every field editable at once, keyboard-first.
- Extra powers only experts get: reassign owner, move a lead across steps out of order, bulk-mark a whole batch, override a hot/cold call, and manage connected leads (same person or same group across multiple chats) as one unit.
- Hot / cold is shown as a live signal (last reply age + intent + move-in date) and the expert can force it either way with a reason.

The mode is remembered per person.

## Step 1 — Capture: Draft Vision into the CRM

- Upload one or many WhatsApp screenshots (including chats with gaps).
- Each detected chat row shows exactly like WhatsApp: photo/initials, name, number, last message, labels, time, unread.
- For every row: Add to CRM, Merge into existing lead (same number found), or Ignore. Merging appends the new messages to that lead's story instead of creating a duplicate.
- Rows already in the CRM are marked so re-uploading the same screenshot is safe.

## Step 2 — Divide the day: 30 × 4 × 8

- A WhatsApp account has up to 8 handlers. The day has 4 rounds.
- One button builds the round: it takes the untouched chats from the last 7 days, oldest first, and gives each handler a batch of 30.
- Board per round: handler, 30 slots, done / open / overdue, plus a "nothing older than 7 days is stuck" counter that must reach zero.
- A batch is only complete when every one of its 30 leads is marked and has a next step.
- Anything still stuck after the last round is escalated to Control Tower.

## Step 3 — Qualify the lead

Fixed order, mandatory:
1. When do we handle it — now / today / this week / future date.
2. Is the lead already on WhatsApp — yes (existing chat) / no (first contact needed).
3. How are we communicating — WhatsApp / call / both.
4. Where is the lead — area or landmark, plus move-in date and budget.
5. Confidence acknowledgement — the handler states plainly: "I can close this" / "Not sure, needs help" / "This is not a real lead". Choosing anything other than the first asks for the blocker and routes it (help → Control Tower, not real → closed with reason).

Only after all five does the flow open the next stage and hand the lead to the existing journey ladder (tour → booking → check-in), so nothing already built is duplicated.

## Technical notes

- New folder `src/bookingflow/` with the route `/booking-flow`; reuses the existing workflow config, event store, SLA engine and journey steps rather than adding a parallel model.
- Capture reuses the existing Draft Vision extraction and the sample-chat loader, so the page works without an upload.
- Rounds, batches and qualification answers persist in the backend so all 8 handlers see the same board; every action appends to the existing immutable lead timeline.
- Mode toggle is presentation only — Guided and Expert write the same records; Expert additionally exposes reassign / out-of-order move / bulk / hot-cold override.
