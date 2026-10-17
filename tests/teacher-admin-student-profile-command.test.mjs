import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createTeacherAdminCommandEndpoint} from '../src/server/http/teacher-admin-commands.mjs';
const student=randomUUID(),teacher=randomUUID(),op=randomUUID(),token='aaa.bbb.ccc';
const actor={verified:true,userId:teacher,accessToken:token,role:'teacher',accountStatus:'active'};
function req(payload,overrides={}){return new Request(`https://example.test/api/v1/teacher/students/${student}/profile`,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'idempotency-key':op,'content-type':'application/json',...overrides},body:JSON.stringify(payload)});}
const ctx={params:Promise.resolve({studentId:student})};
test('profile update requires active verified teacher and strict sanitized shape',async()=>{
 let count=0;const handler=createTeacherAdminCommandEndpoint('student-profile',{verify:async()=>actor,execute:async(kind,c)=>{count++;assert.equal(kind,'student-profile');assert.equal(c.target,student);assert.equal(c.data.fullName,'A Student');return {id:student,fullName:c.data.fullName};}});
 const res=await handler(req({fullName:'  A Student  '}),ctx);assert.equal(res.status,200);assert.equal((await res.json()).data.fullName,'A Student');assert.equal(count,1);
});
test('profile rejects role escalation and invalid field values before executing',async()=>{
 let called=0;const handler=createTeacherAdminCommandEndpoint('student-profile',{verify:async()=>{called++;return actor},execute:async()=>{throw Error('SHOULD_NOT_RUN')}});
 for(const p of [{fullName:'X',role:'teacher'},{fullName:' '},{fullName:'A\nB'},{fullName:'A'.repeat(161)},{accountStatus:'active'}]){const r=await handler(req(p),ctx);assert.equal(r.status,400);}
 assert.equal(called,0);
});
test('profile rejects disabled teacher, student and forged actor token',async()=>{
 for(const change of [{role:'student'},{accountStatus:'disabled'},{accessToken:'forged.token.xyz'},{verified:false}]){
  const handler=createTeacherAdminCommandEndpoint('student-profile',{verify:async()=>({...actor,...change}),execute:async()=>{throw Error('INVALID_ACCESS')}});
  assert.equal((await handler(req({fullName:'Valid Name'}),ctx)).status,403);
 }
});
test('profile detects upstream substitution and sanitizes provider exception',async()=>{
 for(const execute of [async()=>({id:randomUUID(),fullName:'Valid Name'}),async()=>({id:student,fullName:'Valid Name',role:'teacher'})]){
  const handler=createTeacherAdminCommandEndpoint('student-profile',{verify:async()=>actor,execute});
  assert.equal((await handler(req({fullName:'Valid Name'}),ctx)).status,502);
 }
 const handler=createTeacherAdminCommandEndpoint('student-profile',{verify:async()=>actor,execute:async()=>{throw Error('DATABASE SECRET')}});
 const res=await handler(req({fullName:'Valid Name'}),ctx);assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/SECRET/);
});
test('profile invalid key, query and route UUID denied',async()=>{
 const handler=createTeacherAdminCommandEndpoint('student-profile',{verify:async()=>{throw Error('SHOULD_NOT_VERIFY')},execute:async()=>null});
 assert.equal((await handler(req({fullName:'Valid Name'},{'idempotency-key':'no'}),ctx)).status,400);
 assert.equal((await handler(req({fullName:'Valid Name'}),{params:Promise.resolve({studentId:'bad'})})).status,400);
 const query=new Request(`https://example.test/foo?extra=1`,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'idempotency-key':op,'content-type':'application/json'},body:JSON.stringify({fullName:'Valid Name'})});
 assert.equal((await handler(query,ctx)).status,400);
});
test('student profile SQL RPC is least privilege and audited',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261018000200_teacher_student_profile_update.sql',import.meta.url),'utf8');
 assert.match(sql,/security definer set search_path = ''/i);assert.match(sql,/public\.current_user_is_teacher\(\)/);
 assert.match(sql,/role='student'::public\.app_role for update/);assert.match(sql,/coaching_mutation_receipts/);
 assert.match(sql,/student\.profile\.updated/);assert.match(sql,/revoke all on function.*from public,anon,authenticated/i);
 assert.doesNotMatch(sql,/set\s+role\s*=|set\s+account_status\s*=/i);
});
