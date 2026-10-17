# Musa Sir Teacher Academic Publication — Combined Part D

## Contract
- `POST /api/v1/teacher/assignments/{assignmentId}/publish` — draft -> published, requires future due date, idempotency UUID.
- `POST /api/v1/teacher/exams/{examId}/publish` — draft -> published, idempotency UUID.
- `POST /api/v1/teacher/exams/{examId}/results/publish` — teacher-only release of all valid draft grades after scheduled exam time, ranks using SQL competition `rank()` (ties 1,1,3), idempotency UUID.
- `GET /api/v1/student/results?limit=20&offset=0` — only authenticated, active student's released exam results through a SECURITY DEFINER projection with own student ID and active enrollment.

All publish endpoints accept no request body and need `Authorization: Bearer <signed JWT>` plus `Idempotency-Key`. Publication SQL is transactional with audit rows, receipts, explicit teacher verification and locks. No direct client writes or student base-table result SELECT are granted. Student published-results access remains separately role validated at HTTP and SQL.

New local-only migrations 014-016: `20261018000700`, `20261018000800`, `20261018000900`. Cloud DEV still requires operator approval to deploy 011-016. `COACHING_ENABLE_MUTATION_APIS` stays OFF by default. No Git push. Full tests and rollback-only real local SQL QA are required before local commits.

## Remaining
Real signed-JWT HTTP smoke tests, full student portal integration, assignment submissions/grades & grade release, academic edits, finance/materials/CMS production adapters and complete original app parity. Do not represent these endpoints as an entire completed academic module.
