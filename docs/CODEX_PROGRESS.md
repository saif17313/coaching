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
Full npm run verify passed: structure, lint (zero errors/17 existing warnings), typecheck, 725 tests, zero production dependency vulnerabilities and optimized production build. The optimized runtime was then started locally; signed Teacher/Student reads, public HTML and final mobile audit keyboard scrolling/contrast/overflow checks PASS. This is a local production-build smoke, not a hosted deployment. Restore the reviewed local DEV launcher after stopping that smoke server.

## Deployment Blocker
No repository-linked project exists in connected Vercel account. Only an unrelated project is connected. No `.vercel` link, authenticated Vercel CLI, release workflow, established production domain or production DB target exists in this workspace. Existing GitHub workflow verifies feature pushes; it does not deploy. Do not deploy to the unrelated project or claim live production verification.

## Next Exact Action
All release verification and final mobile audit checks passed. Local DEV server restored with reviewed gates. API/schema milestone committed as 338dc6d. Scope staging to this task's source/assets/migrations/tests/evidence/docs, excluding payloads, environment files and diagnostics. Scan staged content for credentials without printing them. Commit, push normally, verify remote SHA, update this file and report the genuine hosting blocker.
