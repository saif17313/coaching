# Teacher Profile/Settings + Website CMS Core — Offline Handoff

**Scope:** Shifat's Tales-compatible backend operations for teacher profile/preferences and a versioned, typed website CMS core. This package ships **no working UI, no authenticated HTTP routes, no production persistence port, and no live integration**. Do not count whole phases as completed.

## Covered surface / route handoff

| Existing Shifat's Tales surface | Offline service operation | Still required |
|---|---|---|
| `/teacher/profile` | `getMyProfile`, `updateMyProfile` | Verified Supabase auth; profile RPC, audit, UI |
| `/teacher/settings` | `getMyPreferences`, `updateMyPreferences`, `requestCredentialChange` fail-closed | MFA/password reauthentication via Supabase Auth; settings UI |
| `/teacher/website` | `createPageDraft`, `updatePageDraft`, `publishPage`, `archivePage` | Teacher CMS screen, protected APIs, real transactional adapter |
| `/teacher/website/courses/hero` | `upsertSectionDraft` (hero kind), `upsertItemDraft` | Original field-by-field component parity + media upload |
| `/`, `/about`, `/courses`, `/gallery`, `/results`, `/contact` | `getPublicPage` (safe published snapshot reader) | Public route integration, caching, SEO and component rendering |
| Global footer / SEO | `updateGlobalDraft`, `publishGlobal`, `getPublicGlobal` | Versioned DB RPC, public cache invalidation |
| Website media | `registerMediaMetadata`, `archiveMedia` | Actual storage policy, upload verification, safe media serving |

Other CMS surfaces in master plan (materials, academic calendar, routine, news/events, reviews, etc.) have only a generic section/item vocabulary here. Their complete original schemas, admin forms and public renderers remain **PENDING**.

## Security and consistency

- All teacher actors are expected to be **verified server-side**; caller-supplied `verified: true` is not trustworthy. Production auth gate must derive actor exclusively from Supabase Auth and teacher status, never request JSON.
- Database adapter **rechecks** teacher website privileges and active status in the transaction before changing rows.
- Profile patch strictly forbids role, email, account status, authentication metadata and teacher ID mutation.
- Credential/email/password/MFA operations intentionally return `AUTH_REAUTH_INTEGRATION_REQUIRED` until real Auth flow is implemented.
- Website drafts, section items and media metadata stay protected. Public consumers fetch an **immutable published snapshot**, not base draft rows. Nested public payloads are recursively validated using an explicit schema.
- Revision compare-and-swap, slug uniqueness, asset readiness, snapshot pointer update and audit append must be enforced **inside one serializable/locked Postgres transaction**. JavaScript validation alone is not sufficient against concurrent editors.
- Published media must not be removed while referenced by a published snapshot. Storage keys are never exposed by public projections.
- No base-table RLS read/write grants for anonymous clients; publication will require a reviewed server-only read endpoint or stable SECURITY DEFINER function with controlled privileges and safe returned columns.
- Do not render raw CMS text as executable HTML; use escaped text/allowlisted components.
- External item links require `https:`. External links should apply `rel="noopener noreferrer"` when opening new tabs.
- Audit rollback is mock-tested. Live PostgreSQL, Supabase Storage and RLS are **not** tested.

## Exact verification

- `npm run verify:structure`
- `npm test` (baseline 80 + this package's 21 = expected 101 if no divergent local changes)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Deferred tasks before accepting feature parity

1. Implement authenticated server principal, teacher scoping and persistent transaction ports; migration schema review and integration in an isolated Supabase project.
2. Build protected `/api/v1` teacher routes for profile, preferences, pages, sections, items, media and publication; validate payloads; rate-limit mutations; add tests.
3. Build public publication readers and safe caching, ensure unpublish/rollback cache invalidation.
4. Compare every old Shifat's Tales CMS page and section in source, including courses hero, dynamic material/result references and uploaders; document all divergences and corrections.
5. Complete teacher account security, email update/reverification and MFA; verify with real auth sessions.
6. Run malicious-content, schema-RLS, concurrency, rollback and end-to-end tests against actual service/database adapters.

**Nothing applied to Supabase. No Git commit or push.**
