import test from 'node:test';
import assert from 'node:assert/strict';
import { createProtectedReadEndpoint, BoundaryError } from '../src/server/http/protected-read.mjs';
import { verifySupabaseUser, AuthUnavailableError } from '../src/server/http/supabase-read-auth.mjs';
const s='11111111-1111-4111-8111-111111111111', t='22222222-2222-4222-8222-222222222222';
const b='33333333-3333-4333-8333-333333333333';
const e='44444444-4444-4444-8444-444444444444';
const JWT='aa.bb.cc';
const profile={id:s,role:'student',full_name:'Student One'};
const enrollment={id:e,student_id:s,batch_id:b,status:'active',requested_at:'2026-10-16T00:00:00Z',decided_at:'2026-10-16T01:00:00Z'};
const batch={id:b,code:'CSE_01',name:'Science',capacity:50,is_archived:false};
function fixture(kind='student-me',changes={}){
 const calls=[];
 const verified={userId:kind.startsWith('teacher')?t:s,role:kind.startsWith('teacher')?'teacher':'student',accessToken:JWT,verified:true};
 const deps={
  verify:async token=>{calls.push(['verify',token]);return verified;},
  readRows:async (table,token,query)=>{calls.push(['read',table,token,query]);return kind==='student-me'?[profile]:kind==='student-enrollments'?[enrollment]:kind==='teacher-students'?[profile]:[batch];},
  ...changes
 };
 const go=async(search='',authorization=`Bearer ${JWT}`,method='GET')=>{
  const req=new Request(`https://example.test/api/v1/${kind}${search}`,{method,headers:authorization?{Authorization:authorization}:{}});
  const response=await createProtectedReadEndpoint(kind,deps)(req);
  return {status:response.status,headers:response.headers,body:await response.json()};
 };
 return {calls,go};
}
test('student/me performs token verification and scoped profile query',async()=>{
 const f=fixture();const {status,body,headers}=await f.go();
 assert.equal(status,200);assert.deepEqual(body.data,profile);assert.match(headers.get('cache-control'),/no-store/);
 assert.deepEqual(f.calls[0],['verify',JWT]);
 assert.equal(f.calls[1][3].id,`eq.${s}`);
 assert.deepEqual(f.calls[1][3],{select:'id,role,full_name',id:`eq.${s}`,limit:'1'});
});
test('student/enrollments returns only student-scoped rows with pagination',async()=>{
 const f=fixture('student-enrollments');const r=await f.go('?limit=4&offset=2');
 assert.equal(r.status,200);assert.deepEqual(r.body.data,[enrollment]);
 assert.equal(f.calls[1][3].student_id,`eq.${s}`);assert.equal(f.calls[1][3].limit,'4');assert.equal(f.calls[1][3].offset,'2');
});
test('teacher/students enforces role filter in DB query and safe projection',async()=>{
 const f=fixture('teacher-students');const r=await f.go('?limit=3');
 assert.equal(r.status,200);assert.deepEqual(r.body.data,[profile]);assert.equal(f.calls[1][3].role,'eq.student');
});
test('teacher/batches reads batches with bounded pagination',async()=>{
 const f=fixture('teacher-batches');const r=await f.go('?limit=5&offset=1');
 assert.equal(r.status,200);assert.deepEqual(r.body.data,[batch]);assert.equal(f.calls[1][3].limit,'5');
});
test('missing, malformed or oversized bearer never calls verifier',async()=>{
 for(const auth of [null,'Basic abc','Bearer x','Bearer aa.bb.cc, Bearer xyz','Bearer aa.bb.cc\tother','Bearer '+('x'.repeat(9000))]){
  const f=fixture();const r=await f.go('',auth);assert.equal(r.status,401);assert.deepEqual(f.calls,[]);
 }
});
test('query allowlist rejects SQL-like filters, duplicate keys and pagination edge cases before auth',async()=>{
 for(const query of ['?role=teacher','?student_id='+t,'?select=*','?limit=0','?limit=51','?limit=-1','?limit=1.1','?limit=2&limit=3','?offset=10001','?offset=NaN','?offset=01']){
  const f=fixture('teacher-students');const r=await f.go(query);assert.equal(r.status,400,query);assert.deepEqual(f.calls,[],query);
 }
 const f=fixture('student-me');assert.equal((await f.go('?limit=1')).status,400);assert.deepEqual(f.calls,[]);
});
test('student token cannot access teacher routes; teacher cannot access student routes',async()=>{
 for(const [kind,role] of [['teacher-students','student'],['teacher-batches','student'],['student-me','teacher'],['student-enrollments','teacher']]){
  const f=fixture(kind,{verify:async token=>{f.calls.push(['verify',token]);return {verified:true,userId:s,role,accessToken:token};}});
  assert.equal((await f.go()).status,403);assert.equal(f.calls.length,1);
 }
});
test('unverified principals, identity mismatches and fake roles are rejected',async()=>{
 for(const patch of [{verified:false},{userId:'bad'},{accessToken:'fake'},{role:'admin'},null]){
  const f=fixture('student-me',{verify:async()=>patch===null?null:{verified:true,userId:s,role:'student',accessToken:JWT,...patch}});
  assert.equal((await f.go()).status,401);assert.equal(f.calls.length,0);
 }
});
test('foreign student profile and missing self profile do not leak',async()=>{
 for(const output of [[{...profile,id:t}],[],[{...profile,role:'teacher'}]]){
  const f=fixture('student-me',{readRows:async()=>output});const r=await f.go();assert.notEqual(r.status,200);
 }
});
test('provider output extra fields and non-array payloads fail closed',async()=>{
 for(const output of [[{...profile,password:'private'}],{},null,[profile,profile]]){
  const f=fixture('student-me',{readRows:async()=>output});assert.equal((await f.go()).status,502);
 }
});
test('cross student enrollment and malicious statuses always fail',async()=>{
 for(const patch of [{student_id:t},{status:'draft'},{id:'invalid'},{batch_id:'invalid'},{requested_at:'bad'},{other:'private'}]){
  const f=fixture('student-enrollments',{readRows:async()=>[{...enrollment,...patch}]});assert.equal((await f.go()).status,502);
 }
});
test('teacher student-list provider cannot substitute teacher records or private details',async()=>{
 for(const patch of [{role:'teacher'},{password_hash:'secret'},{id:'bad'}]){
  const f=fixture('teacher-students',{readRows:async()=>[{...profile,...patch}]});assert.equal((await f.go()).status,502);
 }
});
test('teacher batch provider cannot leak unexpected data or invalid amounts',async()=>{
 for(const patch of [{capacity:0},{capacity:1.25},{private_note:'x'},{is_archived:'false'}]){
  const f=fixture('teacher-batches',{readRows:async()=>[{...batch,...patch}]});assert.equal((await f.go()).status,502);
 }
});
test('duplicate row id and oversized result rejected',async()=>{
 for(const output of [[batch,batch],Array(21).fill(batch)]){
  const f=fixture('teacher-batches',{readRows:async()=>output});assert.equal((await f.go()).status,502);
 }
});
test('database/authorization failure returns sanitized response and no credentials',async()=>{
 const f=fixture('student-me',{verify:async()=>{throw Error('Bearer private secret in upstream');}});
 const r=await f.go();assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r.body),/private|Bearer|upstream/);
 const g=fixture('student-me',{verify:async()=>{throw new BoundaryError(401,'UNAUTHORIZED');}});
 assert.equal((await g.go()).status,401);
});
test('auth user lookup verifies remotely and ignores metadata claims',async()=>{
 let calls=0;
 const res=await verifySupabaseUser(JWT,{projectUrl:'https://abcd.supabase.co',anonKey:'publishable',fetchImpl:async(url,init)=>{
  calls++;assert.equal(String(url),'https://abcd.supabase.co/auth/v1/user');assert.equal(init.headers.Authorization,`Bearer ${JWT}`);
  assert.equal(init.method,'GET');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');
  return new Response(JSON.stringify({id:s,app_metadata:{role:'teacher'},user_metadata:{role:'teacher'}}),{status:200});
 }});
 assert.equal(calls,1);assert.deepEqual(res,{id:s});
});
test('invalid Supabase host and missing key fail before fetch (SSRF defense)',async()=>{
 for(const projectUrl of ['http://abcd.supabase.co','https://127.0.0.1','https://evil.com','https://abcd.supabase.co.evil.com','https://abcd.supabase.co/path','https://u:p@abcd.supabase.co','https://abcd.supabase.co:443/extra']){
  let called=false;
  await assert.rejects(()=>verifySupabaseUser(JWT,{projectUrl,anonKey:'publishable',fetchImpl:async()=>{called=true;}}),AuthUnavailableError);
  assert.equal(called,false,projectUrl);
 }
 await assert.rejects(()=>verifySupabaseUser(JWT,{}),AuthUnavailableError);
});
test('Supabase remote unauthorized returns null, errors and bad IDs fail closed',async()=>{
 const options={projectUrl:'https://abcd.supabase.co',anonKey:'anon-key'};
 assert.equal(await verifySupabaseUser(JWT,{...options,fetchImpl:async()=>new Response('',{status:401})}),null);
 for(const fetchImpl of [async()=>new Response('oops',{status:500}),async()=>new Response('{}',{status:200}),async()=>new Response('bad json',{status:200}),async()=>{throw Error('network');}]){
  await assert.rejects(()=>verifySupabaseUser(JWT,{...options,fetchImpl}),AuthUnavailableError);
 }
});
test('no write operation, service key, cookie authentication or role-from-token exists',async()=>{
 const fs=await import('node:fs/promises');
 const path=await import('node:path');
 const root=path.resolve(import.meta.dirname,'../src/server/http');
 for(const f of ['protected-read.mjs','supabase-read-auth.mjs','production-read-adapter.ts']){
  const source=await fs.readFile(path.join(root,f),'utf8');
  assert.doesNotMatch(source,/process\.env\.SUPABASE_SERVICE_ROLE|\.user_metadata\.role/i);
 }
});
test('Next.js route entrypoints use only the trusted production gateway',async()=>{
 const fs=await import('node:fs/promises'); const path=await import('node:path');
 const root=path.resolve(import.meta.dirname,'../src/app/api/v1');
 for(const [route,scope] of [['student/me','student-me'],['student/enrollments','student-enrollments'],['teacher/students','teacher-students'],['teacher/batches','teacher-batches']]){
  const code=await fs.readFile(path.join(root,route,'route.ts'),'utf8');
  assert.match(code,/protectedReadRoute/);assert.ok(code.includes(`protectedReadRoute('${scope}')`));
  assert.doesNotMatch(code,/POST|PATCH|PUT|DELETE|service.role/);
 }
});
test('production profile role is loaded from same bearer under RLS, not signup metadata',async()=>{
 const fs=await import('node:fs/promises'); const path=await import('node:path');
 const code=await fs.readFile(path.resolve(import.meta.dirname,'../src/server/http/production-read-adapter.ts'),'utf8');
 assert.match(code,/verifySupabaseUser\(/);assert.match(code,/readSupabaseRows<unknown>\('profiles',accessToken/);
 assert.match(code,/role=Reflect\.get\(record,'role'\)/);
 assert.doesNotMatch(code,/user_metadata\s*\?|app_metadata\s*\?/);
});
