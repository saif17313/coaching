# Coaching Management System — Backend Master Plan

> Source of truth for plan and implementation progress.

## Current Progress

```text
CURRENT PHASE:   PHASE 0 — Repository + Engineering Foundation
CURRENT PART:    Part A — Repository Bootstrap
STATUS:          COMPLETED LOCALLY WHEN APPLY.ps1 PASSES
BASELINE BRANCH: main
NEXT DEV BRANCH: feature/p00-foundation
PUSH STATUS:     NOT PUSHED
NEXT:            Phase 0 / Part B — Engineering Standards + CI + Shared Config
```


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
