# Shifat's Tales feature-parity ledger — Resource & Communication slice

This ledger complements (does not replace) `BACKEND_MASTER_PLAN.md`. Reference snapshot paths established the original surfaces; complete feature-by-feature source review remains pending.

| Shifat's Tales capability / expected flow | Local new code | Production status | Remaining gap |
| --- | --- | --- | --- |
| Teacher creates batch material | service + mock test | **Not operational** | live storage upload, source asset table, transactional port, protected route |
| Teacher edits material metadata | service + mock test | **Not operational** | mutation RPC, UI and auditing |
| Teacher publishes / archives material | service + mock test | **Not operational** | SQL transaction + lock + teacher scope |
| Student lists published batch material | service + mock test | **Not operational** | active enrollment SQL/RLS integration |
| Student securely downloads material | 60s grant contract + tests | **Not operational** | signed URL storage adapter, bucket policies, access endpoint |
| Material move across batches | not implemented | **Missing** | dependency validation, state-sync and audit |
| Teacher creates/publishes/archives announcements | service + mock test | **Not operational** | production transaction + teacher-admin routes |
| Teacher edits/deletes announcements | not implemented | **Missing** | business rules, history and constraints |
| Student sees release-scoped announcements | service + mock test | **Not operational** | live RLS, routing and integration |
| Batch-targeted in-app notification fanout | service + mock test | **Not operational** | durable queue/fanout adapter and RPC |
| Recipient lists/marks own notifications read | service + mock test | **Not operational** | production adapter and auth gateway |
| Push/email/SMS deliveries, retries, reporting | not implemented | **Missing / needs baseline audit** | notification delivery pipeline |
| Audit on resource mutations | transaction hook + mock test | **Not operational** | immutable durable audit writer & permissions |

Other teacher-side features still pending: full payment lifecycle, reports, site/CMS, role provisioning, teacher dashboards and many student flows. Do not mark page/section parity complete based on service tests alone.
