import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTeacherCoreReadEndpoint} from '../src/server/http/teacher-core-reads.mjs';
const teacher='123e4567-e89b-42d3-a456-426614174000';
const batchId='123e4567-e89b-42d3-a456-426614174001';
const studentId='123e4567-e89b-42d3-a456-426614174002';
const enrollmentId='123e4567-e89b-42d3-a456-426614174003';
const token='a.b.c';
const date='2026-10-18T00:00:00+00:00';
const b={id:batchId,code:'CSE-01',name:'Morning Batch',capacity:3,is_archived:false};
const bRow={id:batchId,code:b.code,name:b.name,capacity:b.capacity,is_archived:b.is_archived};
const eRow={id:enrollmentId,student_id:studentId,batch_id:batchId,status:'active',requested_at:date,decided_at:date};
const sRow={id:studentId,role:'student',full_name:'Sample Student',account_status:'active',created_at:date};
const urls={
 'batch-roster':`http://localhost:3000/api/v1/teacher/batches/${batchId}/roster`,
 'batch-occupancy':`http://localhost:3000/api/v1/teacher/batches/${batchId}/occupancy`,
 'enrollment-detail':`http://localhost:3000/api/v1/teacher/enrollments/${enrollmentId}`,
 'student-directory':'http://localhost:3000/api/v1/teacher/students/directory',
};
async function run(kind,options={}){
 const calls=[];
 const verify=options.verify??(async t=>({verified:true,userId:teacher,role:'teacher',accountStatus:'active',accessToken:t}));
 const readRows=options.readRows??(async(table,t,query)=>{
  calls.push({table,token:t,query});
  if(table==='batches')return [bRow];
  if(table==='enrollments')return [eRow];
  return [sRow];
 });
 const countBatch=options.countBatch??(async(t,id,status)=>{calls.push({count:true,token:t,batchId:id,status});return status==='active'?1:1;});
 const req=new Request(options.url??urls[kind],{method:options.method??'GET',headers:options.auth===undefined?{authorization:`Bearer ${token}`}:(options.auth?{authorization:options.auth}:{})});
 const ctx={params:Promise.resolve(options.params??{batchId,enrollmentId})};
 const response=await createTeacherCoreReadEndpoint(kind,{verify,readRows,countBatch})(req,ctx);
 return {response,data:await response.json(),calls};
}
test('batch roster returns one batch, enrollment and student joined by verified IDs',async()=>{
 const {response,data,calls}=await run('batch-roster');
 assert.equal(response.status,200);assert.equal(data.data.batch.id,batchId);
 assert.equal(data.data.entries[0].student.id,studentId);
 assert.equal(data.data.entries[0].enrollment.batchId,batchId);
 assert.equal(data.data.pagination.limit,20);
 assert.equal(calls.length,3);
 assert.equal(calls[0].table,'batches');assert.equal(calls[1].query.batch_id,`eq.${batchId}`);
 assert.equal(calls[2].query.id,`in.(${studentId})`);
 for(const c of calls)assert.equal(c.token,token);
 assert.match(response.headers.get('cache-control'),/no-store/);
});
test('batch roster has strict filter pagination and supports zero enrollments without profile reads',async()=>{
 const empty=await run('batch-roster',{url:urls['batch-roster']+'?status=pending&limit=10&offset=30',readRows:async(table,t,q)=>table==='batches'?[bRow]:[]});
 assert.equal(empty.response.status,200);assert.equal(empty.data.data.entries.length,0);assert.deepEqual(empty.data.data.pagination,{limit:10,offset:30,status:'pending'});
 const good=await run('batch-roster',{url:urls['batch-roster']+'?status=active',readRows:async(table,t,q)=>table==='batches'?[bRow]:table==='profiles'?[sRow]:[eRow]});
 assert.equal(good.response.status,200);
});
test('batch roster refuses foreign batch enrollment, missing profile, duplicated profiles and private fields',async()=>{
 for(const readRows of [
  async t=>t==='batches'?[bRow]:t==='enrollments'?[{...eRow,batch_id:teacher}]:[sRow],
  async t=>t==='batches'?[bRow]:t==='enrollments'?[eRow]:[],
  async t=>t==='batches'?[bRow]:t==='enrollments'?[eRow]:[sRow,sRow],
  async t=>t==='batches'?[bRow]:t==='enrollments'?[eRow]:[{...sRow,email:'secret@internal'}],
  async t=>t==='batches'?[bRow]:t==='enrollments'?[{...eRow,status:'pending',decided_at:null}]:[sRow],
 ]){
  const {response,data}=await run('batch-roster',{readRows,url:urls['batch-roster']+'?status=active'});
  assert.equal(response.status,502);assert.doesNotMatch(JSON.stringify(data),/secret@internal/);
 }
});
test('batch occupancy counts active and pending using signed-JWT-specific port',async()=>{
 const {response,data,calls}=await run('batch-occupancy');
 assert.equal(response.status,200);assert.deepEqual(data.data,{batch:{id:batchId,code:b.code,name:b.name,capacity:3,isArchived:false},active:1,pending:1,availableSeats:2,isAtCapacity:false});
 assert.deepEqual(calls.filter(x=>x.count).map(x=>x.status).sort(),['active','pending']);
 assert.equal(calls[1].batchId,batchId);assert.equal(calls[1].token,token);
});
test('batch occupancy rejects impossible capacity, invalid count and upstream error',async()=>{
 for(const countBatch of [async()=>4,async()=>-1,async()=>1.5,async()=>{throw Error('PRIVATE_SECRET');}]){
  const {response,data}=await run('batch-occupancy',{countBatch});
  assert.ok([502,503].includes(response.status));assert.doesNotMatch(JSON.stringify(data),/PRIVATE_SECRET/);
 }
});
test('enrollment detail resolves the correct profile and batch only after matching enrollment',async()=>{
 const {response,data,calls}=await run('enrollment-detail');
 assert.equal(response.status,200);assert.equal(data.data.enrollment.id,enrollmentId);
 assert.equal(data.data.student.fullName,sRow.full_name);assert.equal(data.data.batch.id,batchId);
 assert.equal(calls[0].query.id,`eq.${enrollmentId}`);
 assert.equal(calls.find(x=>x.table==='profiles').query.role,'eq.student');
});
test('enrollment detail never exposes foreign rows, extra data or unresolved profiles',async()=>{
 const variants=[
  async t=>t==='enrollments'?[{...eRow,id:teacher}]:t==='profiles'?[sRow]:[bRow],
  async t=>t==='enrollments'?[eRow]:t==='profiles'?[{...sRow,id:teacher}]:[bRow],
  async t=>t==='enrollments'?[eRow]:t==='profiles'?[sRow]:[{...bRow,email:'private'}],
 ];
 for(const readRows of variants){const {response,data}=await run('enrollment-detail',{readRows});assert.equal(response.status,502);assert.doesNotMatch(JSON.stringify(data),/private/);}
});
test('missing resource produces sanitized 404 without querying dependent records',async()=>{
 const calls=[];
 const {response}=await run('enrollment-detail',{readRows:async(table)=>{calls.push(table);return [];}});
 assert.equal(response.status,404);assert.deepEqual(calls,['enrollments']);
});
test('student directory returns status-filtered teacher-scoped paginated profiles',async()=>{
 const {response,data,calls}=await run('student-directory',{url:urls['student-directory']+'?accountStatus=active&limit=5&offset=0'});
 assert.equal(response.status,200);
 assert.equal(data.data.students[0].accountStatus,'active');
 assert.equal(calls[0].query.account_status,'eq.active');assert.equal(calls[0].query.role,'eq.student');
 assert.equal(data.data.students[0].fullName,'Sample Student');
});
test('student directory denies wrong role, status substitution and private columns',async()=>{
 for(const bad of [async()=>[{...sRow,account_status:'disabled'}],async()=>[{...sRow,role:'teacher'}],async()=>[{...sRow,email:'secret'}]]){
  const {response}=await run('student-directory',{url:urls['student-directory']+'?accountStatus=active',readRows:bad});assert.equal(response.status,502);
 }
});
test('all four routes block students and inactive, unverified or forged teachers before RLS',async()=>{
 for(const kind of Object.keys(urls))for(const patch of [{role:'student'},{accountStatus:'disabled'},{accountStatus:'pending'},{verified:false},{accessToken:'forged'},{userId:'invalid'}]){
  let queries=0;
  const {response}=await run(kind,{verify:async()=>({verified:true,userId:teacher,role:'teacher',accountStatus:'active',accessToken:token,...patch}),readRows:async()=>{queries++;return [];},countBatch:async()=>{queries++;return 0;}});
  assert.ok([401,403].includes(response.status));assert.equal(queries,0);
 }
});
test('invalid query, path, bearer and HTTP method rejected before Auth',async()=>{
 const cases=[['batch-roster',{url:urls['batch-roster']+'?status=evil'}],['batch-roster',{url:urls['batch-roster']+'?status=active&status=pending'}],['batch-roster',{url:urls['batch-roster']+'?limit=999'}],['student-directory',{url:urls['student-directory']+'?accountStatus=unknown'}],['student-directory',{url:urls['student-directory']+'?offset=-1'}],['enrollment-detail',{params:{enrollmentId:'invalid'}}],['batch-occupancy',{auth:'Bearer invalid'}],['batch-roster',{method:'POST'}]];
 for(const [kind,options] of cases){let verified=0;const {response}=await run(kind,{...options,verify:async()=>{verified++;return {};}});assert.notEqual(response.status,200);assert.equal(verified,0);}
});
test('upstream network/internal exceptions are sanitized and no token or secret is returned',async()=>{
 const {response,data}=await run('batch-roster',{readRows:async()=>{throw Error('sensitive-server-key');}});
 assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(data),/sensitive|server-key|a\.b\.c/);
});
test('new management adapters remain read-only and enforce same JWT for PostgREST',async()=>{
 const base=new URL('../src/server/',import.meta.url);
 const files=['http/teacher-core-reads.mjs','http/production-teacher-core-reads-adapter.ts','supabase/batch-count.ts'];
 for(const f of files){const s=await readFile(new URL(f,base),'utf8');assert.doesNotMatch(s,/service_role|SUPABASE_SERVICE_ROLE|secretKey|['"]DELETE['"]|method\s*:\s*['"]POST['"]/i);}
 const adapter=await readFile(new URL('http/production-teacher-core-reads-adapter.ts',base),'utf8');
 assert.match(adapter,/verifyActiveActor/);assert.match(adapter,/readSupabaseRows/);assert.match(adapter,/countTeacherBatchEnrollments/);
});
