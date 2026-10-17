# Shifat's Tales — CMS section-by-section field parity audit

This is a **pending-field-verification register**, not a claim that original source sections were fully audited. Evidence currently available: old route inventory, targeted snapshot manifest, and current offline `website-cms.mjs` service. The original section component props, action payloads and SQL column schema are NOT mounted here, so unknowns must remain unverified.

| Surface/section | Current CMS generic kind | Original-specific fields/behaviors still to verify |
|---|---|---|
| `/` hero | `hero` | Exact headline parts, CTA variants, background media, ordering and responsive breakpoints |
| `/about` | `rich-text` / `cards` | Organization stats, teacher cards, links and content structure |
| `/courses` + `/teacher/website/courses/hero` | `courses` / `hero` | Course hero settings, fee metadata, batch linking, published course availability |
| `/gallery` and `/gallery/[id]` | `gallery` | Album grouping, display order, image metadata, detail item fields |
| `/results` | `results` | Published testimonials/result cards, class/year filters, privacy consent |
| `/contact` | `contact` | Contact form processing, phone/email, map/social links, spam handling |
| Public notices and events | `news` | Event date/time, attachment and expiry states |
| Website reviews | `reviews` | Reviewer consent, quote/source/asset fields, moderation |
| Academic calendar | `academic-calendar` | Date ranges, academic year and visibility conditions |
| Class routine | `routine` | Links to published routine slots, live status/cancel changes |
| Materials | `materials` | Public vs enrolled-only distinction and storage access |
| Global footer/SEO | `footer` + global settings | Navigation structure, canonical metadata, OG fields, custom social links |
| FAQs | `faq` | Question-answer ordering, visibility and accessibility |

**Existing services:** draft page+section+item CRUD, revision locking contract, published snapshot projection, reviewed media metadata, and global settings draft/public boundary. **Not established:** original field names/types, persistence mapping, uploading, CMS UI controls, public route rendering, cache invalidation, cross-entity live reads or end-to-end parity.

## Acceptance method

Obtain the original project's exact CMS source snapshot including `src/features/website-cms`, teacher CMS route components/actions, public section consumers, relevant Supabase migrations and storage policies. For each row above, record original path, original field names/types/defaults, validation, mutation/permission, public rendering and tests. Only then promote each entry from **UNVERIFIED** to **MATCHED** or **APPROVED DEVIATION**. No section is marked complete at this checkpoint.
