# Phase 3 — Teacher management domain contracts (offline)

## Implemented
- Enrollment state-transition guard; terminal states rejected/cancelled cannot be reactivated implicitly.
- Atomic capacity invariant helper; safe integer checks.
- Validated teacher Batch, Academic Subject and Academic Unit contracts.
- Teacher-specific service with mandatory trusted actor and permission checks.
- Transaction-port interface, including documented locking and role re-verification requirements.
- Explicit planned teacher REST API route map (not live endpoints).
- Offline structural/contract regression tests.

## Explicitly pending (no false completion claims)
- Supabase project provisioning; migrations and real RLS/authorization testing.
- Real student profile/batch enrollment transactions and service adapter implementation.
- Academic subject/unit schema migration, FK and RLS (not deployed or proposed as ready).
- Auth session verification; real teacher API endpoints, user flows and UI.
- Student management CRUD, pagination, filtering and data integrity under concurrency.

## Important invariant
Neither the service nor domain contract performs writes without an authenticated transactional port. No seeded/mock data is presented as production state. Caller role must come from a verified DB profile, never HTTP JSON.

## Verification
`npm run verify:structure`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
