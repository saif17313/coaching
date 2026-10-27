# Effy Tech EduPilot demo: feature parity audit

Date: 2026-10-28. Reference: https://www.effytechbd.com/demos/effy-edu-management-system, crawled in a real browser.
- **Teacher area:** 98 routes visited, including every sidebar page, detail page and form.
- **Student area:** 30 routes visited.
- **Admin demo:** opens the same Teacher console as the Teacher demo, so it has no separate pages.
- **Website Admin mode:** 16 section managers.

The demo uses local mock data, so its behaviour was matched against EduCentre's real Supabase RPCs and verified in the browser. It was not copied.

**Status meanings:**
- **VERIFIED:** a browser E2E or a rolled-back database verification proves it on the live system.
- **PARTIAL:** the core flow exists but some reference options are missing.
- **MISSING:** not implemented.
- **INTENTIONALLY DIFFERENT:** a deliberate safety or product decision.
- **UNVERIFIED:** it could not be exercised.

**Evidence:**
- [docs/evidence/2026-10-28/management-parity.json](../evidence/2026-10-28/management-parity.json): production browser E2E, 47 checks.
- `-local.json` in the same folder: local run.
- [supabase/verification/20261027_management_parity_verification.sql](../../supabase/verification/20261027_management_parity_verification.sql): 41 database checks, always rolled back, all passed on production.

## Coverage summary

| Area | Verified | Partial | Missing | Intentionally different |
|---|---|---|---|---|
| Students & lifecycle | 9 | 2 | 0 | 1 |
| Batches & enrollment | 9 | 1 | 0 | 1 |
| Tuition, payments, receipts | 10 | 0 | 0 | 1 |
| Academics (syllabus, exams, results) | 10 | 3 | 0 | 1 |
| Reports & PDFs | 4 | 2 | 0 | 0 |
| Settings, audit, notifications, profile | 3 | 2 | 0 | 1 |
| Student portal | 8 | 1 | 0 | 0 |
| Public website & CMS | 9 | 1 | 1 | 0 |

## Students & lifecycle

| Effy feature | EduCentre | Status | Notes / evidence |
|---|---|---|---|
| Student register with filters | Students page, Registered records. Search, plus filters for student status, portal access, class and fees. The API also filters by batch. | VERIFIED | `GET /api/v1/teacher/management/students`, `coaching_teacher_student_directory_v2`. E2E: "Directory filters by batch and lifecycle". |
| Student detail: demographics, guardian, academic info | Full admission profile, editable at any time by the Teacher | VERIFIED | `StudentAdmissionProfile`. E2E 2026-10-27 offline admission. |
| Create student without email | Offline admission with no Auth account | VERIFIED | E2E "Offline create". Previous evidence: `offline-admission.json`. |
| Replace profile photo | Avatar upload, then Save profile | VERIFIED | 2026-10-27 E2E |
| Approve / reject registration | Admission workflow review (submitted → approved/rejected) | VERIFIED | `StudentWorkflowPanel`. Kept separate from lifecycle. |
| Suspend account access | Portal access status (active/disabled) | VERIFIED | Separate from lifecycle |
| Active / Inactive / Cancelled / Completed | New student lifecycle with an audited transition history | VERIFIED | Database checks for invalid transitions and required reasons. E2E "Marked inactive", "Reactivated", "Inactive Student cannot be enrolled". |
| Teacher private notes | Admission workflow private notes | VERIFIED | Teacher-only field |
| Add to batch / enrollment history | Assign batch, plus enrollment history tab | VERIFIED | E2E enrollment |
| Student payments history and current dues | New "Payments & dues" tab: per-due ledger, installments, receipts | VERIFIED | `payment-ledger?studentId=` |
| Per-student audit trail | Global audit log only | PARTIAL | No per-student filter |
| Later portal login linking | Portal login panel (invite with the permanent id) | PARTIAL | Linking proven in the rolled-back database run. A real inbox has not been tested. |
| Delete student permanently | Cancel admission instead | INTENTIONALLY DIFFERENT | Finance and results history must never be deleted |

## Batches & enrollment

| Effy feature | EduCentre | Status | Notes / evidence |
|---|---|---|---|
| Lifecycle Draft/Open/Running/Completed/Archived/Cancelled | `batches.lifecycle_status`, kept in sync with `is_archived` | VERIFIED | Database checks (cancelled closes writes, legacy unarchive). E2E create/cancel. |
| Admission open/closed | `admission_open` gate on new enrollments | VERIFIED | Database check `ADMISSION_CLOSED` |
| Name, code (locked after enrollment), subject, level, session, dates, capacity, description | Batch studio form | VERIFIED | E2E "Batch created via form", "Batch profile persisted", "Batch edit saved". Database `BATCH_CODE_IMMUTABLE`. |
| Class days and start/end time | Day pills (Saturday first) and time range | VERIFIED | E2E "Sat, Mon, Wed · 16:00–17:30" |
| Monthly fee and admission fee | Initial fee rule on create; fee changes with an effective month and fee history | VERIFIED | Database fee rule. Issued dues are never rewritten. |
| Cover image | Cover upload and preview | VERIFIED | Media guard prevents archiving a cover that is in use |
| Batch detail: students, enrollments, quick transitions | Batch "Manage" dialog | VERIFIED | — |
| Capacity guard | `CAPACITY_BELOW_ACTIVE` | VERIFIED | Database check |
| Completed/cancelled batches stop admissions | `BATCH_NOT_ACCEPTING` | VERIFIED | Database check |
| Enrollment statuses Suspended/Completed | Enrollment has pending/active/rejected/cancelled; the Student lifecycle covers inactive/completed | PARTIAL | No per-enrollment suspend |
| Delete batch permanently | Cancel or archive only | INTENTIONALLY DIFFERENT | Owner declined batch deletion on 2026-10-27 |

## Tuition, payments, receipts

| Effy feature | EduCentre | Status | Notes / evidence |
|---|---|---|---|
| Monthly billing per batch | "Generate dues" uses the fee in force for the month; fills gaps only | VERIFIED | E2E "Monthly dues generated from fee rule" |
| Different fee by month, prospective changes | Fee rules with an effective month | VERIFIED | — |
| Student-specific discount | Concessions (percent or amount, period range) applied as audited waivers | VERIFIED | Database 10% concession example |
| Partial payments, multiple installments | Each payment is a separate immutable transaction | VERIFIED | E2E BDT 30 fee paid 10 + 15 → partial, 5 due, then 5 → paid |
| Paid / Partially paid / Unpaid / Waived / Overdue | Ledger status derived from the ledger | VERIFIED | Database ledger and summary checks |
| Ledger filters: month, year, batch, status, method, search | Payment ledger page | VERIFIED | — |
| Collection summary (expected/collected/outstanding/rate/methods) | Ledger summary cards | VERIFIED | — |
| Overpayment protection | Client and database (`PAYMENT_EXCEEDS_BALANCE`) | VERIFIED | E2E "Overpayment blocked" |
| PDF receipt per payment | Immutable receipt per installment | VERIFIED | E2E "Receipt PDF downloads" |
| Expenses, net profit, 12-month chart | Per-batch expenses and cashflow statement with CSV; Overview has an organisation-wide 12-month chart (billed, collected, expenses, net) with a table view | VERIFIED | Added 2026-10-28 (`coaching_teacher_finance_trend`) |
| Edit or delete a payment record | Waiver, refund and correction adjustments | INTENTIONALLY DIFFERENT | Immutable financial history |

## Academics

| Effy feature | EduCentre | Status | Notes / evidence |
|---|---|---|---|
| Subjects per batch | Subjects | VERIFIED | — |
| Chapters and topics, completion and progress % | Syllabus planner: chapter → topic, planned/in progress/completed, weights | VERIFIED | E2E "Syllabus progress 50%". Database progress 60.00% / chapter 75.00%. |
| Subject status (running/paused) and weight | Not modelled at the subject level | PARTIAL | Progress is weighted at the unit level |
| Exam create: type, date, time, duration, total and pass marks, syllabus notes | Exam draft, then details dialog with type, pass marks, duration, instructions and coverage | VERIFIED | E2E "Exam details saved" |
| Scheduled vs draft visibility | Draft is hidden; Schedule (publish) shows it to Students | VERIFIED | — |
| Attendance Present/Absent, marks, remarks | Attempted / Absent / Not recorded per Student | VERIFIED | E2E "Absence saved without marks". Database `INVALID_RESULT`. |
| Rank, grade, pass/fail, class stats | Rank on publish (absent unranked), grade, pass rate, average, highest | VERIFIED | E2E "Published sheet" |
| Publish results | Publish (not-recorded Students stay unpublished) | VERIFIED | — |
| Result sheet PDF | `/api/v1/teacher/reports/exam/[id]` | VERIFIED | E2E "Result sheet PDF" |
| Result CSV export | Result sheet PDF and **Results CSV** (attendance, marks, percent, grade, rank, pass/fail) | VERIFIED | Added 2026-10-28; spreadsheet formula prefixes are neutralised |
| Assignments and submissions review | Assignments, Student submission and grading | VERIFIED | Previous evidence |
| Dated class sessions (scheduled/completed/cancelled, room, online link) | Weekly routine slots | PARTIAL | No per-date session status |
| Study materials: PDF, release date, draft/published | Private PDF materials with release control | PARTIAL | No expiry, download toggle, or link/YouTube item types |
| Online exam taking | Not provided | INTENTIONALLY DIFFERENT | Exams are offline by design |

## Reports & PDFs

| Effy feature | EduCentre | Status | Notes |
|---|---|---|---|
| Student progress report (printable) | Student self-service progress PDF | VERIFIED | E2E "Student progress report PDF" |
| Exam analysis | Exam sheet statistics and PDF | VERIFIED | — |
| Monthly collections report | Ledger with month filter and summary | VERIFIED | — |
| Teacher-built report for any one Student | **Progress report PDF** on every Student profile | VERIFIED | Added 2026-10-28; shows exactly the published results that Student sees (`coaching_teacher_student_exam_history`) |
| Enrollment ledger, batch/subject performance with CSV | Cashflow/expense CSV only | PARTIAL | — |
| Student exam analytics (trend chart, mastery) | Averages, best, attempted/absent counts | PARTIAL | No trend chart |

## Settings, audit, notifications, profile

| Effy feature | EduCentre | Status |
|---|---|---|
| Teacher profile and photo | Account settings | VERIFIED |
| Notifications | Notifications (polling) | VERIFIED |
| Audit log stream | Audit log list | VERIFIED |
| Audit filters by category/action/entity/date | — | PARTIAL |
| Centre settings (name, contact, gate messages, rank/grade visibility) | Website global settings; ranks always shown on published results | PARTIAL |
| Currency, timezone, student ID prefix | Fixed BDT, Asia/Dhaka and the EC- roll format | INTENTIONALLY DIFFERENT |

## Student portal

| Effy feature | EduCentre | Status |
|---|---|---|
| Dashboard: dues, next class, assignments, batches, upcoming exams | Student dashboard | VERIFIED |
| Batch console (overview, materials, syllabus, payments, exams, results, announcements) | Batch-scoped pages via the batch selector | VERIFIED |
| Syllabus progress | Read-only planner with % | VERIFIED (E2E) |
| Exams with attendance and scorecard (marks, %, grade, rank, remarks) | Exam history cards | VERIFIED (E2E) |
| Payments ledger, receipts, report a payment | Billing statement, dues, payments, receipts, payment claims | VERIFIED |
| Profile edit | Own profile (limited fields) | VERIFIED |
| Assignments and submission | Assignments | VERIFIED |
| Notifications | Notifications | VERIFIED |
| Exam trend charts and goals | — | PARTIAL |

## Public website & CMS (Website Admin)

| Effy feature | EduCentre | Status |
|---|---|---|
| Home: hero, stats, batches, why us, teacher, results, lectures, news, gallery, footer | Editable CMS sections (page → section → item) | VERIFIED (2026-10-22 evidence) |
| Courses, materials, results, gallery, news & events, contact, academic calendar, routine pages | CMS pages and navigation | VERIFIED |
| Reviews page | CMS reviews section | VERIFIED |
| Visitor submits a review (moderated) | — | MISSING |
| Wall of Fame filtered by month | Top-students section without a month filter | PARTIAL |
| Hero/section managers, global settings, footer | Website Studio | VERIFIED |
| Draft, preview, publish; no edit controls on the public site | Revision-gated drafts and published snapshots | VERIFIED |
| Premium motion | Scroll reveal, hero parallax, card tilt and glow, reduced-motion fallback | VERIFIED (E2E: no overflow, content revealed at 360/768/1440/1920) |
| Mobile layout | Compact portal hero, two-column filters, no overflow at 375 px | VERIFIED (E2E) |

## Remaining gaps, in priority order
1. Enrollment and batch/subject performance reports with CSV.
2. Dated class sessions with status, room and online link.
3. Study material expiry, download toggle, and link/YouTube types.
4. Visitor review submission with moderation, and the month filter on the Wall of Fame.
5. Audit log filters, and a per-Student audit trail.

## Test data footprint (production)
The browser E2E deliberately uses real ledger writes on labelled fixtures. That ran nine times: five local runs failed partway while the script was being fixed, then one local and one production run passed, plus two attempts in between.
- **Totals:** 9 `E2E-PAR-*` batches, 8 `E2E PARITY Student …` records, and 14 test payments totalling BDT 145. Each run uses a BDT 30 fee.
- **Retired:** every one of these batches and Students was cancelled through the audited API. Nothing was deleted.
- **Genuine records** were checked afterwards and are unchanged: 1 payment (60 paisa), 1 receipt, 2 enrollments, 0 orphaned enrollments.
- **Test Student account:** on 2026-10-28 its four active enrollments in the cancelled test batches were cancelled through the audited enrollment decision (as were the offline E2E Students' enrollments), so its portal and the Student directory show only its two real batches. Its earlier E2E exam results stay in history but no longer appear, because exam history only follows active enrollments.
- **Earlier offline-admission fixtures:** the three `E2E Offline Test Student …` records were cancelled the same day.
- **Going forward:** the E2E script retires its own fixtures in every case, including failed runs: it ends every enrollment in the test batch, cancels the offline Student and then the batch.
