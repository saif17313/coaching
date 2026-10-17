import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('new reader uses only bearer-based, RLS-scoped production adapter',()=>{
  const adapter=r('src/server/http/production-member-read-adapter.ts');
  assert.match(adapter,/verifyActiveActor/);
  assert.match(adapter,/readSupabaseRows/);
  assert.doesNotMatch(adapter,/service.?role|SUPABASE_SERVICE_ROLE|createAdmin/i);
  const gateway=r('src/server/http/member-read.mjs');
  assert.match(gateway,/eq\.active/);
  assert.match(gateway,/Cache-Control/);
  assert.doesNotMatch(gateway,/\.insert\(|\.update\(|\.delete\(/);
});
test('read-only verification script covers core relations, RPCs, RLS and grants',()=>{
  const sql=r('supabase/verification/core_api_integration_readonly_audit.sql');
  assert.match(sql,/to_regclass/);assert.match(sql,/relrowsecurity/);assert.match(sql,/to_regprocedure/);assert.match(sql,/role_table_grants/);
  for(const name of ['profiles','batches','enrollments','coaching_mutation_receipts','coaching_change_student_status','coaching_decide_enrollment'])assert.ok(sql.includes(name),name);
  assert.doesNotMatch(sql,/\b(insert|update|delete|alter|drop|create|grant|revoke)\s+(table|policy|role|function|on|into)\b/i);
});
test('account lifecycle migration closes direct batch writes and checks active teacher',()=>{
  const sql=r('supabase/migrations/20261016000600_account_lifecycle_mutation_rpcs_offline.sql');
  assert.match(sql,/revoke insert,update,delete on public\.batches from authenticated/i);
  assert.match(sql,/and account_status = 'active'/i);
  assert.match(sql,/coaching_decide_enrollment/);
  assert.match(sql,/coaching_mutation_receipts/);
});
