# Teacher Office — Transactional Part F (local-only)

Provides **8 new authenticated teacher write APIs** with transaction-safe PostgreSQL SECURITY DEFINER functions and receipts:

| Action | POST route | Fields |
|---|---|---|
| Fee plan create | `/api/v1/teacher/batches/{batchId}/fee-plans/create` | `period`, `amountMinor`, `dueOn`, `label` |
| Monthly dues generate | `/api/v1/teacher/fee-plans/{planId}/dues/generate` | Empty JSON object `{}` |
| Payment post | `/api/v1/teacher/dues/{dueId}/payments/post` | `studentId`, `amountMinor`, `method`, `reference` |
| Due waiver | `/api/v1/teacher/dues/{dueId}/waive` | `amountMinor`, `reason` |
| Payment refund | `/api/v1/teacher/payments/{paymentId}/refund` | `amountMinor`, `reason` |
| Announcement draft | `/api/v1/teacher/batches/{batchId}/announcements/create` | `title`, `body`, `visibleFrom` (ISO UTC string or `null`) |
| Announcement publish | `/api/v1/teacher/announcements/{announcementId}/publish` | Empty JSON object `{}` |
| Batch notifications | `/api/v1/teacher/batches/{batchId}/notifications/dispatch` | `eventId`, `title`, `body` |

All POST requests require `Authorization: Bearer <access JWT>`, `Idempotency-Key: <UUID>` and `Content-Type: application/json`. Money is strictly integer BDT minor units (paisa); no floating-point math. The feature flag `COACHING_ENABLE_MUTATION_APIS=enabled-after-db-verification` remains **OFF by default**; never auto-enable.

**Security:** Active teacher verified twice (HTTP `/user` + database function); receipt replay demands identical actor/action/payload. Payment/waiver/refund lock the batch and due row, bound payment/refund amounts, and create append-only entries. All financial operations, audit logs and idempotency receipts are committed atomically. Direct client table writes remain disallowed. Notifications are in-app only and recipient-scoped; a dispatch event cannot be reused under a different operation. A material upload/publish API is intentionally **not** included until verified Supabase Storage ownership and signed URL delivery are built.

**Operator acceptance:** All 320 Node tests, lint (existing warnings allowed), typecheck, production build, LOCAL migrations 017/018, local PostgreSQL lint, and rollback-only signed-role PostgreSQL QA must succeed before the 3 local feature-wise Git commits. No cloud migration, deploy, seed, reset or push. Cloud DEV currently has migrations 001–010; local has 001–018 after install. Hosted signed-JWT smoke tests and complete frontend/CMS parity still pending.

**Operational boundary:** Do not use finance write endpoints against Cloud DEV while migrations 017/018 are absent. Schema deployment needs separate explicit approval and review. Real operations also require the existing mutation flag to be intentionally enabled only after DB verification. QA fixture transaction rolls back completely.
