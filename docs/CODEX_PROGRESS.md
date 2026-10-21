# EduCentre - Codex Progress

## Current Phase
2026-10-21, Asia/Dhaka. Premium UI + production integration task: supplied Teacher/Student/CMS references, missing Student information fix, preserved real workflows, verification, commit/push and existing production deployment if available. Credentials stay in memory/local browser only. No environment files changed.

## Git Baseline
- Repository `E:/projects/Musa Sir/coaching`, branch `feature/p00-foundation`, origin `https://github.com/saif17313/coaching.git`.
- Current baseline `4307eb2`, fast-forwarded from `150c24d` to preserve the remote Copilot CI runner merge. The different prior untracked installer runner was preserved in a unique TEMP backup before merging. No reset/force push.
- Earlier shared presentation milestone `758e94e` and external continuation fixes remain preserved.

## Completed
- [x] Shared premium shell, unchanged supplied backgrounds, line icons, serif heroes, cards/tables/forms and responsive navigation across all 19 Teacher and 16 Student surfaces.
- [x] Dedicated connected Overview, Students, Batches and Website Studio layouts. No screenshot sample names/counts/trends used as business data.
- [x] P0 directory fix: profile-only projection dropped normalized admission/contact/guardian/academic data. Joined Teacher-only RPC, strict API/DTO, populated table, complete server search, filters, pagination and current-page CSV preserve it.
- [x] Real batch occupancy/capacity/subjects/routines and filtering; existing create/edit/archive/duplicate-form workflows retained.
- [x] Teacher settings connected to existing storage with own-user guards, timestamp lock, idempotency, audit and read-back. Neutral label handles legacy empty identity names without changing Auth identity.
- [x] CMS visual section cards, grouped editors, public-renderer preview, separate Save Draft/Publish. Full change-set prevalidation and revision checks between steps; concurrent/partial saves explicitly require review.
- [x] Modal Tab trap/Escape/focus restoration; inert closed mobile navigation and focus handling; corrected text contrast. Final mobile audit table scrolls to keep identifiers readable.
- [x] Repository checks exclude unpacked installer payloads. Original artifacts preserved.

## Database Status
- Exact DEV target `rkpwqgwceekuvlizfpeb`, PostgreSQL 17.11. Hosted migration count 43; canonical versions match local filenames. Do not reapply.
- Earlier approved preview/admission migrations `20261020175556` and `20261020182540` remain applied.
- New authorized additions: Student directory `20261020215707`; batch directory `20261020221518`; own Teacher profile `20261020223400`; empty-name display fallback `20261020225917`.
- Local PostgreSQL rollback tests pass joined fields/search/filter/pagination, occupancy/routine/subject joins, role denial, profile save/replay/stale timestamp/input validation and unchanged identity.
- RLS/grants remain enforced. No account/enrollment/finance writes in this phase. Own-profile biography/contact restored after E2E; previously absent profile retains neutral Teacher label. Auth identity unchanged. Isolated CMS fixture archived; public 404 confirmed.
- Security advisors checked after DDL: baseline extension placement, callable guarded RPCs and leaked-password protection warnings remain. See the verification report for links. No RLS bypass.

## Verification Results
- 725/725 tests pass; typecheck passes; lint zero errors, 17 existing warnings; production dependency audit zero vulnerabilities.
- Real Teacher/Student DB/API/UI Student data comparison, guardian search, empty results, profile navigation and role isolation PASS.
- Real Teacher settings save/read-back/restore and Student denial PASS.
- Isolated CMS draft privacy, Save Draft, reorder, visibility, reload, publish and independent public API/HTML confirmation PASS; archived afterward.
- All 35 role surfaces at desktop/mobile: 70 Axe WCAG A/AA scans, zero violations or page overflow. Mobile menu keyboard checks PASS.
- Additional 13 tablet/CMS mobile/dialog scans: zero violations/overflow; modal Tab/Escape/focus restoration PASS.
- Evidence: `docs/evidence/2026-10-21/premium/`; report: `docs/PREMIUM_PORTAL_VERIFICATION_2026_10_21.md`.
- Historical admission/photo/academic/financial evidence preserved. Do not replay permanent admission or financial fixtures. Existing approved DEMO Student admission revision is 4.

## Release Check
Full npm run verify passed: structure, lint (zero errors/17 existing warnings), typecheck, 725 tests, zero production dependency vulnerabilities and optimized production build. The optimized runtime was then started locally; signed Teacher/Student reads, public HTML and final mobile audit keyboard scrolling/contrast/overflow checks PASS. This is a local production-build smoke, not a hosted deployment. The reviewed local DEV launcher is restored and its non-mutating dry run passes.

## Deployment Blocker
No repository-linked project exists in connected Vercel account. Only an unrelated project is connected. No `.vercel` link, authenticated Vercel CLI, release workflow, established production domain or production DB target exists in this workspace. Existing GitHub workflow verifies feature pushes; it does not deploy. Do not deploy to the unrelated project or claim live production verification.

## Commit / Push / CI Status
- API/schema milestone: 338dc6d. Premium UI/workflow/evidence milestone: fd5f86f.
- Both pushed normally to feature/p00-foundation; remote full SHA matched fd5f86fd532383ba2717ca7ba07119bfb7260ec8.
- GitHub Verify run 39513975649, job 118941555824: completed SUCCESS; npm run verify completed 2026-10-20T23:18:00Z. Evidence saved under premium/github-verification.json.
- Final documentation and reviewed DEV launcher are being committed as the handoff. All source changes and live DEV/local production-build verification are complete. Remaining installer ZIPs/payloads and diagnostic failure artifacts are unrelated and remain unstaged.

## Remaining External Blocker
Hosted production deployment and live-domain verification require an authorized hosting project linked to this repository and an established production configuration. None is available through current access. Do not create an unrelated deployment or claim success. No further permission is required for the completed code/DEV work.

## New task 2026-10-21
New prompt 2b41db98: replace long CMS with actual schema-driven nested navigation and context editors/previews; polish public site, video and complete student/admission/payment workflows. Baseline e83ddc4, main and feature both at baseline. Repository-linked Vercel project still unavailable through connector; supplied educentre-iota URL also currently fails network fetch. Implement safely first; preserve records and publishing semantics.

## CMS / workflow upgrade milestone
Schema-driven recursive CMS navigation and focused content/preview implemented, long stacked forms removed. Public premium theme and placeholder-claim omission added; YouTube thumbnails/player updated. Grouped Student profile, extended application/documents, verified vs pending payment reports, exact fee breakdowns and management reporting implemented. New migration 20261021133233 applied once to established project rkpwqgwceekuvlizfpeb; hosted count44. Local SQL rollback checks pass core identity preservation, private notes/doc isolation, charge assignment, pending-not-collected, verification replay, duplicate reference denial, installments/balances and approval policy gates. Legacy APIs unchanged. Source assertions still need updating for the new component boundaries; 11 new behavioral tests pass. Next: restart owned DEV server for new route exports, authenticated CMS/profile/payment and responsive checks, full checks, push feature, then existing Git-to-Vercel main production release and live verification. Current production origin educentre-iota.vercel.app works through Chrome; GitHub Vercel status identifies saif-411a/educentre, despite connector managing another team. No secrets/env changes.

## Current upgrade verification (supersedes historical deployment blocker)
Both production roles now authenticate at https://educentre-iota.vercel.app. The existing deployed Teacher write gateway reports enabled/reachable; Student-to-Teacher request is denied403. Existing Git integration is saif-411a/educentre; origin main and feature remain e83ddc4 before release. Two additive migrations applied once: 20261021133233 workflow/payments and 20261021140445 Home layout; hosted count45. Local rollback SQL passes financial and Home publish/isolation checks. 739 automated tests pass. Real CMS nested field/reset, typed video normalization/private draft/preview/publish/readback pass; fixture archived. Existing identity lookup, private-note redaction and Student isolation pass. One-paisa DEMO report rejected with unchanged real ledger; original workflow fields restored. All70 role viewport Axe scans and33 focused/public scans pass after correcting decorative mobile overflow and public caption contrast. Final document access test and full verify/build/release remain. No env changes, no existing financial writes or identity changes. Next: finish tests, stop owned DEV for production build, review/stage only authorized source/evidence, push feature/CI, fast-forward existing main workflow, verify live production UI/data/permissions.

Final local release checks pass build, typecheck, lint0errors/17warnings,739tests, optimized-server signed reads/newworkflow APIs/mobile/public HTML. Local npm audit DNS failed twice; require GitHub Verify success including audit before main production release. Staged authorized76files only; credential scan reports zero findings. Unrelated installer payloads and diagnostic failures remain unstaged.

## Hosted release verified
Application5d37352897397cf3b3e92a744dde2ce73f7057d1 is pushed to feature and main; feature/main GitHub Verify runs39619916111/39620291625 SUCCESS including npm audit. Vercel completed GjiNSovyhYMoC53xL1nQv2gfvF9Z after delay. User clarified main is not the configured Vercel branch; no Vercel production-branch settings were changed. Same source commit is already on feature. The live domain now serves the new CMS and APIs. Live Teacher/Student financial reconciliation, private notes redaction,Teacher403isolation,context CMS/Home,UI save/private404/publish/publicHTML and mobile public layout PASS. Isolated livefixturearchived404; no financialwrites. Target-team connector still403 but establishedGitdeployment works, so no access change is needed. Preparing final verification-script/evidence/docs commit on feature; leave unrelatedpayloadsunstaged. ReviewedlocalDEV launcher restored afteroptimizedsmoke.

User confirmed actual Vercel production branch feature/p00-foundation; final pushes stay there. Live release5d verified; evidence commitde0b613 pushed. Final public footer check found a reservedexample.orgcontact stillvisible; addedsharedpresentationfilter for reservedemails(publicsettings andtypedcontact),preservingallstoredvalues andrealemails.740tests/typecheck/lintpass; finalbuildrunningbeforefeaturepush. Thenconfirm livefakecontactremoved andfinalCIpass; restoreDEV.
