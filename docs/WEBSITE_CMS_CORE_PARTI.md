# Website Admin / CMS Core — Part I (local-first)

**Status:** Combined, local-only core CMS backend package. This is **not** complete Shifat's Tales section/field parity or website UI. The exact Shifat's Tales CMS components and original type schema were not supplied for this package, so page-specific fields remain unverified.

## Nine protected HTTP endpoints

- `GET /api/v1/teacher/website/pages` — teacher-only bounded page inventory (max 50).
- `GET /api/v1/teacher/website/pages/{pageId}` — owned CMS draft/section/item projection; teacher-only.
- `POST /api/v1/teacher/website/pages/create` `{id,slug,title,seoTitle,seoDescription}` + `Idempotency-Key: UUID` — create draft.
- `PATCH /api/v1/teacher/website/pages/{pageId}/edit` `{expectedRevision,title?|seoTitle?|seoDescription?}` + UUID operation key — optimistic draft edit.
- `PUT /api/v1/teacher/website/pages/{pageId}/sections/{sectionId}` `{expectedRevision,kind,order,heading,body,visible}` + UUID key — ordered section upsert.
- `PUT /api/v1/teacher/website/pages/{pageId}/sections/{sectionId}/items/{itemId}` `{expectedRevision,order,title,description,url,visible}` + UUID key — item upsert.
- `POST /api/v1/teacher/website/pages/{pageId}/publish` `{expectedRevision}` + UUID key — atomic published snapshot.
- `GET /api/v1/public/site-pages/{slug}` — anonymous published snapshot only, HTTP 404 if never published.
- `GET /api/v1/public/site-settings` — only allowlisted, explicitly published global settings or `null`.

`create/update/section/item/publish` use the single audited `coaching_cms_write` SECURITY DEFINER PostgreSQL function with signed teacher identity, revision locking, shared mutation receipts/idempotent replay, atomic audit and immutable snapshot generation. Cached public pages intentionally disabled in this phase. Public reader never queries mutable sections on demand; it fetches the stored snapshot. Direct anon/authenticated CMS table SELECT/INSERT/UPDATE/DELETE remain revoked. All teacher mutation APIs are **OFF by default** via `COACHING_ENABLE_MUTATION_APIS` and the installer never toggles that switch.

**Media boundary:** This package is **text + HTTPS link CMS only**. Item media attachments, Supabase Storage bucket/signatures, upload verification and material upload/publish are NOT implemented. SQL rejects publishing visible unverified media; application DTO rejects non-null mediaId. Don't add image uploads by bypassing this gate.

**Additional work:** Global settings draft/update/publish, page archiving, delete/reordering UX, precise Shifat's Tales Home/About/Courses/Gallery/Results/Contact etc. field parity, media upload pipeline, public caching/revalidation, live signed-JWT HTTP tests, browser UI, cloud migration and production hardening remain pending.

**Acceptance:** Existing local migration count 20, new local migration 021 (`20261018001400`); 405 Node tests (384 baseline+21 focused), ESLint/typecheck/build, Supabase local schema lint, rollback-only PostgreSQL QA; 3 feature-wise local commits. The installer stops and preserves database/files on failed local SQL QA. Never reset DB, push Git or apply cloud migrations automatically.
