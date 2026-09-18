# Phase 0 Part B — Preflight

Run from the repository root before applying the patch.

```powershell
git branch
git status --short
```

Expected:
- branch: `feature/p00-foundation`
- any existing changes must be only files introduced/updated by this Part B ZIP.
- `next-env.d.ts` and `APPLY-PART-B.ps1` are tolerated by the runner and are never committed by Part B.

Do not run `git clean`, `git reset --hard`, or delete source files manually.
