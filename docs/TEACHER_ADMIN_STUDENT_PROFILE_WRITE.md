# Phase 6 — Teacher Student Profile: Write Capability

- `PATCH /api/v1/teacher/students/{studentId}/profile`
- Headers: `Authorization: Bearer <signed session JWT>`, `Idempotency-Key: <UUID>`, `Content-Type: application/json`
- JSON: `{"fullName":"Student Full Name"}` (trimmed, 2–160 characters, no control characters)
- Success `200`: `{ "success":true,"data":{"id":"<studentId>","fullName":"..."} }`
- Requires active, verified teacher with matching bearer token; PostgreSQL `SECURITY DEFINER` independently checks teacher role/status.
- Uses migration `20261018000200_...`: row-locked student, atomically audits/receipts, idempotent replay, no direct client profile write grant.
- Never changes auth email, role, account status, password or student identity. No account creation.
- Production write requires existing `COACHING_ENABLE_MUTATION_APIS=enabled-after-db-verification` opt-in, which this package does not set.
- Cloud migrations 009/010 are NOT deployed by local installer. Real cloud HTTP smoke tests pending.
