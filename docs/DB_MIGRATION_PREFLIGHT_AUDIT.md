# Musa Sir — migration preflight audit (offline)

## Evidence and scope

Six local SQL SHA-256 fingerprints supplied by the user match reconstructed copies exactly. This repair changes only the two named files, adds a seventh UNAPPLIED draft schema and tests. It performs no Supabase calls and does not imply PostgreSQL replay success.

## Confirmed blockers prior to deployment

1. `20261016000400_routine_assignments_offline.sql`: the `EXCLUDE USING gist` expression `int4range(...)` needed an outer expression pair of parentheses under PostgreSQL `EXCLUDE` grammar. Fixed.
2. `supabase/verification/core_api_integration_readonly_audit.sql`: refers to `academic_submissions`; source creates `assignment_submissions`. Fixed.
3. The first six migrations have no `exams` or `exam_results` relation despite offline Exams/Results services. Added a *draft*, restricted schema in migration `00700`; this is **not** the complete exam publication implementation.

## Critical outstanding gaps (deployment gates)

- PostgreSQL/Supabase local replay of all seven migrations has NOT occurred; static tests are not a SQL execution substitute.
- Independent authenticated RLS tests for real student/teacher/pending/disabled users and secure RPCs NOT run.
- The first real teacher account requires trusted, audited provisioning; signup defaults to student/pending, and public signup is currently disabled.
- No actual student result-reading RPC; student result table direct SELECT remains inaccessible.
- The existing account lifecycle SQL has 4 RPC drafts but remote idempotency/concurrency tests have not been run.
- CMS/media and financial operations still need production adapters and complete Shifat's Tales parity review.
- Existing read-only SQL verification scripts are diagnostics, not deploy/migration statements.

## Before any remote migration

1. Verify `supabase --version`, Docker availability and local Supabase CLI setup. Avoid `db push` until a clean local `supabase db reset` / `db start` (as appropriate) succeeds.
2. Run all tests/lint/typecheck/build on Windows after applying this guarded fix.
3. Verify RLS and migrations with a disposable local database before remote `db push --dry-run`.
4. Keep write API feature switch disabled until real role/auth/RPC verification.

No environment variables, keys, DB password or project ID are required by this package.
