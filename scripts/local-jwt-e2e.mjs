/**
 * Local-only signed JWT Next.js <-> GoTrue <-> PostgREST integration harness.
 * NEVER accepts remote endpoints. Temporary Auth users / SQL rows are removed in finally.
 * Requires RUN_LOCAL_JWT_E2E.ps1 to supply LOCAL credentials in the process environment.
 */
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';

const local='http://127.0.0.1:54321';
const app='http://127.0.0.1:3107';
const key=process.env.COACHING_E2E_PUBLISHABLE_KEY;
const admin=process.env.COACHING_E2E_SERVICE_ROLE_KEY;
const container=process.env.COACHING_E2E_DB_CONTAINER;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function safeId(v){ assert.match(v,uuid);return v; }
function eq(v,w,reason){assert.equal(v,w,reason);}
function out(message){console.log(message);}

async function requirePortFree(){
  await new Promise((resolveDone,reject)=>{
    const s=net.connect({host:'127.0.0.1',port:3107});
    s.setTimeout(1300);
    s.once('connect',()=>{s.destroy();reject(new Error('E2E port 3107 is already occupied; nothing was started.'));});
    s.once('error',(e)=>{s.destroy();if(e.code==='ECONNREFUSED')resolveDone();else reject(e);});
    s.once('timeout',()=>{s.destroy();reject(new Error('Cannot preflight local E2E port.'));});
  });
}

function psql(sql){
  assert.equal(container,'supabase_db_coaching');
  // Only constant, exact Docker container and connection. SQL assembled from locally generated validated UUIDs.
  return execFileSync('docker',['exec',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-A','-t','-c',sql],
    {cwd:process.cwd(),encoding:'utf8',timeout:10000,windowsHide:true}).trim();
}
async function send(url,{method='GET',bearer,apiKey=key,body}={}){
  if(!url.startsWith(local+'/')&&!url.startsWith(app+'/'))throw new Error('Remote URLs are forbidden');
  const headers={'apikey':apiKey,'accept':'application/json'};
  if(bearer) headers.authorization=`Bearer ${bearer}`;
  if(body!==undefined)headers['content-type']='application/json';
  const r=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store'});
  const data=await r.json().catch(()=>null);
  return {status:r.status,data};
}
async function createUser(label,created){
  const email=`musa-jwt-${label}-${randomUUID().replaceAll('-','')}@example.invalid`;
  const password=`Aa!9_${randomUUID()}_Qa`;
  const r=await send(local+'/auth/v1/admin/users',{method:'POST',apiKey:admin,bearer:admin,body:{email,password,email_confirm:true}});
  if(r.status!==200&&r.status!==201)throw new Error(`Local admin user creation failed: HTTP ${r.status}`);
  const id=safeId(r.data?.id);
  created.push(id);
  return {id,email,password,label};
}
async function authToken(user){
  const r=await send(local+'/auth/v1/token?grant_type=password',{method:'POST',body:{email:user.email,password:user.password}});
  eq(r.status,200,`Local signed-in Auth token request failed for ${user.label} (HTTP ${r.status})`);
  assert.match(r.data?.access_token,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const self=await send(local+'/auth/v1/user',{bearer:r.data.access_token});
  eq(self.status,200,`Supabase Auth /user failed for ${user.label}`);
  eq(self.data.id,user.id,`Supabase signed token identity mismatch for ${user.label}`);
  return r.data.access_token;
}
function setProfile(user,role,status){
  safeId(user.id);
  const result=psql(`UPDATE public.profiles SET role='${role}'::public.app_role,account_status='${status}'::public.account_status WHERE id='${user.id}'::uuid`);
  eq(result,'UPDATE 1',`Local profile configuration failed (${user.label})`);
}
async function waitForNext(child){
  for(let i=0;i<90;i++){
    if(child.exitCode!==null)throw new Error('Next.js E2E server stopped before becoming healthy.');
    try{
      const r=await fetch(app+'/api/v1/health',{signal:AbortSignal.timeout(1200)});
      if(r.status===200)return;
    }catch{}
    await wait(1000);
  }
  throw new Error('Next.js E2E server readiness timed out (90s).');
}
async function stopNext(child){
  if(!child||!child.pid)return;
  if(process.platform==='win32'){
    try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',timeout:10000,windowsHide:true});}catch{}
  }else{
    try{child.kill('SIGTERM');}catch{}
  }
}
async function cleanupUsers(ids){
  let failed=false;
  for(const id of ids.reverse()){
    try{
      const r=await send(local+`/auth/v1/admin/users/${safeId(id)}`,{method:'DELETE',apiKey:admin,bearer:admin});
      if(![200,204,404].includes(r.status)){ failed=true; console.error(`[CLEANUP WARNING] Local Auth user delete HTTP ${r.status}`); }
    }catch{failed=true;console.error('[CLEANUP WARNING] Local Auth cleanup request failed.');}
  }
  return !failed;
}
async function main(){
  if(!key||!admin||container!=='supabase_db_coaching'||process.env.COACHING_E2E_API_URL!==local)
    throw new Error('Local-only test prerequisites missing; use RUN_LOCAL_JWT_E2E.ps1.');
  if(!existsSync(resolve('node_modules/next/dist/bin/next')))throw new Error('Install project dependencies before E2E.');
  await requirePortFree();
  const created=[];
  let server=null, batchCode=null;
  let failed=false;
  try{
    const readiness=await send(local+'/auth/v1/health');
    eq(readiness.status,200,'Local Supabase Auth health not ready.');
    const ids={};
    for(const label of ['student','other-student','teacher','pending-teacher','disabled-teacher']){
      ids[label]=await createUser(label,created);
    }
    setProfile(ids.student,'student','active');
    setProfile(ids['other-student'],'student','active');
    setProfile(ids.teacher,'teacher','active');
    setProfile(ids['pending-teacher'],'teacher','pending');
    setProfile(ids['disabled-teacher'],'teacher','disabled');
    const access={};
    for(const [label,user] of Object.entries(ids)) access[label]=await authToken(user);
    out('[PASS] Five real local Supabase Auth sessions and DB profile states');

    const env={...process.env,NODE_ENV:'development',SUPABASE_URL:local,SUPABASE_ANON_KEY:key,
      COACHING_LOCAL_SUPABASE_TESTING:'allow-loopback-54321',
      COACHING_ENABLE_MUTATION_APIS:'enabled-after-db-verification'};
    const next=resolve('node_modules/next/dist/bin/next');
    server=spawn(process.execPath,[next,'dev','--hostname','127.0.0.1','-p','3107'],{cwd:process.cwd(),env,stdio:'ignore',windowsHide:true});
    await waitForNext(server);
    out('[PASS] Isolated Next.js development server on 127.0.0.1:3107');
    const request=(endpoint,token,method='GET',body,headers={})=>{
      const full=app+endpoint;
      if(!full.startsWith(app+'/'))throw new Error('Invalid app path');
      return fetch(full,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)})
        .then(async r=>({status:r.status,data:await r.json().catch(()=>null)}));
    };
    let r=await request('/api/v1/student/me',access.student);
    eq(r.status,200,`Student own-profile HTTP ${r.status}`);
    eq(r.data.data.id,ids.student.id,'Student profile identity mismatch');
    r=await request('/api/v1/teacher/students',access.student);
    eq(r.status,403,'Student incorrectly accessed teacher endpoint');
    r=await request('/api/v1/student/me',access.teacher);
    eq(r.status,403,'Teacher incorrectly accessed student endpoint');
    r=await request('/api/v1/teacher/students',access.teacher);
    eq(r.status,200,`Teacher list HTTP ${r.status}`);
    assert.ok(Array.isArray(r.data.data));
    out('[PASS] Signed JWT student self-read, role isolation and teacher read');

    for(const label of ['pending-teacher','disabled-teacher']){
      r=await request('/api/v1/teacher/students',access[label]);
      eq(r.status,403,`${label} bypassed active-status gate`);
    }
    r=await request('/api/v1/student/me');
    eq(r.status,401,'Missing token not blocked');
    r=await request('/api/v1/student/me','abc.def.ghi');
    eq(r.status,401,'Forged token not blocked');
    out('[PASS] Pending/disabled accounts and missing/forged tokens denied');

    // Signed student must not write through PostgREST directly.
    r=await send(local+'/rest/v1/batches',{method:'POST',bearer:access.student,body:{code:'JWT_DENIED',name:'Must Deny',capacity:1}});
    assert.ok([401,403].includes(r.status),`Direct student batch insert unexpectedly returned ${r.status}`);
    out('[PASS] Student PostgREST direct mutation rejected by privileges/RLS');

    batchCode='JWT'+randomBytes(7).toString('hex').toUpperCase();
    const operation=randomUUID();
    const body={code:batchCode,name:'JWT QA Temporary Batch',capacity:2};
    const hdr={'Idempotency-Key':operation};
    const responses=await Promise.all([request('/api/v1/teacher/batch-commands',access.teacher,'POST',body,hdr),request('/api/v1/teacher/batch-commands',access.teacher,'POST',body,hdr)]);
    for(const item of responses){
      eq(item.status,201,`Concurrent idempotent create HTTP ${item.status}`);
      eq(item.data.data.code,batchCode,'Unexpected batch code');
    }
    eq(responses[0].data.data.id,responses[1].data.data.id,'Duplicate idempotency key yielded distinct batches');
    const count=psql(`SELECT count(*) FROM public.batches WHERE code='${batchCode}'`);
    eq(count,'1','Parallel duplicate request produced multiple rows');
    r=await request('/api/v1/teacher/batch-commands',access.teacher,'POST',{...body,capacity:3},hdr);
    eq(r.status,503,'Conflicting operation payload was not rejected');
    r=await request('/api/v1/teacher/batches',access.teacher);
    eq(r.status,200,'Teacher batch listing failed');
    assert.ok(r.data.data.some(x=>x.code===batchCode),'Created batch not readable');
    out('[PASS] Real RPC batch creation, parallel idempotency, conflict rejection and readback');
  }catch(e){
    failed=true;
    console.error('[FAIL]',e instanceof Error?e.message:'Unexpected integration failure');
  }finally{
    await stopNext(server);
    // Clean ALL test-generated public rows first, then Auth users. Never broad deletion.
    if(created.length||batchCode){
      try{
        const actorIds=created.map(id=>`'${safeId(id)}'::uuid`).join(',');
        const generated=created.length?`(${actorIds})`:null;
        const code=batchCode?`'${batchCode}'`:null;
        const stmts=['BEGIN'];
        if(generated){
          stmts.push(`DELETE FROM public.coaching_mutation_receipts WHERE actor_id IN ${generated}`);
          stmts.push(`DELETE FROM public.audit_logs WHERE actor_id IN ${generated}`);
          stmts.push(`DELETE FROM public.enrollments WHERE student_id IN ${generated}`);
        }
        if(code){
          stmts.push(`DELETE FROM public.enrollments WHERE batch_id IN (SELECT id FROM public.batches WHERE code=${code})`);
          stmts.push(`DELETE FROM public.batches WHERE code=${code}`);
        }
        stmts.push('COMMIT');
        psql(stmts.join('; ')+';');
      }catch{failed=true;console.error('[CLEANUP WARNING] Local SQL cleanup failed; inspect local QA records manually.');}
    }
    if(!(await cleanupUsers(created))){failed=true;}
    if(!failed)out('[OK] Local signed-JWT integration PASS; test users and data cleaned up.');
    else process.exitCode=1;
  }
}
await main();
