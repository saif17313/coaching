# Part K — Teacher Office Expense Ledger, Cashflow Exports & Announcement Lifecycle

## Delivery scope (backend only)

This is a **large combined backend milestone**, not a claim of exactly 10 percentage points of completed product work. The authoritative 52-phase roadmap remains in `BACKEND_MASTER_PLAN.md`. Do not mark the frontend, cloud or end-to-end acceptance as complete.

### API contract

All routes under `/api/v1`, require verified **active teacher bearer JWT** (not claims from `user_metadata`). No caching. Only four POST routes use `Idempotency-Key: <UUID>` and the existing `COACHING_ENABLE_MUTATION_APIS=enabled-after-db-verification` gate (normally OFF):

| Method | Route | Purpose |
|---|---|---|
| POST | `/teacher/batches/:batchId/expenses/create` | Post immutable BDT minor-unit cash/bank/mobile expense |
| POST | `/teacher/expenses/:expenseId/reverse` | Full compensating reversal, original posting untouched |
| GET | `/teacher/batches/:batchId/expenses?period=YYYY-MM&limit=20&offset=0` | Bounded teacher expense journal, posted UTC period |
| GET | `/teacher/expenses/:expenseId` | Exact teacher expense detail and reversal reason |
| GET | `/teacher/batches/:batchId/cashflow?period=YYYY-MM` | Full DB-aggregated statement, numeric strings |
| GET | `/teacher/batches/:batchId/cashflow/export?period=YYYY-MM` | CSV of verified full aggregate |
| GET | `/teacher/batches/:batchId/expenses/export?period=YYYY-MM` | Safe complete-only CSV, explicit conflict if >1,000 entries |
| POST | `/teacher/announcements/:announcementId/edit` | Edit only drafts, audited receipt |
| POST | `/teacher/announcements/:announcementId/archive` | Hide draft/published notice, audited receipt |

### Financial semantics and correctness

- Data stored in **integer BDT paisa**. Aggregate numeric values are decimal strings, preventing large-integer precision loss in JavaScript.
- Statement uses transaction **posted UTC timestamps** (not the backdated `expense_on` display date, not invoice accrual). Cashflow is **NOT accounting profit** and should not be labeled a net profit/Loss statement without accrual/reconciliation work.
- `netCollections = grossCollections - refunds`; `netExpenses = postedExpenses - expenseReversals`; `netCashFlow = netCollections - netExpenses`.
- Fee-plan billing and waivers are shown separately as **noncash memo amounts**, NOT added to cash collections.
- Completed aggregate uses PostgreSQL SUM, never a page of 100 rows. Expense CSV uses a stable one-query PostgreSQL snapshot (up to 1,000 records) and refuses to export an incomplete result; Excel formula starters are escaped. No made-up invoice outstanding or profitability metrics.
- Reversals retain original immutable expense; same operation UUID + same payload replays same result, conflicting replay fails. SQL row locks, audit and receipts are one transaction.
- Materials/upload metadata remain **READ ONLY**: verified storage ownership, file MIME/signatures and signed delivery have not yet been audited. No guessed storage URLs or public bucket bypass.

### Local-only acceptance checklist

- [x] Reconstructed source from earlier *user-installed* archive and verified package payload SHA hashes.
- [x] 424 baseline Node tests PASS before changes.
- [x] 50 focused Part K Node tests PASS (474 total).
- [ ] Full Windows ESLint/typecheck/production build — installer will verify.
- [ ] Local-only PostgreSQL migrations 023–024; schema lint — installer will verify.
- [ ] Rollback-only signed-role PostgreSQL test: expense posting/reversal, actual cashflow, user role denial, announcement edits/archive, audit, receipts — installer will verify.
- [ ] Four local feature commits only if verification succeeds.
- [ ] Real signed-JWT HTTP E2E with running Next server; separate supervised acceptance.
- [ ] Shifat's Tales **exact source/field** parity sign-off — requires actual original reference source or screenshots.

### Safety and exclusions

No `git push`, remote SQL, production flag toggle, `.env` alteration, seed, `supabase db reset`, auth or storage privilege widening. Developer must approve a separate cloud migration after cloud backup, signed-role RLS/E2E and migration drift review. All QA fixtures rollback. Existing migrations 001–022 are never edited.

### Premium app-like UI handoff (future UI milestone, not implemented here)

Retain the established navigation hierarchy (Teacher: Overview / Students / Batches / Academics / Resources / Finance / Reports / Website / Settings; Student: My Batches / Classwork / Results / Payments / Notifications). Refresh rather than copy the old visuals:

- **Visual system**: ivory `#F7F6F2` app canvas, deep ink `#172634`, restrained ocean-teal `#236575` primary, warm copper `#B9835A` accent, white surfaces. Not the old exact blue palette; contrast audited for accessibility before rollout.
- **Navigation**: fixed full-height collapsible sidebar on desktop; bottom actions/nav on mobile, large hit targets, breadcrumbs and one clear page-level primary action. Keyboard focus and responsive tables.
- **Operational patterns**: quick-add payment/expense drawer, safe confirmations for refunds/reversals, audit history adjacent to records, sticky summary header; advanced controls progressively disclosed.
- **Reporting**: mobile-friendly cashflow KPI tiles with explicit BDT/paisa display, invoice-vs-cash differentiation; CSV download always indicates period and scope. Skeleton states, empty states, no clutter or gratuitous gradients.
- **CMS**: visually preview published snapshot separately from editable draft; never make preview publish by itself.

These are design requirements, not a claim of shipped UI. Implement visual tokens and screen-by-screen functional tests in the dedicated UI package.
