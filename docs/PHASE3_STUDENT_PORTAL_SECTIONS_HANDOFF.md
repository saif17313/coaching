# Phase 3 — Student Portal Section Reads, Offline Handoff

## Deliverable

`src/server/services/student-portal-sections.mjs` provides:

- `getMyProfile(actor)` exact own-profile projection with active-account precondition;
- `listMyBatches(actor,pagination)` and `getMyBatchOverview(actor,batchId)` with active-enrollment boundary;
- `listMyBatchSection(actor,batchId,kind,pagination)` where kind = materials, announcements, exams, results, payments, assignments, routine, notifications; uses exact result DTOs, owner/batch checks, release flags, published status and payment reconciliation;
- `requestPasswordOrMfaChange(actor)` intentionally fails until a reviewed Supabase Auth reauthentication flow is available.

Function-level mocked ports are tested against ownership leaks, extra private fields, invalid financial totals, future and draft releases, membership denial, malformed paging, duplicated rows and auth bypass. It does NOT create HTTP endpoints or production persistence or make the database live.

## Port contract

| Method | Required security invariant |
|---|---|
| `assertStudentActive(studentId)` | Verify profile role/status in DB transaction/snapshot, not from client metadata |
| `assertActiveEnrollment(studentId,batchId)` | Bind both identifiers to actual active enrollment; check batch status |
| `getStudentProfileAuthorized(studentId)` | Return only documented five profile keys; do not select credential/payment/private teacher fields |
| `listStudentBatchesAuthorized(studentId,{limit,offset})` | Filter active owner enrollments and stable order; cap result count |
| `getStudentBatchOverviewAuthorized(studentId,batchId)` | Confirm membership in the same DB query as data aggregation |
| `listStudentSectionAuthorized(studentId,kind,batchId,{limit,offset})` | Apply ownership, published/release filters and explicit projection; cap result count |

**Important consistency caveat:** JavaScript `assertActiveEnrollment()` then separate `readStudentSectionAuthorized()` is subject to time-of-check/time-of-use races. The real persistence port MUST recheck owner, active status and published flags **atomically in the read query**. The extra service validations defend against accidental data leakage but cannot secure a trustless backend adapter.

No raw media storage keys or signed links are projected. For downloads, use the existing `grantMaterialAccess` and a reviewed storage signer. For notifications mutation/read state, use the existing resource service with real DB permissions. Security/password/email/MFA changes must exclusively go through Supabase Auth after reauthentication.

## Follow-on work

1. Implement production server-side auth principal (verified Supabase `getUser()`), profile/role boundary and account status.
2. Connect reviewed PostgreSQL read repositories / RPCs; reconcile SQL migration and RLS with original code.
3. Wire guarded `/api/v1/student` endpoints with validation and E2E tests, plus frontend read consumers.
4. Finish multi-batch `/student/exams`, `/student/results`, `/student/payments` aggregators, exam/material details and security screen.
5. Re-audit original full source for exact field-level parity, and finish CMS section audit.

**No Supabase migration applied, no Git commit/push.** This package continues Phase 3 offline work and does not close master-plan phases 22–33 or 34–48.
