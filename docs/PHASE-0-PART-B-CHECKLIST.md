# Phase 0 Part B — Manual Verification

| Check | Command | What it verifies |
|---|---|---|
| Structure | `npm run verify:structure` | Required architecture exists |
| Lint | `npm run lint` | Static code quality |
| Typecheck | `npm run typecheck` | TypeScript correctness |
| Tests | `npm test` | Automated behavior |
| Audit | `npm run audit:prod` | Production dependency vulnerabilities |
| Build | `npm run build` | Production build integrity |
| Aggregate | `npm run verify` | All quality gates together |
| Git | `git status` | Working tree state |
| Branch | `git branch` | Current development branch |

Manual API check:
`GET /api/v1/health` should return HTTP 200 and `{ "success": true, "data": ... }`.
