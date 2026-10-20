# Coaching Management System — Backend Master Plan

> Source of truth for plan and implementation progress.

## Part W — Public Discovery and Accessibility (pending Windows verification, 2026-10-19)

- Latest **operator-verified** checkpoint: Part V Installed, **634/634 tests PASS**, lint 0 errors / 15 warnings, TypeScript PASS, Next.js production build PASS.
- This source-only package adds a section index and client-only search strictly from already-published CMS snapshots. Public search never contacts a database or external search provider and strips media IDs and published item URLs from the client search index.
- No migration change, `.env` change, Git operation, cloud request, or mutation-flag enablement. Signed JWT write E2E, private video upload, custom item icons, and editable global logo **remain pending**. The 27 existing SQL migration files are checksummed and untouched.
- This Part W delivery is **not** accepted until the guarded Windows installer passes all four verification commands. Earlier snapshot test totals below are historical and may be outdated.

## Part T — Student Learning Experience (delivery pending Windows acceptance, 2026-10-19)

- Latest **operator-verified** checkpoint: Part S Finance Studio install, **609/609 tests**, lint with 0 errors/16 warnings, TypeScript and Next.js production build PASS.
- Part T is a new frontend module, **NOT operator-verified until its Windows installer passes**. Source adds a StudentExperience component, a strict cookie-only client API adapter, and dedicated student screens for dashboard, batches, subjects/syllabus, routine, assignment text submission/own status, exams schedule, notices, results, progress, notifications, monthly statement/CSV, dues/payments, calendar and profile update.
- Existing Teacher Management, Teacher Academics, Teacher Finance and Website CMS entrypoints are preserved; do not enable public profile creation or direct SQL writes.
- Student assignment file upload, live MCQ timer, downloadable branded scorecards, private material download grants and password/email changes **are not completed** in this delivery; their backend contracts and independent JWT/storage E2E must be implemented before UI claims.
- Local DB readiness 38/38; real signed Teacher JWT read smoke PASS; simulated authenticated PostgreSQL role write with transaction ROLLBACK and zero residue PASS. **Signed-JWT PostgREST/HTTP writes, private media upload/public publication E2E and browser student identity isolation are NOT certified**. `COACHING_ENABLE_MUTATION_APIS` remains OFF; do not change `.env`, cloud SQL, DB/reset or Git.
- Maintain the original Phase 0–52 hierarchy below as authoritative; Part-letter UI deliveries do not close phases.

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

<!-- MUSA_TEACHER_CORE_PARTB_V1 -->
## Teacher Admin Core Management — Combined Part B
Status: FOUR production-bound read API routes implemented locally; real hosted JWT smoke tests pending.
- Student directory: status-filtered, bounded, active-teacher-only student profiles.
- Batch roster: verified batch, filtered enrollments and linked student profile projections.
- Batch occupancy: active/pending counts and informational remaining seats (write RPC owns capacity locks).
- Enrollment detail: enrollment, matching student profile and batch details.
- Supabase Cloud DEV currently at migrations 001–010 (operator verified previously); NO new SQL applied by this part.
- No original reference parity closure asserted; student provisioning, UI wiring, remaining management tabs and real hosted E2E remain pending.
- See docs/TEACHER_CORE_MANAGEMENT_PARTB.md.

<!-- MUSA_TEACHER_ACADEMIC_READS_V1 -->
## Teacher Academic Read Endpoints — Combined Delivery
Six teacher-only signed-JWT and RLS-scoped GET APIs: subjects, syllabus, routine, assignments, exams, results.
Verified: 251/251 automated Node tests, lint (warnings permitted), typecheck and production build.
Remaining: transactional academic write/publish/grade RPCs, student released-only projection and live signed-JWT HTTP QA.
No DB/cloud changes or Git push.

<!-- MUSA_TEACHER_ACADEMIC_TRANSACTIONAL_PARTC_V1 -->
## Teacher Academic Transactional Part C
- Six teacher-only audited, idempotent RPC write endpoints implemented: subjects, syllabus, routine, assignment draft, exam draft and draft marks.
- Local migrations 011–013 applied and rollback-only PostgreSQL QA passed; cloud DEV remains on first ten migrations.
- 264/264 tests, lint, typecheck and production build passed.
- Remaining: edit and publishing flows, grading publication and ranking, released-only student readers, UI integration and hosted HTTP E2E.
- Local feature-wise Git commits only; NEVER pushed.

<!-- MUSA_TEACHER_ACADEMIC_PUBLICATION_PARTD_V1 -->
## Teacher Academic Publish & Student Results (Part D)
- Teacher assignment/exam publish and atomic grade release with competition-rank tie handling.
- Student GET /api/v1/student/results shows only active owner enrolled and published results through a verified RPC.
- Local-only SQL migrations 014-016, real PostgreSQL rollback QA, 278/278 tests, lint, typecheck and build verified.
- Cloud DEV remains on migrations 001-010; next migrations 011-016 require explicit approval.
- Still pending: live signed-JWT HTTP smoke, assignment submissions/grades, module edits, UI and original feature parity.
- Three local feature-wise commits; no Git push.

<!-- MUSA_TEACHER_OFFICE_RESOURCES_FINANCE_PARTE -->
## Teacher Resources, Finance, Reports and Student Read Surfaces — Part E
- Added 16 protected signed-JWT read/report routes across teacher resources, student released-only content, teacher/student dues/payments, notifications, audit and finance reporting.
- Read-only PostgREST repository uses same verified bearer under RLS; no new migrations or direct client writes.
- Complete-only report uses explicit size caps and gross BDT minor-unit strings; does not imply a reconciled outstanding balance.
- Operator must verify 304 Node tests, lint, typecheck and production build before this milestone is accepted.
- Remaining: resource uploads/downloads, transactional payments/refunds, notification dispatch/read receipts, CSV exports, CMS/frontend parity and hosted signed-JWT E2E.
- Cloud DEV unchanged, no Git push.

<!-- MUSA_TEACHER_OFFICE_TRANSACTIONAL_PARTF -->
## Teacher Office Transactional Part F — Finance & Resources
- Added eight guarded audited write API endpoints (fee plan, monthly dues, payment, waiver, refund, announcement draft/publish and notification dispatch).
- Added local-only migrations 017/018, no direct client DML, verified teacher+receipt checks, row locks and immutable finance ledger entries.
- Require 320 tests, lint, typecheck, build, local PostgreSQL lint and rollback-only transaction QA before marking accepted.
- Still pending: verified storage uploads/materials publishing, correction/export, CMS, complete student portal, frontends and cloud signed-JWT smoke testing.
- Cloud DEV stays at 10 migrations. No environment mutations, DB reset, seed or Git push.

Student Portal Academic Part G: 7 verified, RLS-scoped GET endpoints (subjects, syllabus, routine, assignments list/detail, published exams list/detail); 340 Node tests. No SQL change. Student submission/auth UI and hosted JWT QA remain pending.

Student Portal Part H: 7 secured assignment and notification workflows, teacher draft grading/publish, 384 Node tests, two local migrations (019/020) with rollback-only PostgreSQL QA. Storage attachments, signed-JWT end-to-end and cloud rollout are pending.

Website CMS Core Part I: 9 protected teacher/public CMS APIs; draft page, ordered section/item, revision-locked audited publication and anonymous published-only snapshot. 405 Node tests; local-only migration 021 and PostgreSQL rollback QA. Storage uploads, global settings writes, Shifat's Tales exact field parity, frontend and cloud signed-JWT E2E are NOT complete.

<!-- MUSA_CMS_PARTJ_GLOBAL_SETTINGS -->
### Website CMS Part J — Global Settings, Page Archive and Public Navigation
Verified local CMS settings draft/publish, teacher-only revision locks, anonymous published-only navigation and archive; 424 Node tests, local migration 022 and rollback-only PostgreSQL QA. Media upload, exact Shifat's Tales field parity, frontend and cloud E2E are NOT complete. See docs/WEBSITE_CMS_SETTINGS_NAVIGATION_PARTJ.md.

<!-- MUSA_OFFICE_PARTK_CASHFLOW -->
### Part K — Teacher Office Expenses / Cashflow / Announcement Lifecycle (local-first)
Nine signed teacher API routes, two local-only migrations 023–024, immutable expense/reversal journal, transparent UTC cashflow and complete-only CSV, guarded announcement edits/archive, 474 Node tests and rollback-only PostgreSQL QA. UI/media storage, cloud migrations and Shifat's Tales exact field parity are NOT complete. See docs/TEACHER_OFFICE_FINANCE_RESOURCES_PARTK.md.

<!-- MUSA_STUDENT_COMPLETION_PARTL -->
### Part L — Student Portal Dashboard, Profile, Billing, Calendar and Progress
Seven student-only signed JWT routes, two local-only migrations 025–026, per-student billing reconciliation, published-only grade aggregation, student self-profile edit with idempotency/audit, local rollback QA, 522 Node tests. Password/Auth reauthentication, media, complete frontend, cloud deploy and exact Shifat's Tales parity remain pending. See docs/STUDENT_PORTAL_COMPLETION_PARTL.md.

### Combined Part M handoff — verified private CMS media + responsive public website (2026-10-19)

- Base: exact committed `MusaSir_Current_Source_After_PartL.zip`; last verified local HEAD `8a70d6afd7`, 26 migrations and 58 local commits.
- Adds migration `20261019000500_cms_verified_private_media.sql`, private Storage/RLS, upload registration, media attachment, safe public image serving, and snapshot-based responsive homepage/section rendering.
- Published page images require registered Storage object, metadata match and archive locks; raw storage keys never enter public page DTOs. Legacy blanket media publication denial is replaced by **verified** publication checks.
- Requires Windows Node suite, Next.js lint/typecheck/build and real local PostgreSQL rollback-only QA before feature commits; any real Storage HTTP/JWT E2E remains a separate pre-production acceptance gate.
- Premium visual handoff: navy/jade/ivory/warm-gold, familiar information structure but distinctly upgraded brand treatment, app-like mobile usability; teacher/student/CMS authenticated application shells remain scheduled for Part N.
- **OPEN**: original Shifat's Tales per-section field mapping (must not claim parity), media image decoder hardening, teacher draft preview, orphan cleanup, browser Auth workflow, upload of receipts/materials, PDF reports, cloud deployment, production security review.
- This entry does not mark Phases 34–52 complete or modify the roadmap hierarchy.


## Part N — authenticated responsive workspace delivery (2026-10-19, package NOT INSTALLED)

- **Baseline evidence:** `MusaSir_Current_WORKTREE_02a33e805040_20261019-040612.zip`; `.git` metadata reports `feature/p00-foundation` / `02a33e805040b334c0b6718244ed5ad9bf0322a9`. This is a worktree snapshot; commit/index cleanliness and installed DB state remain unverified. Part M private media and public website source is present, 27 SQL migration source files included.
- **Payload:** real-data Teacher/Student portal screens, credential login using Supabase Auth + active RLS profile check, server-only HttpOnly access cookie, CSRF-guarded existing API routing, CMS page/item/section/media editor, mobile app shell, existing Part J archive route repair; documentation and focused security tests.
- **Existing backend untouched:** Auth `/user` validation, role profile, RLS, idempotent RPCs, media validation, and default-OFF mutation gate. No new migrations, SQL cloud changes, credentials, `.env` edits, database reset, Git push, or automatic local commit.
- **Isolated verification:** 6/6 new security tests pass; TS/TSX syntax transpilation succeeds. Full dependency-backed ESLint/tsc/Next build and real JWT/Storage E2E **not verified in this sandbox**; Windows guarded installer performs them before accepting.
- **Still open:** complete Teacher CRUD forms, Student submission browser UX, CMS settings/media draft preview, token rotation/refresh, page-by-page functional parity, accessibility and local Auth/Storage E2E. **Do not mark phases 5–52 as completed** from a frontend shell alone.
- See `docs/PREMIUM_PORTAL_PARTN_HANDOFF.md` for acceptance matrix, deployment caveats, and known gaps.


### Part N reference parity + lint-safe installer repair (pending operator acceptance, 2026-10-19)

- Reference source audit: `docs/SHIFATS_TALES_REFERENCE_PARITY_PARTN.md`. Reference 137 frontend page routes vs current baseline 2; this is a route-inventory comparison, not a completion percentage.
- Repair package fixes Part N CMS initial effect lint regression and ignores only historical untracked `payload/**` and `installer.cjs` staging for ESLint; TypeScript excludes historical `payload` staging. No application module or mutation flag regression intended.
- Operator still must successfully install and verify Node suite, ESLint, TypeScript, Next build and manually test Auth and Storage E2E. This entry **does not** declare Part N complete.

<!-- MUSA_PARTO_TEACHER_MANAGEMENT_UI -->
### Part O — Teacher Management Operational UI (2026-10-19, acceptance pending)
- Built dedicated Teacher Students/Batches/Enrollments operation screens using approved backend API paths and current Part N authenticated browser proxy; no direct browser SQL or service-role access.
- Student full-name/status transitions; batch create/name/capacity/archive; enrollment request/approve/reject/cancel, bounded lists/status filters, confirmation for access-impacting actions, mobile layouts and error/empty/loading states.
- **Student account provisioning is NOT present**: requires approved Auth/invite backend first; no database profile-only user creation. Current mutation feature flag stays OFF and SQL/JWT write E2E is still pending.
- No migrations, cloud SQL, `.env` modifications, Git push, or implicit activation. Windows test/lint/typecheck/build installer acceptance required before marking source installed. See `docs/TEACHER_MANAGEMENT_PARTO_HANDOFF.md`.

### Part P — Website Admin Studio + dynamic public presentation (delivery candidate; Windows install pending)

- **Scope:** Extend the real Part N/O Teacher-authenticated CMS into a task-specific Website Admin Studio (pages/SEO, global text settings, section upsert, item upsert, visibility, verified image upload/attachment and separate publish/archive) plus local draft preview and accessible motion-enhanced public hero.
- **Security:** Browser commands use same-origin cookie-authenticated proxy and existing teacher JWT/RLS/RPC; UUID idempotency, `x-musa-ui` marker, revision-checked writes. No service-role browser use, no migration, no cloud SQL and no mutation flag enablement.
- **Media:** Existing private Supabase Storage remains canonical. Local draft preview does not request private unpublished images. Cloudinary is optional for future public video delivery, not an auth/storage replacement.
- **Reference parity:** This is a usable generalized content studio, **not** full Shifat's Tales per-section typed-field, logo, icons, video or page-by-page editor parity. Each additional field requires explicit DTO + migration + RLS/RPC + tests, then UI.
- **Acceptance:** New client contract tests, Node suite, lint, typecheck, production build and guarded Windows installer verification; local signed-JWT/Storage E2E remains pending. Do not mark complete until operator output confirms install and smoke tests.
- **Next milestones:** (1) Local mutation/RLS acceptance and safe student onboarding; (2) Teacher Academics deep CRUD; (3) Teacher finance/office/report/export UI; (4) Student interactive learning flow; (5) CMS field-by-field parity including media/icons/videos; (6) immersive public website and page parity; (7) final real Auth/Storage E2E, accessibility/security and deployment. Batch milestones where dependencies allow; 7–8 user turns is a delivery target rather than a quality or calendar guarantee.

### Part Q — Read-only local integration acceptance (package pending Windows install, 2026-10-19)
- Part P verified by Windows operator: 572/572 tests, ESLint 0 errors (16 warnings), typecheck PASS, production build PASS. This is source/build acceptance, not CRUD write E2E.
- Adds local-only, read-only RLS/RPC/grant/private bucket/migration catalogue checking and optional signed Teacher1 JWT → Auth `/user` → RLS profile read. No state or flags changed.
- Q does not activate any mutation gate. Real transactional writes and student provisioning remain blocked until explicit local security acceptance and approval. See `docs/LOCAL_READINESS_PARTQ_HANDOFF.md`.

### Part Q2 — Local rollback-only SQL transaction acceptance (optional proof, 2026-10-19)
- Windows Part Q/AuthSmoke v1.1 verified: 583/583 tests, lint 0 errors, typecheck/build PASS, real local signed Teacher JWT and RLS profile access PASS.
- Delivered optional local `RUN_MUSA_PARTQ_TX_ROLLBACK.ps1 -RunRollbackProof` with read-before/read-after zero-residue checks; `coaching_create_batch` + idempotent replay + update + CMS page.create + forged-actor denial + audit/receipt assertions execute exclusively inside one PostgreSQL BEGIN/ROLLBACK transaction.
- **Limits:** This simulates PostgreSQL `authenticated` SQL role and `auth.uid()` using the validated local teacher record; it does NOT perform real JWT-bearing PostgREST/Next write HTTP E2E. Default mutation flag stays OFF, no cloud SQL, DB reset, secrets/env changes or Git push. See `docs/LOCAL_Q2_ROLLBACK_PROOF.md`.

### Part R — Connected Teacher Academic Studio (2026-10-19)

- [x] Add a reusable, contract-validated client for subject, syllabus, routine, assignment, exam and result CRUD-adjacent draft commands and publication through existing secure REST/RPC routes.
- [x] Integrate a premium responsive six-step Academic Studio into authenticated Teacher Portal with batch/subject/exam scoping, active roster, validation and fail-closed errors.
- [x] Keep public CMS, Teacher Management and Student Portal intact; preserve cookie/CSRF/JWT/idempotency boundaries and default-OFF write switch.
- [x] Add focused Part R client-contract regression tests (sandbox); production full build remains a Windows-installer acceptance gate.
- [ ] Local Windows Part R installer: npm test/lint/typecheck/build.
- [ ] Real signed-JWT HTTP write E2E and independently approved activation of any local write switch (not in this package).
- [ ] Remaining full Shifat's Tales parity, Teacher Finance workflow polish, Student interactivity, CMS icon/video parity, premium website hardening and end-to-end release QA.

Source details: `docs/TEACHER_ACADEMICS_PARTR_HANDOFF.md`.

### Part S (2026-10-19) — Teacher Finance Studio delivery, local source verification pending

- Installed Part R was operator-verified: 598/598 tests, lint 0 errors, TypeScript and production build PASS; mutations stayed disabled.
- This Part S package adds connected Finance Studio views for cashflow, fee plans, student dues/payments/waivers/refunds, expenses/reversal and complete-only CSV exports, with exact existing endpoint mapping. No schema or authorization changes.
- Finance client validates BDT-to-paisa using integer arithmetic, strict UUIDs and parent IDs, operation receipts and CSRF marker. Server-side JWT, RLS, RPC and audit protections remain authoritative.
- Part S sandbox Node/contract tests pass; **Windows test/lint/typecheck/build and real browser writes are unverified** until operator log confirms. The actual local PostgreSQL transaction proof from Q2 was simulated authenticated role + ROLLBACK, not real JWT HTTP writes.
- Next: secure live-JWT HTTP write E2E in an approved **isolated local** environment, student interactive journeys, media and typed CMS parity, public-site experience and final security/production QA. Never silently activate production mutations.

### Part U — Website editorial rendering and CMS composition UX (2026-10-19; Windows install pending)

- **Baseline:** Part T v1.1 operator log confirmed **620/620 Node tests**, ESLint 0 errors (16 prior warnings), TS and Next.js build PASS. Real HTTP mutation E2E remains pending; global mutation switch OFF.
- **Frontend:** CMS publication snapshots render 15 existing kinds with distinct responsive public presentation and published home metadata; dynamic hero photos and CTA labels/HTTPS links are CMS-owned; global tagline, brand and footer are from published global settings.
- **Admin:** Added section blueprints and editorial readiness hints using only the existing strict `section.upsert` DTO; no new fake input fields or permission bypass.
- **Integrity:** Part U adds **no** SQL migration and changes no RPC/auth/storage code. Existing 27 migration source hashes are installation guard dependencies. Public image route remains gated by published metadata and verified media assets.
- **Limits:** Per-item custom icon, video upload/CDN, global logo, typed reference-only content models, assignment files, attendance, live MCQ, result PDFs, live JWT write HTTP E2E and deployment hardening are NOT complete. Future additive schema and E2E are mandatory; see `docs/WEBSITE_EDITORIAL_PARTU_HANDOFF.md`.
- **Acceptance:** Windows installer must pass Node tests, ESLint, typecheck, Next build before this code is marked installed. No `.env`, cloud SQL, Git, migration source, data reset or mutation flag changes.

### Part V — Published video-link presentation (2026-10-19)
- **Scope:** reuse exact approved CMS `item.url` HTTPS link field to display published YouTube links as consent-to-load responsive cards on public pages. New allowlist/ID parser shared with CMS editor; no new CMS fields, SQL, RPC or Storage policy. Optional existing published logo ID displays through same-origin public media gate; **logo editing remains unsupported**.
- **Verification:** new parser/host injection and iframe-gating unit tests plus full Node regression; Windows test/lint/typecheck/build required by guarded installer.
- **Not done:** uploaded video file pipeline, editable per-item icons/global logo, dedicated parity fields, and real JWT HTTP mutations. No cloud SQL, `.env`, Git, DB reset or mutation flag activation.
- **Next:** explicit operator approval for additive schema/API design and real authenticated local write E2E; do not treat link-based video as uploaded-video parity.

## Part X — Hosted DEV Reference-Aligned CMS Demo & Dimensional Public Website (2026-10-20)

- **Delivery status: source package prepared; Windows guarded install and hosted seeding remain pending user execution.** Do not mark hosted CMS seeded or production-ready before cloud verification.
- Hosted `musa-sir-coaching-dev` user-confirmed batch Create → Edit → Refresh was independently verified by read-only cloud query on code `MUSA-DEMO-01`, capacity `35`.
- Signed Teacher seed targets **exact** Hosted DEV project `rkpwqgwceekuvlizfpeb` and `effytechbd@gmail.com` using existing `coaching_cms_write` and `coaching_cms_settings_write` RPCs, checks empty CMS and revisions, publishes 12 demo-labeled pages and settings, and verifies anonymous public snapshots. No service-role bypass, new migration, Auth changes, `.env` changes, mutation flag activation or Git push.
- Public reference inventory: Home, About, Courses, Gallery, Results, Reviews, News/Events, Materials, Academic Calendar, Class Routine, Projects, Contact. CMS schema remains generic (no claim of typed field parity). Illustrative data is **clearly labeled DEMO**; no fabricated official scores, testimonials, qualifications, dates, media or private materials.
- Distinct midnight/iris/champagne site design uses CSS-only perspective and layered 3D animation from CMS-sourced site branding; reduced-motion support, no dependencies, no WebGL requirement.
- Acceptance pending: Windows lint/typecheck/build, real signed CMS seed HTTP E2E, public media uploaded with approved content, student Auth and workflows, browser QA and deployment.

## EduCentre Part AB — current-source incremental repair (20 Oct 2026)

From user-provided `coaching(1).zip` and `Shifats-Tale(1).zip`: EduCentre visible rebrand fallback, active-Teacher-only CMS write-status GET, guarded local write launcher, signed Teacher CMS settings publish + optional academic demo seed, and published-page revision polling. Added negative gate tests. Source-level tests PASS; Windows lint/typecheck/build and cloud WRITE E2E pending. This is **not** a completed parity milestone. Full reference typed-field mapping, featured relation workflows, live student/finance acceptance, media attach/public bytes and Supabase Realtime push remain open. See `docs/EDUCENTRE_PARTAB_FUNCTIONALITY_AUDIT.md`.
