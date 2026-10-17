# Phase 1 — Part A: Core Database Foundation

Status: **IMPLEMENTED LOCALLY — STATIC TESTED; REMOTE UNAPPLIED**

## Scope

- `profiles` tied to Supabase `auth.users`; signup defaults to **student**, never a claimed teacher role.
- `batches` with code, dates, capacity and archive flag.
- `enrollments` with unique student/batch membership and state/decision consistency.
- Initial indexes, authenticated role checks, RLS, and permissions.
- No anonymous access; no client-side profile promotion; no direct enrollment writes.

## Security/operational assumptions

- SQL targets a **new dedicated Supabase project**. Existing database migrations/schema must be reviewed before applying; never blindly run this on Shifats-Tale production.
- Bootstrap an initial teacher through a trusted administrator using the Supabase dashboard/privileged service, after verifying the correct user UUID. Never expose the service-role key to the browser.
- Phase 2 will add trusted profile-update and enrollment services with proper transaction/capacity checks. Until then, writes are deliberately denied.
- RLS-focused static tests verify migration intent, **not** actual database behavior. Run live integration tests on an isolated database before staging/production.
- This migration is forward-only; review/backup before applying. No automatic push or remote database mutation.

## Next: Phase 1 Part B

Set up Supabase CLI/development workflow, typed server/client bindings, environment separation, generated database types, isolated migration checks, and DB integration tests. Do not treat this Part A as production-ready database provisioning.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` where dependencies are installed. For migration syntax and effective RLS, validate using a disposable Supabase/PostgreSQL instance.
