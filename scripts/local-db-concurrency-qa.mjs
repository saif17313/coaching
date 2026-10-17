/**
 * Musa Sir local DB concurrency smoke QA.
 * Only Docker container `supabase_db_coaching`, no network, no project env/secrets.
 * Temporary rows are tagged with fresh IDs and cleaned in finally.
 * This tests REAL PostgreSQL transactions with authenticated role / simulated JWT sub,
 * not signed JWT verification (separately verified by the JWT E2E suite).
 */
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const container = 'supabase_db_coaching';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = () => randomUUID();
const uuid = v => {assert.match(v,uuidPattern); return v;};
const q = value => `'${uuid(value)}'::uuid`;
const sqlText = v => {assert.match(v,/^[A-Z0-9_-]{2,24}$/); return `'${v}'`;};
const marker = 'CQ'+randomBytes(6).toString('hex').toUpperCase();
const code = suffix => sqlText(marker+suffix);
const teacher = id(), teacher2=id();
const teachers=[teacher,teacher2];
const students = Array.from({length:8},id);
const batchA = id(), batchB=id();
const enrollmentA = Array.from({length:5},id);
const enrollmentBactive = id(), enrollmentBpending=id();
const newCodes = [marker+'D1',marker+'D2'];
let hadError=false, cleaned=false;
const say = message => console.log(message);

async function psql(sql,{timeout=30000}={}){
  // execFile passes each argument without a shell; no cloud URL or credentials.
  const args=['exec',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-P','pager=off','-A','-t','-c',sql];
  return exec('docker',args,{timeout,maxBuffer:1024*1024,windowsHide:true});
}
async function query(sql){return (await psql(sql)).stdout.trim();}
async function request(functionCall,actor=teacher){
  // Role and request.jwt.claim.sub emulate authenticated PostgREST database context.
  // Each exec starts an independent PostgreSQL session/transaction.
  const sql=`BEGIN; SET LOCAL ROLE authenticated; SELECT pg_catalog.set_config('request.jwt.claim.sub','${uuid(actor)}',true); SELECT ${functionCall}; COMMIT;`;
  try{
    const result=await psql(sql,{timeout:60000});
    return {ok:true,output:result.stdout.trim()};
  }catch(e){
    const stderr=String(e.stderr||'');
    const msg=stderr.match(/ERROR:\s*([^\r\n]+)/)?.[1]||'UNEXPECTED_SQL_ERROR';
    return {ok:false,error:msg};
  }
}
function checkResponses(results, expectedOk, expectedError){
  const succeeded=results.filter(r=>r.ok);
  const rejected=results.filter(r=>!r.ok);
  assert.equal(succeeded.length,expectedOk,`Expected ${expectedOk} successful concurrent transactions; got ${succeeded.length}; errors: ${rejected.map(r=>r.error).join('; ')}`);
  for(const r of rejected)assert.equal(r.error,expectedError,`Unexpected SQL error: ${r.error}`);
}
async function seed(){
  const ids=[...teachers,...students];
  for(const value of ids)uuid(value);
  const userValues=ids.map(v=>`(${q(v)})`).join(',');
  const aRows=enrollmentA.map((e,i)=>`(${q(e)},${q(students[i])},${q(batchA)})`).join(',');
  const sql=`
BEGIN;
INSERT INTO auth.users(id) VALUES ${userValues};
UPDATE public.profiles SET role='teacher'::public.app_role,account_status='active'::public.account_status WHERE id IN (${teachers.map(q).join(',')});
UPDATE public.profiles SET account_status='active'::public.account_status WHERE id IN (${students.slice(0,7).map(q).join(',')});
INSERT INTO public.batches (id,code,name,capacity) VALUES
 (${q(batchA)},${code('A')},'Concurrency QA approvals',2),
 (${q(batchB)},${code('B')},'Concurrency QA capacity',2);
INSERT INTO public.enrollments(id,student_id,batch_id) VALUES ${aRows};
INSERT INTO public.enrollments(id,student_id,batch_id,status,decided_at) VALUES
 (${q(enrollmentBactive)},${q(students[5])},${q(batchB)},'active'::public.enrollment_status,now());
INSERT INTO public.enrollments(id,student_id,batch_id) VALUES (${q(enrollmentBpending)},${q(students[6])},${q(batchB)});
COMMIT;`;
  const result=await query(sql);
  assert.ok(result.endsWith('COMMIT'),'Fixture setup not committed');
  const verified=await query(`SELECT count(*) FROM public.profiles WHERE id IN (${[...teachers,...students].map(q).join(',')});`);
  assert.equal(verified,'10','Fixture profile count mismatch');
  say('[OK] Local-only QA fixtures prepared (two teachers, eight students, two batches)');
}
async function one(){
  const responses=await Promise.all(enrollmentA.map((e,i)=>request(`public.coaching_decide_enrollment(${q(e)},'approve',${q(id())})`,teachers[i%2])));
  checkResponses(responses,2,'BATCH_FULL');
  const active=await query(`SELECT count(*) FROM public.enrollments WHERE batch_id=${q(batchA)} AND status='active'::public.enrollment_status`);
  assert.equal(active,'2','Concurrent approvals overfilled batch');
  say('[PASS] 5 concurrent approvals for capacity 2: exactly 2 active, 3 BATCH_FULL');
}
async function two(){
  const [approval,shrink]=await Promise.all([
    request(`public.coaching_decide_enrollment(${q(enrollmentBpending)},'approve',${q(id())})`),
    request(`public.coaching_update_batch(${q(batchB)},NULL,1,NULL,${q(id())})`,teacher2)
  ]);
  assert.equal(Number(approval.ok)+Number(shrink.ok),1,`Expected exactly one winning transaction: approval=${JSON.stringify(approval)} shrink=${JSON.stringify(shrink)}`);
  if(!approval.ok)assert.equal(approval.error,'BATCH_FULL');
  if(!shrink.ok)assert.equal(shrink.error,'CAPACITY_BELOW_ACTIVE');
  const state=await query(`SELECT capacity::text||':'||(SELECT count(*) FROM public.enrollments e WHERE e.batch_id=b.id AND e.status='active'::public.enrollment_status)::text FROM public.batches b WHERE id=${q(batchB)}`);
  assert.ok(state==='1:1'||state==='2:2',`Inconsistent capacity/active count: ${state}`);
  say(`[PASS] Concurrent approval vs capacity shrink: valid serialized result (${state})`);
}
async function three(){
  const target=students[7]; // pending default from auth.users trigger
  const [activate,reject]=await Promise.all([
    request(`public.coaching_change_student_status(${q(target)},'active',${q(id())})`),
    request(`public.coaching_change_student_status(${q(target)},'rejected',${q(id())})`,teacher2)
  ]);
  const results=[activate,reject];
  checkResponses(results,1,'INVALID_STATUS_TRANSITION');
  const final=await query(`SELECT account_status::text FROM public.profiles WHERE id=${q(target)}`);
  assert.ok(final==='active'||final==='rejected',`Unexpected student state: ${final}`);
  say(`[PASS] Concurrent conflicting student transitions: exactly one committed (${final})`);
}
async function four(){
  const sharedOp=id();
  const create1=request(`public.coaching_create_batch(${code('D1')},'Conflict batch A',2,${q(sharedOp)})`);
  const create2=request(`public.coaching_create_batch(${code('D2')},'Conflict batch B',2,${q(sharedOp)})`);
  const responses=await Promise.all([create1,create2]);
  checkResponses(responses,1,'IDEMPOTENCY_CONFLICT');
  const count=await query(`SELECT count(*) FROM public.batches WHERE code IN (${newCodes.map(sqlText).join(',')});`);
  assert.equal(count,'1','Idempotency key collision produced multiple batches');
  say('[PASS] Concurrent conflicting idempotency payloads: exactly one batch created');
}
async function cleanup(){
  // Deletes ONLY fresh randomized rows belonging to this invocation.
  const ids=[...teachers,...students].map(q).join(',');
  const sql=`BEGIN;
DELETE FROM public.coaching_mutation_receipts WHERE actor_id IN (${teachers.map(q).join(',')});
DELETE FROM public.audit_logs WHERE actor_id IN (${teachers.map(q).join(',')});
DELETE FROM public.enrollments WHERE student_id IN (${students.map(q).join(',')});
DELETE FROM public.batches WHERE code IN (${[marker+'A',marker+'B',...newCodes].map(sqlText).join(',')});
DELETE FROM auth.users WHERE id IN (${ids});
COMMIT;`;
  await query(sql);
  const remaining=await query(`SELECT (SELECT count(*) FROM auth.users WHERE id IN (${ids}))+(SELECT count(*) FROM public.batches WHERE code IN (${[marker+'A',marker+'B',...newCodes].map(sqlText).join(',')}));`);
  assert.equal(remaining,'0','Temporary users or batches remain after cleanup');
  cleaned=true;
}
async function main(){
  if(process.env.COACHING_DB_CONCURRENCY_LOCAL_ONLY!=='supabase_db_coaching')throw new Error('Local Docker guard missing. Use RUN_LOCAL_DB_CONCURRENCY_QA.ps1.');
  if(process.env.DOCKER_HOST && !/^(npipe:\/\/|unix:\/\/)/i.test(process.env.DOCKER_HOST))throw new Error('Remote DOCKER_HOST forbidden.');
  const alive=await query('SELECT current_database();');
  assert.equal(alive,'postgres');
  const history=await query('SELECT count(*) FROM supabase_migrations.schema_migrations;');
  assert.equal(history,'7','Expected exactly seven migrations in local Supabase');
  say('===== MUSA SIR CONCURRENT TRANSACTION QA =====');
  say('Local Docker PostgreSQL only; no cloud or project credential access.');
  try{
    await seed();
    await one();
    await two();
    await three();
    await four();
  }catch(e){
    hadError=true;
    console.error('[FAIL]',e instanceof Error?e.message:'Unknown concurrency QA error');
  }finally{
    // `seed` uses one atomic transaction; cleanup is safe to run even after partial test failures.
    try{
      await cleanup();
      say('[OK] All temporary local QA users/batches/rows deleted.');
    }catch(e){
      hadError=true;
      console.error('[CLEANUP WARNING] Could not fully clean local QA fixtures.');
      console.error('[CLEANUP WARNING] Marker:',marker);
      console.error('[CLEANUP WARNING]',e instanceof Error?e.message:'Unknown cleanup failure');
    }
  }
  if(hadError||!cleaned){process.exitCode=1;return;}
  say('[OK] Local concurrent transaction QA PASS (four scenarios).');
}
await main();
