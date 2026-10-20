# Public homepage and Website Studio contract

Verified 2026-10-21 against actual DEV snapshots and source. The presentation lives in `src/components/website/SitePresentation.tsx`; both the public server wrapper and authenticated draft iframe use it. `src/client/website-composition.mjs` is the editor's visual-source contract.

| Public section | Current source | Editor fields / semantic form |
| --- | --- | --- |
| Hero | Home hero `833cade6-4f88-4b67-8a7b-d7160ac0f2c8` | Common heading/body/items; HOME_HERO introduction, highlight, educator, photograph, features, two CTA links, motion |
| Hero statistics | Home cards `e94e4abf-f7ff-4d1d-b5e7-eeadac5df855` | Existing item title/description; HOME_STATS structured statistics |
| Courses | Courses catalog `2673584b-9a3e-47cd-89a5-5665f85998b5` | Common catalog items, COURSES_CARDS item metadata; optional HOME_FEATURED_COURSES ordered selection |
| Classroom benefits | About cards `01a44e9d-53db-43fe-b65f-ec1ff019607d` | Heading/body/items; HOME_WHY_CHOOSE benefits and trust statements |
| Teaching philosophy | About rich text `bbce14e1-a3aa-45c8-8d5c-ee5749e30472` | Heading/body/items; HOME_TEACHER identity, biography, portrait, methods |
| Achievements | No separate Home record | HOME_TOP_STUDENTS periods and published result selections; no duplicate generic results spotlight |
| Results | Results `2a00dd9c-1fce-4103-a1ff-082d8a074313` | RESULTS_STUDENTS metadata; optional HOME_STUDENT_SUCCESS ordered selection |
| Video classes | Existing safe YouTube item URLs; no dedicated record | HOME_YOUTUBE_CLASSES heading and classes |
| Reviews | Reviews `19f01800-7931-448a-b268-c5befa82f055` | REVIEWS_ITEMS approval/consent metadata; optional HOME_TESTIMONIALS selection |
| News/events | News `1acef21a-6789-4df1-af24-72477909bd76` | NEWS_EVENTS_ITEMS details; optional HOME_NEWS_EVENTS featured/other selections |
| Gallery | Gallery `94890d08-346c-4689-99d3-ddfcefd21eeb` | GALLERY_ALBUMS media/details; optional HOME_GALLERY selection |
| Footer | Published global settings; no dedicated Home footer | GLOBAL_FOOTER description, copyright, social/navigation links; identity/contact/logo in Global settings |

All section records use `site_pages` -> `site_page_sections` -> `site_section_items`. Common fields use `/api/v1/teacher/website/pages/:id/sections/:sectionId` and the guarded `coaching_cms_write` RPC. Semantic fields use the page's fields API and `coaching_cms_fields_write`. Reorder/hide/archive use the existing organize/archive APIs and guarded RPCs. Publish uses the page publish API and `coaching_cms_write`; anonymous visitors read the immutable published snapshot through `/api/v1/public/site-pages/:slug` and `coaching_cms_get_published_page`.

Media uploads use existing private Storage and `media_assets`. Only the authenticated Teacher preview may read an owned ready draft image through `coaching_media_teacher_preview`; public media still requires publication. No storage keys, JWTs or secrets are serialized to the preview.

The visual map explicitly opens shared About/catalog records. Saving those records changes their draft; publication also updates the corresponding source page. Public Teacher-only Edit links carry the source page, section ID and semantic form into the portal. Anonymous/Student users receive no Edit links and retain API authorization restrictions.

Remaining parity work: homepage-wide ordering of shared versus dedicated records, legacy FAQ/CTA/Home-course records that the existing homepage does not render, dedicated grouping beyond Hero, source refresh after a separate publication, full semantic visibility behavior and exhaustive per-section browser CRUD. Interior page section ordering uses the existing ordered snapshot. These limitations are tracked in CODEX_PROGRESS.md; the current milestone is not complete CMS parity.
