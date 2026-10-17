import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createTeacherAdminCommandEndpoint} from '../src/server/http/teacher-admin-commands.mjs';
const student=randomUUID(),batch=randomUUID(),teacher=randomUUID(),op=randomUUID(),token='aaa.bbb.ccc';
const actor={verified:true,userId:teacher,accessToken:token,role:'teacher',accountStatus:'active'};
const req=(data,headers={})=>new Request('https://example.test/api/v1/teacher/enrollment-requests',{method:'POST',headers:{authorization:`Bearer ${token}`,'idempotency-key':op,'content-type':'application/json',...headers},body:JSON.stringify(data)});
test('teacher can submit strict pending enrollment request with idempotency key',async()=>{
 const id=randomUUID();const handler=createTeacherAdminCommandEndpoint('enrollment-request',{verify:async()=>actor,execute:async(kind,c)=>{assert.equal(kind,'enrollment-request');assert.equal(c.data.studentId,student);assert.equal(c.data.batchId,batch);assert.equal(c.operationId,op);return {id,studentId:student,batchId:batch,status:'pending'};}});
 const res=await handler(req({studentId:student,batchId:batch}));assert.equal(res.status,201);assert.equal((await res.json()).data.id,id);
});
test('invalid IDs, extra properties, and missing operation key fail before auth',async()=>{
 let verified=0;const handler=createTeacherAdminCommandEndpoint('enrollment-request',{verify:async()=>{verified++;return actor},execute:async()=>{throw Error('SHOULD_NOT_RUN')}});
 for(const data of [{studentId:'wrong',batchId:batch},{studentId:student,batchId:'no'},{studentId:student,batchId:batch,status:'active'},{studentId:student}])assert.equal((await handler(req(data))).status,400);
 assert.equal((await handler(req({studentId:student,batchId:batch},{'idempotency-key':'bad'}))).status,400);
 assert.equal(verified,0);
});
test('no student, disabled teacher, or forged actor token can create an enrollment',async()=>{
 for(const change of [{role:'student'},{accountStatus:'disabled'},{accessToken:'forged.token.xyz'},{verified:false}]){
  const handler=createTeacherAdminCommandEndpoint('enrollment-request',{verify:async()=>({...actor,...change}),execute:async()=>{throw Error('INVALID_ACCESS')}});
  assert.equal((await handler(req({studentId:student,batchId:batch}))).status,403);
 }
});
test('foreign/active status payloads from RPC rejected, errors sanitized',async()=>{
 for(const bad of [{id:randomUUID(),studentId:student,batchId:batch,status:'active'},{id:randomUUID(),studentId:student,batchId:randomUUID(),status:'pending'},{id:randomUUID(),studentId:student,batchId:batch,status:'pending',debug:'token'}]){
  const handler=createTeacherAdminCommandEndpoint('enrollment-request',{verify:async()=>actor,execute:async()=>bad});
  assert.equal((await handler(req({studentId:student,batchId:batch}))).status,502);
 }
 const handler=createTeacherAdminCommandEndpoint('enrollment-request',{verify:async()=>actor,execute:async()=>{throw Error('SECRET_DB_ERROR')}});
 const res=await handler(req({studentId:student,batchId:batch}));assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/SECRET/);
});
test('enrollment request SQL protects active account and single enrollment per batch',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261018000300_teacher_enrollment_request.sql',import.meta.url),'utf8');
 assert.match(sql,/security definer set search_path = ''/i);
 assert.match(sql,/public\.current_user_is_teacher\(\)/);
 assert.match(sql,/account_status.*for update/si);
 assert.match(sql,/v_student_status <> 'active'/);
 assert.match(sql,/status='pending'|values\(p_student_id,p_batch_id,'pending'/i);
 assert.match(sql,/ENROLLMENT_ALREADY_EXISTS/);
 assert.match(sql,/coaching_mutation_receipts/);
 assert.match(sql,/revoke all on function.*from public,anon,authenticated/i);
});
