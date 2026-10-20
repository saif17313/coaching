import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const EMAIL = 'teacher1@example.com';
const NAME = 'Musa Sir Local Teacher 1';
const LOCAL = 'http://127.0.0.1:54321';
const CONTAINER = 'supabase_db_coaching';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function promotionSQL(id) {
  if (!UUID.test(id)) throw new Error('Invalid returned Auth user UUID; refusing SQL.');
  return `BEGIN;
DO $musa$
DECLARE affected integer;
BEGIN
  UPDATE public.profiles
     SET role='teacher'::public.app_role,
         account_status='active'::public.account_status,
         full_name='${NAME}',
         updated_at=now()
   WHERE id='${id}'::uuid
     AND role='student'::public.app_role
     AND account_status='pending'::public.account_status;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected exactly one new pending profile'; END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity_id, details)
  VALUES ('${id}'::uuid, 'LOCAL_TEACHER1_BOOTSTRAP', '${id}'::uuid,
          jsonb_build_object('purpose','local development','source','CREATE_MUSA_TEACHER1_LOCAL'));
END;
$musa$;
COMMIT;`;
}

export async function createLocalTeacher({db, adminCreate, adminDelete, passwordLogin, authMe, password}) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('Password must be 8–128 characters. Nothing created.');
  }
  const ready = db(`SELECT CASE WHEN to_regclass('auth.users') IS NOT NULL
       AND to_regclass('public.profiles') IS NOT NULL
       AND to_regclass('public.audit_logs') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='profiles' AND column_name='account_status')
       AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='auth_user_student_profile' AND NOT tgisinternal)
     THEN 'READY' ELSE 'NOT_READY' END;`);
  if (ready !== 'READY') throw new Error('Expected local Auth/profile/audit/trigger schema absent. Nothing created.');
  const count = db(`SELECT count(*) FROM auth.users WHERE email='${EMAIL}';`);
  if (count !== '0') throw new Error(`Local ${EMAIL} already exists; no overwrite/password reset was attempted.`);

  let id = null;
  let committed = false;
  try {
    const created = await adminCreate({email: EMAIL, password, email_confirm: true, user_metadata: {display_name: NAME}});
    if (![200,201].includes(created.status) || !UUID.test(created.data?.id ?? '')) {
      throw new Error(`Local Auth admin creation failed (HTTP ${created.status}).`);
    }
    id = created.data.id;
    db(promotionSQL(id));
    committed = true;
    const profile = db(`SELECT role::text || ':' || account_status::text FROM public.profiles WHERE id='${id}'::uuid;`);
    if (profile !== 'teacher:active') throw new Error('Profile verification failed AFTER promotion; inspect account before retry.');
    const session = await passwordLogin({email: EMAIL, password});
    if (session.status !== 200 || !JWT.test(session.data?.access_token ?? '')) {
      throw new Error(`Local password login verification failed (HTTP ${session.status}); inspect existing user.`);
    }
    const me = await authMe(session.data.access_token);
    if (me.status !== 200 || me.data?.id !== id) throw new Error('Local Auth identity mismatch after login.');
    return {email: EMAIL, id, role: 'teacher', status: 'active'};
  } catch (error) {
    if (id && !committed) {
      try {
        const cleanup = await adminDelete(id);
        const removed = [200,204,404].includes(cleanup.status);
        console.error(removed ? '[ROLLBACK] Newly created Auth user deleted after SQL failure.' : '[WARNING] Auth cleanup could not be confirmed; inspect local DB before any retry.');
      } catch { console.error('[WARNING] Auth cleanup failed; inspect before retrying.'); }
    } else if (committed) {
      console.error('[PARTIAL] Auth user and teacher:active DB promotion already committed. Do NOT rerun blindly.');
    }
    throw error;
  }
}

function localDb(sql) {
  return execFileSync('docker', ['exec', CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', sql], {
    encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function localApi(endpoint, key, body, token = key, method = 'POST') {
  const response = await fetch(`${LOCAL}${endpoint}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  return {status: response.status, data: await response.json().catch(() => null)};
}

async function main() {
  const {MUSA_LOCAL_API_URL: apiUrl, MUSA_LOCAL_ADMIN_KEY: admin, MUSA_LOCAL_ANON_KEY: anon, MUSA_LOCAL_TEACHER_PASSWORD: password} = process.env;
  if (apiUrl !== LOCAL || !JWT.test(admin ?? '') || typeof anon !== 'string' || !anon || anon.length > 4096 || !password) {
    throw new Error('Missing guarded LOCAL credentials; no DB action.');
  }
  // A second, independent read-only local Docker check, before Auth creation.
  if (localDb('SELECT current_database();') !== 'postgres') throw new Error('Unexpected DB, no changes made.');
  const health = await fetch(`${LOCAL}/auth/v1/health`, {redirect: 'error', signal: AbortSignal.timeout(8000)});
  if (!health.ok) throw new Error('Local Auth health failed; no changes made.');
  const teacher = await createLocalTeacher({
    db: localDb,
    password,
    adminCreate: (body) => localApi('/auth/v1/admin/users', admin, body),
    adminDelete: (id) => localApi(`/auth/v1/admin/users/${id}`, admin, undefined, admin, 'DELETE'),
    passwordLogin: (body) => localApi('/auth/v1/token?grant_type=password', anon, body),
    authMe: (access) => localApi('/auth/v1/user', anon, undefined, access, 'GET'),
  });
  console.log('[PASS] Local Supabase Auth account created; password sign-in verified.');
  console.log('[PASS] Local PostgreSQL profile teacher:active; audited promotion.');
  console.log(`USER_ID: ${teacher.id}`);
  console.log(`EMAIL: ${teacher.email}`);
  console.log('PASSWORD: (the password you entered at the prompt; not printed or saved)');
  console.log('NEXT: Open http://127.0.0.1:3000/portal and sign in.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // User and password must not be included in exception/log output.
    console.error(`[STOP] ${error instanceof Error ? error.message : 'Unknown local setup failure.'}`);
    process.exitCode = 1;
  });
}
