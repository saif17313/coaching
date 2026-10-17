# Phase 3 — Learning Resources + Notifications (offline handoff)

## What was implemented (NOT production-enabled)

- Executable workflow services: `src/server/services/learning-resources.mjs`.
- Teacher material draft creation, metadata updates, publish, archive. Student listing requires *active* batch enrollment and only published/released rows; attempted leaky adapter responses are rejected.
- Short-lived signed-material-grant **contract** with explicit HTTPS host allowlist, maximum 60 second expiry and adapter-side authorization obligations. **No actual storage implementation or upload process.**
- Teacher announcement draft/create, publish, archive; student list requires active enrollment and release time.
- Batch notification fanout contract for active students with `eventId` idempotency, owned listing and idempotent read receipt.
- Test-only transactional in-memory port that clones state for rollback; tests cover authorization, visibility, unsafe grants, invalid input, ownership, idempotency and audit expectations.
- A **not-applied** SQL migration for `batch_contents`, `announcements`, `notification_dispatches`, `notifications`, `audit_logs`; RLS policy draft and read-only SQL review queries.

## Critical deployment blockers

1. Supabase/Auth project not connected (intentionally deferred by the user). `actor.verified` may only come from server-verified auth, NEVER request JSON or user metadata.
2. No production transaction adapter, RPC, row-locking or real database migrations applied. On missing ports, writes/read operations fail closed.
3. Database migration has **not** been tested against a running Supabase PostgreSQL instance. Review syntax, grants, RLS, indexes and security-definer functions before applying.
4. Secure file storage not provisioned: upload ownership, virus/size checks, storage bucket RLS, short-lived URL signing, revoke behavior, cross-tenant object path checks remain pending. Material `upload_id` is a reference placeholder pending a verified upload asset table. A mere signed link cannot undo leaked file content.
5. Notification dispatch queue, email/SMS/push delivery, reliability, retries and delivery receipts are **not** implemented. This package only models in-app records.
6. SQL audits are modeled but no real production writer or append-only database mechanism has been implemented. Test-only audit is not compliance-grade.
7. Original Shifat's Tales full materials management, file download API, movement between batches, announcement editing, admin messaging, UI pages, student notifications and activity tracking not completed.
8. No protected HTTP API route, UI, upload component, live RLS check, live transaction integration, or Git commit/push.

## Compatibility / source-of-truth rule

Scope is derived from reference snapshots of Shifat's Tales (admin materials / announcements / notifications + student consumption), but is NOT a claim of full source parity. `BACKEND_MASTER_PLAN.md` remains the source-of-truth roadmap. Reconcile this handoff with that tracker after review; do not silently mark its higher-level feature rows complete.

## Verification

`npm test` must discover the new `.test.mjs`; `npm run lint`, `npm run typecheck`, and `npm run build` must pass. In addition, `tests/learning-resources-migration-shape.test.mjs` enforces coarse migration constraints (not SQL execution). Tests explicitly do not validate a real database or external storage provider.
