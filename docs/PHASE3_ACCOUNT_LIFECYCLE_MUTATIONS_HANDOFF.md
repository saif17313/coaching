# Phase 3 — Account Lifecycle + Transactional Mutation Boundary (Offline)

Status: **Offline-verified design; NOT production-verified.** Follow `BACKEND_MASTER_PLAN.md` and the original Shifat's Tales parity registers. This package makes **no real database changes** and **does not enable writes** by default.

## Implemented

- Reads: production Supabase authentication adapter now fetches `profiles.account_status` (along with `id,role,full_name`) under the same user bearer and rejects all statuses except `active`. The existing four read-only Next.js APIs keep their response shape.
- Protected teacher command HTTP routes (strict JSON, 4 KiB request cap, JWT-shaped bearer syntax, UUID idempotency key, verified Auth identity, DB-derived teacher role, `active` status; server-side errors are sanitized):
  - `PATCH /api/v1/teacher/students/{studentId}/status` JSON `{ "status": "active" | "disabled" | "rejected" }`
  - `POST /api/v1/teacher/enrollments/{enrollmentId}/decision` JSON `{ "decision": "approve" | "reject" | "cancel" }`
  - `POST /api/v1/teacher/batch-commands` JSON `{ "code": "CSE_01", "name": "Physics", "capacity": 30 }`
  - `PATCH /api/v1/teacher/batch-commands/{batchId}` JSON subset of `{ "name": "Physics", "capacity": 20, "isArchived": false }`
- All mutation requests require `Authorization: Bearer <access token>`, `Idempotency-Key: <UUID>`, `Content-Type: application/json` and **no query parameters**.
- Draft migration `supabase/migrations/20261016000600_account_lifecycle_mutation_rpcs_offline.sql`: account status enum, RPC-only writes, teacher active-account check, active-account RLS tightening on existing student resources, idempotency receipts, audited atomic student-status, enrollment-decision, batch-create/update PostgreSQL functions. NO client table-write grant.
- Transactional behavior is specified by the SQL RPC bodies and API boundaries; mock-backed HTTP tests exercise idempotent handling, validation, unauthorized access and rollback assumptions. SQL has **NOT been parsed or executed by a real PostgreSQL instance**.

## Production write gating (intentional)

`COACHING_ENABLE_MUTATION_APIS` must equal `enabled-after-db-verification` *and* valid `SUPABASE_URL`/`SUPABASE_ANON_KEY` must be configured for the production gateway to call these RPCs. Do **not** set this gate before applying and testing all migrations in an isolated Supabase test project and validating RLS/auth/role provisioning/transaction concurrency. The offline installer never sets the gate. No service-role key is used in these routes.

The API returns non-success when no real credentials or migration are available. HTTP route existence does **not** mean live writes work.

## Deployment prerequisites and risks

1. Core migration `00100` and resource/audit migration `00200` must precede `00600` (plus other offline drafts `00300`–`00500` in chronological deployment). All six drafts still require SQL review, migration ordering verification and testing against a real Supabase project.
2. Default account status is `pending` for all profiles, including existing users. A trusted DBA/admin provisioning workflow must explicitly mark legitimate teacher profiles `active`; otherwise all teacher portals and RPCs are intentionally denied.
3. Public registration and Auth users require separate secure signup/account verification. This package does **not** create users through Supabase Auth or let teachers change the role field.
4. Recheck legacy RLS policies, storage policies and related RPCs for active-account enforcement in the real project. The new draft tightens known student read policies, but a full schema privilege audit is not yet complete.
5. Concurrency testing: two teachers approving the last batch seat at once, replaying an idempotency ID with a different payload, disabled teacher using a previously issued token, audit insertion failure, and cancellation/capacity edge cases. Mock tests are not a substitute for PostgreSQL concurrency tests.
6. Existing migrations may define tables, triggers or functions that still require compatibility fixes before production. The SQL draft contains no `DROP TABLE`, but review its `DROP POLICY`, `REVOKE` and `ALTER POLICY` statements before any apply.
7. The current routes cover *teacher-initiated* state/batch/enrollment changes only; self-enrollment requests, student creation via Supabase Auth, student profile edits, payment posting, assignments and CMS writes, and credential changes are still missing live endpoints.

## Security acceptance criteria

- Unknown actor/session/role/account status: denied.
- Unknown JSON property, malformed UUID, missing/reused conflicting idempotency token: denied.
- Disallowed state transition, archived/full batch, or enrollment mismatch: denied in **database transaction** (not only frontend).
- Success must include strict projected response, no extra fields.
- Mutations are audit-logged within the same transaction and every replay either returns the same result or refuses conflicting input.
- User JWT and publishable key only; never a service-role key in browser or HTTP request.

## Verification

- `npm run verify:structure`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` in the operator's Windows workspace.
- Combined reconstructed test count before installer: **175/175 passed locally**; runtime tests and SQL static-shape tests only. Windows TypeScript/Next.js checks remain operator verification until reported.
- No Supabase project creation, migration, Git commit, or push.
