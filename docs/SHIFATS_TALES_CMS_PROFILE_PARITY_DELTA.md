# Shifat's Tales — Profile / Settings / Website CMS Parity Delta

Reference evidence from the original project's route and targeted snapshot manifests: `/teacher/profile`, `/teacher/settings`, `/teacher/website`, `/teacher/website/courses/hero`, public `/`, `/about`, `/contact`, `/courses`, `/gallery`, `/results`, plus CMS actions, media utilities and dynamic section consumers.

| Behavior | Newly added offline logic | Complete parity? |
|---|---|---|
| Teacher own profile | owned read/update, allowed patch, avatar asset gate | NO: login, live auth and persistence |
| Teacher preferences | theme, language, notification preferences | NO: persistence, existing original settings field mapping |
| Credential security | refuses changes until verified reauthentication | NO: Supabase Auth flow |
| Website page drafts | create/update, unique slug contract, revision checks | NO: transaction adapter/HTTP/UI |
| CMS sections/items | typed kinds, sorting, safe links, visibility | NO: original per-section field schemas/renderers |
| Media metadata | trusted-upload contract, MIME/hash/size bounds | NO: upload service/signer/bucket policies |
| Publication | audited immutable snapshot / public-safe projection | NO: real DB RPC, cache invalidation |
| Global footer/SEO/contact | versioned draft + publish + public projection | NO: old original settings migration and UI |
| Public pages | published snapshot reader with leak rejection | NO: endpoints/rendering |
| CMS news/events/reviews/etc. | generic kind registry only | NO: complete domain behavior |

**Do not check off master-plan phases 20 or 34–48** based on offline tests. This package is one backend iteration, not working portal parity.
