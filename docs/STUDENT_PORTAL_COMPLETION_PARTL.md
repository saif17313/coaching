# Student Portal — Part L: Functional Completion Bundle

## Shifat's Tales parity: implemented scope, not full acceptance

This local-first release connects the Student Dashboard, Account/Profile, Monthly Billing, Learning Calendar, and Published Progress with seven protected API routes and two reviewed local-only SQL migrations. This bundle extends, rather than replaces, the existing Student Academic / Submissions / Results / Notification / Payment routes from Parts G–H.

| Surface | Method | Endpoint | SQL RPC | Validation |
|--|--|--|--|--|
| Student Dashboard | GET | `/api/v1/student/dashboard` | `coaching_student_dashboard()` | active-owned aggregates and up to 10 upcoming items |
| Student Profile | GET | `/api/v1/student/profile` | `coaching_student_profile()` | own ID, name and join date only |
| Student Profile | PATCH | `/api/v1/student/profile/update` | `coaching_student_update_own_profile` | name-only, UUID idempotency, audit, actor row lock |
| Monthly Billing | GET | `/api/v1/student/billing?billPeriod=YYYY-MM` | `coaching_student_billing_statement` | 100-due exact cap, integer minor BDT, no partial totals |
| Billing Export | GET | `/api/v1/student/billing/export?billPeriod=YYYY-MM` | same verified statement | injection-resistant complete CSV |
| Student Calendar | GET | `/api/v1/student/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | `coaching_student_calendar` | 31-day max window, 100-item cap, published-only |
| Student Progress | GET | `/api/v1/student/progress` | `coaching_student_progress` | published exam results + published assignment grade only |

### Financial rules

Minor BDT units are integers (paisa), never a floating amount. Per due:

`outstanding = billed - grossPayments - waivers + refunds - corrections`.

Corrections are signed compensating financial entries. Waivers are non-cash and are **not** income. A due with a negative resulting outstanding causes the monthly billing RPC to fail closed. Billing exported figures are produced from one SQL statement snapshot, capped to 100 dues. Income/expense reporting stays in teacher Part K, and this student view never shows other students.

### Released grade rules

Exam score totals are returned as integer **hundredths of a mark** (`earnedMarksX100` and `possibleMarksX100`) to preserve decimal mark fidelity. Assignment point totals are integers. Draft results and unpublished assignment grades are excluded at the SQL boundary.

### Security/limitations

- Same signed JWT is verified by Supabase Auth and server-side active student role check; the bearer is passed unchanged to an allowlisted PostgREST RPC endpoint. No service role.
- Student self-name editing is disabled until the existing `COACHING_ENABLE_MUTATION_APIS=enabled-after-db-verification` flag is deliberately enabled; installation **never** changes this flag.
- Private profile and invoice data has `Cache-Control: private, no-store`.
- No student authentication/provisioning/password reset is implemented here; security credentials require a separate verified Supabase Auth reauthentication flow.
- No frontend login/session/UI wiring; premium mobile-first UI handoff is planned separately and must not be represented as implemented by an API package.
- No hosted cloud migrations, production deploy, Git push, data reset, or original Shifat's Tales exact field-level audit.
- The 52-phase `BACKEND_MASTER_PLAN.md` remains the source of truth. This release covers functional backend surfaces rather than a guaranteed 10 percentage points of the full project.

### Verification

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, local migrations 025–026, `supabase db lint --local`, and `node scripts/local-student-completion-partl-qa.mjs` under Docker with exact local opt-in. SQL QA is wrapped by a single rollback transaction. New functions are granted to authenticated only, not anonymous users; no base table writes are opened.

### UI handoff: premium app-like design

Keep the original functional navigation hierarchy while upgrading the visual language: airy low-density surfaces, muted midnight ink with sea-glass accent and champagne highlights (rather than copying the reference theme), fixed-width readable content, large mobile tap targets, 3–4 primary sidebar groups, responsive bottom navigation on phones, clear status chips, accessible contrast and a one-tap path from a due or upcoming assignment to its relevant detail. The UI must show loading/empty/error states rather than fabricated counts. Consistent DTOs in this bundle are the backend boundary for such UI.
