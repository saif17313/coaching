import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAcademicCommand} from '../src/server/http/teacher-academic-commands.mjs';
const root=new URL('../',import.meta.url);
const path=s=>readFileSync(new URL(s,root),'utf8');
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const batch='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const subject='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const exam='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const student='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const operation='ffffffff-ffff-4fff-8fff-ffffffffffff';
const token='abc.def.ghi';
const validActor={verified:true,userId:actor,role:'teacher',accountStatus:'active',accessToken:token};
const cases=[
 ['subject-create','batchId',batch,{code:'MATH01',title:'Mathematics'},t=>({id:subject,batchId:t,code:'MATH01',title:'Mathematics'})],
 ['syllabus-add','subjectId',subject,{title:'Unit One',position:1},t=>({id:subject,subjectId:t,title:'Unit One',position:1})],
 ['routine-create','batchId',batch,{subjectId:subject,dayOfWeek:1,startMinute:600,endMinute:660,room:'A-1'},t=>({id:subject,batchId:t,subjectId:subject,dayOfWeek:1,startMinute:600,endMinute:660,room:'A-1',status:'active'})],
 ['assignment-draft','batchId',batch,{subjectId:subject,title:'Algebra',instructions:'Solve these problems',releaseAt:'2026-11-01T09:00:00.000Z',dueAt:'2026-11-08T09:00:00.000Z',maxPoints:100,allowResubmit:true},t=>({id:subject,batchId:t,subjectId:subject,title:'Algebra',status:'draft'})],
 ['exam-draft','batchId',batch,{subjectId:subject,title:'Term Exam',scheduledAt:'2026-11-01T09:00:00.000Z',maxMarks:100},t=>({id:subject,batchId:t,subjectId:subject,title:'Term Exam',status:'draft'})],
 ['result-draft','examId',exam,{studentId:student,marks:67.25},t=>({id:subject,examId:t,studentId:student,marks:67.25,resultStatus:'draft'})]
];
function request(body,overrides={}){return new Request('https://example.com/api',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':operation,...overrides},body:JSON.stringify(body)});}
for(const [kind,field,target,body,result] of cases){
 test(`${kind}: active teacher calls one audited RPC through strict DTO`,async()=>{
  let verifyCalls=0,execCalls=0;
  const endpoint=createAcademicCommand(kind,{verify:async x=>{verifyCalls++;assert.equal(x,token);return validActor;},execute:async(k,c)=>{execCalls++;assert.equal(k,kind);assert.equal(c.target,target);assert.equal(c.operationId,operation);assert.equal(c.actorId,actor);return result(target);}});
  const response=await endpoint(request(body),{params:Promise.resolve({[field]:target})});
  assert.equal(response.status,201);assert.deepEqual((await response.json()).data,result(target));assert.equal(verifyCalls,1);assert.equal(execCalls,1);
 });
}
test('all commands require active signed teacher identity and reject forged metadata',async()=>{
 for(const [kind,field,target,body] of cases){
  for(const actorValue of [null,{...validActor,role:'student'},{...validActor,accountStatus:'disabled'},{...validActor,verified:false},{...validActor,accessToken:'different'}]){
   let calls=0;const endpoint=createAcademicCommand(kind,{verify:async()=>actorValue,execute:async()=>{calls++;return {};}});
   const res=await endpoint(request(body),{params:Promise.resolve({[field]:target})});assert.equal(res.status,403);assert.equal(calls,0);
  }
 }
});
test('all commands reject unauthorized fields, route identifiers and mismatched methods before Auth',async()=>{
 for(const [kind,field,target,body] of cases){
  let called=0;const route=createAcademicCommand(kind,{verify:async()=>{called++;return validActor;},execute:async()=>({})});
  const invalid=[
   [request({...body,role:'teacher'}),{[field]:target},400],
   [request(body,{'idempotency-key':'x'}),{[field]:target},400],
   [request(body,{authorization:'Bearer invalid'}),{[field]:target},401],
   [request(body),{[field]:'not-a-uuid'},400],
   [new Request('https://example.com/?attack=1',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':operation},body:JSON.stringify(body)}),{[field]:target},400],
   [new Request('https://example.com/',{method:'GET'}),{[field]:target},405]
  ];
  for(const [req,params,status] of invalid){const res=await route(req,{params:Promise.resolve(params)});assert.equal(res.status,status,kind);}assert.equal(called,0);
 }
});
test('invalid course, routine, assignment, exam and mark bounds fail closed',async()=>{
 const invalid=[
  ['subject-create',{code:'bad code',title:'Algebra'}],
  ['syllabus-add',{title:'Units',position:0}],
  ['routine-create',{subjectId:subject,dayOfWeek:1,startMinute:700,endMinute:700,room:'B'}],
  ['assignment-draft',{subjectId:subject,title:'Homework',instructions:'Do some work',releaseAt:'2026-11-02T00:00:00.000Z',dueAt:'2026-11-01T00:00:00.000Z',maxPoints:10,allowResubmit:false}],
  ['exam-draft',{subjectId:subject,title:'Midterm',scheduledAt:'not-date',maxMarks:100}],
  ['result-draft',{studentId:student,marks:100.111}],
 ];
 for(const [kind,body] of invalid){const [,,target]=cases.find(x=>x[0]===kind);let called=0;const route=createAcademicCommand(kind,{verify:async()=>{called++;return validActor;},execute:async()=>({})});const s=cases.find(x=>x[0]===kind);assert.equal((await route(request(body),{params:Promise.resolve({[s[1]]:target})})).status,400);assert.equal(called,0);}
});
test('upstream substitutions and sensitive fields are never accepted or leaked',async()=>{
 for(const [kind,field,target,body,result] of cases){const route=createAcademicCommand(kind,{verify:async()=>validActor,execute:async()=>({...result(target),privateNotes:'never'})});const res=await route(request(body),{params:Promise.resolve({[field]:target})});assert.equal(res.status,502);assert.doesNotMatch(JSON.stringify(await res.json()),/never/);}
});
test('upstream errors are sanitized; missing ports rejected',async()=>{
 assert.throws(()=>createAcademicCommand('fake',{}));
 const route=createAcademicCommand('subject-create',{verify:async()=>validActor,execute:async()=>{throw Error('secret=1234');}});
 const res=await route(request(cases[0][3]),{params:Promise.resolve({batchId:batch})});assert.equal(res.status,503);assert.doesNotMatch(JSON.stringify(await res.json()),/secret/);
});
test('read-only table grants remain unchanged and every write is security-definer with receipts',()=>{
 const migrations=['20261018000400_teacher_academic_subject_syllabus_routine_rpcs.sql','20261018000500_teacher_academic_assignment_exam_draft_rpcs.sql','20261018000600_teacher_exam_draft_grading_rpc.sql'];
 const sql=migrations.map(p=>path(`supabase/migrations/${p}`)).join('\n');
 assert.equal((sql.match(/security definer set search_path = ''/g)??[]).length,6);
 assert.equal((sql.match(/revoke all on function public\./g)??[]).length,6);
 assert.equal((sql.match(/grant execute on function public\./g)??[]).length,6);
 assert.equal((sql.match(/coaching_mutation_receipts/g)??[]).length,12);
 assert.equal((sql.match(/insert into public\.audit_logs/g)??[]).length,6);
 assert.doesNotMatch(sql,/grant\s+(?:all|insert|update|delete)\s+on\s+public\./i);
 assert.match(sql,/routine_batch_overlap_exclusion/);
 assert.match(sql,/result_status='draft'/);
});
test('production gateway keeps mutation feature switch, signed JWT and strict project host',()=>{
 const adapter=path('src/server/http/production-teacher-academic-commands.ts');
 assert.match(adapter,/enabled-after-db-verification/);
 assert.match(adapter,/Authorization:`Bearer \$\{c.token\}`/);
 assert.match(adapter,/supabase\\\.co/);
 assert.doesNotMatch(adapter,/SERVICE_ROLE|supabase_service_role/i);
 for(const [,field] of cases){assert.ok(field);}
});
