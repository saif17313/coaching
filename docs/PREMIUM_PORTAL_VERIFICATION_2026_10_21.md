# Premium portal delivery and verification

The supplied four UI references define the visual direction. Their sample names, counts and trends are not application data. The two supplied background PNGs are used unchanged under `public/portal`.

## Delivered surfaces

The shared Teacher/Student shell now provides the navy sidebar, supplied background, line icons, serif titles, consistent cards/tables/forms, responsive navigation and keyboard focus handling. All 19 Teacher and 16 Student navigation surfaces retain their existing authenticated workflows. Overview, Student directory, Batch directory and Website Studio have dedicated layouts matching the references' hierarchy. Teacher settings now reads and saves the existing Teacher profile storage.

The Student directory searches the complete authorized server result, including name, roll, phone, guardian and school, with class/account/fee filters, pagination and a clearly scoped current-page CSV. Batch results include actual occupancy, capacity, subjects and saved routines. Counts come from records; no screenshot trend percentages or invented Teacher assignments are displayed. Related dashboard schedules/notices explicitly disclose their batch scope.

Website Studio has visual section navigation, grouped editors, responsive preview using the public renderer, draft save, independent read-back and separate publication. Save Draft validates the full change set first; each step retains a revision check. Concurrent changes stop subsequent steps and require review. It is intentionally not presented as an atomic multi-step transaction.

## P0 Student data root cause

The old directory projected only basic `profiles` fields. Admission, contact, guardian, school and academic fields already persisted in normalized related tables were dropped before reaching the table. The joined, Teacher-only directory RPC and strict HTTP/client contract now carry those fields through to the rendered directory. The Student's own profile continues to read its guarded normalized admission projection, independently of the legacy profile endpoint.

The live comparison checks persisted profile versus directory API versus visible table; guardian search, empty results, profile navigation and cross-role denial pass. No backfill or replacement of existing Student identities was needed.

## Database changes

Reviewed DEV project: `rkpwqgwceekuvlizfpeb`. Hosted history contains 43 migrations after these additions:

- `20261020215707_teacher_student_directory_projection.sql`: read-only joined Student directory.
- `20261020221518_teacher_batch_directory_projection.sql`: read-only joined batch directory.
- `20261020223400_teacher_account_profile.sql`: own Teacher profile read/write using existing storage, optimistic timestamp, idempotency and audit.
- `20261020225917_teacher_profile_empty_name_fallback.sql`: neutral presentation label for a legacy blank Teacher identity name; no identity update.

These retain active-role/ownership guards, empty search paths and restricted grants. Local PostgreSQL transactions verify joins/search/filter/pagination, occupancy/routine relationships, profile save/replay/conflicts, unchanged identity and Student denial, then roll back. No account, enrollment or finance records were created by this premium UI phase. The real own-profile test restored the biography/contact content; the previously missing profile now retains the neutral `Teacher account` display label. Auth identity is unchanged. The isolated CMS page was archived and its public API returns 404.

The security advisor still reports baseline extension placement, intentionally callable guarded RPCs and disabled leaked-password protection. Direct access to internal RPC-only tables remains denied. See [Supabase security advisor guidance](https://supabase.com/docs/guides/database/database-linter) and [password protection configuration](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No advisor issue was bypassed by disabling RLS.

## Verification evidence

- `docs/evidence/2026-10-21/premium/student-data.json`: real DB/API/UI Student data agreement and role isolation.
- `surfaces.json`: connected overview, batches, create form and visual CMS editing.
- `writes.json`: own profile save/read-back/restore; Student denial; CMS draft privacy, ordering, visibility, reload, publication through API and rendered HTML; archival cleanup.
- `accessibility.json`: all 35 role navigation surfaces at desktop and mobile, 70 scans, zero Axe WCAG A/AA violations and zero page overflow; mobile Tab trap and Escape pass.
- `tablet-dialogs.json`: additional tablet, CMS media/settings/mobile and modal keyboard checks.

Automated checks cover tested views and states, not an accessibility certification or a replay of every historical financial mutation. Prior admission/private-photo and academic/finance evidence remains in the historical audit documents. This phase avoids replaying permanent financial fixtures.

## Release status

The latest remote Copilot CI runner change was fast-forwarded and preserved. The existing GitHub workflow runs repository verification on feature pushes. Local release checks and final Git SHAs are recorded in `docs/CODEX_PROGRESS.md`.

Production deployment and independent live-domain verification are blocked: there is no linked hosting project for `saif17313/coaching` in the connected Vercel account, no `.vercel` project link, no release workflow, and no authenticated local Vercel CLI. The only connected project belongs to an unrelated repository. No production database target or production domain has been established. This work does not claim a production deployment or apply DEV migrations to an unidentified production database.
