import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const container = 'supabase_db_coaching';
const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const q = value => { assert.match(value, isUUID); return `'${value}'::uuid`; };
const teacher = randomUUID();
const student = randomUUID();
const batch = randomUUID();
const enrollment = randomUUID();
const op = randomUUID();
const marker = `FH${randomBytes(6).toString('hex').toUpperCase()}`;
const batchCode = `${marker}B`;
const extraBatchCode = `${marker}C`;
let fixtureAttempted = false;
let success = false;
let cleaned = false;

async function psql(sql, timeout = 30000) {
  return exec('docker', ['exec', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off', '-A', '-t', '-c', sql], {
    timeout, windowsHide: true, maxBuffer: 1024 * 1024,
  });
}
async function query(sql, timeout) { return (await psql(sql, timeout)).stdout.trim(); }
async function request(sql) {
  const statement = `BEGIN; SET LOCAL ROLE authenticated; SELECT pg_catalog.set_config('request.jwt.claim.sub',${q(teacher)}::text,true); SELECT ${sql}; COMMIT;`;
  try { return { ok: true, output: (await psql(statement, 20000)).stdout.trim() }; }
  catch (e) {
    const match = String(e.stderr ?? '').match(/ERROR:\s*([^\r\n]+)/);
    return { ok: false, error: match?.[1] ?? 'UNEXPECTED_SQL_ERROR' };
  }
}
async function readiness() {
  assert.equal(await query('SELECT current_database();'), 'postgres');
  assert.equal(await query('SELECT count(*) FROM supabase_migrations.schema_migrations;'), '8', 'Expected exactly 8 applied local migrations');
  const grants = await query(`SELECT count(*) FROM (VALUES ('anon'::text),('authenticated'::text)) AS r(role)
    CROSS JOIN (VALUES ('profiles'::text),('enrollments'::text)) AS t(tbl)
    WHERE has_table_privilege(r.role, 'public.'||t.tbl, 'INSERT')
       OR has_table_privilege(r.role, 'public.'||t.tbl, 'UPDATE')
       OR has_table_privilege(r.role, 'public.'||t.tbl, 'DELETE');`);
  assert.equal(grants, '0', 'Unexpected direct client write privileges');
  const policies = await query(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;`);
  assert.equal(policies, '0', 'One or more public tables missing RLS');
  const functionText = await query(`SELECT pg_get_functiondef('public.coaching_decide_enrollment(uuid,text,uuid)'::regprocedure);`);
  assert.match(functionText, /role='student'::public\.app_role for update;/i, 'Student profile must be locked in approval');
  assert.match(functionText, /SECURITY DEFINER/i);
  const execute = await query(`SELECT has_function_privilege('anon','public.coaching_decide_enrollment(uuid,text,uuid)','EXECUTE')::text || ',' || has_function_privilege('authenticated','public.coaching_decide_enrollment(uuid,text,uuid)','EXECUTE')::text;`);
  assert.equal(execute, 'false,true', 'RPC grants changed');
  console.log('[PASS] Migration 008, least-privilege grants, RLS and student-row lock');
}
async function seed() {
  fixtureAttempted = true;
  await query(`BEGIN;
    INSERT INTO auth.users(id) VALUES (${q(teacher)}),(${q(student)});
    UPDATE public.profiles SET role='teacher'::public.app_role, account_status='active'::public.account_status WHERE id=${q(teacher)};
    UPDATE public.profiles SET account_status='active'::public.account_status WHERE id=${q(student)};
    INSERT INTO public.batches(id,code,name,capacity) VALUES (${q(batch)},'${batchCode}','DB Final QA',1);
    INSERT INTO public.enrollments(id,student_id,batch_id) VALUES (${q(enrollment)},${q(student)},${q(batch)});
    COMMIT;`);
  assert.equal(await query(`SELECT count(*) FROM public.enrollments WHERE id=${q(enrollment)} AND status='pending'::public.enrollment_status`), '1');
  console.log('[OK] Local-only temporary identity and enrollment fixtures created');
}
async function testRace() {
  // The disable transaction locks the target student row before sleeping.
  // We wait until the database reports it as an active sleeping transaction.
  const disableSql = `SET application_name='${marker}'; BEGIN; UPDATE public.profiles
    SET account_status='disabled'::public.account_status WHERE id=${q(student)};
    SELECT pg_sleep(3); COMMIT;`;
  const disabling = psql(disableSql, 14000);
  let holderReady = false;
  for (let attempts = 0; attempts < 24; attempts++) {
    const active = await query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${marker}'
      AND state='active' AND wait_event='PgSleep';`);
    if (active === '1') { holderReady = true; break; }
    await new Promise(resolve => setTimeout(resolve, 70));
  }
  if (!holderReady) {
    await disabling;
    throw new Error('Could not coordinate local row-lock race; scenario not tested');
  }
  const approving = request(`public.coaching_decide_enrollment(${q(enrollment)},'approve',${q(op)})`);
  const [disabled, approval] = await Promise.all([disabling, approving]);
  assert.ok(disabled.stdout.includes('COMMIT'), 'Disable transaction did not commit');
  assert.equal(approval.ok, false, `Approval incorrectly succeeded during concurrent disable: ${approval.output}`);
  assert.equal(approval.error, 'STUDENT_NOT_ACTIVE', `Expected STUDENT_NOT_ACTIVE, got ${approval.error}`);
  const data = await query(`SELECT p.account_status::text||':'||e.status::text FROM public.profiles p
    JOIN public.enrollments e ON e.student_id=p.id WHERE p.id=${q(student)} AND e.id=${q(enrollment)};`);
  assert.equal(data, 'disabled:pending', 'Inconsistent status after competing commits');
  console.log('[PASS] Student-disable transaction commits first; concurrent approval blocks then rejects stale status');
}
async function testTeacherRPC() {
  const result = await request(`public.coaching_create_batch('${extraBatchCode}','Post-hardening teacher RPC',2,${q(randomUUID())})`);
  assert.equal(result.ok, true, `Teacher RPC failed unexpectedly: ${result.error}`);
  assert.equal(await query(`SELECT count(*) FROM public.batches WHERE code='${extraBatchCode}';`), '1');
  console.log('[PASS] Authorized SECURITY DEFINER teacher mutations still work after direct write revocation');
}
async function cleanup() {
  if (!fixtureAttempted) return;
  await query(`BEGIN;
    DELETE FROM public.coaching_mutation_receipts WHERE actor_id=${q(teacher)};
    DELETE FROM public.audit_logs WHERE actor_id=${q(teacher)};
    DELETE FROM public.enrollments WHERE id=${q(enrollment)};
    DELETE FROM public.batches WHERE code IN ('${batchCode}','${extraBatchCode}');
    DELETE FROM auth.users WHERE id IN (${q(teacher)},${q(student)});
    COMMIT;`);
  const remaining = await query(`SELECT
    (SELECT count(*) FROM auth.users WHERE id IN (${q(teacher)},${q(student)}))+
    (SELECT count(*) FROM public.batches WHERE code IN ('${batchCode}','${extraBatchCode}'))+
    (SELECT count(*) FROM public.enrollments WHERE id=${q(enrollment)});`);
  assert.equal(remaining, '0', 'Some local test records remain');
  cleaned = true;
  console.log('[OK] Local temporary rows verified deleted');
}
async function main() {
  if (process.env.COACHING_FINAL_DB_LOCAL_ONLY !== container) throw new Error('Local-only runner guard missing');
  if (process.env.DOCKER_HOST && !/^(npipe:\/\/|unix:\/\/)/i.test(process.env.DOCKER_HOST)) throw new Error('Remote Docker host refused');
  try {
    await readiness();
    await seed();
    await testRace();
    await testTeacherRPC();
    success = true;
  } catch (error) {
    console.error('[FAIL]', error instanceof Error ? error.message : 'Unknown local QA error');
  } finally {
    try { await cleanup(); }
    catch (error) {
      console.error('[CLEANUP WARNING] Local fixture marker:', marker);
      console.error('[CLEANUP WARNING]', error instanceof Error ? error.message : 'Unknown cleanup error');
      success = false;
    }
  }
  if (!success || (fixtureAttempted && !cleaned)) process.exitCode = 1;
  else console.log('[OK] FINAL LOCAL DATABASE SECURITY + CONCURRENCY QA PASSED');
}
await main();
