# EduCentre - Codex Progress

## Current Phase
Phase B shared preview implemented; remaining catalog/ordering work was still unpushed in this exported ZIP. Phase C Student admission schema has already been applied on Hosted DEV. Phase D Teacher/Student admission UI and strict APIs are implemented; final Student self-edit and photo E2E remain pending. Continuation: safe CMS mapping/deep-link/UI fixes completed with unit tests; Windows build + remote push not yet verified.

## Baseline / Git HEAD
- Workspace: `E:\projects\Musa Sir\coaching`; branch `feature/p00-foundation`; starting HEAD `f9c83a5`; shared-preview milestone `758e94e` pushed to `origin/feature/p00-foundation`.
- Remote: `https://github.com/saif17313/coaching.git`. User explicitly requests pushing latest updates; this overrides the attachment's no-push sentence. No force push or production deployment authorized.
- Existing tracked user edits: master-plan documentation, ESLint/TypeScript configuration, public root styles/layout/page and SiteExperience. Preserve these edits. Numerous unrelated installer archives/scripts remain untracked; do not bulk-add them.
- Baseline verification from previous task: 701 tests, typecheck/build pass, lint 0 errors/17 warnings, production dependency audit 0 vulnerabilities. Reference parity remains partial. Supabase DEV has 37 migrations; never blindly reapply them.

## Completed
- [x] Read the new attached task and inspect current status, branch, remote and commits.
- [x] Establish persistent progress before implementation.
- [x] Read live public snapshots: home has hero/cards/courses/FAQ/CTA; About supplies classroom benefits and teaching philosophy; Courses/Results/Reviews/News/Gallery supply homepage catalogs. None of these live homepage records currently has a semantic section key.
- [x] Add `src/client/website-composition.mjs` describing the 12 visual section roles, current shared sources and catalog/selection relationships.
- [x] Extract pure `SitePresentation.tsx` from the server revision-watcher wrapper, keeping the same public presentation for preview reuse.
- [x] Remove the automatic duplicate results spotlight unless a separate achievement section exists; render typed statistics/video sections only once.

## In Progress
- [ ] Trace actual homepage composition, field usage, source pages and duplicate rendering.
- [ ] Establish one shared public/draft rendering contract and verify a representative editor workflow.

## Remaining
- [ ] Phase A: exact visual section â†’ field â†’ CMS record/API/database mapping.
- [ ] Phase B: intuitive section-specific editing, correct source navigation, accurate draft preview and complete publishing verification.
- [ ] Phase C: prepare normalized Student personal/guardian/admission migration and audited contracts; obtain explicit approval before cloud schema changes.
- [ ] Phase D: integrate Teacher admission/directory/profile and permitted Student profile edits.
- [ ] Phase E: responsive/accessibility checks, full required checks, scoped commits and push the current feature branch.

## Database Changes
User-approved and APPLIED to DEV as hosted version `20261020182540`: `supabase/migrations/20261020182540_student_admission_details.sql`. Adds three normalized tables, a unique sequence-backed roll, revision/idempotency/audit guarded read/write RPCs, owner-only private-photo metadata/Storage read boundary. Existing full name/Auth email/enrollments/billing stay authoritative. Direct table reads/writes are revoked; RPC reads redact emergency contact for Student and reject other Student IDs. Teacher explicitly creates admission rows; no existing-record backfill, Auth creation, enrollment changes or financial writes. Approval received and exact ACTIVE_HEALTHY DEV project verified before application. Local PostgreSQL rollback tests passed all guards and shared-record checks. Hosted functions have empty search_path, anon EXECUTE denied and authenticated EXECUTE allowed; advisors show existing categories plus four intentionally guarded authenticated RPCs. No existing Student rows were backfilled.

User-approved and APPLIED: `supabase/migrations/20261020175556_cms_teacher_private_preview.sql`, one guarded Teacher-only read RPC. Recovery: `supabase/verification/disable_teacher_preview.sql`. It exposes no new public media and changes no records or tables. Applied as hosted version `20261020175556`; verified anon EXECUTE denied, authenticated EXECUTE allowed with an active-Teacher/ownership check inside the RPC. The public-image resolver continues to deny unpublished draft images. Existing reviewed DEV target: `rkpwqgwceekuvlizfpeb`. New attachment requires approval before hosted schema changes and consequential records. Do not modify environment files or bypass RLS.

## Architecture and source map
- Exact current source IDs, fields, API/RPC/table chains and remaining parity gaps: `docs/CMS_PUBLIC_SECTION_MAP.md`.
- Relevant pre-existing public root/layout/SiteExperience/styles and ESLint/TypeScript exclusions are included in the CMS milestone so the pushed code reproduces the verified running website. Existing master-plan edits and installer artifacts remain untouched.

## Current Student implementation
- `src/client/student-admission.mjs/.d.mts`: shared validation, explicit Student edit allowlist, strict role-dependent response contract.
- `src/server/http/student-admission.mjs` and production adapter: verified JWT, expected revision, idempotency key, body-size limit, sanitized errors. Teacher admission/photo and Student admission-profile/profile-photo routes added.
- `StudentAdmissionProfile.tsx`: grouped personal/guardian/academic/address/admission forms, private photo upload/assignment, related enrollments/fee plans, database read-back; embedded in Teacher directory and Student profile. Existing Student full-name edits remain available before admission through the original guarded command.
- Hosted admission migration approved and applied; user also explicitly approved DEMO account admission tests. Real Teacher created roll `EC-2026-00000001` for existing DEMO Student, saved DEMO guardian/school/address, reloaded, and Student API read same roll with emergency contact redacted. Student on Teacher endpoint rejected 403; Student guardian edit rejected 400. Browser first attempt stopped at a selector mismatch (`Profile` vs actual `My profile`) after those successful checks; evidence retained as attempt1. Resume script accepts only this exact revision-1 DEMO fixture; no duplicate admission is created.

## Files Modified
- `docs/CODEX_PROGRESS.md` (new).
- New shared composition/presentation, Teacher-only preview page, live preview canvas/container and homepage source map.
- WebsiteAdminStudio/StructuredCmsEditor now wire unsaved structured field state into the shared presentation preview.

## Verification Results
- 2026-10-21: `npm run typecheck` passes. Full test suite: **709/709 passed** after catalog/order regressions. Full lint: **0 errors, 17 existing warnings**. Production build passed before the subsequent catalog/order correction; repeat after that correction before its commit; reviewed DEV server restarted (owned session 56723).
- Fixed a real legacy-source bug: an untyped About hero could be selected for benefits or mentor. Added a regression case with an earlier About hero.
- Added JWT forwarding/private cache/security denial tests for the Teacher preview endpoint. Public resolver restrictions remain intact.
- Preview now recovers after iframe reload, clamps zero-width sizing, has a Reload control, and shares in-flight public source requests with the visual section map. It loads actual published navigation instead of inferring an incomplete menu.
- `scripts/verify-cms-parity-browser.mjs` prepared for actual Hero unsaved-preview, publish-disabled, published-read-back and iframe-reload checks. First attempt failed at Teacher session HTTP 401 before any writes; server log subsequently shows renewed Teacher HTTP 200. The valid Teacher session is in CDP port 9334 (the original Student window). Actual shared-preview check now PASS (5 checks), including unsaved Hero rendering, public separation, disabled publication, iframe reload and Desktop width. Actual CMS CRUD/publishing script PASS; isolated DEMO fixture archived and public 404 confirmed. Student session remains unavailable.
- Supabase security advisors run after approved DDL: new preview RPC appears among intentionally authenticated guarded RPCs; existing published-only anonymous RPCs, extension-in-public and password-protection warnings remain. No new table/RLS changes.

## Known Issues
- Previous audit documents generic CMS/public composition mismatch and incomplete reference/profile workflows.
- New screenshots mentioned in the attachment were not supplied as separate files in this message. Inspect actual source and local browser; do not invent screenshot findings.
- Five development-only lint-chain dependency advisories remain upstream; production audit was clear.

## Next Exact Action
Shared-preview milestone pushed successfully. Follow-up catalog form mapping, Home-owned ordering and source refresh implemented; actual preview/navigation browser PASS (7 checks), full tests 709 pass. Commit/push this correction after refreshed build and progress update. Remaining CMS gaps: dedicated grouping beyond Hero, hidden semantic fallback handling and exhaustive per-section CRUD.  Actual Hero preview and isolated DEMO save/reload/publish checks passed. External Playwright module uses CDP port 9334 for Teacher; no Student session is currently available. Student schema audit completed; migration prepared only. Migration approved/applied; strict APIs and shared UI implemented/typechecked. Finish the resumed real Student permitted phone edit and Teacher read-back, verify private profile image flow, then run full lint/typecheck/tests/build and scoped commits/push. Both roles currently available in CDP port 9333; use authenticated existing tabs rather than creating new tabs. Teacher session renewed (both verification windows may now be Teacher); identify role from session response, never window label. Student browser sign-in is still required for final Student E2E. Preserve existing master-plan edits and unrelated untracked installer files.

## Continuation from `coaching(2).zip` — 2026-10-21

- **Source boundary:** The uploaded ZIP contains no `.git` directory or `node_modules`. It includes a local `.env.local`; this must NEVER be included in a handoff, patch, commit, or GitHub upload. Working tree and commit history are authoritative on the owner's Windows PC. The connected GitHub remote `feature/p00-foundation` was independently read at `758e94e1ddd842301ba7fd426034077e2ec73c40` before any push, with no force push.
- **Verified previously in ZIP/docs:** Codex's shared public/draft renderer, Teacher CMS preview authorization, actual DEMO CMS draft/publish/read-back, additive admission schema/RPC on DEV, Student Admission & Guardian forms, private media bridge, and partial browser verification. Do not reapply either migration.
- **This continuation fixed:**
  - Public News/Gallery `View details` previously targeted nonexistent `/site/news-events/[id]` and `/site/gallery/[id]` routes. The cards now deep-link to actual `/site/[slug]#item-[id]` anchors and show `View on page` rather than claiming a nonexistent detail page. The IDs are validated; cards have matching anchor IDs.
  - Website Admin's Homepage section map previously used only published snapshots; now it shows unsaved/current draft mapping for the actively edited source page and labels shared published sources, helping avoid editing the wrong page.
  - Student admission fee association selector previously displayed literal placeholder `? ?`; now uses readable BDT `৳` and clarifies 20-record read limit.
  - Typed Website Admin forms (Hero, Why Choose, Teacher, Contact, Footer, Course items, Reviews, News, Gallery and others) now display accessible, purpose-specific field groups. The grouping is presentation-only and exhaustive: validation, field names and Supabase schema remain identical.
- **Verification run here:** 721/721 Node tests PASS; 7/7 new targeted tests PASS; `typescript.transpileModule` syntax checks for 4 changed TSX files PASS. **Full `npm run lint`, `npm run typecheck` and `npm run build` were NOT run here**, since the uploaded archive excludes `node_modules` and this sandbox cannot reach npm/GitHub. Run all three on Windows before any push. No cloud writes or account edits were performed.
- **Read-only Hosted DEV recheck:** Student details, guardian, and admission tables exist with one existing DEMO record in each; `coaching_student_admission_read` and `coaching_student_admission_write` functions exist. The correct write-RPC's `p_expected_revision` type is `bigint`, not `integer`.
- **Still open (do not claim completion):** Complete Shifat's Tales field/animation parity; fully typed editors and relationships for every CMS visual section, including the old legacy fallback sections; full private student photo browser E2E; Student self-service edit + Teacher read-back in a genuine active Student browser session; all Teacher/Student operational CRUD live E2E; actual Windows verification and GitHub push.
- **Next exact actions:** On Windows, stop Next.js; apply the guarded `RUN_EDUCENTRE_CODEX_CONTINUATION.ps1` from this package; run the automatic four verifications. Open Teacher + real Student browser sessions and run `scripts/verify-student-admission-browser.mjs` and `scripts/verify-student-photo-browser.mjs` with an installed Playwright runtime if available. Resolve any browser failures. Review Git status and push the verified current feature branch using the optional guarded push script. Then continue exhaustive visual section-by-section CMS editor parity without new unreviewed schema changes.
