# Musa Sir — Teacher Resources, Finance, Reports & Student Read Parity (Part E)

## Scope / exact route contracts

This is a **read-only, local-code delivery**. It extends the Shifat's Tales teacher/student surfaces without exposing unreviewed monetary or resource mutations. All responses use `{success:true,data}` / `{success:false,error:{code}}`; `Cache-Control: private, no-store`; `Authorization: Bearer <Supabase access JWT>` verified against Auth and DB active-role profile. Same signed JWT used for PostgREST RLS. No service role or direct DML is used.

| Surface | GET route | Description |
|---|---|---|
| Teacher resources | `/api/v1/teacher/batches/{batchId}/materials` | Teacher batch content list, all statuses; metadata only, **not** a storage download grant |
| Teacher resources | `/api/v1/teacher/batches/{batchId}/announcements` | Batch announcement drafts/published/archived |
| Student resources | `/api/v1/student/batches/{batchId}/materials` | Own enrolled batch, released published content only; no `uploadId` |
| Student resources | `/api/v1/student/batches/{batchId}/announcements` | Own enrolled batch, released published announcements only |
| Teacher finance | `/api/v1/teacher/batches/{batchId}/fee-plans` | Batch fee plans |
| Teacher finance | `/api/v1/teacher/batches/{batchId}/dues` | Batch monthly dues |
| Teacher finance | `/api/v1/teacher/students/{studentId}/dues` | Student-specific dues |
| Teacher finance | `/api/v1/teacher/students/{studentId}/payments` | Student payment history |
| Teacher finance | `/api/v1/teacher/dues/{dueId}/payments` | Payment history for due with student match |
| Teacher finance | `/api/v1/teacher/dues/{dueId}/adjustments` | Waiver/refund/correction entries for due |
| Student finance | `/api/v1/student/dues` | Own dues |
| Student finance | `/api/v1/student/payments` | Own payments |
| Teacher notifications | `/api/v1/teacher/notifications` | Notifications assigned to signed-in teacher |
| Student notifications | `/api/v1/student/notifications` | Own notifications |
| Teacher audit | `/api/v1/teacher/audit-logs` | Metadata-only teacher audit list (no arbitrary audit details) |
| Teacher report | `/api/v1/teacher/batches/{batchId}/finance-report?billPeriod=YYYY-MM` | Complete-only gross monetary totals, bounded to <=100 monthly dues and <=2000 payment/adjustment rows each |

## Security and accounting decisions

- Query allowlists, strict UUID/JWT formats, bounded pagination (limit <=50, offset <=10000), exact upstream projections, owner/scope validation, duplicate row rejection, and sanitized failure responses.
- Teacher-only batch, student, due and audit operations verify active teacher before database access; student reads require active student; student batch reads also require own active enrollment and a released/published item.
- No service-role privileges, storage signed URLs, direct table mutations, or new SQL migrations.
- Finance summary reports **gross totals only**, with `totalsMinor` as **base-10 strings in BDT minor units** (`billed`, `payments`, `waivers`, `refunds`, `corrections`); does not infer net outstanding, because correction semantics and refunds require the entire ledger reconciliation workflow.
- If the selected batch/month contains more than 100 dues or over 2000 payment or adjustment entries, report returns `422 REPORT_LIMIT_EXCEEDED` rather than silently claiming a partial total. This remains an operational limitation to address with a future aggregate SQL RPC.
- API DTOs do not expose `operation_id`, `created_by`, raw `audit_logs.details`, notification dispatch data, private profile data or any storage URL.

## Completion/remaining parity register

**Implemented:** Teacher and student read surfaces listed above, production adapters, Node security tests, documentation. **Not yet finished:** Material upload verification, secure download grant, resource/announcement lifecycle writes, finance plan/dues/payment/waiver/refund/correction RPCs, robust aggregate reporting/CSV exports, notification dispatch/read receipts, settings/CMS wiring, teacher/student UI, hosted signed-JWT HTTP smoke tests. Do **not** count these full modules as complete.

No Git push, Supabase Cloud mutation, local SQL migration, Auth setting/flag update, or `.env.local` change is performed by this installer. Separate feature-wise **local commits** are made after tests/lint/typecheck/build pass on the operator's Windows machine.
