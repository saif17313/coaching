# Teacher Admin / Overview — Live Read API (first backend slice)

Status: **IMPLEMENTED BY LOCAL INSTALLER IF VERIFICATION PASSES**; cloud API smoke test is separately pending.

Endpoint: `GET /api/v1/teacher/overview`; bearer token required; no query string.

Source of truth: RLS-scoped `public.profiles`, `public.batches`, and `public.enrollments`.
Six exact counts: studentsTotal, studentsActive, studentsPending, batchesOpen, enrollmentsPending, enrollmentsActive. Counts are independent and are not a single serializable snapshot.

Security: reuses verified Supabase `/auth/v1/user` + active profile, teacher-only role gate, fixed allowlisted PostgREST HEAD counts using the *same user's JWT* and publishable key, no service-role keys, no user-chosen table/filters, no writes, and non-cacheable HTTP responses. Production hosted HTTPS only; local loopback only if explicit development opt-in from prior JWT patch.

This API intentionally does not claim revenue summaries, timetable, finance metrics, recent notifications, charts, or the entire Teacher Overview page are finished. Complete these capabilities page-by-page as defined in BACKEND_MASTER_PLAN.md.

Deployment: no DB migration required beyond existing remote 001–008. Do not expose the endpoint publicly until Next.js backend is deployed with the appropriate Supabase env and Auth configured. Do not enable production mutation routes merely because overview GET passes.
