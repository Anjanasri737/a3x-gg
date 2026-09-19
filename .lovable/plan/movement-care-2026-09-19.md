# Movement CARE

## Goal
Create a new copy that turns every Draft Vision decision into a visible business outcome. The page will use the same customers, owners, stages, next actions, locks, and history as Movement OS—never a disconnected demo state.

## What the page will show
- A compact outcome header: drafted, actively moved, qualified, tours scheduled, tours completed, bookings, overdue promises, and leads still needing a result.
- One unified customer queue sourced from Movement OS, with Draft Vision signals such as WhatsApp account, latest message, unread status, D1–D4 recommendation, and movement health.
- Clicking a customer opens their working view on the same screen.
- A result contract for every draft: intended result, accountable owner, deadline, proof required, current blocker, receiver, and acceptance status.
- Clear distinction between activity and achievement: a call or message is evidence; a qualified lead, accepted tour handoff, completed tour, booking, or valid future/lost path is the result.
- A live accountability trail showing who changed what, when, the achieved result, and the next owned commitment.

## CARE workflow
Use the uploaded CARE ladder throughout:
1. **FIND** — create and progress real good leads.
2. **SCHEDULE** — convert qualified demand into exact-property tours.
3. **COMPLETE** — complete the customer path and secure an accepted handoff.
4. **CLOSE** — move eligible post-tour demand to pre-booking or paid booking.

Before any draft starts, the operator must choose the result they are committing to for the day: **FIND, SCHEDULE, COMPLETE, or CLOSE**. The page will state “This is my expected result today” and turn that choice into a measurable daily target, not a loose activity preference.

The screen will recommend the highest-value CARE stage from live Movement OS state while protecting overdue P0/P1 customers and critical commitments. The operator may accept it or override it with a reason when allowed by their capability.

## Daily result commitment and progress
- The draft queue stays gated until the operator selects their CARE result, target quantity, and support needed for the day.
- The chosen goal controls queue ordering, recommended actions, success language, and the result counters shown throughout the page.
- BUILD, MOVE, and FINISH checkpoints compare actual Movement OS evidence against the commitment: achieved, accepted, still open, at risk, and carried with owner + deadline.
- Progress updates are system-prefilled from real events; the operator adds only “moved”, “stuck”, and “need”.
- The same accountable person sees a compact progress report during the day, with early manager support triggered after two weak rounds rather than waiting until EOD.
- A draft never counts as success by itself. It counts only when it creates the chosen accepted result or a cleanly owned next commitment.

## Role playbooks
Add an on-page role switch with role-specific guidance and outcomes:
- **Flow Ops:** 40 good leads progressed, 10 qualified tours, 100% valid CRM outcome/handoff, accepted by TCM.
- **Tour Conversion Manager:** prioritize hot tour cases, control/confirm tours, complete 8–10 tours, and move eligible customers toward paid booking.
- Include each role’s acceptance gate, safeguards, evidence, receiver, and BUILD / MOVE / FINISH round questions from the uploaded CARE V5 document.
- TCM only for the tour role; Field Visit will not be included.

## Interaction and accountability
- Every action will use the existing Movement OS event actions so the new page and Movement OS stay synchronized.
- Drafting a lead will require or create a next result and owner tied to the day’s chosen CARE goal; the page will flag any draft without a usable next commitment.
- Quick actions will cover claim, call result, qualification, schedule/confirm/complete tour, post-tour result, quote/payment intent, booking, next action, and valid exit.
- Completed work will remain inspectable through the shared event history.

## Integration and navigation
- Add a new `/movement-care` page and “Movement CARE” menu entry without replacing Draft Vision or Movement OS.
- Reuse the existing semantic styles and controls, with a dense split layout suitable for the current compact screen.
- Add complete page title and social metadata.

## Verification
- Test Flow Ops and TCM role switching.
- Test that drafting cannot start before a daily FIND / SCHEDULE / COMPLETE / CLOSE commitment is set, and that the chosen goal changes progress and queue emphasis.
- Test BUILD / MOVE / FINISH progress reports against actual shared Movement OS events.
- Test selecting a lead, drafting it, setting accountability, moving it through a tour result, and confirming the same changes appear in Movement OS state/history.
- Check the compact desktop viewport for overlap, empty sections, and non-working controls; capture screenshots before completion.
