import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isUuid,rpcFailure,validLinkedAuthUser,validLoginEmail,validOfflineStudent} from '../src/server/student-login-link.mjs';

const migration=readFileSync('supabase/migrations/20261027032838_offline_student_records.sql','utf8');
const activation=readFileSync('src/app/api/v1/teacher/students/[studentId]/login/route.ts','utf8');
const offline=readFileSync('src/app/api/v1/teacher/students/offline/route.ts','utf8');

test('offline admission accepts only a bounded name: no email or password fields', ()=>{
 assert.equal(validOfflineStudent({fullName:'Nusrat Jahan'}),true);
 assert.equal(validOfflineStudent({fullName:'A'}),false);
 assert.equal(validOfflineStudent({fullName:'Nusrat',email:'x@y.z'}),false);
 assert.equal(validOfflineStudent({fullName:'Bad\u0007name'}),false);
 assert.equal(validOfflineStudent([]),false);
});

test('login activation requires exactly one plausible email', ()=>{
 assert.equal(validLoginEmail({email:'student@example.org'}),true);
 assert.equal(validLoginEmail({email:'not-an-email'}),false);
 assert.equal(validLoginEmail({email:'a@b.c',studentId:'x'}),false);
});

test('linked Auth user must carry the permanent Student id and reserved email', ()=>{
 const id='5b0c2f9e-3d8a-4c1b-9f6e-2a7d4e8b1c03';
 assert.equal(validLinkedAuthUser({id,email:'S@Example.org'},id,'s@example.org'),true);
 assert.equal(validLinkedAuthUser({id:'5b0c2f9e-3d8a-4c1b-9f6e-2a7d4e8b1c04',email:'s@example.org'},id,'s@example.org'),false);
 assert.equal(validLinkedAuthUser({id,email:'other@example.org'},id,'s@example.org'),false);
 assert.equal(isUuid(id),true);assert.equal(isUuid('nope'),false);
});

test('RPC failures map to safe codes and never leak database messages', ()=>{
 assert.deepEqual(rpcFailure(400,{message:'EMAIL_ALREADY_REGISTERED'}),{status:409,code:'EMAIL_ALREADY_REGISTERED'});
 assert.deepEqual(rpcFailure(400,{message:'FORBIDDEN'}),{status:403,code:'FORBIDDEN'});
 assert.deepEqual(rpcFailure(404,{message:'Could not find the function public.coaching_create_offline_student'}),{status:503,code:'MIGRATION_NOT_APPLIED'});
 assert.deepEqual(rpcFailure(500,{message:'relation secret_table does not exist'}),{status:503,code:'WRITE_SERVICE_UNAVAILABLE'});
});

test('migration decouples Student identity from Auth without moving existing ids', ()=>{
 assert.match(migration,/drop constraint if exists profiles_id_fkey/);
 assert.doesNotMatch(migration,/update public\.(payments|enrollments|monthly_dues|payment_receipts|exam_results)/i);
 assert.doesNotMatch(migration,/delete from|truncate/i);
 assert.match(migration,/on conflict \(id\) do nothing/);
 assert.match(migration,/EMAIL_RESERVED_FOR_STUDENT/);
 assert.match(migration,/left join auth\.users u on u\.id=pr\.id/);
 for(const fn of ['coaching_create_offline_student','coaching_prepare_student_login','coaching_student_login_state'])
  assert.match(migration,new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public,anon,authenticated`));
});

test('activation creates the Auth user with the Student id and sends a verification invitation', ()=>{
 assert.match(activation,/JSON\.stringify\(\{id:studentId,email,email_confirm:false\}\)/);
 assert.match(activation,/\/auth\/v1\/invite/);
 assert.match(activation,/coaching_prepare_student_login/);
 assert.doesNotMatch(activation,/password\s*:/i);
 assert.doesNotMatch(offline,/auth\/v1|SUPABASE_AUTH_ADMIN_KEY/);
});
