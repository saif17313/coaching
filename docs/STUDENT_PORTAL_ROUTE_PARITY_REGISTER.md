# Student Portal — Shifat's Tales route-to-backend parity register

**Source:** previously supplied Shifat's Tales student-management route inventory and targeted snapshot manifest. **This is route evidence, not a fresh full-source audit.** Missing original per-page UI components and exact database column mappings have NOT been verified in this package. Do not infer completion percentage.

Status codes: `O`=operational offline logic tested; `P`=partial read-side logic; `D`=deferred; `N`=not implemented. All entries require verified Supabase Auth, production repositories/RPCs/RLS, operational HTTP endpoints and frontend binding for production parity.

| Original route / workflow | Offline service operation | Status | Required before parity sign-off |
|---|---|---|---|
| `/student` | `student-portal.mjs:getDashboard` | P | Transaction-safe snapshot read, HTTP, UI |
| `/student/profile` | `student-portal-sections.mjs:getMyProfile` | P | Auth-derived identity and profile table mapping |
| `/student/profile/edit` | `student-batch-enrollment.mjs:updateStudent` self-only safe patch | P | Verified writable fields and original form field parity |
| `/student/security` | `requestPasswordOrMfaChange` deliberately fail-closed | D | Supabase Auth reauthentication/MFA/password flow |
| Student batch listing / `/student/batches/[batchId]` | `listMyBatches`, `getMyBatchOverview` | P | DB active-enrollment checks, batch detail UI |
| `/student/batches/[batchId]/materials` | `listMyBatchSection:materials` | P | Secure content access + file URLs from guarded signer |
| `/student/batches/[batchId]/materials/[contentId]` | `learning-resources.mjs:grantMaterialAccess` offline rules | P | Live signed URL/storage policy; attachment access test |
| `/student/batches/[batchId]/announcements` | `listMyBatchSection:announcements` | P | Publication filters and notifications routing |
| `/student/batches/[batchId]/exams` | `listMyBatchSection:exams` | P | Link to exam details, exam release/archival status |
| `/student/batches/[batchId]/exams/[examId]` | `academic-exams.mjs` exam policy + overview projection | P | Detail read service/pagination, proper exam ownership |
| `/student/exams` | `listMyBatchSection:exams` per batch | P | Cross-batch collection (separate authorized aggregation) |
| `/student/batches/[batchId]/results` | `listMyBatchSection:results` | P | Atomic publish view and result detail/rank validity |
| `/student/results` | `listMyBatchSection:results` per batch | P | Cross-batch aggregation; no draft marks disclosure |
| `/student/batches/[batchId]/payments` | `listMyBatchSection:payments` | P | Real ledger projection, receipts, monthly dues queries |
| `/student/payments` | `listMyBatchSection:payments` per batch | P | Cross-batch invoice view, receipt management |
| `/student/notifications` | `listMyBatchSection:notifications` | P | Delivery/mark-as-read port in learning resource service |
| Student routine / assignments/submissions | `routines-assignments.mjs` + section reader | P | Original exact pages/routes may differ; UI and DB verify |
| Registration/login/pending/disabled | Auth boundary only; deliberately fail-closed | D | Real session, email verification, redirect behavior |

**All of these remain NOT parity-complete**. The new reader rejects provider records containing extra fields, wrong student or batch, draft/unreleased records, malformed financial totals, and invalid source shapes. It cannot replace DB-level row-level security; production port must repeat authorization inside the query, not trust checked arguments supplied by a browser.

## Database/HTTP integration requirements

1. Derive `actor.id` and verified role from server-side Supabase `getUser()` and authorized profile, never from POST JSON/header or a fabricated `verified` value.
2. Scope every query to `auth.uid()` plus active account/enrollment, with immutable published states and current release-window checks; bind item-level batch ownership.
3. Return explicit allowlisted DTO columns, never entire database rows (`SELECT *`) or unsigned storage keys. For result records check marks published; for invoice rows perform ledger reconciliation.
4. Add `/api/v1/student/...` guarded read endpoints (not created in this offline package); rate-limit when needed, paginate, and validate HTTP query DTOs.
5. Test against actual Supabase test users/rows including cross-student IDOR, disabled status, membership revocation, stale publication and concurrent updates.
6. Original Shifat's Tales source comparison: verify exact student edit fields, batch exam detail fields, payment statuses, original notices and links before marking a route complete.

**No protected Student API or UI routes are exposed by this package.**
