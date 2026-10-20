# EduCentre â€” Codex Progress

## Current Phase
Phase A source map established; Phase B shared renderer and real iframe preview are being implemented. Updated 2026-10-21 (Asia/Dhaka).

## Baseline / Git HEAD
- Workspace: `E:\projects\Musa Sir\coaching`; branch `feature/p00-foundation`; starting HEAD `f9c83a5`.
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
User-approved and APPLIED: `supabase/migrations/20261020175556_cms_teacher_private_preview.sql`, one guarded Teacher-only read RPC. Recovery: `supabase/verification/disable_teacher_preview.sql`. It exposes no new public media and changes no records or tables. Applied as hosted version `20261020175556`; verified anon EXECUTE denied, authenticated EXECUTE allowed with an active-Teacher/ownership check inside the RPC. The public-image resolver continues to deny unpublished draft images. Existing reviewed DEV target: `rkpwqgwceekuvlizfpeb`. New attachment requires approval before hosted schema changes and consequential records. Do not modify environment files or bypass RLS.

## Architecture and source map
- Exact current source IDs, fields, API/RPC/table chains and remaining parity gaps: `docs/CMS_PUBLIC_SECTION_MAP.md`.
- Relevant pre-existing public root/layout/SiteExperience/styles and ESLint/TypeScript exclusions are included in the CMS milestone so the pushed code reproduces the verified running website. Existing master-plan edits and installer artifacts remain untouched.

## Files Modified
- `docs/CODEX_PROGRESS.md` (new).
- New shared composition/presentation, Teacher-only preview page, live preview canvas/container and homepage source map.
- WebsiteAdminStudio/StructuredCmsEditor now wire unsaved structured field state into the shared presentation preview.

## Verification Results
- 2026-10-21: `npm run typecheck` passes. Full test suite: **707/707 passed**. Full lint: **0 errors, 17 existing warnings**. Production build passed; reviewed DEV server restarted (owned session 56723).
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
Commit and push the verified shared-preview milestone; then finish homepage ordering/visibility, remaining dedicated field groups and publication refresh. Actual Hero preview and isolated DEMO save/reload/publish checks passed. External Playwright module uses CDP port 9334 for Teacher; no Student session is currently available. Student database/UI work has not started; prepare a concrete additive migration for approval next. Preserve existing master-plan edits and unrelated untracked installer files.
