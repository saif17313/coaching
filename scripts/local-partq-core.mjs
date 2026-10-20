export const REQUIRED_TABLES = Object.freeze([
  'profiles','batches','enrollments','coaching_mutation_receipts','audit_logs',
  'academic_subjects','syllabus_units','routine_slots','academic_assignments','assignment_submissions',
  'exams','exam_results','monthly_dues','payments','payment_adjustments',
  'site_pages','site_page_sections','site_section_items','media_assets'
]);
export const REQUIRED_RPCS = Object.freeze([
  'coaching_change_student_status','coaching_decide_enrollment','coaching_create_batch',
  'coaching_update_batch','coaching_request_enrollment','coaching_create_subject',
  'coaching_cms_write','coaching_cms_settings_write','coaching_cms_get_published_page',
  'coaching_media_register','coaching_cms_media_mutation','coaching_media_resolve',
  'coaching_student_dashboard','coaching_student_billing_statement'
]);
const VALID_NAME = /^[a-z][a-z0-9_]*$/;
export function makeCatalogSql() {
  for (const name of [...REQUIRED_TABLES, ...REQUIRED_RPCS]) if (!VALID_NAME.test(name)) throw Error('Invalid catalog name');
  const tableNames = REQUIRED_TABLES.map(n=>`('${n}')`).join(',');
  const rpcNames = REQUIRED_RPCS.map(n=>`('${n}')`).join(',');
  return `BEGIN READ ONLY;
WITH required_tables(n) AS (VALUES ${tableNames}),
required_rpcs(n) AS (VALUES ${rpcNames}),
tables_json AS (
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',r.n,'exists',c.oid IS NOT NULL,'rls',coalesce(c.relrowsecurity,false)) ORDER BY r.n),'[]'::jsonb) AS val
 FROM required_tables r LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname='public'
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=ns.oid AND c.relname=r.n AND c.relkind IN ('r','p')
),rpc_json AS (
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',r.n,'exists',
 EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.proname=r.n)) ORDER BY r.n),'[]'::jsonb) AS val
 FROM required_rpcs r
),grants_json AS (
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',table_name,'grantee',grantee,'privilege',privilege_type) ORDER BY table_name,grantee,privilege_type),'[]'::jsonb) AS val
 FROM information_schema.role_table_grants WHERE table_schema='public'
 AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE')
 AND table_name IN ('profiles','batches','enrollments','coaching_mutation_receipts','media_assets')
),migration_json AS (
 SELECT coalesce(jsonb_agg(version::text ORDER BY version::text),'[]'::jsonb) AS val FROM supabase_migrations.schema_migrations
),teacher_json AS (
 SELECT jsonb_build_object('auth_users', count(u.id),
 'active_teacher_profiles',count(u.id) FILTER (WHERE p.role::text='teacher' AND p.account_status::text='active')) AS val
 FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE lower(u.email)='teacher1@example.com'
),storage_json AS (
 SELECT jsonb_build_object('exists',count(*)=1,'private',bool_and(public=false)) AS val
 FROM storage.buckets WHERE id='musa-site-media'
)
SELECT jsonb_build_object('tables',(SELECT val FROM tables_json),'rpcs',(SELECT val FROM rpc_json),
 'dangerous_grants',(SELECT val FROM grants_json),'migration_versions',(SELECT val FROM migration_json),
 'teacher',(SELECT val FROM teacher_json),'media_bucket',(SELECT val FROM storage_json))::text;
ROLLBACK;`;
}
export function assessCatalog(s, expectedVersions){
  if (!s || typeof s!=='object'|| !Array.isArray(s.tables)||!Array.isArray(s.rpcs)||!Array.isArray(s.dangerous_grants)||!Array.isArray(s.migration_versions)) throw Error('Untrusted local SQL response');
  const checks=[];const add=(name,pass,details)=>checks.push({name,pass:pass===true,details});
  for(const name of REQUIRED_TABLES){const rows=s.tables.filter(t=>t.name===name);add('Table '+name, rows.length===1&&rows[0].exists===true&&rows[0].rls===true,rows.length!==1?'Missing/duplicate catalog row':(!rows[0].exists?'Missing table':!rows[0].rls?'RLS disabled':'present + RLS'));}
  for(const name of REQUIRED_RPCS){const rows=s.rpcs.filter(t=>t.name===name);add('RPC '+name,rows.length===1&&rows[0].exists===true,rows.length!==1?'Missing/duplicate catalog row':rows[0].exists?'present':'missing');}
  const disallowed=s.dangerous_grants.filter(g=>['profiles','batches','enrollments','coaching_mutation_receipts','media_assets'].includes(g.table));
  add('No direct client DML on core protected tables',disallowed.length===0,disallowed.length?JSON.stringify(disallowed):'no direct DML grants');
  const versions = new Set(s.migration_versions.map(String));
  const missing=expectedVersions.filter(v=>!versions.has(v));
  add('All 27 repository migrations recorded as applied',expectedVersions.length===27&&missing.length===0,missing.length?'Missing: '+missing.join(', '):'27 matched');
  add('Local teacher1@example.com is active teacher',s.teacher?.auth_users===1&&s.teacher?.active_teacher_profiles===1,`Auth users: ${s.teacher?.auth_users??'?'}; active teacher profiles: ${s.teacher?.active_teacher_profiles??'?'}`);
  add('Private CMS media bucket',s.media_bucket?.exists===true&&s.media_bucket?.private===true,s.media_bucket?.exists?'bucket exists; private='+s.media_bucket.private:'bucket missing');
  return {checks,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length};
}
export function inspectStatusEnv(data){
  if(typeof data!=='string'||data.length>16000)throw Error('Unexpected local CLI output');
  const x={};for(const line of data.split(/\r?\n/)){
    const m=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());if(m)x[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
  }
  const api=x.API_URL;if(api!=='http://127.0.0.1:54321')throw Error('Local Supabase CLI URL is not exactly loopback 127.0.0.1:54321');
  const key=x.ANON_KEY||x.PUBLISHABLE_KEY;
  if(!key || key.length>4096||/[\r\n]/.test(key))throw Error('Missing or malformed local publishable key');
  return {api,key};
}

/** Supabase CLI is a .cmd wrapper on Windows. Node 24 cannot spawn .cmd directly. */
export function localCliCommand(platform) {
  if (platform === 'win32') return {bin:'cmd.exe',args:['/d','/s','/c','npx.cmd --no-install supabase status --output env']};
  if (platform === 'linux' || platform === 'darwin') return {bin:'npx',args:['--no-install','supabase','status','--output','env']};
  throw Error('Unsupported platform for local Supabase CLI');
}
