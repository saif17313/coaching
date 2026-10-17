# Phase 3 — Payments, Monthly Dues, Reports & Audit (offline package)

## Delivery and coverage
- `src/server/services/finance-ledger.mjs` is executable service orchestration. It does NOT talk to Supabase, establish a user session, or implement production persistence.
- Fee plan creation; one monthly due per enrolled student, batch, and period (transaction adapter responsibility); request idempotency via `operationId`.
- Payment posting, partial payment, waiver, refund and explicit compensating correction. Immutable original payment and append-only adjustment model.
- Money represented only in safe-integer **BDT paisa**; no binary floating point arithmetic or currency conversion.
- Outstanding balance = billed - posted payments - correction delta - waivers + refunds. The DB adapter MUST lock relevant rows and compute totals from the append-only entries.
- Bounded student-visible payment history; teacher batch/period report with defensive row scope checks; CSV escaping for spreadsheet formula injection; guarded audit listing.
- Mock transaction tests include invalid inputs, IDOR, duplicate commands, rollback on failed audit, payments larger than outstanding, double refunds, corrections after refund, and CSV formula payload.
- `supabase/migrations/20261016000300_finance_ledger_offline.sql` is an **unapplied** PostgreSQL/Supabase draft. SQL shape tests are NOT DB integration tests.
- This package also removes one `no-unused-vars` warning in the previously installed resources integration test without changing mock behavior and adds an honest checkpoint to `BACKEND_MASTER_PLAN.md`.

## Trust boundaries / production blockers
1. **Supabase setup is deferred by operator decision.** Do not run migrations, authenticate fake actors, or expose real payment mutations over HTTP.
2. `actor.verified` can ONLY be sourced from a server-verified Supabase Auth user. It cannot be provided by request JSON, JWT decode without verification, localStorage, or editable profile metadata.
3. The production adapter must: (i) re-verify teacher permissions and enrollment, (ii) lock fee plan, due, payment, and idempotency rows in a deterministic order, (iii) persist all entries + audit in the same ACID transaction, (iv) reject mismatched operation-id reuse, (v) enforce unique due per student/batch/month and cross-table relationship constraints, (vi) handle retries and concurrent requests safely, (vii) NEVER update or delete posted financial entries.
4. `financial_operations` acts as an idempotency anchor. Direct authenticated user writes to new tables deliberately have no grants/policies. Transactional privileged RPC has **not** been written, security-reviewed, deployed or tested.
5. The SQL draft still needs relational invariants at the database layer: plan/due batch linkage, due student enrollment at generation, payment due/student relation, payment-adjustment cross-references, and sum constraints under locks. These are adapter/RPC requirements, NOT fully enforced in this migration.
6. The SQL draft references `public.profiles`, `public.batches`, and `public.current_user_is_teacher()` from Phase 1, plus `public.audit_logs` from the resources migration. Validate schema objects, RLS, grants, FK ownership, and policy recursion in an isolated test database before applying.
7. No fiscal compliance, receipt numbering, external payment gateway, reconciliation, refund execution, currency exchange, actual cash disbursement, withholding tax, bank settlement, SMS/email, or PCI integration is included. Application-layer refund is an accounting entry, not a bank transfer.
8. Original Shifat's Tales full finance parity is NOT claimed. Need full real source audit for admin payment tables, correction semantics, receipt/reconciliation behavior, filters and student visibility, then compare exact routes/sections to services.
9. Reports and CSV endpoint are **services only**, not protected Next.js HTTP routes. Production rate limiting, file encoding, CSV download headers, query authorization and export size bounds require API implementation.

## Verify and apply safely
From project root after extraction:
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\APPLY_PHASE3_FINANCE.ps1`
Installer: strict Git HEAD + exact dependency hashes, payload integrity, guarded update hashes, rollback of added files + warning/master-plan edits on failure, structure/tests/lint/typecheck/build. Does not run SQL, push, commit or call remote systems. Existing `.env`, `.git` and other files are untouched.

## Next ordered work
Teacher account/profile/settings; academic routine and assignments; missing original CMS and student-facing service parity; secure authenticated HTTP routes + Supabase adapters and RLS integration after explicit approval to connect DB. Teacher finance service integration is NOT a replacement for those modules.
