# Gharpayy Booking Flow — from WhatsApp screenshot to qualified lead

A new single flow (`/booking-flow`) that starts where the real work starts — WhatsApp screenshots — and carries a lead through capture, daily division of work, and qualification, with two ways to use it.

## Two modes

**Guided mode (default, for the normal person)** — one question at a time, fixed order, no skipping. The screen always states the goal and the deadline. A lead can never be left without an owner, a next step and a time.

**Expert mode (header toggle)** — same data, dense one-screen layout, everything editable at once. Extra powers: reassign owner, move out of order, bulk-mark a batch, force hot/cold with a reason, and manage connected leads (same person or group across chats) as one unit.

The mode is remembered per person.

---

## Guided mode — step by step

**A. Capture**
1. Open the flow; it lands on "Bring chats in".
2. Upload screenshots (or press "Load sample chats" to try it).
3. Each detected chat appears exactly like WhatsApp: photo/initials, name, number, last message, labels, time, unread.
4. For each row choose one: Add to CRM / Merge into the existing lead with the same number / Ignore. Rows already in the CRM are labelled so re-uploads are safe.
5. Screen confirms "X new customers added, Y merged" and moves on.

**B. Get your batch**
6. Pick your name from the handler list and pick the round (1 of 4).
7. Press "Give me my 30" — the system hands over the 30 oldest untouched chats from the last 7 days.
8. The batch shows 30 slots with a progress ring; a banner counts how many chats older than 7 days are still stuck.
9. Open the first lead; the flow always points at the next unmarked one.

**C. Qualify (one question per screen, in order)**
10. When do we handle it — now / today / this week / a future date.
11. Is the lead already on WhatsApp — yes (existing chat) / no (first contact needed).
12. How are we communicating — WhatsApp / call / both.
13. Where is the lead — area or landmark.
14. Move-in date.
15. Budget and room type.
16. Acknowledgement — "I can close this" / "Not sure, need help" / "This is not a real lead".
    - Not sure → asks the blocker and sends it to Control Tower.
    - Not real → asks the reason and closes the lead.
17. Confirm the next step and its deadline (pre-filled, editable).
18. Save. The lead turns green, the batch counter goes up, the flow opens the next lead automatically.

**D. Finish the batch**
19. When all 30 are marked with a next step, the batch is complete and shows a short summary.
20. Anything left unmarked at the end of the last round escalates to Control Tower.

---

## Expert mode — step by step

1. Toggle Expert in the header; the layout becomes a list on the left, full lead sheet on the right.
2. Capture screen adds bulk controls: select all new rows, add them in one action, auto-merge every confident number match.
3. Batch screen adds a build view for the whole team: create all 4 rounds for all 8 handlers at once, see each handler's 30, drag a lead from one handler to another, reassign owners.
4. Lead sheet shows every qualification field at once — no question-by-question walk — with keyboard tab order and instant save.
5. Hot/cold panel shows the live signal (last reply age, stated intent, move-in date) and lets the expert force hot or cold with a mandatory reason.
6. Connected leads panel groups chats that share a number, a name or a group requirement, so one decision applies to all of them at once.
7. Out-of-order move: jump a lead straight to tour, booking or closed, with a reason recorded.
8. Bulk actions on a selection: set owner, set next step and deadline, mark cold, push to Control Tower.
9. Every expert action still appends to the same immutable lead timeline with who did it and why.

---

## Technical notes

- New folder `src/bookingflow/` with route `/booking-flow`; reuses the existing workflow config, event store, SLA engine and journey steps instead of a parallel model.
- Capture reuses the existing Draft Vision extraction and sample-chat loader, so the page works with no upload.
- Rounds, batches and qualification answers persist in the backend so all 8 handlers share one board.
- Mode toggle is presentation only — both modes write the same records; Expert additionally exposes reassign, out-of-order move, bulk and hot/cold override.
- After qualification the lead is handed to the existing journey ladder (tour → booking → check-in); nothing already built is duplicated.
