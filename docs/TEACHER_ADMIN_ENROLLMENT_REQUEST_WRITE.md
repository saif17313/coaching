# Phase 8 — Teacher Enrollment Request: Write Capability

- `POST /api/v1/teacher/enrollment-requests`
- Headers: `Authorization: Bearer <signed session JWT>`, `Idempotency-Key: <UUID>`, `Content-Type: application/json`
- JSON: `{"studentId":"<UUID>","batchId":"<UUID>"}`
- Success `201`: `{ "success":true,"data":{"id":"<UUID>","studentId":"...","batchId":"...","status":"pending"} }`
- Requires verified active teacher and existing active student + unarchived batch. Uses batch-first lock to serialize with capacity edits and enrollment approvals.
- Calls migration `20261018000300_...` transaction with audit event and unique `(student_id,batch_id)` constraint. Idempotent same-key replay. New request always pending; batch capacity checked on approval by existing RPC.
- Does NOT re-enroll rejected/cancelled students automatically. Existing duplicate relationship must be resolved through explicit future business policy.
- No auth user provisioning, service role, direct table DML or cloud migration in this installer.
- Production mutation flag remains disabled by default. Cloud deployment of migrations 009/010 and end-to-end cloud Auth/RPC smoke testing are separate, explicit operations.
