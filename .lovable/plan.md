# Admin Draft Control — one control room over Vision, Movement and Booking Flow

Today the admin Vision page is just the small Vision Hub (work pool, uploads, lookup, accuracy). This plan replaces it with a single admin control room that governs the whole chain: WhatsApp screenshot → customer → batch → owner → journey step → booking → check-in. Movement OS and the Booking Flow split screen stay exactly as the operator tools; admin only watches, filters and drills into them.

## First build (the six screens that give real control)

**1. Command** — one strip of clickable numbers: screenshots today, rows read, silent drops, unique customers, new vs existing, needs review, unread waiting, no owner, in a batch, being worked, overdue, revenue at risk, quotes due, bookings today, check-ins today. Below it the funnel: screenshots → rows → customers → qualified → batched → contacted → tour → quote → booking → check-in. Every number opens the exact customers behind it.

**2. Vision** — one row per upload batch: WhatsApp account, who uploaded, time, checkpoint, screenshots expected vs received, rows read, unique customers, duplicates, review rows, errors, processing time, status. Plus the single most important line: *last screenshot age per WhatsApp account*, red when stale. Actions: reprocess, mark duplicate, reopen batch, inspect rows, escalate missing screenshots.

**3. Reconciliation** — per WhatsApp account and checkpoint: rows visible vs resolved + review + non-customer, and the gap. A checkpoint can never show green while the gap is above zero. Includes the review queue with the reason (unclear number, name only, possible duplicate, group chat, uncertain match…) and one-click resolutions: link existing, create, merge, mark duplicate, mark non-customer, correct number, correct name, read again.

**4. Batches (G1–G4)** — every operator's batch of 30 per round: assigned, worked, locked next action, connected, tours, quotes, bookings, remaining, time per customer, overdue and red counts. Click an operator to see the exact 30, with a "why is this customer here" panel showing the scoring reasons and the planned-vs-actual mix. A batch only counts as closed when every customer has an owner, a next action and a deadline — otherwise admin sees "26/30 · 4 unresolved" and which four. Admin can refill, remove, re-rank, move to later, release, reassign or regenerate.

**5. Ownership & claims** — three separate things, never merged: long-term owner, batch reservation, person working it right now. Shows claim start, expiry and last action, and flags double claims, reservation conflicts, stale claims, owner mismatch and abandoned work.

**6. Risk & leakage** — RED / AMBER / GREEN / GREY as global filters, plus the leakage queue grouped by where the money leaks: capture, identity, ownership, batch, movement, tour, closing, booking, payment, room lock, check-in. Every row shows the customer, why it is red, who is accountable, age, next action, deadline and a Fix Now button that opens the live workspace.

**7. Movement** — the same priority model operators use (customer waiting, revenue now, tour now, follow-up due, high intent, fresh, recovery) as clickable counters, plus each operator's active tray: why each customer is in it, how long, whether it was touched, its next action and deadline. Admin can remove, replace, reprioritise, reassign or escalate. Includes the handoff monitor: from team, to team, sent at, allowed time, acknowledged or red.

**8. Booking Flow** — one row per journey step showing how many customers sit there, how many are overdue and average time, so clogs are obvious. Plus process-integrity violations: a tour scheduled with no budget, a quote sent with no tour outcome, a booking with no room, money taken before approval, a room held with no payment, a check-in marked without confirmation. And guided-versus-expert performance, measured on handling time, missing fields and conversion rather than seniority.

## Who owns what

Draft Vision answers what exists on WhatsApp. Movement OS answers who deserves attention now and who owns it. Booking Flow Split executes the exact next step. Admin only checks whether the company is executing correctly — it never duplicates operator controls.

## Drill-down

From anywhere, clicking a customer opens an admin split view: left side the full story (every screenshot appearance, WhatsApp account, label and unread changes, owner and claim history, batch history, calls, qualification, tour, quote, payment, booking, check-in); right side the same Booking Flow work panel the operator uses, read-through with reassign and escalate. Also **Open Movement** and **Open Booking Flow** links.

## Command bar (on every tab)

Date range · today · checkpoint · WhatsApp account · zone · operator · owner · current handler · batch · priority P0–P6 · health · journey step · funnel stage · SLA state · unread · new vs existing · search by name or number. Filters follow you between tabs, so "Kora + G2 + P0 + overdue", "tour done + no quote" and "payment received + room not locked" are all one click. Day-wise, person-wise and zone-wise views come from this same bar.

## Naming fix (before any analytics)

Three different things are currently all called "draft". They get separate names everywhere:
- Priority class D1–D4 → **Immediate / Active / Future / Cold**
- Daily work batches of 30 → **G1 / G2 / G3 / G4 / Closure**
- Rent-agreement follow-ups in the tour tracker → **Agreement queue**

## One customer, not three

Vision, Movement OS and Booking Flow each keep their own browser-stored copy today, and the split screen can even create a second record when a name or number does not match. This plan puts a single customer id on every surface: Movement passes the id, Booking Flow opens that exact customer and never invents one, and admin reads the shared backend record rather than anyone's local copy.

## Later tabs (after the six land)

Tours, Closing, Booking, Check-in, Handoffs, People quality, Guided-vs-Expert performance, accuracy broken out per extraction type, rules and thresholds editable without code, and the full audit log of every override with old value, new value, reason and time.

## Technical notes

- New route tree under `src/routes/admin.vision.*` (kept at the same URL, titled "Draft Control"), with shared filter state in a context provider so tabs keep the selection.
- Reuse existing primitives rather than new logic: `src/lib/flow-os/reconciliation.ts`, `drafting-algorithm.ts`, `work-concurrency.ts`, `operator.ts`, `revenue-api.ts`, `src/movement/priority.ts` and `metrics.ts`.
- Admin reads server truth (Supabase: `screenshot_batches`, `screenshot_observations`, `leads`, `work_claims`, `flow_draft_batches`, `flow_draft_items`, `next_actions`, `sla_breaches`, `audit_logs`) through `createServerFn`, not the browser-persisted `vision2` engine.
- Canonical id resolution: a single `resolveCustomerId(phone, name)` helper used by `SplitFlow` and Movement Split; `ensureLead` is only reachable from explicit capture, not from selection.
- Where a metric has no backend column yet, it is derived on read; no new parallel tables.
