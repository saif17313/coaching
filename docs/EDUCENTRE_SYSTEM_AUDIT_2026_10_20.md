# EduCentre system audit and repair evidence

The CMS write contradiction is repaired and verified against the reviewed DEV project. Additional CMS, portal, media, grading, finance and dependency defects were fixed. **The complete reference-parity master task remains Partial**: the verified workflows below work, but several reference workflows and exhaustive field-level E2E coverage remain unfinished.

## Target and source

- Workspace: `E:\projects\Musa Sir\coaching`, branch `feature/p00-foundation`. No push or deployment.
- Supabase: `rkpwqgwceekuvlizfpeb`, `musa-sir-coaching-dev`, PostgreSQL 17. Original 27 migrations retained; 10 reviewed additive migrations bring the DEV history to 37.
- Reference source: [Shifat's Tales at 00404e5](https://github.com/adnan-bin-wahid/Shifats-Tale/tree/00404e5e365454d14ef67c99c215e29ad29c3959), inspected in `../educentre-reference-audit`. The requested ZIP was unavailable; the actual GitHub URL was discovered in the workspace. The live reference was also inspected.
- [137-route feature/API/database inventory](EDUCENTRE_FEATURE_API_DATABASE_MATRIX.md), [complete JSON projections and 42 form schemas](EDUCENTRE_FEATURE_API_DATABASE_MATRIX.json), and [31-resource CRUD permission matrix](EDUCENTRE_CRUD_PERMISSION_MATRIX.md). There are 121 current v1 API route files. Candidate source mappings do not certify reference equivalence.

## P0 root cause and repairs

The database log at `2026-10-20T12:47:54.485Z` contains `ALREADY_PUBLISHED`, immediately before the supplied screenshot. The original pages had equal draft/published revisions. The editor allowed unchanged publication; the server discarded the database conflict and returned a generic 503; the browser then blamed the runtime gate. The green banner checked configuration alone. [Detailed recovery evidence](CMS_WRITE_RECOVERY_2026_10_20.md).

The repaired boundary preserves safe validation, role, revision, idempotency, missing-RPC and business-conflict codes. Unchanged/unsaved publication is blocked. The authenticated readiness probe expressly reports `mutationVerified: false`; real mutation success requires a server receipt and read-back. Actual UI create/save/refresh/publish, independent database read-back, private drafts, public HTML, duplicate operations and stale revisions pass in [cms-browser.json](evidence/2026-10-20/cms-browser.json).

Other repaired failures include anonymous published-image access invoking an authenticated-only helper; schedule overlaps incorrectly returning 503; missing Teacher answer projection preventing useful grading; Student progress returning decimal centimarks rejected by its integer DTO; and expense export requesting a page larger than its RPC permits. Each has follow-up passing evidence below.

## Verified workflow coverage

| Workflow | Result | Evidence and limits |
|---|---|---|
| CMS P0, draft/save/publish/read-back, revision/idempotency | Pass | [CMS browser](evidence/2026-10-20/cms-browser.json) |
| Typed hero, relationships, section/item ordering, verified media | Pass for tested scenarios | [System](evidence/2026-10-20/system-browser.json), [academic follow-up](evidence/2026-10-20/academic-browser.json). Not all 42 forms have independent browser CRUD tests |
| Verified global logo | Pass | [Logo lifecycle](evidence/2026-10-20/logo-browser.json); original logo restored after testing |
| Portfolio reference fields | Pass for seven persisted section types and tested education UI | [Portfolio](evidence/2026-10-20/portfolio-browser.json): education, research, publications, projects, skills, training and ECA persist/read back; education edits through UI; public degree/training render. Legacy training lists remain valid |
| Publication refresh on already open public page | Pass | [Published refresh](evidence/2026-10-20/published-refresh-browser.json); bounded 30-second fingerprint polling/focus, no WebSocket claim |
| Approved DEMO invitation, confirmation, activation and enrollment | Pass | [Invitation](evidence/2026-10-20/student-invite.json), [Teacher activation/enrollment UI](evidence/2026-10-20/student-activation-browser.json). Public signup remains disabled |
| Student submission, Teacher answer review/draft grading/publication | Pass | [Student workflow](evidence/2026-10-20/student-browser.json); its final notification assertion used the wrong expected status, closed by the follow-up below |
| Notices and own notification read-state | Pass | [Notifications follow-up](evidence/2026-10-20/student-notifications-browser.json), [Teacher announcements/profile checks](evidence/2026-10-20/portal-browser.json) |
| Exam marks, publication, Student results/progress | Pass | [Exam results](evidence/2026-10-20/exam-results-browser.json), [final role sweep](evidence/2026-10-20/read-permissions-browser.json) |
| Explicitly approved DEMO finance | Pass | [Finance](evidence/2026-10-20/finance-browser.json). Fee 100, payment 60, waiver 10, refund 20 paisa; expense 100 and reversal. Outstanding 50, net collection 40, net expense 0 paisa. No money moved; permanent audit/ledger retained |
| Private PDF materials | Pass | [Complete Teacher UI / Student native download / archive lifecycle](evidence/2026-10-20/materials-browser.json), [download and fixture cleanup follow-up](evidence/2026-10-20/materials-download-browser.json). PDF only, maximum 5 MiB; exact hash verified. Earlier attempts retain harness errors, including unavailable secondary-CDP download events; the working helper verifies the actual saved file |
| Teacher/Student/Anonymous GET isolation | Pass: 72 routes | [Per-route actual statuses](evidence/2026-10-20/read-permissions-browser.json). Archived image/PDF fixtures correctly return 404; positive file delivery is separately evidenced |
| Public desktop/tablet/mobile, motion, carousel, dialog and touch | Pass for tested screen | [Public browser](evidence/2026-10-20/public-browser.json): axe A/AA, no overflow, actual Three.js GPU interaction/pause, reduced motion, carousel controls, dialog focus and touch swipe |
| Portal desktop/tablet/mobile accessibility | Pass for tested screens | [Portal accessibility follow-up](evidence/2026-10-20/portal-accessibility-browser.json): all six role/viewport combinations have zero reported axe violations and no horizontal overflow. This does not prove every portal screen is accessible |

The original failing evidence is preserved with later repairs/follow-ups. A failed historical attempt is not presented as an independently passing run. DEMO identifiers and immutable finance operation IDs are in the JSON records. Do not blindly rerun financial scripts with new operation IDs.

## Database and media controls

All 31 public tables have RLS. The final effective privilege query confirms no direct client `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `TRIGGER` or `REFERENCES` grants. The audit found unnecessary maintenance privileges on profiles/batches/enrollments and removed them in migration `20261020165831`. See [final effective-grant read-back](evidence/2026-10-20/final-database-grants.json).

CMS images stay private until a published snapshot/settings revision references them. Logo and page publication share verified media resolution and archive protection. Learning PDFs use a separate private bucket, Teacher-owned immutable object paths, metadata registration, audited revisioned commands, and download checks for the requested material's publication/release, active enrollment and nonarchived batch. Download bytes are length/hash/signature checked and served as private, uncached attachments. No ordinary user operation uses the server Auth-admin key.

Recovery definitions and a materials-disable script are in `supabase/verification`. Backup/PITR retention was not independently verified. No reset, financial deletion or destructive data migration was performed. Test PDF records are archived; private objects and their audit history remain. The approved DEMO Student, batch, academic and financial records remain clearly labeled. The three audit CMS pages and unused logo fixture were archived through their guarded APIs; public page endpoints now return 404. See [cleanup evidence](evidence/2026-10-20/cms-fixture-cleanup.json).

## Security advisories and dependency changes

The initial production dependency audit found one critical and two high advisories. Next.js and its lint configuration were updated from 16.3.4 to 16.4.2; the lockfile now resolves sharp 0.35.5 and source-map-js 1.2.2. Advisory applicability depends on application use; the Next.js critical finding concerns attacker-controlled Node.js ImageResponse input. Sources: [Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Final required checks: **701 tests pass, TypeScript passes, lint has zero errors and 17 warnings, production build passes, and the production dependency audit reports zero vulnerabilities**. Raw [test](evidence/2026-10-20/test.log), [lint](evidence/2026-10-20/lint.log), [typecheck](evidence/2026-10-20/typecheck.log), [build](evidence/2026-10-20/build.log) and [production audit](evidence/2026-10-20/audit-prod.log) logs are retained. All 72 HTTP role checks and public/portal responsive browser checks also pass; one temporary 503 is retained with its successful targeted recheck.

The full dependency audit still reports five high-severity development-only findings in the lint dependency chain, all traced to `braces` 3.0.3 ([full audit](evidence/2026-10-20/dependency-audit-full.json)), for which [the reviewed advisory lists no patched version](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Compatible `brace-expansion` patches 1.1.21 and 5.0.12 were installed. No lint-package downgrade or incompatible override was forced. Production dependencies are clear in the recorded audit.

[Supabase advisor output](evidence/2026-10-20/security-advisors-final.json) still reports intentional private RLS tables without direct policies, callable public/authorized SECURITY DEFINER RPCs, the existing `btree_gist` extension in public, and disabled leaked-password protection. The callable-RPC warnings require ongoing review; the public CMS functions intentionally expose published projections. Private table policies were not opened to silence the advisor. [Extension remediation](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [RPC exposure review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection configuration](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Remaining work and verification limits

1. Teacher own-profile editor and full reference application settings/preferences remain unimplemented; the protected tables alone are not completion. Existing Website Admin global settings work.
2. Reference print layouts for exam results and individual Student progress are not implemented. CSV/receipt workflows tested here do not substitute for those layouts.
3. Subject/syllabus/routine and assignment/exam edit/archive behavior, exhaustive CMS moderation/relationships, and each reference field's complete UI lifecycle still require dedicated implementation or verification. The generated feature matrix therefore remains Partial/Not Tested.
4. Public visuals retain the EduCentre design with working interactions; they are not a pixel-identical port of the reference. Exact per-section animation/Framer Motion equivalence is not certified.
5. Student notices/materials/inbox use bounded visible polling with focus refresh; no Supabase Realtime WebSocket subscription or instant-delivery claim is made. A timed browser check observed a new published notice appear in the existing Student view after roughly 30 seconds without navigation or a Refresh click; [polling evidence](evidence/2026-10-20/portal-polling-browser.json).
6. Only one approved DEMO Student exists. A second real authenticated Student is needed for independent same-role cross-account browser tests. No extra account was created without approval.
7. A session-boundary defect was also repaired: Auth/DB outages now return 503 with a retry state, while expired sessions return 401 and unauthorized accounts return 403. [Fault-injected UI recovery followed by a real Teacher session](evidence/2026-10-20/session-recovery-browser.json) and three boundary tests pass. Auth cookies currently expire after one hour. A refresh-token rotation workflow was not introduced; tests required local reauthentication. Passwords, invitation links and tokens stayed out of chat/evidence.
8. Cloud backup retention and a restore exercise are Not Tested. Existing Supabase advisor settings above remain open. Production deployment and push were not requested or performed.

Existing user changes in master-plan documentation, root styling/entry points, configuration and SiteExperience remain unstaged. The local feature commits preserve them. Reproducing the exact running website from a clean checkout also requires reviewing those preexisting user changes.

## Local source commits

- `ff1a8eb` — CMS error/publish repair and live persistence evidence.
- `923ad7e` — typed editors, ordering and verified logo publication.
- `9866963` — invitations, grading, notices and finance exports.
- `ab40286` — typed published content and accessible scientific interactions.
- `05decc1` — private PDF publication/downloads, visible portal polling and maintenance-grant repair.
- `dfa170b` — reference portfolio fields with legacy training compatibility.

- `cbf453a` ? correct session error classification and recoverable verification UI.
- `76e7976` ? compatible development brace-expansion security patches.

Dependency and final evidence commits follow these source milestones. The final [runtime read-back](evidence/2026-10-20/final-runtime.json) verifies real Teacher and Student sessions, the enabled reviewed gate/read probe, Teacher overview, Student progress and materials after the server restart.
