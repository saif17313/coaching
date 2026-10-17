# Teacher Admin Core Management — Combined Part B

Scope: read-only, production-bound Teacher Admin operational views. Source: committed Musa Sir HEAD `fa6866e670`; no new SQL migrations or database schema edits.

## Routes and DTOs

| Endpoint | Behavior |
| --- | --- |
| `GET /api/v1/teacher/students/directory?accountStatus=active&limit=20&offset=0` | Active-teacher-only student directory, account-state filter and pagination |
| `GET /api/v1/teacher/batches/{batchId}/roster?status=pending&limit=20&offset=0` | Batch detail + enrollment records enriched with validated student profiles |
| `GET /api/v1/teacher/batches/{batchId}/occupancy` | Active, pending, remaining seat counts using user-scoped PostgreSQL HEAD counts |
| `GET /api/v1/teacher/enrollments/{enrollmentId}` | Enrollment detail with profile and batch summary |

All require `Authorization: Bearer <signed Supabase JWT>`, Auth `/user` confirmation and an active `teacher` DB profile. Exact allowlisted user-JWT PostgREST queries run under existing Supabase RLS, no service-role token. Unknown query fields, duplicated parameters, oversized pages, foreign IDs, extra upstream columns, duplicate/ambiguous rows and malformed records fail closed. No-store responses, bounded pagination (limit 1–25, offset 0–10000). No writes or mutation feature switch changes.

`student-directory` output includes `{students:[{id,fullName,accountStatus,createdAt}],pagination}`. `batch-roster` includes `{batch,entries:[{enrollment,student}],pagination}`. `batch-occupancy` includes `{batch,active,pending,availableSeats,isAtCapacity}`. `enrollment-detail` includes `{enrollment,student,batch}`. No auth emails, sensitive metadata or draft material are returned.

**Occupancy counts are informational snapshots only.** Do not make approval decisions using this GET response. Existing `coaching_decide_enrollment` transaction owns the capacity/lock invariant. Concurrent modifications between HEAD reads can change counts; a refresh is required after successful writes.

## Verification

- Existing 222 tests + 14 new contract/security tests = expected 236.
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` required in operator's Windows environment.
- Pure HTTP contract tests were run against the user-supplied source archive (236/236 pass). Full Windows Next build and cloud real-JWT HTTP tests remain pending until operator confirmation.
- No SQL migration, no remote cloud mutation, no Git push.

## Remaining core parity

Teacher-side student onboarding/invitation, richer search/export, historical payment view, full batch operations UI, workflow UI wiring, and real hosted JWT end-to-end smoke tests remain pending. Existing create/update batch, enrollment request and decision/status/profile mutation RPC routes are **not** modified by this package.
