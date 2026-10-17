# Resource service persistence adapter contract (production pending)

`createLearningResourceOperations(port,{now,allowedStorageHosts})` accepts only a **server-controlled** implementation. Never pass untrusted request data as the `actor`; a separate trusted Auth boundary must verify session and role.

## Transaction semantics

`port.inTransaction(async tx => ...)` is mandatory for all mutations. Must have proper row locks, serializable behavior where necessary, atomic audit log writes and atomic notification idempotency. All `tx` method results must be persisted or rolled back together when a callback throws.

Required transaction methods used by service layer:

- `assertTeacherManagesBatch(actorId,batchId)`: teacher authorization (cannot rely only on role embedded in a token).
- `assertMaterialUploadReady(actorId,uploadId,batchId)`: upload owned by actor and batch, complete, safe, size/type authorized; upload rows and object paths must be verified in database.
- `createMaterial(draft,actorId)`, `getMaterialForTeacher(actorId,id)`, `updateMaterial(id,patch)`, `setMaterialStatus(id,status)`.
- `getMaterialForAccess(actor,id)` and `assertActiveEnrollment(actorId,batchId)` must verify account enabled, enrollment active and matching batch using trusted DB state. Signed grant must NOT be minted for an archived batch or disabled user.
- `mintAuthorizedMaterialGrant(actor,materialId,maxTtlSeconds)` checks authorization again, signs URL with trusted server secret for exact authorized object and TTL. Never return arbitrary user-supplied URLs. Service checks allowlisted HTTPS host, expiry and max 60s TTL.
- `createAnnouncement(draft,actorId)`, `getAnnouncementForTeacher(actorId,id)`, `setAnnouncementStatus(id,status)`.
- `enqueueNotificationsForActiveStudents(event,actorId)`: create dispatch idempotency anchor `eventId`; select active eligible recipients in a single transaction; insert one notification per recipient, with unique `(event_id,recipient_id)`. Disable repeated fanout even for zero recipients. Enforce batch-level scope.
- `getNotificationForRecipient(actorId,id)`, `setNotificationReadAt(id,time)` must never permit cross-recipient updates.
- `appendAudit({actorId,action,entityId})` is inside each mutation transaction. Do not log signed links or credentials.

Read contract:

- `port.assertTeacherManagesBatch(actorId,batchId)` or `port.assertActiveEnrollment(actorId,batchId)` for listing permission.
- `port.listMaterialsAuthorized(actor,batchId,{limit,offset})`, `port.listAnnouncementsAuthorized(...)`: teacher may inspect drafts only within own scope; students only see published and released items from an active enrollment. Return exactly batch-scoped rows.
- `port.listNotificationsForRecipient(actorId,{limit,offset})`: recipient-only rows; service checks recipient IDs defensively.

The current test port is memory-only and uses a clone-and-commit transaction simulation. It does **not** provide durable SQL, storage, RLS, multi-process concurrency, RPC, HTTP or E2E behavior. The SQL file is an offline schema proposal, not an applied, tested migration.
