# Coaching Management System

Backend-first, modular coaching management system.

## Current status

- Phase 0 / Part A: Repository Bootstrap
- Baseline commit is created locally on `main`.
- Script then switches to `feature/p00-foundation`.
- Nothing is pushed automatically.

See `docs/BACKEND_MASTER_PLAN.md`.

## Requirements

- Node.js 20.9+
- npm
- Git

## Commands

```bash
npm install
npm run verify:structure
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

## Architecture

Reusable backend logic belongs in `src/server`. UI must not own business rules.

## Secrets

Never commit real credentials. Local secrets belong in `.env.local`; repository placeholders belong in `.env.example`.
