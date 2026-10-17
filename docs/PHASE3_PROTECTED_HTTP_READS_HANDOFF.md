# Phase 3 — Authenticated HTTP Read API Handoff (offline integration)

## What is actually implemented

Four concrete Next.js App Router `GET` handlers, all `/api/v1`, are wired through a reusable security boundary:

| Route | Authorized role | Data source | Server-side filter |
|---|---|---|---|
| `/api/v1/student/me` | student | `profiles` | `id=eq.<verified-user-id>`; one row |
| `/api/v1/student/enrollments` | student | `enrollments` | `student_id=eq.<verified-user-id>`; limited list |
| `/api/v1/teacher/students` | teacher | `profiles` | `role=eq.student`; limited list |
| `/api/v1/teacher/batches` | teacher | `batches` | limited list |

### Request lifecycle

1. Validate GET query allowlist and page bounds (`limit` 1–50, `offset` 0–10000; `/me` accepts no query).
2. Require exactly one syntactically valid Bearer JWT header; reject cookie-only requests.
3. Call Supabase Auth's `/auth/v1/user` endpoint over HTTPS with user token and anon/publishable key, with timeout, redirects disabled, and `no-store` caching. **Local JWT decoding is not verification.**
4. Query `profiles` with the **same verified user token** under PostgreSQL RLS. Determine teacher/student role ONLY from that database row; never from JWT claims, client JSON, or signup metadata.
5. Authorize the requested route against the verified database role; restrict every read to table/query allowlists, specific columns and bounded pages.
6. Validate returned records and reject extra columns, inconsistent student ownership, malformed rows, duplicate IDs, or unexpected row counts; return sanitized `success/error` JSON with private no-cache headers.

`src/server/http/production-read-adapter.ts` wires the security boundary to `readSupabaseRows`. The previous Phase 1 REST adapter receives one narrow, explicit query-allowlist change: `role` is permitted for teacher student-list filtering. No mutation paths, SQL execution or service-role keys are added.

## Known limitations — DO NOT label fully production-ready

- Supabase project has **not** been created or connected. These routes will return **503** (fail closed) until properly configured; no live database or RLS tests have been run.
- The foundational `profiles` schema contains `id`, `role`, and `full_name` but **no account-approval/disabled status**. Original Shifat's Tales pending/disabled-account behavior cannot yet be enforced by these routes. Do not enable as production-facing endpoints until the reviewed account lifecycle schema and guards are integrated.
- Teachers still have no transactional CRUD API; enrollment approval, exams, finance and CMS writes remain disabled. Student list is a bounded read only.
- Session refresh, password reset, MFA, cookie session mode, signed download endpoints, per-IP/API throttling, E2E tests and complete feature parity are pending.
- Existing SQL migration files are **drafts** and have not been applied. This package makes no DB calls during installation.
- Self-hosted Supabase Auth is intentionally unsupported by the initial HTTPS `*.supabase.co` verification adapter. The origin allowlist must be explicitly reviewed for any custom deployment.

## Test coverage

The new `tests/protected-read-api-integration.test.mjs` executes the request gateway against injected fake verified identities and fake RLS-scoped repositories. It checks authenticated reads, filters, role separation, invalid JWT, query injection, field leaks, IDOR, malformed output, errors, metadata spoofing, SSRF-host restrictions and no-store headers. These are local mock tests, not live Supabase verification.

## Required before production

1. Apply reviewed migrations to a safe Supabase project; reconcile original `student_profiles` / account approval / disabled gates, unique constraints and RLS policies.
2. Create a real teacher through trusted provisioning, not signup metadata. Verify Auth `getUser` and profile role match for both student and teacher.
3. Test RLS read/write boundaries and account-state guards using real identities, expired tokens, revoked users, disabled students and disabled teachers.
4. Add atomic RPC/transaction adapters and protected write APIs separately; no service-role database bypass from user-controlled endpoints.
5. Run Next.js E2E, auth, schema migration, rate-limit and security tests, then perform section-by-section original Shifat's Tales parity review.

Installation only: no Git commit/push, no database or remote deployment.
