# Teacher Admin Student Management — Part A (Read)

`GET /api/v1/teacher/students/{studentId}/management?limit=20&offset=0`

Authenticated active teacher only. Every read uses the same user JWT for Supabase Auth and RLS-scoped PostgREST. No service-role token, client-controlled table names, direct mutations or database migration.

Success data:
- `profile`: `{id,role,full_name,account_status,created_at}`
- `enrollments`: bounded array of `{id,student_id,batch_id,status,requested_at,decided_at}`
- `pagination`: `{limit,offset}` (limit 1–30, offset 0–10000).

Built to fill Teacher Student Management detail-page fields missing from the existing public-safe student detail API: account status and enrollment history. The existing `PATCH /api/v1/teacher/students/{studentId}/status` is still disabled unless server environment explicitly opts in, and any such enablement requires a separate E2E test and reviewed operational decision.

Not implemented by this part: student creation/invitations, writable profile edits, bulk import/export, filtering student lists, UI wiring, email or password management. These must be tracked against the original Shifat's Tales feature parity register and completed in subsequent parts.

Checklist: tests, lint, TypeScript, Next build, no Git changes, no cloud migration, optional live JWT smoke test remains pending.
