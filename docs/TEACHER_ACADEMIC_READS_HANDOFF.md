# Teacher Academic Control — Combined Read APIs

Implements six read-only JWT/RLS-scoped teacher endpoints:

| Endpoint | Contents |
| --- | --- |
| GET `/api/v1/teacher/batches/{batchId}/subjects` | Batch subjects |
| GET `/api/v1/teacher/subjects/{subjectId}/syllabus` | Subject and ordered syllabus units |
| GET `/api/v1/teacher/batches/{batchId}/routine` | Batch weekly timetable |
| GET `/api/v1/teacher/batches/{batchId}/assignments` | Draft/published/closed assignments |
| GET `/api/v1/teacher/batches/{batchId}/exams` | Draft/published/archived exams |
| GET `/api/v1/teacher/exams/{examId}/results` | Teacher-only draft/published results |

`Authorization: Bearer <Supabase Auth JWT>` required. Token verified against Auth and `profiles` account state; RLS scoped queries use exactly that token, never a service role. Limit=1–50; offset=0–10000. `status` is allowed only on routine/assignments/exams/results and is validated per resource. Responses are `Cache-Control: private, no-store`; returned fields are strictly projected.

**Remaining:** All teacher academic write/edit/publish/grade RPCs and protected HTTP mutations, student-side released-only result/submission projection, full signed-JWT real HTTP QA, frontend pages and original source parity. No schema changes, new migration, cloud operation or Git push in this package. Treat only these six read routes as implemented, not the academic modules as complete.
