# Musa Sir vs Shifat's Tales — actual source parity register (2026-10-19)

## Source identities

- **Reference**: `Shifats-Tale.zip`, branch `main`, ZIP Git HEAD `00404e5e365454d14ef67c99c215e29ad29c3959`; independently matches GitHub main at audit time. The project has **137 `page.tsx` routes**: 93 teacher, 21 student, 17 public, 4 auth, 2 status; 8 API `route.ts` handlers. Its `features.md` defines four feature families.
- **Current**: user-supplied `coaching.zip`, branch `feature/p00-foundation`, ZIP Git HEAD `02a33e805040b334c0b6718244ed5ad9bf0322a9` (not independently verified as Git index/commit). 2 public `page.tsx` routes, 111 API `route.ts` handlers. 27 local migration source files, but the ZIP does **not** establish which SQL was applied. Historical untracked `payload/` and `installer.cjs` were included in user's current archive and must be preserved, not silently deleted.
- **Authority**: current `docs/BACKEND_MASTER_PLAN.md`. The reference is a functional and IA guide, not an auth/DB blueprint or a visual theme to copy.

## Feature comparison and acceptance gaps

| Reference surface | Reference features (source: `features.md`, page inventory) | Current coaching backend source | Current frontend / remaining acceptance |
|---|---|---|---|
| Public | Home, about, courses, public materials, news, gallery, results, reviews, contact, academic calendar and routine | CMS draft/publish, typed generic sections, private verified media, public snapshot endpoints | Generic home + `/site/[slug]` only. Dedicated page presentation, rich section-specific media, typed field parity, visitor UX and safe public assets are incomplete. |
| Teacher dashboard | Overview, student detail/edit, batches, enrollment, academic subjects, assignments, exams, grading, finance, alerts and reports | Major corresponding protected read/write endpoints; transactional RPC / RLS for core flows | Part N offers a single generic API-backed table shell. Task-specific edit/create forms, validation UX, admin journeys and print output incomplete. |
| Student dashboard | My batches, assignments, exams, routine, materials, result ranking, payments, notification, profile and security | 7 Part L completion routes + Part G/H assignment/notifications + published results | Part N shell covers a subset with generic tables. No parity for assignment file submission UI, exam timer/MCQ, PDF scorecards, rich resource library, security/password changes. |
| CMS | Homepage section editors; About/teacher portfolio (education, training, research, publications); course hero/cards; gallery; reviews; footer/SEO; contact/FAQ, news/events; materials | Versioned generic page/section/item CMS, settings publish, media attach and safe public DTO | Generic section/item editor present as Part N payload, not dedicated typed field workflows. Reference's section-level forms require explicit DTO/DB mapping; never claim 1:1 field parity from generic `kind`. |
| Print and reports | Teacher result print, progress print, academic reports and downloadable scorecards | Signed protected reports/CSV and published grades | Print/PDF generation, branding and browser/export E2E incomplete. |
| Additional reference business logic | Attendance, MCQ live exams, results verification, student reviews/gallery moderation | Not evidenced as implemented by current API inventory | Mark as **missing/unverified**, not complete; design database, authorization and API before UI. |

## Reference CMS navigation group inventory

Reference `src/app/teacher/website` includes: Home (hero, stats, excellence, batches, success, teacher, gallery, testimonials, why-learn, YouTube, news/events); About (hero, metrics, education, training, research, publications, ECA, skills, projects); Courses (hero, cards); Academic Calendar (hero, card); Class Routine (hero, card); Gallery (hero, albums); Materials (hero, categories, manage); News/Events (hero, categories, body, manage); Reviews (hero, manage); Results (hero, students); Contact (hero, info, FAQ); Footer and Global Settings.

Current generic CMS section kinds in SQL source include `hero`, `rich-text`, `cards`, `gallery`, `results`, `courses`, `contact`, `cta`, `faq`, `news`, `reviews`, `academic-calendar`, `routine`, `materials`, `footer`. **Kind coverage does not imply section-specific schema or workflow parity.**

## Safe delivery strategy

1. First fix Part N installation regression: React asynchronous initial effect, exact ESLint/TS ignore of *legacy untracked* installer staging; preserve prior files. Do not touch `.env*`, migrations, cloud, Git remote or mutation gate.
2. Teacher frontend in coherent groups: management + academics, finance/operations + reports, CMS typed editors. Map each required form field to existing real request/DTO contract; absent backend support goes back to module→schema/RPC/API before exposing form.
3. Student frontend in coherent groups: academic planner, assignment submission, published results and statements, notifications/profile. Verify IDOR protection and release-state behavior with signed users.
4. Public pages and CMS: content-based navigation/section rendering first; implement separate typed fields only after storage/RLS/public snapshot review.
5. Final signed-JWT HTTP E2E, private Storage integration, PostgreSQL rollback QA, accessibility, PDF/print, deploy configuration review and launch preparation.

## Evidence limitations

The reference's `features.md` advertises capabilities; not every advertised feature was independently end-to-end exercised. Current counts reflect repository files, **not production completion**. The user's latest Windows run passed 547 tests and failed lint, then rolled back 14 package files. No successful Part N install or completed real authentication/Storage E2E has been established. Since `coaching.zip` contains `.env.local` and `.git`, do not publish the raw archive or redistribute it to third parties.
