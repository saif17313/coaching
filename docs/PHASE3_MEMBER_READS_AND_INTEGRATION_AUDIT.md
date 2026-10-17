# Phase 3 — Authenticated Core Detail Reads + Integration Readiness

## Implemented (offline verified)

New authenticated GET entrypoints use `verifyActiveActor` (remote Supabase Auth verification, bearer-bound `profiles` row, database role and `account_status=active`) and the same bearer for RLS-scoped reads. Extra provider fields fail closed; errors are sanitized and responses are `private, no-store`.

| Route | Purpose | Database boundary |
|---|---|---|
| `GET /api/v1/student/batches` | List student's actively enrolled batches (max 20 per page) | `enrollments.student_id=auth.uid()` **and status active**, then ID-scoped `batches` |
| `GET /api/v1/student/batches/[batchId]` | Detail of own actively enrolled batch | Authorize enrollment before fetching batch |
| `GET /api/v1/teacher/enrollments` | Paginated teacher enrollment listing, optional status filter | Remote Auth + active teacher role + RLS |
| `GET /api/v1/teacher/students/[studentId]` | Minimal student profile detail | Remote Auth + active teacher + exact profile shape |
| `GET /api/v1/teacher/batches/[batchId]` | Minimal batch detail | Remote Auth + active teacher + exact batch shape |

**Deliberate scope:** These routes query only the Phase 1 core tables. They do not expose draft grades, raw private profile attributes, financial or CMS tables. Batches from an active enrollment can be archived; that flag is returned explicitly. No write endpoints, admin/service-role keys or direct DB migration are introduced by this package.

## Source-of-truth and parity status

- Original Shifat's Tales reference: teacher student/batch/enrollment screens and student batch pages are confirmed by previous route inventory, but field-by-field source parity remains **UNVERIFIED**. Do not mark full feature parity done.
- Existing verified core: 4 read routes, 4 default-OFF write boundaries. This iteration adds five read route entrypoints, not production-ready teacher/student modules.
- Student notifications, exam details, results, finance, CMS routes and remaining field-level parity are still pending HTTP wiring and live RLS testing.

## Database migration compatibility requirements (UNVERIFIED)

1. Apply all SQL drafts in version order to a **disposable** Supabase environment only after schema review. The supplied drafts have not been applied or live-concurrency-tested.
2. Verify that `profiles.account_status` is present and that `current_user_is_teacher()` requires active status; teacher role must be trusted-provisioned, never from signup metadata.
3. Verify the `00600` migration revokes direct authenticated batch INSERT/UPDATE/DELETE and changes student read policies to active-account checks. Ensure existing migrations contain all referenced tables/policies before applying.
4. Run `supabase/verification/core_api_integration_readonly_audit.sql` (read-only catalog inventory); a green inventory is necessary but **not sufficient** for security.
5. Test with separately authenticated teacher, active student, pending student, disabled student, and unrelated student tokens. Confirm cross-student denial, authorization before batch detail fetch, profile role isolation, no draft materials/results leak, and real RLS behavior.
6. Review PostgreSQL SECURITY DEFINER functions, lock order, concurrency and idempotency receipts with two simultaneous requests; use no production traffic or payment credentials until verified.
7. Never enable `COACHING_ENABLE_MUTATION_APIS` prior to verified migrations and live RLS/transaction tests. Existing mutation HTTP routes remain **OFF**.

## Execution and release gate

- Offline tests cover injected Auth/read ports, output allowlists, active enrollment gating, role isolation, bad queries and malformed provider responses.
- Full `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` must pass on operator machine.
- No Supabase calls or migrations, Git commit/push, or UI were carried out by installer.
- Migrate from mocks to live DB only in a separate explicitly approved integration phase.
