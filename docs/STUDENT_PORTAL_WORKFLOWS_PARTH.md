# Student Portal Part H — assignment submission, grading and notification state

Status: **local-only migration package**. Cloud DEV remains at 10 migrations until explicit approval.

Seven protected HTTP routes:

1. `POST /api/v1/student/assignments/:assignmentId/submit` `{answerText}` — authenticated active student, idempotency-key UUID, no attachments (text only), due-date and resubmit guards.
2. `GET /api/v1/student/assignments/:assignmentId/submission` — owner-only, draft points/feedback masked; published grades only after teacher releases.
3. `GET /api/v1/teacher/assignments/:assignmentId/submissions` — teacher-only, capped at 50, fail closed rather than report partial list.
4. `POST /api/v1/teacher/submissions/:submissionId/grade` `{points,feedback}` — teacher-only, grade draft must fit assignment max.
5. `POST /api/v1/teacher/assignments/:assignmentId/grades/publish` `{}` — teacher-only, all submitted work must be graded before atomic release.
6. `POST /api/v1/student/notifications/:notificationId/read` `{}` — owner-only and idempotent.
7. `GET /api/v1/student/notifications/unread-count` — recipient-only unread count.

Security: database SECURITY DEFINER RPCs require signed student/teacher identity; active status; active enrollment; in-app RLS remains enabled; no direct authenticated SELECT or DML grant on assignment_submissions; mutation feature flag remains OFF by default; no service role. Each write shares a verified bearer token and transaction-level audit + receipt. Notification read requires ownership. Text submissions only; attachments/storage signer are **not implemented** here. Teacher grade edits and publication are irreversible after publish. Due date is evaluated by PostgreSQL clock, not caller. Published grades do not reveal other students. No reset, seed, environment or cloud modifications.

QA: baseline 340 Node tests plus 44 focused tests = expected 384. After local migration 019/020, rollback-only PostgreSQL QA creates throwaway auth users, teacher/batch/assignment, student submission+resubmit, grade publication, notification state, verifies access denial and receipt/audit, and ROLLBACK. Real signed-JWT HTTP smoke test and production rollout remain pending; do not claim full product workflow complete from unit QA alone.
