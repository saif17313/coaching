import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261016000600_account_lifecycle_mutation_rpcs_offline.sql',import.meta.url),'utf8').toLowerCase();
test('account status is default pending, denies direct client state mutation and requires active teacher',()=>{
 assert.match(sql,/create type public\.account_status as enum \('pending','active','disabled','rejected'\)/);
 assert.match(sql,/account_status public\.account_status not null default 'pending'/);
 assert.match(sql,/current_user_is_teacher\(\)[\s\S]*account_status = 'active'/);
 assert.match(sql,/drop policy if exists batches_teacher_insert/);
 assert.match(sql,/drop policy if exists batches_teacher_update/);
 assert.match(sql,/revoke insert,update,delete on public\.batches from authenticated/);
});
test('idempotency receipt and account policies have RLS and no direct grant',()=>{
 assert.match(sql,/create table public\.coaching_mutation_receipts/);
 assert.match(sql,/primary key\(actor_id,operation_id\)/);
 assert.match(sql,/alter table public\.coaching_mutation_receipts enable row level security/);
 assert.match(sql,/revoke all on public\.coaching_mutation_receipts from public,anon,authenticated/);
 assert.match(sql,/pg_advisory_xact_lock/g);
 assert.match(sql,/idempotency_conflict/g);
 assert.match(sql,/create policy batches_active_account_read/);
 assert.match(sql,/create policy enrollments_active_student_read/);
});
test('four audited security definer functions are granted to authenticated only',()=>{
 for(const name of ['coaching_change_student_status','coaching_decide_enrollment','coaching_create_batch','coaching_update_batch']){
  assert.match(sql,new RegExp('create function public\\.'+name+'\\('));
  const f=sql.slice(sql.indexOf('create function public.'+name+'('),sql.indexOf('$$;',sql.indexOf('create function public.'+name+'('))+3);
  assert.match(f,/security definer set search_path = ''/);
  assert.match(f,/current_user_is_teacher\(\)/);
  assert.match(f,/insert into public\.audit_logs/);
  assert.match(f,/insert into public\.coaching_mutation_receipts/);
  assert.match(sql,new RegExp('revoke all on function public\\.'+name));
  assert.match(sql,new RegExp('grant execute on function public\\.'+name));
 }
});
test('capacity count and row locks share an atomic transaction, no service role',()=>{
 assert.match(sql,/where id=v_batch for update/);
 assert.match(sql,/where id=p_batch_id for update/);
 assert.match(sql,/status='active'/);
 assert.match(sql,/batch_full/);
 assert.match(sql,/capacity_below_active/);
 assert.doesNotMatch(sql,/service_role/);
});
test('route handlers and production gateway remain write-disabled by default',()=>{
 const fs=readFileSync(new URL('../src/server/http/production-mutation-adapter.ts',import.meta.url),'utf8');
 assert.match(fs,/COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification'/);
 assert.doesNotMatch(fs,/SUPABASE_SERVICE_ROLE|\.user_metadata\.role/);
 const verify=readFileSync(new URL('../src/server/http/production-read-adapter.ts',import.meta.url),'utf8');
 assert.match(verify,/account_status/);assert.match(verify,/accountStatus!=='active'/);
 for(const [file,method] of [['students/[studentId]/status','PATCH'],['enrollments/[enrollmentId]/decision','POST'],['batch-commands','POST'],['batch-commands/[batchId]','PATCH']]){
  const route=readFileSync(new URL('../src/app/api/v1/teacher/'+file+'/route.ts',import.meta.url),'utf8');assert.match(route,new RegExp('export (?:const|async function) '+method+'(?:=|\\()'));
 }
});
test('all existing student RLS readers are tightened to active accounts',()=>{
 for(const policy of ['batch_contents_student_published_read','announcements_student_published_read','notifications_owner_read','dues_student_select','payments_student_select','adjustments_student_select','subjects_student_enrolled_read','syllabus_student_read','routine_enrolled_active_read','assignments_active_released_read']){
  const fragment=sql.match(new RegExp('alter policy '+policy+'[\\s\\S]*?;'))?.[0];
  assert.ok(fragment,policy);assert.match(fragment,/coaching_current_user_is_active\(\)/,policy);
 }
});
