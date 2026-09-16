# Booking Flow — complete it end to end

## Honest answer first

No, the current Booking Flow is not the full thing. Today it stops after three screens:

1. Read WhatsApp screenshots and add/merge/ignore each chat
2. Take your 30 for the round (8 people x 4 rounds)
3. Ask the qualification questions and lock a next step + deadline

Everything you asked for from the very beginning of Draft Vision that is **missing here**:

- Lead admission gate (where is this customer, which channel, when to handle) before any chatting
- The accountability moment — "Yes, I own this lead" creates ownership, opening a lead does not
- WhatsApp reconstruction — show what already happened (contacted, location, move-in, budget, room, property shared, call done) so nobody re-asks
- Call work: connected / no answer / callback / wrong number / duplicate, and connected-call intent
- Tour: readiness, scheduling, confirmation, live visit, post-tour feedback
- Quotation, negotiation, booking creation with a frozen commercial snapshot
- Property approval (room available / rejection reason), payment or token, reservation, room lock, customer confirmation
- Check-in preparation, check-in day, checked in
- One owner / one stage / one next action / one deadline enforced at all times
- Red SLA states, three clocks (screenshot, movement, action), stuck > 7 days, escalation to Control Tower when nobody takes it
- Immutable timeline that reads like a story, plus filters and admin analytics on the same leads

## What I will build

One page, `/booking-flow`, one direction, both modes kept:

- **Understand mode** — one question at a time, fixed order, nothing skippable, always ends with owner + next step + deadline.
- **Expert mode** — same lead on one sheet, out-of-order moves, reassignment, hot/cold override with reason, bulk actions, connected customers together.

### The single journey (every lead walks this, no random jumps)

```text
WhatsApp screenshot
  -> Capture (add / merge / ignore, never 5 leads for 1 customer)
  -> Admission gate (where is the chat, channel, when to handle)
  -> Ownership gate  ("Yes I own this" / Need help / Reassign)
  -> WhatsApp reconstruction (what is already done)
  -> Qualification (area, move-in, budget, room type, intent)
  -> Contact work (call connected / no answer / callback / WhatsApp sent)
  -> Property match and share
  -> Tour ready -> Tour scheduled -> Confirmed -> Live visit -> Feedback
  -> Quotation -> Negotiation -> Customer accepted
  -> Booking created (frozen snapshot)
  -> Property approval -> Payment / token -> Reserved -> Room locked
  -> Customer confirmed -> Check-in prep -> Check-in day -> Checked in
```

### Screens

- **Capture** — unchanged WhatsApp-style rows, add / merge / ignore.
- **My 30** — unchanged, plus red counters for stuck > 7 days and an "unowned" counter that pushes to Control Tower.
- **Lead workspace** — replaces today's 3rd screen:
  - Header always answers the five questions: where, who owns it, what happened, what next, by when.
  - Clickable step rail for the whole journey: done / now / locked, with what is missing on each step.
  - Stage-driven action buttons only (a lead at Tour Scheduled sees tour actions, not qualification).
  - Story timeline, evidence from screenshots, connected customers.
- **Board + admin view** — all leads with filters (owner, stage, waiting on, red/overdue, round, stuck days) and counts per stage, overdue, unowned, escalated.

### Rules enforced by the engine

- A lead cannot leave a step while a mandatory field is empty; the missing field is named on screen.
- Every action writes an append-only event; nothing is edited silently. Edits are allowed but logged.
- No owner, no next action, or no deadline = red, and after the deadline passes it escalates to Control Tower.
- Deadline required whenever "follow-up" or "future" is chosen.
- Booking commercial snapshot cannot change after creation; corrections create a new event.

## Technical notes

- Reuse `src/mymoves/workflow.ts` stage config and `src/bookingos/steps.ts` ladder logic instead of writing a third engine; extend `src/bookingflow/types.ts` with admission, ownership, call, tour, quote, booking, approval, payment and check-in fields.
- Keep the persisted event store in `src/bookingflow/store.ts` (append-only events + derived state), add stage transition guards and SLA/escalation derivation.
- New components under `src/bookingflow/`: `Admission.tsx`, `Reconstruction.tsx`, `StepRail.tsx`, `Workspace.tsx`, `Board.tsx`, `Timeline.tsx`; `Guided.tsx` and `Expert.tsx` become mode wrappers over the same workspace.
- Seed realistic leads spread across every stage (including booked, awaiting approval, payment pending, checked in) so each screen has something real to work on.
- Verify with typecheck and a real browser pass at 889x529, clicking every step and action, with screenshots.
