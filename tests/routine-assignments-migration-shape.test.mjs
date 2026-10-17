import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261016000400_routine_assignments_offline.sql','utf8').toLowerCase();
test('academic, routine and assignment tables exist with RLS and safe client grants',()=>{
 const tables=['academic_subjects','syllabus_units','routine_slots','academic_assignments','assignment_submissions'];
 for(const t of tables){
   assert.match(sql,new RegExp(`create table public\\.${t}\\s*\\(`));
   assert.match(sql,new RegExp(`alter table public\\.${t} enable row level security`));
 }
 assert.match(sql,/revoke all on public\.academic_subjects/);
 assert.doesNotMatch(sql,/grant\s+(?:insert|update|delete|all)\s+on\s+public\./);
});
test('routine exclusion constraint and assignment relationships prevent basic races',()=>{
 assert.match(sql,/exclude using gist/);
 assert.match(sql,/int4range\(start_minute/);
 assert.match(sql,/subject_id,batch_id\) references public\.academic_subjects\(id,batch_id\)/);
 assert.match(sql,/unique \(assignment_id,student_id\)/);
 assert.match(sql,/assignment_schedule_valid/);
 assert.match(sql,/assignment_max_points_valid/);
});
test('draft grades are not exposed via a student SELECT on submission base table',()=>{
 assert.match(sql,/create policy submissions_teacher_read/);
 assert.doesNotMatch(sql,/create policy\s+submissions_student/);
 assert.doesNotMatch(sql,/grant select on public\.assignment_submissions to authenticated/);
 assert.match(sql,/no direct client submission select/);
});
