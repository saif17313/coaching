# Verified CMS write recovery

Target: `rkpwqgwceekuvlizfpeb` (`musa-sir-coaching-dev`, ACTIVE_HEALTHY), PostgreSQL 17, all 27 installed migrations matched. Existing user changes were preserved. No environment files, authentication rules, grants or RLS were changed for this repair.

The screenshot's failure is **not a disabled write gate**. Hosted PostgreSQL logs contain `ALREADY_PUBLISHED` at 2026-10-20 12:47:54.485 UTC (18:47:54 Dhaka), immediately preceding the screenshot. All original pages had equal draft and published revisions. The Publish control allowed an unchanged revision; `production-cms-core.ts` discarded the actual PostgREST error, and `cms-core.mjs` returned a generic 503. The client then suggested restarting a server whose gate was already enabled. The banner checked configuration only.

The repair preserves safe database errors as 400/403/404/409 responses, distinguishes disabled gates and missing RPCs, prevents publishing unchanged or unsaved form state, and verifies publication through the anonymous public API. The readiness endpoint performs an authenticated CMS read and explicitly reports `mutationVerified: false`. A read probe cannot prove mutation permissions. The editor only confirms persistence after an operation and read-back; concurrent submits are locked while an operation is in flight. Draft preview now incorporates edited field values. Saves preserve the selected editor.

Real manually authenticated browser verification is recorded in [cms-browser.json](evidence/2026-10-20/cms-browser.json), with a [desktop screenshot](evidence/2026-10-20/cms-desktop.png). It checks UI create, save, independent API read-back, refresh, publish, public HTML, unchanged-publication rejection, unsaved state, draft privacy, invalid input, optimistic concurrency and concurrent duplicate receipt replay. The isolated DEMO page is identified in the evidence. No real accounts, grades, payments or testimonials were created.

Independent management-connection SQL read-back confirmed DEMO page `616db242-a2e6-4504-87c8-293d56d43c61`: draft revision 4 with heading `DEMO revised introduction`, published revision 2 with heading `DEMO saved introduction`, and stored operation receipts. This confirms draft/public separation independently of browser/API responses. The final audit documents cleanup and subsequent verification.

Recovery for these tests: only newly created, clearly labeled DEMO CMS records are changed; archive them through the Teacher RPC to remove public delivery. No existing business record is modified. Cloud backup retention/PITR has not been verified; no destructive database or financial tests are authorized by this evidence.

Focused verification: 69 existing CMS tests plus 10 new error/recovery tests; TypeScript passed; lint had 0 errors (existing warnings remain). Full-suite and build results are recorded in the final audit.
