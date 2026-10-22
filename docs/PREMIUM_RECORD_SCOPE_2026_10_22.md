# Management record sources and premium public presentation

The reported single Student was a real data-source distinction: the registered-account directory contains one Student account, while the isolated demo workspace contains 51 fictitious students, 11 batches and 81 enrollments. No seed was missing. The prior interface placed the samples behind a separate menu, so the main Students screen did not expose them clearly.

The main Teacher management screens now expose a persistent Registered records / Sample workspace switch. When an existing active sample workspace is present and no choice has been saved, it opens the sample source. Students, Batches, Enrollments, academic plans and sample finance load the same authorized database-backed workspace from the primary navigation. Registered account counts and genuine financial reports remain separate; no fake Auth accounts or extra emails were created. The registered source still correctly shows the one existing Student. Student access remains restricted to the Student's own authorized data.

The public presentation adds layered lighting, restrained orbital decoration, frosted surfaces, deeper image/card framing, richer typography, pointer-responsive card depth and revised shadows. Existing editorial copy, photos, cards, links and ordering are preserved. Motion respects reduced-motion preferences and can be disabled globally. Course-card text remains opaque and readable while imagery retains the depth effect. The same presentation renders in CMS previews.

Global CMS controls now include premium/classic appearance, a motion switch, and 34 bounded interface labels for navigation, branding, footer headings, card/course controls, section eyebrows and discovery/search copy. Existing page/section/card fields, image uploads/cropping, ordering, visibility and draft deletion continue to work. Home's Website appearance & interface section exposes these controls; Global identity links directly to it. Shared Home catalog selections now link to the actual source catalog and restrict record choices to that catalog, rather than offering new Home cards that its selection renderer would ignore.

Migration `20261022154412_editable_website_interface.sql` extends the existing closed field schemas without new table grants or RLS changes. It was tested inside a rollback transaction and applied to the hosted project. An empty, backward-compatible global-control section was added to Home and published after verifying no unpublished edits existed. Its defaults preserve existing text and remain readable by the preceding deployment; existing editorial sections were retained. New fields are saved only when edited in the new CMS.

Verification evidence:

- 756 automated tests pass; typecheck, lint (zero errors, 17 existing warnings), optimized build and foundation/schema checks pass.
- Actual Teacher browser checks verify all 51 samples in the main Students menu, registered-only counts, 11 batches, 81 enrollments, academic/finance record counts, persisted source choice and unchanged genuine totals.
- Unsaved header-label and appearance/motion edits render in the actual iframe preview and do not appear on the public website; reset returns to the stored content.
- All public pages pass at 375/768/1440/1920px, desktop WCAG checks, full-width About and reduced-motion behavior.
- Every rendered same-origin homepage image decodes successfully (23 image elements); sample Gallery/News/Reviews/Results images also pass independent decoding checks.
- PostgreSQL verifies accepted label settings, rejected arbitrary CSS/wrong types and compatibility with existing empty content.

See `docs/evidence/2026-10-22/record-scope-premium.json`, `public-engineering.json`, `premium-images.json`, `public-samples-local.json` and the premium screenshots. Preview builds and production activation are reported separately; a pushed or Ready preview is not evidence that the production alias moved.

The production screenshot identified `main` as the Vercel production source. Remote `main` was still at `92b8fe5`, an ancestor of the tested feature history. The release keeps `feature/p00-foundation` updated and advances `main` by normal fast-forward push only, preserving every commit and leaving Vercel project settings unchanged. Production is checked on the actual public alias after that deployment.
