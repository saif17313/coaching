# Shifat's Tales finance / reporting delta — reference inventory

Original evidence available in project snapshots:
- Teacher `/teacher/payments`, `/teacher/payments/new`, `/teacher/payments/[paymentId]`.
- Teacher `/teacher/students/[studentId]/payments`, `/teacher/batches/[batchId]/payments`.
- `/teacher/reports`, `/teacher/audit-logs`, `/api/reports/export`.
- Student `/student/payments`, `/student/batches/[batchId]/payments`.
- Backend `src/app/actions/payments.ts` with monthly due generation, manual overrides, partial/paid/unpaid/refund/waiver/correction flows; `src/app/actions/profiles.ts` changes need audit.

| Required parity workflow | Current finance package | Gap to close |
|---|---|---|
| Fee plan and monthly dues generation | Executable service + mocked atomic generation | DB RPC, active enrollment check, real validation, edits/history |
| Teacher post/manual payment | Executable mock service, overpay and relationship validation | Real repository, protected route, receipt/payment gateway reconciliation |
| Partial/paid/unpaid balance | Minor-unit amount, outstanding calculation | Derived status, real reconciliation, original status equivalence |
| Waiver, refund, correction | Executable compensating ledger events | Privileged transaction RPC, real-money refund mechanism, staff permissions |
| Student own payment views | Defensive service + negative IDOR test | Supabase RLS and app routes |
| Batch and student reports | Filtered service + CSV anti-injection | Report API, filters, pagination, aggregation, dashboard |
| Audit logs | Atomic adapter expectation + audit list | Append-only audited DB writer, retention, admin APIs |

**No line is fully production-verified.** Source code route/section comparison and Supabase-backed end-to-end tests are required for parity signoff. Track final acceptance in BACKEND_MASTER_PLAN.md.
