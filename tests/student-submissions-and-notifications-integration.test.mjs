import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createStudentWorkflow,studentWorkflowKinds} from '../src/server/http/student-workflows.mjs';
const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const target='33333333-3333-4333-8333-333333333333';
const op='44444444-4444-4444-8444-444444444444';
const token='aaa.bbb.ccc';
const stamp='2026-10-18T12:00:00.000000Z';
const students={verified:true,userId:id,role:'student',accountStatus:'active',accessToken:token};
const teachers={verified:true,userId:id,role:'teacher',accountStatus:'active',accessToken:token};
const cases={
 submit:{role:'student',method:'POST',params:{assignmentId:target},body:{answerText:'My correct answer'},out:{id:other,assignmentId:target,studentId:id,submittedAt:stamp,resubmitted:false}},
 ownSubmission:{role:'student',method:'GET',params:{assignmentId:target},out:{id:other,assignmentId:target,studentId:id,submittedAt:stamp,gradePublished:false,points:null,feedback:null}},
 submissionList:{role:'teacher',method:'GET',params:{assignmentId:target},out:{items:[{id:other,assignmentId:target,studentId:other,submittedAt:stamp,answerText:'DEMO submitted answer',gradeStatus:'ungraded',points:null,feedback:null}]}},
 grade:{role:'teacher',method:'POST',params:{submissionId:target},body:{points:85,feedback:'Good'},out:{id:target,assignmentId:other,gradeStatus:'draft',points:85}},
 gradePublish:{role:'teacher',method:'POST',params:{assignmentId:target},body:{},out:{assignmentId:target,publishedCount:1,gradesPublished:true}},
 notificationRead:{role:'student',method:'POST',params:{notificationId:target},body:{},out:{id:target,recipientId:id,readAt:stamp}},
 unreadCount:{role:'student',method:'GET',params:{},out:{unreadCount:3}},
};
function req(kind,override={}){
 const c=cases[kind];const headers={authorization:`Bearer ${token}`,...c.method==='POST'?{'content-type':'application/json','idempotency-key':op}:{},...(override.headers||{})};
 return new Request('https://example.test/api/v1/test'+(override.search??''),{method:override.method??c.method,headers,body:(override.method??c.method)==='POST'?JSON.stringify(override.body??c.body):undefined});
}
function go(kind,opts={}){
 const c=cases[kind],calls=[];
 const route=createStudentWorkflow(kind,{verify:async t=>opts.actor??(c.role==='student'?students:teachers),execute:async(k,p)=>{calls.push({k,p});if(opts.error)throw Error('secrets, token');return opts.output===undefined?c.out:opts.output;}});
 return {calls,call:async(reqOverride={},ctxOverride={})=>{
  const res=await route(req(kind,reqOverride),{params:{...c.params,...ctxOverride}});return {status:res.status,body:await res.json(),headers:res.headers};
 }};
}
test('workflow declares seven protected student and teacher endpoints',()=>assert.deepEqual(studentWorkflowKinds,Object.keys(cases)));
for(const [kind,c] of Object.entries(cases)){
 test(`${kind}: accepted authenticated DTO, correct role and scoped token`,async()=>{
  const g=go(kind),r=await g.call();assert.equal(r.status,200);assert.deepEqual(r.body.data,c.out);
  assert.equal(g.calls.length,1);assert.equal(g.calls[0].k,kind);assert.equal(g.calls[0].p.token,token);
  assert.equal(g.calls[0].p.operationId,c.method==='POST'?op:null);assert.equal(r.headers.get('cache-control'),'private, no-store');
 });
 test(`${kind}: rejects mismatched student/teacher role before RPC`,async()=>{
  const actor=c.role==='student'?teachers:students,g=go(kind,{actor});assert.equal((await g.call()).status,403);assert.equal(g.calls.length,0);
 });
 test(`${kind}: missing bearer rejected before RPC`,async()=>{
  const g=go(kind),r=await g.call({headers:{authorization:'Bearer a fake token'}});assert.equal(r.status,401);assert.equal(g.calls.length,0);
 });
 test(`${kind}: untrusted provider output never leaks extra fields`,async()=>{
  const g=go(kind,{output:{...c.out,apiSecret:'never'}}),r=await g.call();assert.equal(r.status,502);assert.equal(g.calls.length,1);assert.doesNotMatch(JSON.stringify(r.body),/apiSecret/);
 });
 test(`${kind}: upstream failure sanitized`,async()=>{
  const g=go(kind,{error:true}),r=await g.call();assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r.body),/token|secrets/i);
 });
}
test('student may see pending grade only as null, never draft points or feedback',async()=>{
 const g=go('ownSubmission',{output:{...cases.ownSubmission.out,points:85}});assert.equal((await g.call()).status,502);
 const published=go('ownSubmission',{output:{...cases.ownSubmission.out,gradePublished:true,points:85,feedback:'Good'}});
 assert.equal((await published.call()).status,200);
 const noRow=go('ownSubmission',{output:null});assert.equal((await noRow.call()).status,200);
});
test('student submission refuses invalid length and unknown properties before Auth',async()=>{
 for(const body of [{answerText:''},{answerText:'hello',role:'teacher'},{answerText:'a'.repeat(20001)}]){
  const g=go('submit');assert.equal((await g.call({body})).status,400);assert.equal(g.calls.length,0);
 }
});
test('grading rejects score or feedback outside bounds',async()=>{
 for(const body of [{points:-1,feedback:''},{points:1001,feedback:''},{points:70.5,feedback:''},{points:70,feedback:'x'.repeat(2001)}]){
  const g=go('grade');assert.equal((await g.call({body})).status,400);assert.equal(g.calls.length,0);
 }
});
test('mutations require UUID operation id before any RPC',async()=>{
 for(const kind of Object.keys(cases).filter(x=>cases[x].method==='POST')){
  const g=go(kind);assert.equal((await g.call({headers:{'idempotency-key':'invalid'}})).status,400);assert.equal(g.calls.length,0);
 }
});
test('unknown query and invalid route id rejected before database reads',async()=>{
 const g=go('submit');assert.equal((await g.call({search:'?unexpected=true'})).status,400);
 assert.equal((await g.call({}, {assignmentId:'bad'})).status,400);assert.equal(g.calls.length,0);
});
test('invalid HTTP method rejects request before identity checks',async()=>{
 const g=go('submit');assert.equal((await g.call({method:'GET'})).status,405);assert.equal(g.calls.length,0);
});
test('submission list fails closed for oversized / duplicated teacher records',async()=>{
 const one=cases.submissionList.out.items[0];
 assert.equal((await go('submissionList',{output:{items:[one,one]}}).call()).status,502);
 assert.equal((await go('submissionList',{output:{items:Array(51).fill(one)}}).call()).status,502);
});

test('Teacher answer projection is bounded and rejects missing or non-text answers',async()=>{
 const one=cases.submissionList.out.items[0];
 for(const answerText of [undefined,{},'x'.repeat(20001)])assert.equal((await go('submissionList',{output:{items:[{...one,answerText}]}}).call()).status,502);
 assert.equal((await go('submissionList',{output:{items:[{...one,answerText:'DEMO line one\nDEMO line two'}]}}).call()).status,200);
});
test('signed JWT, no service role, no direct submission table grants',()=>{
 const prod=readFileSync('src/server/http/production-student-workflows.ts','utf8');
 assert.match(prod,/COACHING_ENABLE_MUTATION_APIS/);assert.match(prod,/Bearer \$\{c\.token\}/);
 assert.doesNotMatch(prod,/SERVICE_ROLE|service_role|SUPABASE_SERVICE/);
 const s1=readFileSync('supabase/migrations/20261018001200_student_assignment_submission_and_grading.sql','utf8');
 const s2=readFileSync('supabase/migrations/20261018001300_student_submission_read_and_notification_state.sql','utf8');
 for(const sql of [s1,s2])assert.match(sql,/security definer set search_path=''/);
 assert.match(s1,/grade_status='draft'/);assert.match(s1,/grades_published=true/);
 assert.match(s2,/recipient_id=a/);assert.match(s2,/then v_row\.points else null/);
 for(const entry of ['submit','ownSubmission','submissionList','grade','gradePublish','notificationRead','unreadCount'])assert.ok(existsSync(['src/app/api/v1/',...({submit:['student/assignments/[assignmentId]/submit'],ownSubmission:['student/assignments/[assignmentId]/submission'],submissionList:['teacher/assignments/[assignmentId]/submissions'],grade:['teacher/submissions/[submissionId]/grade'],gradePublish:['teacher/assignments/[assignmentId]/grades/publish'],notificationRead:['student/notifications/[notificationId]/read'],unreadCount:['student/notifications/unread-count']}[entry]),'/route.ts'].join('')));
});
