# Phase 1 — Parts B–D (combined local package)

## Implemented
- Minimal server-only typed Supabase read adapter (native fetch, no new dependencies).
- Read-only domain repository for profiles, batches, and enrollments.
- User JWT passed explicitly; RLS remains authoritative; no service-role key.
- Bounded queries, UUID checks, timeouts, uniform non-sensitive HTTP errors.
- Read-only SQL catalog verification script for the Part A migration.
- Static tests for the added components.

## Not completed / deliberately excluded
- Live Supabase DB verification (requires your Supabase project and migration already applied).
- Official Supabase JS SDK and cookie/session auth integration (package registry unavailable during build).
- Enrollment transactions, permission elevation, auth lifecycle, write repositories (Phase 2 and later).
- Zero-knowledge RLS isolation tests with actual JWT roles (must be run against isolated Supabase).

## To verify remote database WITHOUT changing it
Use `supabase/verification/phase1_verify.sql` in the Supabase SQL Editor and verify the query succeeds.
This script checks catalog permissions and RLS flags, not real teacher/student session isolation.
**Do not** apply Part A migration twice and do not run against an existing unrelated database.

## Important
The read adapter is SERVER-ONLY; call from trusted server actions after validating
session tokens using your later auth integration. Never pass browser-provided role claims
or leak user access tokens into logs. This package makes no production deploy or remote DB changes.
