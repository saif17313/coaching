# Teacher Profile / Website CMS Transaction Port Contract

This describes the required production adapter boundary; it is not an implemented database connector.

## Public methods

- `getTeacherProfileAuthorized(actorId)` returns only an owned `{id,displayName,bio,phone,avatarMediaId}` projection.
- `getTeacherPreferencesAuthorized(actorId)` returns only `{teacherId,theme,locale,emailNotifications,pushNotifications}`.
- `readPublishedPage(slug)` returns `null` or `{slug,status:'published',publishedRevision,snapshot}`. Never query `site_page_sections` from a public request without a published-snapshot gate.
- `readPublishedGlobal()` returns `null` or strictly typed public settings with `revision`.
- `inTransaction(callback)` invokes `callback(tx)` in a **single atomic transaction**; exceptions must roll back ALL state, including audit writes.

## Transaction methods

Teacher/account: `assertTeacherActive`, `assertPublicReadyMedia`, `updateTeacherProfile`, `updateTeacherPreferences`, `appendAudit`.

CMS privilege: `assertCanManageWebsite`.

CMS content: `assertSlugAvailable`, `insertPageDraft`, `getPageLocked`, `updatePageDraft`, `assertSectionIdAvailableForPage`, `upsertSectionDraft`, `assertSectionInPage`, `assertItemIdAvailableForSection`, `upsertItemDraft`, `getPageDraftSnapshotLocked`, `assertSnapshotMediaReady`, `publishSnapshotAtomic`, `archivePageAtomic`.

Media: `assertUploadedMediaVerified`, `registerMediaReady`, `assertMediaNotInPublishedSnapshot`, `archiveMedia`.

Global: `getGlobalSettingsLocked`, `updateGlobalDraft`, `publishGlobalAtomic`.

## Atomicity and concurrency requirements

- Lock the target page/settings rows (`SELECT ... FOR UPDATE`) and compare `expectedRevision`, then update and increment draft revision in the same transaction.
- Enforce `UNIQUE(slug)` and object-ID/section-ID relationships in PostgreSQL. Prevent duplicate section/item orders within a public snapshot.
- Create an immutable **published** snapshot and advance the publication pointer atomically; the public reader must never assemble a snapshot from mutable draft rows.
- Enforce media upload verification using **trusted storage metadata** and content inspection; the metadata validation in JavaScript is not upload security. Always enforce content type, size and storage ownership server-side.
- Use the authenticated, enabled teacher identity from Supabase Auth for `actorId`. Callers never supply a trusted actor.
- `appendAudit` must be in the same transaction. Audit failures roll back the business mutation.
- Direct `anon` or `authenticated` INSERT/UPDATE/DELETE on CMS, settings, teacher profile and media base tables must remain impossible; use reviewed, scoped RPCs or strictly server-only adapters.
- The SQL draft currently has **no** live RPC implementation, no storage policy, and no public content API. Review schema and add those before production deployment.
