# Combined Phase 2–3: offline backend core (iteration 1)

## Implemented in this package
- Role/action permission matrix (deny unknown roles/actions)
- Verified-principal boundary that fails closed until Supabase Auth is configured
- Server-side domain validators for batch and UUID inputs
- Coaching service interfaces for profile, batches, enrollment listing and mutations
- Read-only repository adapter using Phase 1 authenticated PostgREST reads
- Mutation methods are not connected: no misleading success or unsafe direct writes
- Contract-level automated checks and safe installer

## Explicitly NOT finished
- Supabase Auth sessions, JWT verification, and refresh / SSR cookies
- Live authenticated identity & DB-derived role loading
- Transactional batch/enrollment write RPC, capacity/concurrency and enrollment lifecycle rules
- Database RLS integration testing against live users
- Admin and student API routes (no exposed endpoints before server-auth readiness)
- Full Teacher, Academic, Finance, Student Portal and CMS capabilities

## Progress tracking
Phase 1 local schema+adapter: implemented; live integration pending.
Phase 2–3 iteration 1: offline architecture; **not** phase complete.
No production configuration or remote database changes are performed by installer.
