# Teacher Academic Control — Transactional Part C

## New authenticated POST routes

| Route | Command | Idempotent RPC |
|---|---|---|
| `/api/v1/teacher/batches/{batchId}/subjects/create` | Create subject | `coaching_create_subject` |
| `/api/v1/teacher/subjects/{subjectId}/syllabus/add` | Add syllabus unit | `coaching_add_syllabus_unit` |
| `/api/v1/teacher/batches/{batchId}/routine-slots` | Create timetable slot | `coaching_create_routine_slot` |
| `/api/v1/teacher/batches/{batchId}/assignment-drafts` | Create assignment draft | `coaching_create_assignment_draft` |
| `/api/v1/teacher/batches/{batchId}/exam-drafts` | Create exam draft | `coaching_create_exam_draft` |
| `/api/v1/teacher/exams/{examId}/results/draft` | Save private draft marks | `coaching_save_exam_result_draft` |

Each endpoint requires an active, remotely verified teacher session, `Authorization: Bearer <JWT>`, an RFC4122 `Idempotency-Key` UUID, JSON with an exact allowlist, and no query string. Successful requests return HTTP 201. The server does not accept teacher identity, role or operation metadata in the request body.

All SQL writes execute inside SECURITY DEFINER RPCs, enforcing teacher account status, idempotency receipts and audit logs within one PostgreSQL transaction. The caller's JWT is passed unchanged; no service-role credentials or direct client write grants are used. Routine conflicts are prevented by an existing PostgreSQL EXCLUDE constraint. Draft marks are only visible through the teacher-only result read API; publication requires a separate reviewed mechanism.

Migration files `20261018000400` through `20261018000600` are applied to **local Supabase only** by the guarded installer. Cloud Dev still has 10 earlier migrations until an explicitly approved deployment. The production mutation gate remains OFF by default and is not edited by this package.

### Incomplete / next

Assignment and exam edits, publication, grade publishing/ranking, student released-only exam-results RPCs, teacher/student frontend, live cloud signed-JWT HTTP smoke tests, and original Shifat's Tales parity audit are **not** implemented by this Part C. Test count is not completion of the whole Academic module.
