# Finance adapter interface (OFFLINE specification)

The finance operations object expects `inTransaction(async tx => result)` on a trusted, reviewed port. `inTransaction` must run all reads/writes under one ACID transaction with explicit isolation + stable row locks. The test fixture clones in-memory state only; this is NOT a production adapter.

`tx` methods used:
- `assertTeacherManagesBatch(actorId,batchId)`
- `insertFeePlan(plan,teacherId)`; `getFeePlanLocked(planId)`
- `claimOperation(operationId,action,targetId,actorId)` returns cached response for exact successful replay, `null` for new; rejects conflicting reuse; must write idempotency record inside same transaction
- `createDuesForActiveEnrollments(plan,teacherId)` only creates due for active enrollment, unique `(student_id,batch_id,bill_period)`
- `getInvoiceLocked(actorId,invoiceId)` returns an authoritative aggregate of immutable accounting entries; row locks required
- `getPaymentLocked(actorId,paymentId)` returns immutable posting with `refundedMinor` and `corrected` calculated under locks
- `insertPayment(record,teacherId)` and `insertAdjustment(record,teacherId)` re-verify all IDs/relationships, account states, sums, nonnegative outstanding and unique IDs
- `appendAudit({...})` inside transaction, not a best-effort async queue
- `completeOperation(operationId,response)` atomically caches replay response

Read-only port methods: `listStudentPaymentsAuthorized(actor,studentId,page)`, `getBatchFinanceReportAuthorized(actor,batchId,filter)`, `listFinancialAuditAuthorized(actor,page)`. Each must apply authenticated identity, permissions, row-level scopes, projection and pagination BEFORE returning records.

## Security requirements
- No direct client mutations for payments, dues, fee plans, operations, adjustments or audit logs.
- An insert into a financial table without the same transaction audit MUST fail entirely.
- A retry with same operationId/action/target/actor returns the prior committed response, never double-posts.
- Different operationId cannot create duplicate monthly dues for the same `(student,batch,period)`.
- Mismatched payment->due->student->batch, invalid refund and correction against refunded payment must fail atomically.
- Creation of a refund adjustment does not transfer money. Cash/bank/mobile banking refunds need a separate authorized settlement flow.
- `service.checkActor` is defense-in-depth ONLY; DB enforces actual permissions, account state, active enrollment and report isolation.
