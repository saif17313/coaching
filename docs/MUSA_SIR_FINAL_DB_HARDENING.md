# Musa Sir: final LOCAL database hardening checkpoint

Scope: **local** Supabase database, migrations 00100-00800. No cloud deployment is performed by this installer.

## Migration 00800

- Revokes unused INSERT, UPDATE, DELETE privileges on `public.profiles` and `public.enrollments` from `anon` and `authenticated`.
- Replaces the existing `public.coaching_decide_enrollment(uuid,text,uuid)` function with the same logic, adding `FOR UPDATE` on the student's profile row during approval.
- Preserves existing `SECURITY DEFINER`, strict `search_path`, active-teacher check, receipt replay, batch capacity locks, status transitions, and audit insertions.
- Confirms `anon` cannot execute the approval RPC and `authenticated` retains the RPC permission.

## Real Postgres integration test

Run `RUN_DB_FINAL_LOCAL.ps1` from the project root. It verifies the exact checksums of the first seven migrations, checks the Docker context and local container, adds files without replacing existing code, runs full Node tests, lint, typecheck, build, `supabase migration up --local`, local PostgreSQL lint, and an isolated real-transaction race test. Random test rows are cleaned in `finally` and verified deleted.

Race tested: one transaction marks a student disabled while holding a profile row lock; simultaneous teacher approval waits for the locked row and rejects with `STUDENT_NOT_ACTIVE`, preserving `disabled:pending`. A valid active teacher's security-definer batch RPC must remain operational after table grant revocations.

## Boundaries and honest limitations

- A student disabled *after an already completed approval* may retain an active enrollment record, but RLS and application readers must continue gating access on active account status. This patch prevents an approval from using a stale status when a disable transaction commits first.
- Complete API/payment/exam/material/CMS feature parity has **not** been established by this migration and must be completed in later Teacher Admin -> Student Portal -> Website CMS implementation phases.
- `supabase migration up --local` mutates the **local** Docker DB and migration history only. It does **not** reset local data or touch cloud. If migration/test fails after local apply begins, files are intentionally retained for diagnosis rather than falsely claiming database rollback.
- Do not run `supabase db reset --linked`, remote SQL, `supabase db push`, commits, or pushes as part of this package.
- Before cloud migration: inspect the target project's database/ref, use `supabase link --project-ref <verified project ref>`, run `supabase db push --dry-run`, review the exact eight migration versions and target, then request explicit user approval for the real `db push`. Do not deploy without approval.
- After cloud deployment: verify remote migration history, schema lint, table grants, PostgREST JWT isolation, and RPC integrity against the intended **development** instance. Do not run test fixture creation on production.
- Back up and commit only reviewed source/migrations/tests/docs. Exclude installer ZIPs, copied package asset directories, local environment files, and test artifacts.

## Next modules from BACKEND_MASTER_PLAN.md

Shared DB foundation (this checkpoint) -> Teacher Admin missing API/persistence/parity work -> Student Portal -> Website Admin/CMS -> public website -> complete feature parity verification, production hardening, and deployment. Use BACKEND_MASTER_PLAN.md as the source of truth. Mark only actually implemented and verified features complete.
