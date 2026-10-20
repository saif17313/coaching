# EduCentre continuation — 2026-10-21

## Verified against uploaded `coaching(2).zip`

- Uploaded archive: 1,401 entries, 31.26 MB uncompressed, excludes `.git`, includes `.env.local` (keep strictly private).
- Connected remote `saif17313/coaching` default and Codex working branch: `feature/p00-foundation`; last observed remote commit `758e94e1ddd842301ba7fd426034077e2ec73c40`.
- 721/721 Node tests passed after continuation; all seven newly added regression tests passed.
- TypeScript TSX **syntax** transpilation succeeded for all five modified TSX files, which does not substitute for project typecheck.
- Connected Hosted DEV database read-only query: 16 site pages; `student_details`, `student_guardians`, `student_admission_details` each currently have one record; RPC functions present. No mutations performed in this continuation.

## Actual source fixes

1. **Public card navigation:** News/Gallery cards linked to nonexistent dynamic item routes. Cards now deep-link to the existing public slug with a visible item anchor and truthful label.
2. **Homepage editor map:** The selected page's draft source is used for visual mapping, while other sources remain marked as published, avoiding mistaken assumptions about visible live state.
3. **Admission fee selector:** Correct BDT currency rendering; clarifies the bounded 20-charge list.
4. **Dedicated CMS form clarity:** Structured CMS fields are now grouped for Hero, Teacher, Courses, News, Gallery, Reviews, Contact, and Footer, with all existing fields still shown and validated identically.

## Outstanding blockers / risks

- The upload is a snapshot, not a `.git` worktree; original staged/index/untracked state cannot be recovered safely. Never reconstruct a replacement commit history from it.
- No `node_modules` or npm-network access in this sandbox: Windows full lint/typecheck/build is mandatory before shipping.
- No real Student Auth/browser session available: Student personal phone edit, private profile photo and Teacher read-back remain unverified.
- Full Shifat's Tales semantic-field and relation parity remains partial despite CMS preview and authenticated DEMO write evidence.
- This continuation did not push to GitHub or change Hosted Supabase.

## Next

Apply overlay only against exact uploaded baseline via guarded Windows installer; verify; use carefully scoped git commit/push on the owner's current branch. After that, proceed one CMS section at a time using actual screenshots and role-scoped E2E tests; track ongoing work in `docs/CODEX_PROGRESS.md`.
