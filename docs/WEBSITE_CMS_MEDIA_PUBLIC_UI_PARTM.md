# Website CMS Media + Premium Public UI — Part M

## Source and acceptance

Built from the user-exported **exact Part L Git archive** (`HEAD 8a70d6afd7`) rather than a reconstructed tree. Source-of-truth roadmap stays `docs/BACKEND_MASTER_PLAN.md`; this combined delivery is **not** a claim of complete Shifat's Tales field-level parity or 10 percentage points of measurable completion.

## Surfaces implemented

| Surface | Feature | Contract |
| --- | --- | --- |
| Teacher Website Admin | Upload vetted image bytes | `POST /api/v1/teacher/website/media/upload`; bearer JWT, UUID `Idempotency-Key`, UUID `x-media-id`, 2–200-character `x-media-alt`, raw image body, allowed MIME JPEG/PNG/WebP/AVIF, max 5 MiB, recognized image signature |
| Teacher Website Admin | Own media inventory | `GET /api/v1/teacher/website/media` (max 100 safe DTOs, no storage paths) |
| Teacher Website Admin | Attach verified media to draft item | `POST /api/v1/teacher/website/pages/{pageId}/items/{itemId}/media` `{mediaId,expectedRevision}` + UUID operation id; atomic page CAS and audit |
| Teacher Website Admin | Archive unused media | `POST /api/v1/teacher/website/media/{mediaId}/archive` `{}` + UUID operation id; refused when any draft item/teacher avatar or published page uses image |
| Public Website | Serve *only* referenced published media | `GET /api/v1/public/media/{mediaId}`; resolves via published snapshot and checks on-disk blob SHA-256, signature, MIME, exact byte count; private Storage GET under anon RLS; no caching |
| Public Website | Premium content frontend | `/` shows published `home` or honest unpublished placeholder; `/site/{slug}` shows **published snapshot only** and responds 404 if unavailable, with page SEO metadata |

Previous `PUT .../sections/{sectionId}/items/{itemId}` still edits text/link/visibility; it never grants direct client media setting. The new attachment endpoint updates `media_id` via a separate audited RPC. `coaching_cms_write('page.publish')` is upgraded to accept **only** registered, ready Storage objects with matching MIME and size, pinning media rows against concurrent archiving; all existing revision, snapshot and receipt behavior remains. Public snapshots contain `mediaId`, *never the private storage key*.

### Storage behavior

- A dedicated **private** Supabase Storage bucket `musa-site-media`, 5 MiB maximum and image-only MIME allowlist, is created in **local migration 027**.
- `storage.objects` INSERT policy: only active teachers and matching Auth UID / UUID asset key. No client UPDATE, DELETE or upsert policy.
- `storage.objects` SELECT policy: active teacher may see their own object; anon/authenticated may retrieve **only** objects referenced by a currently published snapshot. There are no client DML grants to `public.media_assets`.
- Server upload endpoint validates magic bytes and computes SHA-256, uploads using **the same teacher bearer JWT** (no service-role key), then calls audited registration RPC. The SQL function also asserts the object is present in Storage with matching MIME/size. Direct caller-provided hash is **not independently trusted**; public media delivery verifies SHA-256 against the actual downloaded bytes and denies mismatches.
- If Storage succeeds but registration fails, a **private orphan object** can remain. It is not published. No automatic cloud deletion or client deletion capability has been introduced. Operations must use a reviewed cleanup procedure.
- Image content is served by a same-origin API, with `nosniff`, restrictive CSP, and `no-store` so page archive promptly removes access. File signature validation is defense in depth and is not a substitute for full image decoding/re-encoding. For production acceptance, also test adversarial malformed/polyglot images and Storage behavior with real Auth JWTs.

### Premium visual system

New public website uses deep navy **#132943**, teal-jade **#087c70**, soft ivory **#f8f7f2**, warm-gold accent **#d6ae68**. Previous information hierarchy is retained but not the old exact theme. Includes refined responsive nav, hero, content cards, galleries, FAQ accordions, mobile-friendly links, keyboard-focus states and reduced-motion support. CMS pages render text safely with React escaping; no raw HTML insertion, hardcoded course testimonials, fabricated results or invented social proof.

**Not implemented in Part M:** teacher/student/CMS authenticated browser app dashboards, Auth login UX/session lifecycle, verified CMS media thumbnail preview during draft, media replacement or delete, upload cleanup, attached expense receipts, backend Student materials upload, PDF generator, exact original Shifat's Tales field-by-field parity, deployment/cloud migrations, signed-JWT browser plus real Storage E2E. These remain open work items for Parts N/O and readiness checks.

### Required verification

1. Guarded installer validates exact Part L branch/HEAD, 26 baseline local migration sources, selected committed source checksums, no index changes, and all payload SHA-256.
2. Real `npm test` (535 tests), `npm run lint`, `npm run typecheck`, `npm run build` on Windows.
3. Local-only SQL migration 027 `20261019000500_cms_verified_private_media.sql`, Supabase local schema lint, and **rollback-only** PostgreSQL QA `scripts/local-cms-media-partm-qa.mjs` against `supabase_db_coaching`. SQL QA verifies object metadata/published boundaries/receipts; **not** actual Storage API media bytes.
4. Three exact-file feature commits on `feature/p00-foundation`, never `git push`, never cloud SQL, never `.env` edit, never activation of `COACHING_ENABLE_MUTATION_APIS`.
5. Before production activation: real Supabase Auth user teacher + student + anon, upload/attach/publish/view/archive in local Storage HTTP (including denied upload/read), verify private storage object, test high concurrency, and upgrade image validation before accepting arbitrary external files.

No other migration source is changed. If migration or QA fails after DB apply, do not reset or blindly rerun; inspect log and issue guarded resume package.
