# Card management and carousel repair

The user reported that image-card editing/addition was difficult to find, Delete was missing, and the course carousel should keep its active card centered while rotating sequentially.

Every CMS section now exposes a card manager before the section fields, with a visible Add card action, image thumbnails, explicit Edit card, move up/down, Duplicate, Hide/Show and Delete card. New cards open directly in their full editor. Common title, description, link and visibility fields stay available even for typed catalogs; their schema-specific fields remain editable separately. Card image upload, image-library selection and removal use the existing authenticated Supabase media pipeline. Cloudinary is not needed.

Image attachment/removal is now a pending draft change. Editing text and then uploading an image no longer forces an immediate page reload that discards the text. Save draft/Update card serializes text, structured fields, presentation and image changes using the latest read-back revision. Active uploads block saving/publishing. Published visitors continue to receive the prior snapshot until Publish.

Teacher-only deletion is added through the existing organization endpoint. The migration `20261022081801_cms_draft_card_deletion.sql` was rollback-tested locally and applied to the existing hosted project. It validates the page/section/item relationship, takes the page revision lock, checks replay payloads and records removed content in the audit log. It deletes only draft records; published snapshots and image objects are retained. Existing organization operations delegate to the prior guarded implementation, whose direct client grants are revoked. No account, enrollment, financial or genuine authored records were deleted during verification.

The active carousel card now has explicit horizontal and vertical center anchoring, retaining its depth/slide transitions, sequential controls, autoplay, hover/focus pause, swipe and reduced-motion behavior. Ordinary card groups also center their last row instead of filling left-hand grid tracks.

Verification:

- 755 automated tests pass; typecheck, relevant ESLint review and optimized build pass. Existing lint warnings are unchanged.
- Actual Teacher browser flow passes Add/Edit/Save on gallery, news, reviews, results, courses, cards, materials, routine and academic-calendar sections in an isolated archived fixture.
- Typed Gallery editing, image upload after text edits, duplicate, reorder, delete, public read-back and draft/public deletion separation pass.
- CMS at 375px has no horizontal overflow.
- Active carousel is centered within 2px at 375/768/1440/1920px; sequential navigation, autoplay and reduced-motion checks pass.
- PostgreSQL rollback checks pass deletion, stale/foreign target denial, idempotent replay, preserved published snapshots, deletion audit and non-Teacher denial.

Evidence: `docs/evidence/2026-10-22/card-management.json`, `centered-carousel.json` and `centered-carousel.png`. Browser verification scripts create only isolated DEMO fixtures and archive them afterward. Full media editing remains available through the existing Website Studio and private media library.

Deployment uses the existing `feature/p00-foundation` delivery branch. The Vercel team's production promotion access remains outside the connected account; a successful preview build must not be described as confirmed production activation.
