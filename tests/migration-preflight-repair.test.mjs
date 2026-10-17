import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const p = (name) => readFileSync(name,'utf8');
test('routine overlap EXCLUDE expression uses PostgreSQL expression parentheses',()=>{
  const s=p('supabase/migrations/20261016000400_routine_assignments_offline.sql');
  assert.match(s,/\(int4range\(start_minute::integer,end_minute::integer,'\[\)'\)\)\s+with\s+&&/i);
});
test('DB readiness report targets real submissions table',()=>{
  const s=p('supabase/verification/core_api_integration_readonly_audit.sql');
  assert.ok(s.includes("('assignment_submissions')"));
  assert.ok(!s.includes("('academic_submissions')"));
  assert.ok(s.includes("('exams')") && s.includes("('exam_results')"));
});
test('exam and result tables have strong relationships and RLS',()=>{
  const s=p('supabase/migrations/20261016000700_exams_results_schema_offline.sql');
  for(const n of ['exams','exam_results']) {
    assert.ok(s.includes('create table public.'+n+' ('));
    assert.ok(s.includes('alter table public.'+n+' enable row level security;'));
  }
  assert.ok(s.includes('foreign key (subject_id,batch_id)'));
  assert.ok(s.includes('constraint exam_result_unique_student unique (exam_id,student_id)'));
});
test('student exam drafts and unpublished results do not have client access',()=>{
  const s=p('supabase/migrations/20261016000700_exams_results_schema_offline.sql');
  assert.ok(s.includes("status='published'"));
  assert.ok(s.includes('coaching_current_user_is_active()'));
  assert.ok(s.includes('exam_results_active_teacher_read'));
  assert.ok(!/create policy\s+\w+student\w*\s+on\s+public\.exam_results/i.test(s));
  assert.ok(!/grant\s+(insert|update|delete|all)\s+on\s+public\.exam_results/i.test(s));
});
