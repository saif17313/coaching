# Musa Sir — Website CMS Part J, Global Settings and Public Navigation

Scope: **5 API routes**, one local-only additive SQL migration (022), no Supabase Storage upload. All CMS writes are protected by active verified teacher role, JWT, the existing default-OFF mutation switch, an Idempotency-Key UUID, serializable row locks/optimistic revision checks, atomic audit and mutation receipts.

- `GET /api/v1/teacher/website/settings` — teacher-only draft settings and revision (`revision=0` if not configured). First draft has placeholder email `admin@example.org`, **never publicly published automatically**.
- `PUT /api/v1/teacher/website/settings/draft` — `{expectedRevision,settings:{siteTitle,tagline,contactEmail,contactPhone,footerText,logoMediaId:null}}` and Idempotency-Key. New settings expect revision 0, later updates compare current revision. All six settings keys mandatory. Server blocks logo IDs until reviewed Storage verification exists.
- `POST /api/v1/teacher/website/settings/publish` — `{expectedRevision}` and Idempotency-Key. Publishes immutable-by-revision settings snapshot; later edits do not modify the public copy.
- `POST /api/v1/teacher/website/pages/{pageId}/archive` — `{expectedRevision}` and Idempotency-Key. Revokes public page visibility *without deleting history*, replay safe; archived page disappears from `GET /api/v1/public/site-pages/{slug}`.
- `GET /api/v1/public/site-navigation` — anonymous minimal list of published pages with only `slug` and `title`; max 50, no draft metadata, no public base-table grants.

SQL migration: `supabase/migrations/20261018001500_cms_settings_navigation_archive.sql`. New reviewed functions: `coaching_cms_get_settings_draft`, `coaching_cms_settings_write`, `coaching_cms_archive_page`, `coaching_cms_public_navigation`. No other migrations changed. **No new direct table grants**; no service-role tokens, cloud changes or automatic mutation flag toggle.

Rollback-only local PostgreSQL QA verifies content, revision checks, replay, anon vs student vs teacher, settings publication, archive removal, audit receipts and absence of table grants; test fixtures are always rolled back. Local Node tests, ESLint, TypeScript and Next build must pass before applying local SQL and creating local commits. If SQL application or QA fails, STOP; do not reset DB or blindly retry.

Not complete: exact Shifat's Tales component-field parity (source unavailable), real media upload/storage verification, CMS browser editor, frontend page renderer, cache revalidation, contact-form delivery, cloud migrations 011–022 and live signed-JWT E2E. Media/logo cannot be published until a verified upload pipeline is implemented. The pre-existing `admin@example.org` template is placeholder only, not a real contact address.
