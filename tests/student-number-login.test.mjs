import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLoginBody} from '../src/server/browser-session.mjs';
import {isStudentNumber,resolveStudentLoginEmail} from '../src/server/student-number-login.mjs';
const root='https://example.supabase.co';
const adminKey='sb_secret_'+'a'.repeat(32);

test('login accepts email or exactly ten digits without changing the existing payload contract',()=>{
 for(const email of ['student@example.com','1000000000','9999999999'])assert.equal(verifyLoginBody({email,password:'password'}),true);
 for(const email of ['100000000','10000000000','0000000000','10000 0000','1000000000@example','1e9','١٠٠٠٠٠٠٠٠٠'])assert.equal(verifyLoginBody({email,password:'password'}),false);
 assert.equal(verifyLoginBody({email:'1000000000',password:'password',role:'teacher'}),false);
 assert.equal(isStudentNumber(1000000000),false);
});
test('student number lookup stays server-side and uses privileged credentials only for lookup',async()=>{
 const email=await resolveStudentLoginEmail('1000000000',{root,adminKey,fetchImpl:async(url,options)=>{
  assert.equal(String(url),root+'/rest/v1/rpc/coaching_resolve_student_login');
  assert.equal(options.headers.apikey,adminKey);
  assert.equal(options.headers.Authorization,undefined);
  assert.deepEqual(JSON.parse(options.body),{p_student_number:'1000000000'});
  assert.equal(options.cache,'no-store');
  return Response.json('student@example.com');
 }});
 assert.equal(email,'student@example.com');
});
test('unknown and offline IDs do not reveal whether a student record exists',async()=>{
 await assert.rejects(resolveStudentLoginEmail('1000000000',{root,adminKey,fetchImpl:async()=>Response.json(null)}),/^Error: INVALID_CREDENTIALS$/);
 await assert.rejects(resolveStudentLoginEmail('not-an-id',{root,adminKey,fetchImpl:async()=>{throw Error('must not fetch');}}),/INVALID_CREDENTIALS/);
 await assert.rejects(resolveStudentLoginEmail('1000000000',{root,fetchImpl:async()=>{throw Error('must not fetch');}}),/AUTH_UNAVAILABLE/);
 await assert.rejects(resolveStudentLoginEmail('1000000000',{root,adminKey,fetchImpl:async()=>new Response('upstream private details',{status:503})}),/^Error: AUTH_UNAVAILABLE$/);
});
