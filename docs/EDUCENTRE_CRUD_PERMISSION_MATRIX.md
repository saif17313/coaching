# EduCentre verified permission and lifecycle matrix

Reviewed DEV: `rkpwqgwceekuvlizfpeb`. Website Admin uses the active Teacher role. Browser cookies pass through the same-origin CSRF proxy; server verification checks Supabase Auth and the current database account status. Normal data operations use that user's JWT.

All 31 public tables have RLS enabled. Effective `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `TRIGGER` and `REFERENCES` privileges for `anon` and `authenticated` are empty after the maintenance-grant repair. This does not deny reviewed RPC execution: the functions enforce their own role, account, ownership, lifecycle and concurrency rules. See [actual database read-back](evidence/2026-10-20/final-database-grants.json).

The [HTTP permission sweep](evidence/2026-10-20/read-permissions-browser.json) records actual Teacher, Student and fresh Anonymous requests per GET route. Workflow evidence below separately verifies writes. A passing read boundary does not certify every possible mutation or reference feature.

| Persistent resource | Teacher / Website Admin | Student | Anonymous | Verified operation / limitation |
|---|---|---|---|---|
| profiles | Read directory; rename Student; approve/change Student status | Own profile read and name update | No portal reads/writes | DEMO invite, activation and self-edit passed; public signup remains disabled |
| batches | Create, edit, read, archive lifecycle | Enrolled batch reads | No access | DEMO create/edit and role reads passed; complete archive UI lifecycle not certified |
| enrollments | Request and approve/reject/cancel subject to capacity/state | Own enrollment reads | No access | DEMO request and approval through Teacher UI passed; arbitrary enrollment writes denied |
| academic_subjects | Create/read within batch | Enrolled published learning context | No access | DEMO create/read passed; reference edit/remove workflows remain Partial |
| syllabus_units | Create/read ordered units | Enrolled subject read | No access | DEMO create/read passed; complete edit/reorder lifecycle remains Partial |
| routine_slots | Create/read; overlap rejected | Enrolled batch read | No access | Actual overlapping slot returns 409 SCHEDULE_CONFLICT; reference editing remains Partial |
| academic_assignments | Draft creation, explicit publication, submissions review | Published enrolled assignments | No access | DEMO creation/publication and submitted answer projection passed |
| assignment_submissions | Review, draft grade, publish grades | Own submission and published own grade | No access | Teacher answer/grading UI and Student submit/grade visibility passed |
| exams | Draft creation, explicit publication | Published enrolled exam read | No access | DEMO exam creation/publication passed; broader draft editing remains Partial |
| exam_results | Draft marks, publish/rank | Own published results | No access | Actual Teacher marks UI, Student results and integer progress projection passed |
| batch_contents | Upload PDF, create/edit draft, publish, archive | Released published PDF only with active enrollment | No access | Teacher UI lifecycle, Student native file download and archive revocation passed |
| learning_material_uploads | Guarded registration after verified private Storage upload | No metadata-table access | No access | Exact MIME, 5 MiB bound, signature, checksum and immutable object path; PDF only |
| announcements | Create/edit draft, publish, archive | Published released notices in enrolled batch | No access | Actual Teacher UI and Student visibility passed; visible view polls every 30 seconds |
| notification_dispatches | Audited dispatch to enrolled Students | No direct access | No access | One dispatch per event; duplicate replay tested; no external email delivery claimed |
| notifications | Own inbox reads; batch dispatch command | Own inbox and read-state command | No access | Actual Student read-state UI and nonexistent-ID rejection passed |
| fee_plans | Create/list; generate monthly dues | No administrative commands | No access | Explicitly approved DEMO 100-paisa fee and due generation passed |
| monthly_dues | Batch/Student reads and authorized fee generation | Own reconciled billing/dues | No access | DEMO billed 100, paid 60, waived 10, refunded 20, outstanding 50 paisa |
| payments | Post/read receipts; authorized refunds | Own payments and receipts | No access | Approved DEMO payment/refund tested; no generic update/delete |
| payment_adjustments | Audited waiver/refund commands | Own billing projection | No access | Approved DEMO waiver/refund passed; immutable history retained |
| financial_operations | Internal idempotent finance operation tracking | No direct access | No access | Receipt replay verified; no generic CRUD |
| office_expenses | Record/read/export expense | No access | No access | Approved DEMO 100-paisa expense, CSV and reversal passed |
| office_expense_reversals | Append audited reversal | No access | No access | Approved DEMO expense reversal passed; original retained |
| teacher_profiles | No completed own-profile workflow | No access | No access | Partial: table protected, reference profile editor not implemented |
| teacher_preferences | No completed preferences workflow | No access | No access | Partial: no inert theme/notification preference controls added |
| app_settings | Revisioned CMS draft and explicit publication | Published website data through public API only | Published website settings only | Branding and verified logo save/publish/read-back passed; broader reference application settings remain Partial |
| media_assets | Verified upload/list, attach/detach, protected archive | Published website image endpoint only | Published website image endpoint only | Actual private draft denial, published bytes, public-use block and revocation passed |
| site_pages | Create/read/edit/publish/archive | Published website endpoint only | Published website endpoint only | Actual persistence, draft privacy, read-back, revision/idempotency conflict, publish and refresh passed |
| site_page_sections | Typed fields, visibility and atomic ordering through CMS commands | Published snapshot only | Published snapshot only | Hero and portfolio save/render passed; individual E2E coverage of all 42 forms remains Partial |
| site_section_items | Typed metadata, visibility, image relationships and ordering | Published snapshot only | Published snapshot only | Media attach/detach and ordering passed; exhaustive reference item lifecycle remains Partial |
| coaching_mutation_receipts | Internal command receipts only | Internal receipts for own permitted commands | No access | Exact-payload replay and changed-payload conflicts tested; no direct client DML |
| audit_logs | Authorized read only | No access | No access | Teacher audit GET passes; append-only records generated by guarded commands |

No second Student account was created. Same-role cross-Student isolation has code/RLS review and own-record tests, but a two-account browser test remains Not Tested. Financial records and the approved DEMO account/batch remain for traceability; test PDF records are archived and private objects retained. No generic deletion or database reset was used.
