# Shifat's Tales → Coaching backend parity register

Source: original Shifat's Tales targeted source manifests and build-route snapshots supplied during this project. This is a baseline of **confirmed categories**, not a claim that every section has been inventoried. Latest new-project local confirmation: Phase 3 domain installer passed 22 tests, lint, typecheck, build (reported by operator).

| Area | Original evidence | New project state before this package | Acceptance for parity |
|---|---|---|---|
| Auth & account gates | register/login/recover, pending approval, disabled | fail-closed interface | authenticated sessions, safe account state transitions, routing and integration tests |
| Teacher student listing/detail/edit | `/teacher/students`, `[studentId]`, edit | interfaces only | persisted listing, detail, guarded update, IDOR tests |
| Teacher student payments | `/teacher/students/[studentId]/payments` | not built | payment history, filters, access tests |
| Batch management | teacher batches list/detail/new/edit + batch students | capacity/validation only | create/edit/archive/list, capacity concurrency test |
| Enrollment | `/teacher/enrollments`, student batch membership | transition rules only | approval/rejection atomic and audited, correct student visibility |
| Academic | original teacher academic/subject/routine scope described in later roadmap | subject/unit validation only | subjects/units/routine/assignments persisted with constraints |
| Exams/results | teacher exam lifecycle, result draft/publish, student views | pending | atomic publish and ranking tests |
| Materials | batch materials + secured download API | pending | storage rules, entitlement checks, signed access |
| Payments | batch/student payment pages, monthly dues | pending | ledger/dues and valid payment transitions |
| Notifications/announcements | student notifications, batch announcements | pending | targeting, persistence, read/access |
| Reports/audit | teacher reports/export, audit logs | pending | filter validation, CSV injection defense, durable append-only audit |
| Website CMS | teacher website page controls, public consumers | pending | publish/version/permissions, safe media references |
| Student Portal | student dashboard, batches, exams, results, materials, payments, profile, security | pending | each endpoint and authorization state tested |

## Definition of Done
1. Route/section-to-service mapping exists and matches reference behavior or has an approved documented deviation.
2. Real service/repository/database implementations exist (not just interfaces), with input validation and authorization.
3. Transactional invariants are enforced at the database boundary, not only through pure JavaScript checks.
4. Automated unit, integration, RLS, and negative tests pass in an isolated environment.
5. Live Supabase setup is **deferred by user request**. No database-backed feature will be labeled deployed or fully verified until real integration.
6. Keep master plan authoritative; update checked progress only after milestone-level acceptance.

## Current delivery
This package adds executable, pure domain invariants for student patching, account status, duplicate enrollments, batch activation capacity, ownership and a fail-closed atomic enrollment port. It does **not** add unprotected HTTP endpoints, fake persistence, database migrations or mark any full module complete.
