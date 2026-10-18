# Student Portal Academic Gateway — Part G

This change adds **seven live, read-only student API routes**, following the existing Shifat's Tales student academic navigation scope without claiming full UI or submission-workflow parity:

| Method | Route | Visibility |
|---|---|---|
| GET | `/api/v1/student/batches/[batchId]/subjects` | Active student enrollment |
| GET | `/api/v1/student/subjects/[subjectId]/syllabus` | Enrolled subject's batch |
| GET | `/api/v1/student/batches/[batchId]/routine` | Active routine slots only |
| GET | `/api/v1/student/batches/[batchId]/assignments` | Published/closed, released assignments only |
| GET | `/api/v1/student/assignments/[assignmentId]` | Released assignment details and instructions |
| GET | `/api/v1/student/batches/[batchId]/exams` | Published exams only |
| GET | `/api/v1/student/exams/[examId]` | Published exam details only |

## Security and transport

- Auth must be a verified Supabase-signed bearer token bound to an **active student profile**. Actor role never comes from client-supplied metadata.
- Every RLS query uses **the exact same user access token**. No `service_role`, direct writes, or elevated queries.
- Active membership is independently checked in `enrollments`, and for subject/assignment/exam details the actual parent batch is also checked.
- Bounded pagination (`limit` 1–40, `offset` 0–10000), strict resource UUIDs, DTO field whitelist, row uniqueness, no-store cache, sanitized errors.
- Academic row release/status checks are done in code **in addition to** PostgreSQL RLS. Unreleased assignments, draft/archived exams and archived routines are never returned.
- No migration, Auth flag change, cloud operation, Git push, or unapproved mutation switch.

## Still missing for end-to-end Student Portal

Student assignment submissions and released assignment grades need a reviewed transactional RPC that prevents draft grade leakage. Notification read-state update and Student Profile/Auth reauthentication workflows also require dedicated integration. The web UI, hosted JWT smoke tests, and actual Shifat's Tales section-by-section UX acceptance are not part of this API-only package. Do **not** describe these routes as completing the Student Portal.

## Local verification

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Real cloud signed-JWT and RLS smoke tests must run before production acceptance. Module tests are in `tests/student-academic-portal-integration.test.mjs`.
