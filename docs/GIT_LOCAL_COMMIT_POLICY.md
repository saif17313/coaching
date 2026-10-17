# Musa Sir: Local Feature-Commit Policy

- Commit completed work **locally**, grouped by feature: database/foundation, auth, teacher, student, learning resources, finance, routines, academics, website CMS, API integration, tests, and documentation.
- Use concise Conventional Commit messages (e.g. `feat(teacher): ...`, `fix(security): ...`, `test(integration): ...`).
- Validate a changed feature (tests, lint, TypeScript, Next build) before committing; investigate test failures and do not hide them.
- **Never push or publish a branch unless the user explicitly requests it.** A local `git commit` is allowed after verification; publishing needs separate approval.
- Stage explicit source paths, **not** `git add .` or `git add -A`. Review staged diff/check for accidental secrets and unneeded artifacts.
- Never commit `.env.local`, Supabase tokens/keys, service-role credentials, CLI auth cache, migration backup copies, installer ZIPs/extracted packages, generated `.next` artifacts or user-specific system files.
- Keep existing, unrelated local work unchanged; do not reset, clean, discard or rewrite others' commits. No history rewrite without explicit permission.
- At the end of each delivery report new commit hashes and the exact tested scope, and state explicitly whether the work is only local.
- Before remote DB migrations, separately verify the project identity, migration hashes, dry run and authorization.
