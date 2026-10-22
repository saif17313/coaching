# EduCentre production engineering delivery

Production target: https://educentre-iota.vercel.app. Deployment branch: `feature/p00-foundation`. Existing application commit `92b8fe5` was preserved.

## Delivered behavior

- Public page backgrounds span the viewport, with centered readable content and balanced spacing. All twelve published routes passed checks at 375, 768, 1440 and 1920 pixels. The About page no longer has the asymmetric right gap shown in the reference.
- Original book and learning-diamond branding supplies the public fallback logo, portal logo, favicon, Apple icon, manifest icons, actual Suspense loading screen and receipt logo. Navigation progress follows Next's real pending-link state; it has no simulated completion percentage or artificial delay. Reduced motion suppresses decorative animation and the GPU model.
- Contextual CMS Style controls save bounded image dimensions, crop/focal position, fit, scale, radius, mobile width, alignment, section backgrounds, spacing and type scales. The same renderer displays private previews and published pages. Draft changes use revision checks, idempotency, active Teacher authorization and a closed database schema; arbitrary CSS is rejected.
- Shared private upload controls are available before Student invitation/admission save. Student and Teacher profile avatars use circular crops and initials/error fallbacks. Assigned private photographs and documents are protected from accidental archival.
- Verified canonical payments have server-generated A4 PDF receipts, searchable history, download and view/print controls. Receipt issuance stores a permanent financial snapshot; later corrections are listed separately. Students can access their own payment receipts, while active Teachers use the established institutional authorization boundary.
- A separate, persistent Demo workspace provides fictitious profiles, batches, enrollment, academic content, admission decisions, sample payment reporting/review, installments, waivers, refunds and watermarked receipts. Its records are never inserted into genuine enrollment or accounting tables, used for genuine dashboard totals, or passed to outbound messaging.

## Isolated demonstration data

The repeatable seed creates 50 fictitious Bangladeshi profiles, 10 batches and 80 enrollments. Fees include BDT 2,500, 3,000, 3,500 and 4,000, with full, partial, unpaid, overdue, installment, waived, refunded, pending and rejected examples.

Browser testing added one sample Student, one batch and one enrollment. The resulting workspace contains **51 profiles, 11 batches, 81 enrollments, 52 sample payment records and four frozen sample receipts**. One existing authorized Student identity is bound to the first virtual profile for role testing. No fictitious Auth users or invitation emails were created.

`scripts/demo-workspace-command.mjs seed` reuses an existing dataset. `seed --bind-test-student` can bind the locally authorized test Student when creating a workspace. `archive` performs non-destructive cleanup and retains audit history and receipts; repeating cleanup is safe. These scripts use the local verification browser and credential-document environment variables, never embedded credentials. The populated demonstration workspace remains active for review.

## Database and media changes

Applied additive migrations, using the hosted canonical versions:

1. `20261021181457_cms_safe_presentation_controls.sql`
2. `20261021184151_immutable_payment_receipts.sql`
3. `20261021190344_isolated_demo_workspace.sql`
4. `20261021192429_demo_student_admission.sql`
5. `20261021194901_receipt_and_demo_safety_guards.sql`

There are 50 applied migrations in the configured project. Existing genuine Student, enrollment and financial values were preserved. The migrations add closed RPCs, revision/idempotency checks, receipt immutability, bounded demo state, an issuer index and a private-media archival guard. They do not broaden bucket access or public RLS policies. Existing issued snapshots are preserved; subsequent canonical receipts can additionally record the Student's class.

## Verification evidence

`npm run verify` passed: structure, lint, type checking, **752 tests**, production dependency audit and optimized build. Lint has zero errors and 17 existing warnings; the production dependency audit reports zero vulnerabilities. Receipt font and logo files were checked in all four optimized route tracing manifests.

Physical browser evidence in [evidence/2026-10-22](evidence/2026-10-22):

| Evidence | Result |
| --- | --- |
| `cms-design.json` | Upload, resize/crop, actual preview, private save, reload, publish and four widths |
| `demo-admission.json` | Full fictitious admission, private photo, circular avatar, edit, rejection, resubmission, approval, completion and invalid-transition denial |
| `demo-workspace.json` | BDT 2,500 full payment, BDT 3,000 paid in two BDT 1,500 installments, frozen receipt balances, batch/capacity setup, enrollment and Teacher/Student reconciliation |
| `demo-payment-review.json` | Pending Student reports remain uncollected; Teacher verification and rejection persist |
| `engineering-access.json` | Existing-account linking without duplicate Auth/email, own avatar, 48 role/tab/viewport accessibility scans and actual pending-navigation progress |
| `public-engineering.json` | Twelve routes, 48 width checks, accessibility, full-width About, brand assets and reduced motion |
| `payment-receipt.json` | Actual Student PDF button, authorized Teacher download, anonymous and wrong-role denial |
| `pdf-content-validation.json` | Independent PDF text extraction, A4 dimensions, exact amounts, demo watermark and page rendering |

[Representative isolated sample receipt](evidence/2026-10-22/sample-demo-2500.pdf) and [rendered preview](evidence/2026-10-22/sample-demo-receipt-preview.png) contain fictitious data only. They show a verified BDT 2,500 payment and zero remaining balance, with the required SAMPLE / DEMO watermark. The canonical test receipt containing actual profile details is deliberately excluded from the committed artifacts.

PostgreSQL rollback tests cover receipt ownership/immutability, draft/public separation, stale revisions, idempotency, duplicate references/enrollments, exact installments, overpayment denial, refunds, admission eligibility, capacity, Student isolation and private-photo archival protection. Genuine management/finance totals were unchanged by the demonstration scenarios.

Invitation readiness was checked on the live deployment using an invalid empty request: the configured service returned `400 INVALID_ONBOARD_INPUT`, without a possible recipient or outgoing email. Existing-account linking was tested physically. A new inbox delivery/confirmation cycle was not repeated; the established controlled identity was reused.

## Existing environment observations

Supabase reports no ERROR-level advisor findings. Closed tables intentionally have no client policies, and reviewed SECURITY DEFINER RPCs intentionally require their own active-role/ownership checks. These findings must not be "fixed" by granting public table access. See the [RLS advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Existing project notices include [btree_gist in the public schema](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Their established configuration was not changed as part of the feature release.

The full development dependency audit reports the upstream [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) through Next's ESLint dependency chain. npm currently proposes a breaking downgrade to Next 14 rather than a compatible repair. No framework downgrade was performed; the production dependency audit passes.

The receipt's Noto Sans Bengali font is distributed with its [Open Font License](../public/fonts/OFL-NotoSansBengali.txt). PDF rendering is loaded only when needed and supports actual Bengali shaping.

## Release status

Optimized local verification is complete. Commit, CI and hosted verification results are recorded in the subsequent release evidence.
