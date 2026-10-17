import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMemberReadEndpoint } from '../src/server/http/member-read.mjs';
const student='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const batchId='33333333-3333-4333-8333-333333333333';
const batch2='44444444-4444-4444-8444-444444444444';
const enrollId='55555555-5555-4555-8555-555555555555';
const token='abc.def.ghi';
const batch={id:batchId,code:'K10_01',name:'Class Ten',capacity:40,is_archived:false};
const enroll={id:enrollId,student_id:student,batch_id:batchId,status:'active',requested_at:'2026-09-10T10:00:00Z',decided_at:'2026-09-11T10:00:00Z'};
const profile={id:student,role:'student',full_name:'Example Student'};
const actor=(role='student')=>({verified:true,userId:role==='student'?student:other,role,accountStatus:'active',accessToken:token});
const makeReq=(path,opts={})=>new Request('https://example.invalid'+path,{method:opts.method||'GET',headers:{authorization:opts.auth===undefined?'Bearer '+token:opts.auth}});
const ctx=id=>({params:Promise.resolve(id)});
const output=async r=>({status:r.status,body:await r.json(),cache:r.headers.get('cache-control')});
const ports=(role,rowsImpl)=>{const calls=[];let verified=0;return {
  calls,get verified(){return verified;},
  verify:async t=>{verified++;return {...actor(role),accessToken:t};},
  readRows:async(table,t,q)=>{calls.push({table,t,q});return rowsImpl(table,q);},
}};
const defaultRows=(table,q)=>table==='enrollments'?[{...enroll}]:table==='batches'?[{...batch}]:[{...profile}];

test('student/my-batches returns only active enrollment joined to strict batch projection',async()=>{
  const p=ports('student',defaultRows);
  const r=await output(await createMemberReadEndpoint('student-batches',p)(makeReq('/student/batches?limit=5&offset=0')));
  assert.equal(r.status,200);assert.equal(r.body.data.length,1);assert.deepEqual(r.body.data[0],{...batch,enrollment_id:enrollId});
  assert.equal(p.calls.length,2);assert.equal(p.calls[0].q.student_id,`eq.${student}`);assert.equal(p.calls[0].q.status,'eq.active');
  assert.equal(p.calls[1].q.id,`eq.${batchId}`);assert.equal(p.calls[0].t,token);assert.equal(r.cache,'private, no-store');
});
test('student/batch detail checks active own enrollment before loading batch',async()=>{
  const p=ports('student',defaultRows);
  const r=await output(await createMemberReadEndpoint('student-batch',p)(makeReq('/student/batches/'+batchId),ctx({batchId})));
  assert.equal(r.status,200);assert.equal(r.body.data.id,batchId);assert.equal(p.calls[0].q.batch_id,'eq.'+batchId);
});
test('teacher/enrollments lists paginated validated records and optional status filter',async()=>{
  const p=ports('teacher',defaultRows);
  const r=await output(await createMemberReadEndpoint('teacher-enrollments',p)(makeReq('/teacher/enrollments?status=active&limit=5&offset=1')));
  assert.equal(r.status,200);assert.deepEqual(r.body.data,[enroll]);assert.equal(p.calls[0].q.status,'eq.active');
  assert.equal(p.calls[0].q.limit,'5');assert.equal(p.calls[0].q.offset,'1');
});
test('teacher/student detail projects only student role; teacher/batch detail projects safe batch',async()=>{
  for (const [kind,name,value] of [['teacher-student','studentId',student],['teacher-batch','batchId',batchId]]) {
    const p=ports('teacher',defaultRows);
    const r=await output(await createMemberReadEndpoint(kind,p)(makeReq('/teacher/x'),ctx({[name]:value})));
    assert.equal(r.status,200);assert.equal(r.body.data.id,value);assert.equal(p.calls[0].q.id,'eq.'+value);
  }
});
test('no access for mismatched roles and unverified or inactive actors',async()=>{
  for (const kind of ['student-batches','teacher-enrollments']){
    const wrongRole=kind==='student-batches'?'teacher':'student';
    const p=ports(wrongRole,defaultRows);
    const r=await output(await createMemberReadEndpoint(kind,p)(makeReq('/test')));
    assert.equal(r.status,403);assert.equal(p.calls.length,0);
  }
  for(const bad of [{...actor(),accountStatus:'disabled'},{...actor(),verified:false},{...actor(),accessToken:'wrong.token.here'},{...actor(),userId:'invalid'}]){
    let reads=0;const r=await output(await createMemberReadEndpoint('student-batches',{verify:async()=>bad,readRows:async()=>{reads++;return [];}})(makeReq('/test')));
    assert.equal(r.status,401);assert.equal(reads,0);
  }
});
test('missing bearer, invalid method, malformed route id and queries fail before Auth',async()=>{
  const p=ports('student',defaultRows);
  for(const [kind,req,c] of [
    ['student-batches',makeReq('/x',{auth:''}),undefined],
    ['student-batches',makeReq('/x',{auth:'Bearer abc'}),undefined],
    ['student-batches',makeReq('/x',{method:'POST'}),undefined],
    ['student-batches',makeReq('/x?offset=-2'),undefined],
    ['student-batches',makeReq('/x?limit=21'),undefined],
    ['student-batches',makeReq('/x?student_id=eq.hacker'),undefined],
    ['student-batches',makeReq('/x?limit=1&limit=2'),undefined],
    ['student-batch',makeReq('/x'),ctx({batchId:'abc'})],
    ['student-batch',makeReq('/x?limit=1'),ctx({batchId})],
    ['teacher-enrollments',makeReq('/x?status=disabled'),undefined],
    ['teacher-batch',makeReq('/x'),ctx({badKey:batchId})],
  ]){
    const r=await output(await createMemberReadEndpoint(kind,p)(req,c));assert.ok([400,401,405].includes(r.status));
  }
  assert.equal(p.verified,0);assert.equal(p.calls.length,0);
});
test('student batch detail cannot read batch if active enrollment missing',async()=>{
  const p=ports('student',(table)=>table==='enrollments'?[]:[{...batch}]);
  const r=await output(await createMemberReadEndpoint('student-batch',p)(makeReq('/x'),ctx({batchId})));
  assert.equal(r.status,404);assert.equal(p.calls.length,1);
});
test('stale pending, foreign and duplicated enrollment rows reject without revealing batches',async()=>{
  for(const es of [[{...enroll,status:'pending',decided_at:null}],[{...enroll,student_id:other}],[enroll,enroll],[{...enroll,batch_id:batch2}]]){
    const p=ports('student',(table)=>table==='enrollments'?es:[{...batch}]);
    const r=await output(await createMemberReadEndpoint('student-batches',p)(makeReq('/x')));
    assert.equal(r.status,502);assert.equal(r.body.error.code,'UPSTREAM_DATA_INVALID');
    assert.ok(p.calls.length===1||p.calls.length===2);
  }
});
test('provider batch mismatch, unknown columns and duplicate batch rows fail closed',async()=>{
  for(const bs of [[{...batch,id:other}],[{...batch,teacher_notes:'secret'}],[batch,batch],[]]){
    const p=ports('student',(table)=>table==='enrollments'?[enroll]:bs);
    const r=await output(await createMemberReadEndpoint('student-batch',p)(makeReq('/x'),ctx({batchId})));
    assert.equal(r.status,502);
  }
});
test('teacher profile provider cannot switch teacher role or leak private columns',async()=>{
  for(const ps of [[{...profile,role:'teacher'}],[{...profile,email:'private@example.com'}],[{...profile,id:other}], [profile,profile]]){
    const p=ports('teacher',()=>ps);
    const r=await output(await createMemberReadEndpoint('teacher-student',p)(makeReq('/x'),ctx({studentId:student})));
    assert.equal(r.status,502);
  }
});
test('teacher enrollment provider rejects mismatched requested status and invalid timestamps',async()=>{
  for(const es of [[{...enroll,status:'rejected'}],[{...enroll,decided_at:null}],[{...enroll,secret:'oops'}],[enroll,enroll]]){
    const p=ports('teacher',()=>es);
    const r=await output(await createMemberReadEndpoint('teacher-enrollments',p)(makeReq('/x?status=active')));
    assert.equal(r.status,502);
  }
});
test('upstream errors sanitize secrets; no stack traces or token echoes',async()=>{
  const p=ports('teacher',async()=>{throw new Error('MY_SECRET '+token);});
  const r=await createMemberReadEndpoint('teacher-enrollments',p)(makeReq('/x'));
  assert.equal(r.status,503);const body=JSON.stringify(await r.json());assert.equal(body.includes('MY_SECRET'),false);assert.equal(body.includes(token),false);
});
test('service cannot be constructed with missing ports or unknown endpoints',()=>{
  assert.throws(()=>createMemberReadEndpoint('other',{}));assert.throws(()=>createMemberReadEndpoint('teacher-batch',{verify:async()=>{}}));
});
test('production Next route files use only the trusted member-read adapter and never export writes',()=>{
  const routes={
    'student/batches':'student-batches','student/batches/[batchId]':'student-batch','teacher/enrollments':'teacher-enrollments',
    'teacher/students/[studentId]':'teacher-student','teacher/batches/[batchId]':'teacher-batch',
  };
  for(const [path,kind] of Object.entries(routes)){
    const file=readFileSync(new URL(`../src/app/api/v1/${path}/route.ts`,import.meta.url),'utf8');
    assert.match(file,/production-member-read-adapter/);assert.match(file,new RegExp(`protectedMemberReadRoute\\('${kind}'\\)`));
    assert.doesNotMatch(file,/export const (POST|PATCH|DELETE|PUT)/);
  }
});
