# Coaching Management System — Backend Master Plan

> Source of truth for plan and implementation progress.

## Current Progress (offline development track)

```text
CURRENT TRACK:  Phase 3+ reusable backend services (combined offline packages)
LAST VERIFIED:  Student Portal section readers + CMS field parity audit — 127/127 tests,
                clean lint, typecheck and build pass (operator output)
THIS PACKAGE:   Supabase Auth /user verified read-only HTTP gateway, four role-protected
                GET routes and RLS-scoped queries; Windows verification pending
SOURCE REF:     Shifat's Tales feature parity register (NOT complete)
DB STATUS:      Supabase project creation, Auth, migrations and live RLS deferred
GIT:            feature/p00-foundation @ 37f2140, no commit/push by installer
BLOCKERS:       Production auth, repositories, atomic RPCs, protected APIs,
                real SQL/RLS and E2E integration tests
```

**Progress definition:** Local mock-backed services exist for student/batch/enrollment,
academics/exams, learning resources/notifications, offline finance workflows, and the proposed routine/assignments package.
None is accepted as fully production-complete without real persistence, auth, API
and database verification. Do not mark Teacher Admin, Student Portal or CMS
as parity-complete based on test counts alone.

**Original phase roadmap below remains authoritative.** This combined-package work
is an offline implementation track, not a renumbering or closure of Phases 4–52.




### Phase 3 integration checkpoint — protected HTTP reads (install pending)

- New `/api/v1/student/me`, `/api/v1/student/enrollments`, `/api/v1/teacher/students`, `/api/v1/teacher/batches` GET routes connect to Auth-verified PostgREST reads.
- Role is fetched from the RLS-scoped database profile after Supabase Auth `/user` verification; bearer syntax/JWT metadata alone grants no role.
- Reject unknown query fields, unauthorized roles, foreign student records and unexpected upstream projections. API responses are non-cacheable.
- Account disabled/pending states **not represented in current profile table**; production rollout remains blocked until account-state checks are implemented and tested.
- No database migrations, CRUD writes, Git commit or push; backend-read E2E and RLS tests remain pending.

### Toolchain compatibility baseline

- Node.js: `>=20.9.0` (local environment currently Node 24.x)
- Next.js: `16.3.4`
- React: `19.2.8`
- TypeScript: `6.0.3` — intentionally pinned because the current typescript-eslint toolchain supports TypeScript `<6.1.0`; TypeScript 7 is not used yet.
- ESLint: `9.39.5` — intentionally pinned because the current `eslint-config-next` / `eslint-plugin-react` chain is not compatible with ESLint 10.
- Do not upgrade ESLint to 10 until the Next.js React lint dependency chain is confirmed compatible.

### Part A deliverables

- Next.js + TypeScript foundation
- strict TypeScript configuration
- versioned `/api/v1/health` endpoint
- clean app/server/lib/types/config boundaries
- environment/secret baseline
- lint, typecheck, unit test, structure check, production build
- production dependency audit
- local baseline commit
- switch to `feature/p00-foundation`
- no automatic push

---

## Core Development Hierarchy

```text
Surface
  -> Page
    -> Section
      -> Backend Capability
        -> Database
        -> Validation
        -> Repository
        -> Service
        -> Authorization / RLS
        -> API Contract
        -> Tests
        -> Docs
        -> Verification
        -> Commit
```

## High-Level Order

```text
PHASE 0   Repository + Engineering Foundation
PHASE 1   Database + Supabase Foundation
PHASE 2   Authentication + Authorization + Security
PHASE 3   Shared Reusable Backend Architecture
PHASE 4   Teacher Admin Full Planning

PHASE 5   Teacher Overview
PHASE 6   Teacher Student Management
PHASE 7   Teacher Batch Management
PHASE 8   Teacher Enrollment Management
PHASE 9   Teacher Academic Control
PHASE 10  Teacher Academic Routine
PHASE 11  Teacher Assignments
PHASE 12  Teacher Exams & Grading
PHASE 13  Teacher Study Materials
PHASE 14  Teacher Announcements
PHASE 15  Teacher Payment Ledger
PHASE 16  Teacher Finance Management
PHASE 17  Teacher Academic Reports
PHASE 18  Teacher Notifications
PHASE 19  Teacher Security & Audit Logs
PHASE 20  Teacher Portal Settings + Profile
PHASE 21  Teacher Backend Stabilization / API Freeze

PHASE 22  Student Portal Planning
PHASE 23  Student Dashboard
PHASE 24  Student Academic Journey
PHASE 25  Student Routine
PHASE 26  Student Assignments
PHASE 27  Student Exams & Results
PHASE 28  Student Materials
PHASE 29  Student Announcements
PHASE 30  Student Payments
PHASE 31  Student Notifications
PHASE 32  Student Profile + Security
PHASE 33  Student Stabilization / API Freeze

PHASE 34  Website Admin / CMS Planning
PHASE 35  CMS Core Engine
PHASE 36  Home
PHASE 37  About
PHASE 38  Courses
PHASE 39  Gallery
PHASE 40  Results
PHASE 41  Materials
PHASE 42  Academic Calendar
PHASE 43  Class Routine
PHASE 44  News & Events
PHASE 45  Reviews
PHASE 46  Contact
PHASE 47  Global Settings / Footer / SEO

PHASE 48  Public Read APIs + Caching
PHASE 49  Performance + Scalability Hardening
PHASE 50  Security Audit
PHASE 51  Full Integration Tests
PHASE 52  Production Readiness
```

## Architecture Rules

- Database is the source of truth for business data.
- Frontend never decides authorization.
- Business logic does not live inside UI components.
- Teacher and Student reuse domain services.
- CMS content is independent from visual layout.
- Large lists are server-paginated and indexed.
- Critical multi-record mutations use transactions.
- Sensitive mutations are auditable.
- APIs are versioned and documented.
- Secrets are never committed.

## Git Workflow

Bootstrap exception:

```text
empty main
  -> verified Part A
  -> local baseline commit on main
  -> switch to feature/p00-foundation
```

After that, development proceeds on phase/domain branches.

Automation may commit locally after checks pass. It must never push unless the user explicitly requests push.

## Definition of Done

```text
[ ] requirement/domain behavior defined
[ ] data model/migration complete where applicable
[ ] validation complete
[ ] repository/service complete
[ ] authorization/RLS complete where applicable
[ ] API contract complete
[ ] tests pass
[ ] lint/typecheck/build pass
[ ] frontend handoff documented
[ ] master plan updated
[ ] local commit created
[ ] push deferred until explicit approval
```


## Offline checkpoint — Student Portal section read services + CMS parity audit (2026-10-16)

- **Operator-verified prerequisite:** 101/101 tests, clean ESLint, TypeScript and Next.js build after Teacher/CMS package.
- **This package adds:** student-profile and batch-summary read projections, student-facing materials, announcements, exams, results, payments, assignments, routine and notification section readers with exact DTO allowlists, ownership/membership gates, release/publish checks and invoice reconciliation; executable mock-backed security tests.
- **Expected after installation:** 127 tests (101 baseline + 26 new tests including subtests). The operator must confirm full verification before updating the verified count.
- **Audit:** `STUDENT_PORTAL_ROUTE_PARITY_REGISTER.md` and `SHIFATS_TALES_CMS_FIELD_AUDIT_REGISTER.md` record confirmed routes and unresolved field-level differences; no full original-source audit is claimed.
- **Pending:** production Auth, database repositories/RPCs/RLS, live read isolation, student APIs/pages, credential reauthentication, full CMS section parity.
- **No database application, Git commit or push**. This is an offline service iteration, not feature-parity completion.

## Verified offline checkpoint — Teacher Profile / Settings + Website CMS Core (2026-10-16)

- **Prerequisite operator-verified baseline:** 80/80 tests, lint, typecheck, build passed after routine/assignments/student dashboard package.
- **This package adds (offline only):** teacher-owned profile/preferences services, controlled credential-change boundary; CMS page/section/item drafts, revision-based publishing, immutable public snapshot projection, media metadata authorization, global footer/SEO settings and audit integration contracts.
- **Expected tests after installation:** 101 total (80 existing + 21 new); only mark newly verified after successful installer output.
- **Unapplied SQL draft:** `20261016000500_teacher_settings_website_cms_offline.sql`, seven RLS-enabled tables, no end-user grants.
- **Not complete:** real Supabase Auth, website CMS transactional adapters, hosted storage, protected Teacher API routes, public CMS readers/caching, teacher/website UI and complete original section-by-section parity.
- **Operator policy:** no database changes, Git commit or Git push from this installer. These phases remain in-progress; do not mark as completed based solely on offline services.

See `docs/PHASE3_TEACHER_SETTINGS_WEBSITE_CMS_HANDOFF.md` and `docs/SHIFATS_TALES_CMS_PROFILE_PARITY_DELTA.md` for the detailed remaining gaps.

## Offline checkpoint — Account Lifecycle & Transactional Mutation HTTP Boundary (2026-10-16)

- **Operator-verified prerequisite:** 148/148 tests, ESLint, TypeScript and Next.js build passed after authenticated read-only API package.
- **This iteration:** active account-status verification on existing read APIs; four new protected, teacher-only mutation routes; strict request/response allowlists; idempotency header; production PostgREST RPC gateway default-OFF; `00600` unapplied SQL draft with status/RLS hardening and transactional audited RPCs; mock HTTP tests and SQL security shape checks.
- **Expected after applying package:** 175 passing tests (148 previous + 27 new counted by Node test including subtests). Operator must confirm lint, typecheck, build, and route registration before calling installer verified.
- **Not complete:** database migrations applied, live signup/teacher provisioning, live Auth/RLS role checks, PostgreSQL transaction/concurrency tests, database seeding, protected APIs for every original feature, full original-source feature parity and production readiness.
- **Security gate:** write routes cannot send RPC requests unless `COACHING_ENABLE_MUTATION_APIS=enabled-after-db-verification` is deliberately set after real database verification. Do not set this switch during offline development.
- **No database mutation, commit or push** from installer.
- Detailed handoff: `docs/PHASE3_ACCOUNT_LIFECYCLE_MUTATIONS_HANDOFF.md`.

## Offline checkpoint — Core Student/Teacher Detail Read APIs + Supabase Readiness Audit (2026-10-17)

- **Operator-verified prerequisite:** 175/175 tests, lint, TypeScript and Next.js production build passed after Account Lifecycle/Mutation API package.
- **This iteration:** five new authenticated GET routes for student active batch list/detail and teacher enrollment list/student detail/batch detail, backed by strict bearer-bound role and account-status checks and Phase 1 RLS-scoped table reads. No new write grants or table dependencies.
- **Offline test gate:** 175 existing + new executable security and migration-readiness tests. Operator must confirm installer verification before marking this package verified.
- **Still NOT complete:** Full Shifat's Tales parity; pending/disabled users with live credentials; migrations/RLS live verification; storage/media, finance, exams, CMS authenticated APIs; teacher provisioning; production transaction/concurrency verification.
- **Migration gate:** `supabase/verification/core_api_integration_readonly_audit.sql` is read-only and has **not** been executed. No live database mutation, Git commit or push.
- Handoff: `docs/PHASE3_MEMBER_READS_AND_INTEGRATION_AUDIT.md`.

<!-- MUSA_TEACHER_OVERVIEW_PARTA_V1 -->
## Phase 5 / Part A â€” Teacher Overview: First Live Read API
Status: API IMPLEMENTED LOCALLY (when guarded installer passes); cloud/HTTP integration still pending.
Endpoint: GET /api/v1/teacher/overview. Fixed JWT-scoped six counts from profiles, batches, enrollments.
Teacher Overview page and remaining sections are NOT complete. Continue backend-first Phase 5, then Phase 6 Teacher Student Management.
See docs/TEACHER_ADMIN_OVERVIEW_API_HANDOFF.md.

<!-- MUSA_TEACHER_STUDENT_MANAGEMENT_PARTA_V1 -->
## Phase 6 / Part A — Teacher Student Management: Live Detail Read
Status: API INSTALLED LOCALLY after guarded verification; real cloud HTTP smoke test pending.
Endpoint: GET /api/v1/teacher/students/{studentId}/management.
Fields: verified active-teacher access, RLS-scoped student profile/account status and paginated enrollments.
Does NOT claim Student Management is feature-complete: new student provisioning, edits, bulk actions and UX wiring remain pending.
See docs/TEACHER_ADMIN_STUDENT_MANAGEMENT_PARTA.md.

<!-- MUSA_TEACHER_WRITE_COMMANDS_009_010 -->
### Teacher Student Profile + Enrollment Request (Phases 6 and 8)
Status: local APIs, SQL migrations 009-010, PostgreSQL rollback-only QA, tests and build verified.
Endpoints: PATCH /api/v1/teacher/students/{studentId}/profile and POST /api/v1/teacher/enrollment-requests.
Migrations 009-010 NOT deployed to cloud; cloud remains at 8/8.
Student creation/provisioning and Batch/Enrollment pages, cloud HTTP smoke tests and remaining parity are not yet complete.
See docs/TEACHER_ADMIN_STUDENT_PROFILE_WRITE.md and docs/TEACHER_ADMIN_ENROLLMENT_REQUEST_WRITE.md.
