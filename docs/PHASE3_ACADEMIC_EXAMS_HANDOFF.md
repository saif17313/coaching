# Academic / Exams / Results — Offline implementation

Scope: executable domain workflows for subject and syllabus-unit creation; authorized subject listings; exam drafts; marks draft; publish; published-result reading; tie-aware ranking. There are 4 executable integration tests with a test-only memory port simulating atomic transactions and authorization. These are **not production CRUD**.

**Production blockers:** verified server-side Supabase identities, batch/subject link validation in Postgres transactions, enrollment-based access and attendance rules, transactional exam draft save/publish RPC with concurrency locking, durable audits, material visibility and protected HTTP endpoints, RLS and live integration. No database migrations are applied by this package. The production port is **not** shipped; all operations fail closed without it.

Shifat's Tales parity: syllabus, routines, assignments, student progress, complete exam lifecycle, batch-wise results and results publishing details beyond these primitives remain pending. Payments/materials/notifications/reports/CMS also pending. Never mark original feature parity complete based on these tests.
