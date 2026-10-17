import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {teacherPublishEndpoint,studentPublishedResultsEndpoint} from '../src/server/http/academic-publication.mjs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const teacher='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',student='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const exam='cccccccc-cccc-4ccc-8ccc-cccccccccccc',assignment='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const batch='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',id='ffffffff-ffff-4fff-8fff-ffffffffffff';
const token='abc.def.ghi';
const actor=(role='teacher')=>({verified:true,userId:role==='teacher'?teacher:student,role,accountStatus:'active',accessToken:token});
const action=(kind,opts={})=>new Request('https://example.com/publish'+(opts.query??''),{method:'POST',headers:{authorization:`Bearer ${token}`,'idempotency-key':id,...opts.headers},body:opts.body});
const result={id,examId:exam,batchId:batch,examTitle:'Final Exam',scheduledAt:'2026-10-01T09:00:00+00:00',marks:83.5,maxMarks:100,rank:1,status:'published'};
for(const [kind,field,target,expected] of [
 ['assignment','assignmentId',assignment,{id:assignment,status:'published'}],
 ['exam','examId',exam,{id:exam,status:'published'}],
 ['results','examId',exam,{examId:exam,status:'published',publishedCount:1}]
]){
 test(`${kind} publishes through exactly one authenticated RPC and returns exact DTO`,async()=>{
  let verified=0,called=0;
  const route=teacherPublishEndpoint(kind,{verify:async(t)=>{assert.equal(t,token);verified++;return actor();},execute:async(k,c)=>{called++;assert.equal(k,kind);assert.equal(c.target,target);assert.equal(c.operationId,id);return expected;}});
  const res=await route(action(kind),{params:Promise.resolve({[field]:target})});
  assert.equal(res.status,200);assert.deepEqual((await res.json()).data,expected);assert.equal(verified,1);assert.equal(called,1);
 });
 test(`${kind} denies malformed query, token, operation, path, method and unexpected body`,async()=>{
  let calls=0;const route=teacherPublishEndpoint(kind,{verify:async()=>{calls++;return actor();},execute:async()=>expected});
  for(const [req,params,status] of [
   [action(kind,{query:'?role=teacher'}),{[field]:target},400],
   [action(kind,{headers:{authorization:'Bearer invalid'}}),{[field]:target},401],
   [action(kind,{headers:{'idempotency-key':'invalid'}}),{[field]:target},400],
   [action(kind),{[field]:'bad'},400],
   [action(kind,{body:'{"isAdmin":true}',headers:{'content-type':'application/json'}}),{[field]:target},400],
   [new Request('https://example.com/',{method:'GET'}),{[field]:target},405],
  ]){assert.equal((await route(req,{params:Promise.resolve(params)})).status,status);}
  assert.equal(calls,0);
 });
 test(`${kind} requires active teacher and rejects polluted RPC output`,async()=>{
  for(const invalid of [null,actor('student'),{...actor(),verified:false},{...actor(),accountStatus:'disabled'},{...actor(),accessToken:'other'}]){
   let call=0;const route=teacherPublishEndpoint(kind,{verify:async()=>invalid,execute:async()=>{call++;return expected;}});
   assert.equal((await route(action(kind),{params:Promise.resolve({[field]:target})})).status,403);assert.equal(call,0);
  }
  const route=teacherPublishEndpoint(kind,{verify:async()=>actor(),execute:async()=>({...expected,privateNotes:'SECRET'})});
  const res=await route(action(kind),{params:Promise.resolve({[field]:target})});assert.equal(res.status,502);assert.doesNotMatch(JSON.stringify(await res.json()),/SECRET/);
 });
}
test('student published-results reader requires active student and strict pagination',async()=>{
 let called=0;
 const route=studentPublishedResultsEndpoint({verify:async()=>actor('student'),read:async({limit,offset})=>{called++;assert.equal(limit,20);assert.equal(offset,0);return {items:[result],limit,offset};}});
 const req=new Request('https://example.com/api/v1/student/results',{headers:{authorization:`Bearer ${token}`}});
 const res=await route(req);assert.equal(res.status,200);assert.deepEqual((await res.json()).data.items,[result]);assert.equal(called,1);
});
test('student results refuse teacher, disabled and forged user',async()=>{
 for(const invalid of [null,actor(),{...actor('student'),accountStatus:'disabled'},{...actor('student'),verified:false},{...actor('student'),accessToken:'fake'}]){
  let calls=0;const route=studentPublishedResultsEndpoint({verify:async()=>invalid,read:async()=>{calls++;return {items:[],limit:20,offset:0};}});
  assert.equal((await route(new Request('https://example.com/results',{headers:{authorization:`Bearer ${token}`}}))).status,403);assert.equal(calls,0);
 }
});
test('student reader rejects unsupported filters and untrusted provider data',async()=>{
 let verifyCalls=0;const route=studentPublishedResultsEndpoint({verify:async()=>{verifyCalls++;return actor('student');},read:async()=>({items:[],limit:20,offset:0})});
 for(const qs of ['?studentId='+student,'?limit=100','?limit=01','?offset=-1','?limit=2&limit=2']){
  const req=new Request('https://example.com/results'+qs,{headers:{authorization:`Bearer ${token}`}});
  assert.equal((await route(req)).status,400,qs);
 }assert.equal(verifyCalls,0);
 for(const invalid of [{...result,status:'draft'},{...result,marks:9999},{...result,privateNotes:'secret'},{...result,rank:null}]){
  const bad=studentPublishedResultsEndpoint({verify:async()=>actor('student'),read:async()=>({items:[invalid],limit:20,offset:0})});
  const res=await bad(new Request('https://example.com/results',{headers:{authorization:`Bearer ${token}`}}));
  assert.equal(res.status,502);assert.doesNotMatch(JSON.stringify(await res.json()),/secret|privateNotes/);
 }
});
test('network/DB failures are sanitized; no service role and mutation gate is still OFF by default',async()=>{
 const bad=teacherPublishEndpoint('exam',{verify:async()=>actor(),execute:async()=>{throw Error('sensitive failure');}});
 const res=await bad(action('exam'),{params:Promise.resolve({examId:exam})});assert.equal(res.status,503);assert.doesNotMatch(JSON.stringify(await res.json()),/sensitive/);
 const teacherSrc=read('src/server/http/production-academic-publication.ts');const studentSrc=read('src/server/http/production-student-published-results.ts');
 assert.match(teacherSrc,/enabled-after-db-verification/);assert.match(studentSrc,/Bearer/);
 assert.doesNotMatch(teacherSrc+studentSrc,/SUPABASE_SERVICE_ROLE_KEY/);
});
test('SQL grants are function-only and students can never select draft result base rows',()=>{
 const s1=read('supabase/migrations/20261018000700_teacher_assignment_publication_rpc.sql');
 const s2=read('supabase/migrations/20261018000800_teacher_exam_publication_and_ranking_rpcs.sql');
 const s3=read('supabase/migrations/20261018000900_student_published_exam_results_rpc.sql');
 const all=s1+s2+s3;
 assert.equal((all.match(/security definer set search_path = ''/g)||[]).length,4);
 assert.equal((all.match(/revoke all on function/g)||[]).length,4);
 assert.equal((all.match(/grant execute on function/g)||[]).length,4);
 assert.doesNotMatch(all,/grant\s+(?:all|insert|update|delete)\s+on\s+public\./i);
 assert.match(s2,/rank\(\) over \(order by marks desc\)/i);
 assert.match(s3,/er.student_id=v_actor and er.result_status='published'/);
 assert.match(s3,/x.status='published'/);
 assert.match(s3,/e.status='active'/);
 assert.match(read('supabase/migrations/20261016000700_exams_results_schema_offline.sql'),/No student SELECT policy on exam_results/);
});
