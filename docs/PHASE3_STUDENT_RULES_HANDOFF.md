# Phase 3 incremental backend handoff

Installed: pure domain rules (`student-operations.mjs`) and seven **runtime** tests, plus a Shifat's Tales parity register.

Not installed / blocked pending backend/database integration:
- Real teacher/student identity provider, durable student CRUD and transaction-backed enrollment adapter.
- Database constraints, locks, migration tests, row-level security and authenticated HTTP endpoints.
- Full coverage of every original UI section; source-by-source audit is still required.

Service port `decideEnrollmentAtomic` must verify the authenticated teacher from DB, lock enrollment + batch, verify status/capacity under lock, update rows and durable audit within the transaction, reject replay and return a committed record. Pure capacity validation before the transaction is not sufficient.

Run: `node --test tests/student-operations-runtime.test.mjs` and all standard project verification commands. No Supabase operations take place.
