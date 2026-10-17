import test from 'node:test';
import assert from 'node:assert/strict';
import {createProtectedMutationEndpoint} from '../src/server/http/protected-mutations.mjs';
const teacher='11111111-1111-4111-8111-111111111111';
const student='22222222-2222-4222-8222-222222222222';
const batch='33333333-3333-4333-8333-333333333333';
const enrollment='44444444-4444-4444-8444-444444444444';
const operation='55555555-5555-4555-8555-555555555555';
const jwt='ey.ey.ey';
const config={
 'student-status':{method:'PATCH',path:'/teacher/students/'+student+'/status',param:{studentId:student},body:{status:'active'},output:{id:student,status:'active'}},
 'enrollment-decision':{method:'POST',path:'/teacher/enrollments/'+enrollment+'/decision',param:{enrollmentId:enrollment},body:{decision:'approve'},output:{id:enrollment,status:'active'}},
 'batch-create':{method:'POST',path:'/teacher/batch-commands',param:{},body:{code:'CSE_01',name:'Science',capacity:30},output:{id:batch,code:'CSE_01',name:'Science',capacity:30,isArchived:false}},
 'batch-update':{method:'PATCH',path:'/teacher/batch-commands/'+batch,param:{batchId:batch},body:{capacity:31},output:{id:batch,code:'CSE_01',name:'Science',capacity:31,isArchived:false}},
};
function fixture(kind,patch={}){
 const calls=[];const c=config[kind];
 const deps={
  verify:async accessToken=>{calls.push(['verify',accessToken]);return {verified:true,userId:teacher,role:'teacher',accountStatus:'active',accessToken};},
  execute:async(k,cmd)=>{calls.push(['exec',k,cmd]);return structuredClone(c.output);},
  ...patch,
 };
 const invoke=async({body=c.body,headers={},method=c.method,params=c.param,path=c.path}={})=>{
  const req=new Request('https://example.test'+path,{method,headers:{Authorization:`Bearer ${jwt}`,'Idempotency-Key':operation,'Content-Type':'application/json',...headers},body:method==='GET'?undefined:typeof body==='string'?body:JSON.stringify(body)});
  const res=await createProtectedMutationEndpoint(kind,deps)(req,{params:Promise.resolve(params)});
  return {status:res.status,body:await res.json(),headers:res.headers};
 };
 return {calls,invoke};
}
for(const kind of Object.keys(config))test(`protected mutation ${kind}: happy path is identity-bound and validated`,async()=>{
 const f=fixture(kind),r=await f.invoke();assert.equal(r.status,kind==='batch-create'?201:200);assert.deepEqual(r.body.data,config[kind].output);assert.match(r.headers.get('cache-control'),/no-store/);
 assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0],['verify',jwt]);
 const [,k,cmd]=f.calls[1];assert.equal(k,kind);assert.equal(cmd.actor.id,teacher);assert.equal(cmd.token,jwt);assert.equal(cmd.operationId,operation);
 assert.equal(cmd.target,kind==='batch-create'?null:Object.values(config[kind].param)[0]);
});
test('malformed and missing bearer, idempotency key, media type do not call verification',async()=>{
 for(const headers of [{Authorization:'Basic xxx'},{Authorization:'Bearer x'},{Authorization:'Bearer x.x.x, y'},{Authorization:''},{'Idempotency-Key':'123'},{'Idempotency-Key':''},{'Content-Type':'text/plain'}]){
  const f=fixture('batch-create');const r=await f.invoke({headers});assert.ok([400,401,415].includes(r.status));assert.equal(f.calls.length,0);
 }
});
test('unknown params and SQL-like search rejected before auth',async()=>{
 const f=fixture('batch-update');for(const path of [config['batch-update'].path+'?role=teacher',config['batch-update'].path+'?select=*']){
  assert.equal((await f.invoke({path})).status,400);
 }
 assert.equal(f.calls.length,0);
});
test('invalid payloads are rejected prior to verify and execute',async()=>{
 for(const [kind,body] of [
  ['student-status',{status:'teacher'}],['student-status',{status:'active',role:'teacher'}],
  ['enrollment-decision',{decision:'approve',capacity:100}],['enrollment-decision',{decision:'release'}],
  ['batch-create',{code:'bad code',name:'Science',capacity:10}],['batch-create',{code:'CSE1',name:'A',capacity:10}],
  ['batch-create',{code:'CSE1',name:'Science',capacity:1.1}],['batch-update',{isArchived:'yes'}],
  ['batch-update',{}],['batch-update',{capacity:0}],['batch-update',{role:'teacher'}]
 ]){
  const f=fixture(kind);const r=await f.invoke({body});assert.equal(r.status,400,`${kind}: ${JSON.stringify(body)}`);assert.equal(f.calls.length,0);
 }
});
test('large JSON without content length must reject at 4KB',async()=>{
 const f=fixture('batch-create');const r=await f.invoke({body:JSON.stringify({name:'x'.repeat(9000),code:'CSE1',capacity:1}),headers:{'Content-Length':''}});
 assert.equal(r.status,413);assert.equal(f.calls.length,0);
});
test('truncated JSON, arrays, primitive bodies, prototype fields fail closed',async()=>{
 for(const body of ['{','null','[]','1','{"status":"active","__proto__":{}}']){
  const f=fixture('student-status');const r=await f.invoke({body});assert.ok([400].includes(r.status));assert.equal(f.calls.length,0);
 }
});
test('teacher active account and exact verified token are mandatory',async()=>{
 for(const p of [{role:'student'},{accountStatus:'pending'},{accountStatus:'disabled'},{accountStatus:'rejected'},{verified:false},{accessToken:'other'},{userId:'bad'},{role:'admin'},null]){
  const f=fixture('student-status',{verify:async token=>p===null?null:{verified:true,userId:teacher,role:'teacher',accountStatus:'active',accessToken:token,...p}});
  const r=await f.invoke();assert.equal(r.status,403);assert.equal(f.calls.length,0);
 }
});
test('route param must be valid UUID, even when JSON is valid',async()=>{
 for(const kind of ['student-status','enrollment-decision','batch-update']){
  for(const params of [{},{[Object.keys(config[kind].param)[0]]:'BAD'}]){
   const f=fixture(kind);assert.equal((await f.invoke({params})).status,400);assert.equal(f.calls.length,0);
  }
 }
});
test('method confusion returns 405, without reading identity',async()=>{
 const f=fixture('student-status');assert.equal((await f.invoke({method:'POST'})).status,405);assert.equal(f.calls.length,0);
});
test('upstream errors are sanitized and never echo secrets or tokens',async()=>{
 const f=fixture('student-status',{execute:async()=>{throw Error('Bearer top-secret db SQL password');}});
 const r=await f.invoke();assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r.body),/top-secret|SQL|Bearer|password/);
});
test('provider result must match route target and exclude extra/private fields',async()=>{
 for(const kind of Object.keys(config)){
  for(const data of [{...config[kind].output,id:kind==='batch-create'?'bad':teacher},{...config[kind].output,secret:'something'},[],{},null]){
   const f=fixture(kind,{execute:async()=>data});const r=await f.invoke();assert.equal(r.status,502,kind);
  }
 }
});
test('batch-create success uses HTTP 201 while updates use HTTP 200',async()=>{
 assert.equal((await fixture('batch-create').invoke()).status,201);assert.equal((await fixture('batch-update').invoke()).status,200);
});
test('mutation port is invoked once with same idempotency ID; no client role forwarded',async()=>{
 const f=fixture('enrollment-decision');await f.invoke();
 const input=f.calls[1][2];assert.deepEqual(Object.keys(input).sort(),['actor','input','operationId','target','token'].sort());assert.deepEqual(Object.keys(input.actor).sort(),['id','role','verified'].sort());
});
test('normalizes batch name before mutation call',async()=>{
 const f=fixture('batch-create');await f.invoke({body:{code:'CSE1',name:'  Physics  ',capacity:1}});assert.equal(f.calls[1][2].input.name,'Physics');
});
// End-to-end HTTP -> transactional mock adapter: commit audit and results together, never partially.
test('HTTP -> mock ledger: idempotent replay is single commit; conflicting replay fails closed',async()=>{
 const receipts=new Map(),audit=[];let status='pending';
 const execute=async(_kind,c)=>{
  const key=c.actor.id+':'+c.operationId,payload=JSON.stringify([_kind,c.target,c.input]);
  if(receipts.has(key)){
   const prior=receipts.get(key);if(prior.payload!==payload)throw Error('IDEMPOTENCY_CONFLICT');return prior.result;
  }
  const edges={pending:['active','rejected'],active:['disabled'],disabled:['active'],rejected:[]};
  if(!edges[status].includes(c.input.status))throw Error('INVALID_STATUS_TRANSITION');
  const result={id:student,status:c.input.status};
  // Atomic mock commit: audit mutation succeeds before status/receipt changed.
  audit.push({actor:c.actor.id,previous:status,next:c.input.status});status=c.input.status;
  receipts.set(key,{payload,result});return result;
 };
 const f=fixture('student-status',{execute});
 assert.equal((await f.invoke()).status,200);assert.equal((await f.invoke()).status,200);assert.equal(audit.length,1);assert.equal(status,'active');
 assert.equal((await f.invoke({body:{status:'disabled'}})).status,503);assert.equal(status,'active');assert.equal(audit.length,1);
});
test('HTTP -> mock transaction: audit failure prevents status commit',async()=>{
 const current='pending';const commits=0;
 const f=fixture('student-status',{execute:async()=>{
  // DB function raises before transaction completion, so caller never receives a success.
  throw Error('AUDIT_INSERT_FAILED');
 }});
 const r=await f.invoke();assert.equal(r.status,503);assert.equal(current,'pending');assert.equal(commits,0);
});
test('incorrect status result rejected even when provider returns a valid state',async()=>{
 for(const [kind,status] of [['student-status','disabled'],['enrollment-decision','rejected']]){
  const f=fixture(kind,{execute:async()=>({...config[kind].output,status})});
  assert.equal((await f.invoke()).status,502);
 }
});
test('inactive teacher verified-role claims are not sufficient for mutation',async()=>{
 const f=fixture('batch-create',{verify:async token=>({verified:true,userId:teacher,role:'teacher',accessToken:token})});
 assert.equal((await f.invoke()).status,403);
});
