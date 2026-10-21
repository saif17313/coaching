# CMS, public website and management upgrade

## Delivered behavior

- Website Studio uses actual saved pages, sections, schema groups, nested objects, array rows and content cards as its navigation tree. Search, breadcrumbs, expansion, saved navigation context, focused editors, unsaved-edit protection and mobile editor/preview switching replace the former stacked form.
- Home previews the complete composed website. Selecting a section or field isolates its available public presentation. Hidden or placeholder-only content explains why there is no publishable preview. Home ordering and visibility use its own draft layout, preserving shared source pages.
- Existing draft revisions, explicit publication, media verification, private images, public snapshots and read-back checks remain authoritative. Pages/sections/cards can be added; rows can be reordered, duplicated or removed from the unsaved draft. Stored sections/cards can be disabled and pages archived without deleting records.
- Public pages use the coordinated navy/emerald theme, responsive typography and existing verified imagery. Development copy is removed from presentation. Placeholder testimonials/results are omitted rather than presented as real claims; original CMS data remains stored.
- YouTube watch, shortened, Shorts and embed URLs normalize to a validated video ID. The matching thumbnail loads immediately; the privacy-domain player loads on Play. Invalid input, thumbnail/player errors, loading and direct provider fallback are handled.
- Student profiles group existing personal, guardian, academic, address, admission, photograph and enrollment fields. New application details include previous education, guardian email, gender, private Teacher notes, review decisions and assigned private scans.
- Add Student validates admission data before account creation. Existing email identities open their original Student profile. Invitations, pending account access, review status, enrollment approval and verified payment remain separate decisions. Pending invitation resend uses the existing identity and server-only Auth administrator.
- Admission/tuition/other breakdowns reference the existing fee plan and charge ledger. Student reports remain pending until Teacher verification posts through the existing payment RPC. Installments, waivers/refunds, outstanding balances, receipts, statements and batch totals use the authoritative ledger. Explicit batch admission rules apply to future approvals.

## Database

Applied once to established project `rkpwqgwceekuvlizfpeb`; migration history now contains 45 entries:

1. `20261021133233_admission_workflow_and_payment_review.sql`: four additive workflow/breakdown/payment-report/policy tables; guarded, audited RPCs; duplicate-reference protection; optional enrollment rules; assigned-document access; management summary and existing-identity lookup.
2. `20261021140445_cms_composed_home_layout.sql`: adds the Home arrangement schema while retaining all 42 earlier CMS form schemas unchanged. No content backfill or existing record rewrite.

New RPCs deny anonymous execution, validate active roles and use an empty search path. Student reads are scoped to their own identity; private notes never enter the Student DTO. Direct table access remains restricted with RLS. No Auth identity, existing admission roll, enrollment or financial record was replaced.

Security advisors were reviewed. Restricted tables intentionally use guarded RPC access; callable security-definer notices reflect that design. Existing extension placement and Auth password-protection advisories remain separate configuration matters: [extension placement](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [guarded RPC guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Verification

- 739 automated tests pass, including recursive navigation, immutable nested edits, Home composition/order/visibility, video URL validation, money arithmetic, strict DTOs, private-note redaction and signed role boundaries.
- Local PostgreSQL transaction fixtures pass and roll back: revision conflicts, replay, private documents, admission charges, pending reports, verified installments, duplicate references, exact balances, batch reconciliation, approval rules, Home save/publish and Student denial.
- Authenticated browser checks pass nested field/reset, normalized video draft/save/reload, draft privacy, correct preview thumbnail, explicit publication and independent public API/HTML confirmation. Isolated CMS fixture archived afterward.
- Existing identity lookup and Student denial of Teacher endpoints pass. Reversible DEMO application fields were restored. One one-paisa DEMO payment report was rejected; it did not change verified receipts or outstanding ledger totals.
- A private one-pixel verification image was uploaded, assigned, read by the Student with integrity checks/no-store and denied anonymously/publicly. Original assignments restored; test image archived.
- 70 Teacher/Student desktop/mobile WCAG A/AA scans pass, including keyboard navigation. Another 33 focused CMS, application/ledger and 12-public-route scans pass at desktop/tablet/mobile sizes. No horizontal page overflow or uncaught public browser errors.
- Evidence: `docs/evidence/2026-10-21/context-upgrade.json`, `context-documents.json`, `context-accessibility.json`, `context-views.json` and selected screenshots. Earlier historical reports remain unchanged.

## Release

Release checks, commit, GitHub CI, deployment and live verification are recorded below after completion. The existing production origin is `https://educentre-iota.vercel.app`, Git integration `saif-411a/educentre`. Both authorized roles authenticate there; the existing deployed write gateway is enabled/reachable. No environment or secret changes were needed.

Local release checks: structure, lint (zero errors/17 existing warnings), typecheck,739 tests and optimized build pass. Optimized-runtime smoke passes new Teacher/Student workflow reads, public HTML and mobile audit keyboard/contrast/overflow. The local npm security audit could not resolve registry.npmjs.org on two attempts; the existing GitHub Verify workflow repeats the complete npm run verify including that audit before production promotion. Evidence: context-production-build-smoke.json.
