import assert from 'node:assert/strict';
import test from 'node:test';
import {createTeacherStudentManagementEndpoint} from '../src/server/http/teacher-student-management.mjs';
const id='0032d124-ecc0-4732-b284-7208efab01e1',uid='01910a3f-b7fa-437f-95fa-362953d48ef2',batchId='1d4c3fc6-f433-4402-ae4a-a224d05d164e';
const token='abc.def.ghi';
const profile={id,role:'student',full_name:'Test User',account_status:'pending',created_at:'2026-10-18T00:00:00+00:00'};
const enrollment={id:'ec2536d5-a7bc-4e04-acb9-c3b642a1e445',student_id:id,batch_id:batchId,status:'pending',requested_at:'2026-10-18T00:00:00+00:00',decided_at:null};
const path=`http://localhost:3000/api/v1/teacher/students/${id}/management`;
async function call(options={}){
 const calls=[];
 const verify=options.verify??(async t=>{calls.push('verify');return {verified:true,userId:uid,role:'teacher',accessToken:t,accountStatus:'active'};});
 const readRows=options.readRows??(async (table,t,q)=>{calls.push({table,token:t,query:q});return table==='profiles'?[profile]:[enrollment];});
 const req=new Request(options.url??path,{headers:options.auth===undefined?{authorization:`Bearer ${token}`}:(options.auth?{authorization:options.auth}:{})});
 const ctx={params:Promise.resolve({studentId:options.studentId??id})};
 const r=await createTeacherStudentManagementEndpoint({verify,readRows})(req,ctx);
 return {r,body:await r.json(),calls};
}
test('active teacher reads RLS-scoped student profile status and bounded enrollments',async()=>{
 const {r,body,calls}=await call();assert.equal(r.status,200);assert.equal(body.data.profile.account_status,'pending');assert.equal(body.data.enrollments[0].id,enrollment.id);assert.equal(body.data.pagination.limit,20);assert.match(r.headers.get('cache-control'),/no-store/);
 assert.equal(calls.length,3);assert.equal(calls[1].table,'profiles');assert.equal(calls[1].token,token);assert.equal(calls[1].query.id,`eq.${id}`);assert.equal(calls[1].query.role,'eq.student');assert.equal(calls[2].query.student_id,`eq.${id}`);
});
test('only active teachers can enter; student and disabled teacher read no rows',async()=>{
 for(const patch of [{role:'student'},{accountStatus:'pending'},{accountStatus:'disabled'},{verified:false},{accessToken:'other'}]){
  let reads=0;
  const {r}=await call({verify:async t=>({verified:true,userId:uid,role:'teacher',accessToken:t,accountStatus:'active',...patch}),readRows:async()=>{reads++;return [];}});
  assert.notEqual(r.status,200);assert.equal(reads,0);
 }
});
test('malformed bearer and unknown queries or ID are rejected before verify',async()=>{
 for(const options of [{auth:null},{auth:'Bearer invalid'},{url:path+'?status=active'},{url:path+'?limit=999'},{url:path+'?offset=-2'},{url:path+'?limit=1&limit=2'},{studentId:'not-a-uuid'}]){
  const {r,calls}=await call(options);assert.notEqual(r.status,200);assert.equal(calls.length,0);
 }
});
test('foreign, duplicated and extra-field records fail closed',async()=>{
 const variants=[
  async t=>t==='profiles'?[{...profile,full_name:'ok',email:'private@example.com'}]:[enrollment],
  async t=>t==='profiles'?[{...profile,id:uid}]:[enrollment],
  async t=>t==='profiles'?[profile]:[{...enrollment,student_id:uid}],
  async t=>t==='profiles'?[profile]:[enrollment,enrollment],
  async t=>t==='profiles'?[{...profile,role:'teacher'}]:[enrollment],
 ];
 for(const v of variants){const {r,body}=await call({readRows:async table=>v(table)});assert.equal(r.status,502);assert.doesNotMatch(JSON.stringify(body),/private@example.com/);}
});
test('absent student returns 404 without enrollment query, upstream errors sanitized',async()=>{
 let n=0;let {r}=await call({readRows:async()=>{n++;return [];}});assert.equal(r.status,404);assert.equal(n,1);
 const out=await call({readRows:async()=>{throw Error('my-secret-token');}});assert.equal(out.r.status,503);assert.doesNotMatch(JSON.stringify(out.body),/secret|token/);
});
test('endpoint is strictly read-only and uses no elevated service credentials',async()=>{
 const fs=await import('node:fs/promises');
 for(const file of ['../src/server/http/teacher-student-management.mjs','../src/server/http/production-teacher-student-management-adapter.ts']){
  const s=await fs.readFile(new URL(file,import.meta.url),'utf8');
  assert.doesNotMatch(s,/service_role|SUPABASE_SERVICE_ROLE|secretKey|method\s*:\s*['"]POST|method\s*:\s*['"]PATCH|method\s*:\s*['"]DELETE/i);
 }
});
