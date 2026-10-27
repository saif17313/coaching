# Reference feature parity matrix (baseline)

Generated from [reference-feature-parity-matrix.json](reference-feature-parity-matrix.json), which also lists the routes, input fields and tables for each feature. Baseline commit c1952bf, 2026-10-27.

Counts: PARTIAL 6, VERIFIED 14, MISSING 4, INTENTIONAL_DIFFERENCE 1.

VERIFIED here means prior physical evidence exists and the contract tests pass at baseline; scenarios A-L are re-run after implementation.

| Feature | Role | Status | Gaps | Evidence |
|---|---|---|---|---|
| Teacher adds student (personal, guardian, academic) | teacher | PARTIAL | Requires Auth signup (email) before the record exists; No permanent-address field | docs/evidence/2026-10-22/demo-admission.json |
| Upload/replace student photo | teacher | VERIFIED | — | docs/evidence/2026-10-22/engineering-access.json |
| Invite/link existing account without duplicate Auth | teacher | VERIFIED | Admission before credentials exists only in the demo workspace | docs/evidence/2026-10-22/engineering-access.json |
| Search/filter student directory | teacher | VERIFIED | — | docs/evidence/2026-10-22/record-scope-premium-production.json |
| Batch create/update/archive | teacher | PARTIAL | No cover photo, subject, level, session, description, schedule, default fee, admission fee; No draft/active/completed lifecycle; No safe delete of unused drafts | coaching_create_batch / coaching_update_batch signatures (20261016000600) |
| Enroll student into one or more batches with capacity | teacher | VERIFIED | — | docs/evidence/2026-10-22/demo-workspace.json |
| Month-specific batch fee plan and due generation | teacher | VERIFIED | — | docs/evidence/2026-10-20/finance-browser.json |
| Default monthly fee with effective-from, concessions, fee history | teacher | MISSING | No default fee; No student concession beyond per-due waiver; No fee change history | schema review |
| Multiple payments per monthly due, partial/full status | teacher | VERIFIED | Scenario C to re-run on the canonical ledger | docs/evidence/2026-10-22/demo-workspace.json |
| Waivers, refunds, audited adjustments | teacher | VERIFIED | — | docs/evidence/2026-10-20/finance-browser.json |
| Student-reported payment, Teacher verify/reject | student,teacher | VERIFIED | — | docs/evidence/2026-10-22/demo-payment-review.json |
| Immutable PDF receipt per verified payment | teacher,student | VERIFIED | — | docs/evidence/2026-10-22/pdf-content-validation.json |
| Batch dues/cashflow/finance report, student billing statement | teacher,student | PARTIAL | No paid/partial/unpaid/overdue segmentation view; Payment-method breakdown and trend not verified | docs/EDUCENTRE_FEATURE_API_DATABASE_MATRIX.md |
| Subject -> chapter -> topic syllabus with completion tracking | teacher,student | PARTIAL | Flat units only; No status/weight/planned/completed dates; No progress calculation | 20261016000400 schema |
| Private PDF materials, release control, Student view/download | teacher,student | VERIFIED | No chapter linkage; No 'download allowed' toggle | docs/evidence/2026-10-20/materials-browser.json |
| Offline exam scheduling with syllabus, pass marks, instructions, lifecycle | teacher,student | PARTIAL | No pass marks, instructions or coverage; Status only draft/published/archived | 20261016000700 schema |
| Attempted / Absent / Not recorded | teacher,student | MISSING | No attendance column; publication requires marks, so absence cannot be represented | exam_result_publication_consistent constraint |
| Marks draft, publish, rank, Student results | teacher,student | VERIFIED | No grade, pass/fail or remarks | docs/evidence/2026-10-20/exam-results-browser.json |
| Student performance trend, subject strengths | student | PARTIAL | Aggregate totals only; no per-exam trend or subject breakdown | coaching_student_progress (20261020160818) |
| Student academic progress PDF | teacher,student | MISSING | Not implemented | docs/EDUCENTRE_SYSTEM_AUDIT_2026_10_20.md remaining work #2 |
| Batch/exam result sheet PDF | teacher | MISSING | Not implemented | reference exam_and_print_files |
| Online MCQ/timed exams (reference) | student | INTENTIONAL_DIFFERENCE | — | Product rule: offline exams only |
| Page/section/item CMS, draft/publish, media, design controls | teacher | VERIFIED | Scenario K re-run pending | docs/evidence/2026-10-22/cms-design.json |
| Notices and notifications | teacher,student | VERIFIED | Polling, not realtime | docs/evidence/2026-10-20/student-notifications-browser.json |
| Isolated demo workspace | teacher,student | VERIFIED | — | docs/evidence/2026-10-22/demo-workspace.json |
