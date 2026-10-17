# Phase 3 — operational service boundary (offline)

This package adds an executable orchestration service for create/list/get/update student, student status changes, create/update/list batch, enrollment request/decision/list. The service validates commands, actor claims, pagination and immutable safe patches. All operations require an injected port. Without a configured production port **no persistence occurs** and writes reject.

A **test-only memory port** checks happy paths, forbidden access, duplicate requests, state transitions, batch capacity, rollback on simulated transaction failure, and audit emission. It is **NOT a production repository or Supabase replacement**. Identity verification is not implemented; `verified: true` is only supplied by the test harness, and must NEVER be sourced from request JSON.

Production completion gates: verified Supabase auth from server session; RLS; migrations for student status and child profiles; transaction-safe RPCs with DB-side authorization, row locks, idempotency, unique enrollment constraints, durable append-only audits; wired protected routes; Postgres integration tests. These are deferred and cannot be represented as completed.

Original Shifat's Tales parity register remains in docs/SHIFATS_TALES_BACKEND_PARITY_MATRIX.md; all other teacher/student/CMS workflows remain pending.
