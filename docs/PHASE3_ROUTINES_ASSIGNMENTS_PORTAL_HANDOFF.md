# Phase 3 Offline Teacher Routine / Assignments / Student Portal Dashboard

**Status:** Implementation package for offline service orchestration, not production parity.

## Confirmed reference and page/section mapping

| Surface/page/section | Intended backend operation | Offline service | Production gaps |
| --- | --- | --- | --- |
| Teacher > Academic > Routine | Create/update/archive and list overlapping class slots | `createStudyOperations` methods for routine | Real Auth, teacher scope, live SQL exclusion and APIs |
| Teacher > Academic > Assignments | Draft/edit/publish/close | `createAssignment`, `editAssignmentDraft`, `publishAssignment`, `closeAssignment` | Locked, audited RPC + HTTP |
| Teacher > Assignment submissions/grading | Grade drafts, release grades | `gradeSubmission`, `publishAssignmentGrades` | Row locks, student eligibility, grade publish audit, API |
| Student > Routine | List active batch slots | `listRoutine` | Real enrollment/RLS, account disable gate, API |
| Student > Assignments | Released assignment list, submit, resubmit | `listAssignments`, `submitAssignment` | Secure file upload, delivery state, RPC, API |
| Student > My submissions | Only own, released grades | `listMySubmissions` | Secure grade projection RPC, RLS tests, API |
| Student > Dashboard | Authorized aggregate/read-side view | `createStudentPortalOperations.getDashboard` | Multi-table aggregation adapter, caching, HTTP |

**Original Shifat's Tales evidence:** source route snapshots explicitly show a `/student` dashboard, `/student/batches/[batchId]` and many student content routes. Routine / assignments were separately required by the Musa Sir Master Plan (phases 10, 11, 25, 26). Do NOT falsely claim those specific standalone routes were in the original Shifat's Tales snapshot without validating its source.

## Domain guarantees implemented in JavaScript

- Trusted-identity only; missing persistence port fails closed.
- Teacher scope + subject-to-batch verification must be repeated inside transaction adapter.
- Overlap detection for a batch/day; adjacent time windows permitted.
- Assignment draft → published → closed, no unpublished content in student list.
- Student must have active batch enrollment and submit before due date; one submission per assignment/student.
- Resubmit only if enabled and submission ungraded; no resubmission after grade publication.
- Grade draft never shared with student; grade publication is atomic/audited.
- Student dashboard denies leaky provider output; no silent filtering of foreign records.
- Audit failures rollback mock state in executable integration tests.

## Database draft

`supabase/migrations/20261016000400_routine_assignments_offline.sql` creates academic subjects, syllabus units, routine slots, assignments and submissions. It enables RLS on every table; only defined read grants are exposed, never write grants. Draft grade storage does NOT give the student direct `SELECT` access to submission rows because RLS cannot hide confidential columns. A reviewed authorized projection/RPC must be added later.

**Not applied or tested against Postgres.** SQL grammar/RLS behavior must be verified by running migrations on an isolated Supabase/Postgres instance later. The transaction/RPC boundary must enforce status, enrollment, subject relationships, concurrent submissions, due date based on database clock, audit and grade publication. The JS clock is for offline simulations, not authoritative security.

## Verification and Definition of Done

- Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` after applying the installer.
- Later add authenticated teacher/student API endpoints and adapters, acceptance tests, runtime SQL/RLS checks, concurrent-writer tests, attachment storage checks and E2E UX.
- Until these pass, mark the scope **OFFLINE SERVICE VERIFIED ONLY**, not fully done.
- Neither Git history, Supabase credentials nor migrations are modified by the installer.
