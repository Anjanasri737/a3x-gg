# Lead OS 10X cohorts and demo universe

## Outcome
- Make `/flow-os` the obvious place to see the recently merged end-to-end Lead OS work.
- Add fast cohort views for active leads, old/stale leads, expired leads, and tours.
- Populate a realistic, clearly labeled demo universe with at least 100 leads in each requested lead cohort and 20 tour records.

## Implementation
1. Extend the Lead OS list with a cohort selector, accurate summary counters, age/status context, and direct links to supporting WhatsApp, Draft 30, and Control Tower work.
2. Preserve the existing canonical customer workspace and pipeline actions; cohort filters only organize the same source of truth.
3. Add idempotent demo data through a database migration. Use unique demo identities, varied pipeline stages, owners, messages, observations, next actions, old timestamps, expired outcomes, and 20 tour-stage journeys.
4. Ensure seeded rows appear through the existing Flow OS read model and can be opened without affecting real records.
5. Verify exact counts in the database, then test `/flow-os` on desktop and the current compact viewport.

## Technical details
- “Old” means an open lead whose last meaningful activity is over 30 days old.
- “Expired” means a closed/lost/expired lead, kept visible for recovery and audit.
- Tour records will use the existing lead pipeline and action/timeline structures rather than a disconnected mock store.
- Seed inserts will be repeat-safe and prefixed `[LEADOS DEMO]` for clean identification.
