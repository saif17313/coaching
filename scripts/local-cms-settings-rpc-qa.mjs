/** Must be invoked by guarded LOCAL-ONLY Part J installer. */
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
if(process.env.MUSA_CMS_J_LOCAL_QA!=='supabase_db_coaching')throw Error('Explicit local Docker QA opt-in missing');
if(process.env.DOCKER_HOST&&!/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('Remote Docker target denied');
const teacher=randomUUID(),student=randomUUID(),page=randomUUID(),slug='settings-'+randomUUID().replaceAll('-','').slice(0,12);
const operations=Array.from({length:7},randomUUID);
const content={siteTitle:'Musa Sir Coaching',tagline:'Study with confidence',contactEmail:'support@example.org',contactPhone:null,footerText:'Musa Sir Coaching Footer',logoMediaId:null};
const sql=`BEGIN;
insert into auth.users(id) values ('${teacher}'::uuid),('${student}'::uuid);
update public.profiles set role='teacher'::public.app_role,account_status='active'::public.account_status where id='${teacher}'::uuid;
update public.profiles set role='student'::public.app_role,account_status='active'::public.account_status where id='${student}'::uuid;
SET LOCAL ROLE authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','${teacher}',true);
DO $teacher$
declare d jsonb; s jsonb; p jsonb; v jsonb; r jsonb; n jsonb;rev bigint;
begin
 d:=public.coaching_cms_get_settings_draft();
 rev:=(d->>'revision')::bigint;
 if rev<0 or (d->'settings'->>'logoMediaId') is not null then raise exception 'INITIAL_SETTINGS_INVALID';end if;
 s:=public.coaching_cms_settings_write('draft.update',rev,'${JSON.stringify(content)}'::jsonb,'${operations[0]}'::uuid);
 if (s->>'revision')::bigint<>rev+1 then raise exception 'SETTINGS_DRAFT_REVISION_FAILED';end if;
 if public.coaching_cms_settings_write('draft.update',rev,'${JSON.stringify(content)}'::jsonb,'${operations[0]}'::uuid)<>s then raise exception 'SETTINGS_REPLAY_FAILED';end if;
 d:=public.coaching_cms_get_settings_draft();
 if d->'settings'->>'contactEmail'<>'support@example.org' then raise exception 'SETTINGS_PRIVATE_READ_INVALID';end if;
 s:=public.coaching_cms_settings_write('publish',rev+1,null,'${operations[1]}'::uuid);
 if (s->>'publishedRevision')::bigint<>rev+1 then raise exception 'SETTINGS_PUBLISH_FAILED';end if;
 if public.coaching_cms_settings_write('publish',rev+1,null,'${operations[1]}'::uuid)<>s then raise exception 'SETTINGS_PUBLISH_REPLAY_FAILED';end if;
 if public.coaching_cms_get_published_settings()->'settings'->>'contactEmail'<>'support@example.org' then raise exception 'PUBLIC_SETTINGS_INVALID';end if;
 begin
  perform public.coaching_cms_settings_write('draft.update',rev+1,'${JSON.stringify({...content,logoMediaId:randomUUID()})}'::jsonb,'${operations[5]}'::uuid);
  raise exception 'EXPECTED_MEDIA_REJECTION';
 exception when others then if sqlerrm<>'INVALID_CMS_SETTINGS' then raise;end if;end;
 p:=public.coaching_cms_write('page.create','${page}'::uuid,null,null,
  pg_catalog.jsonb_build_object('slug','${slug}','title','Published Course Page','seoTitle','Courses Overview','seoDescription','Available classes'),
  '${operations[2]}'::uuid);
 if p->>'revision'<>'1' then raise exception 'CMS_PAGE_CREATE_FAILED';end if;
 r:=public.coaching_cms_write('page.publish','${page}'::uuid,null,1,'{}'::jsonb,'${operations[3]}'::uuid);
 n:=public.coaching_cms_public_navigation();
 if (select count(*) from pg_catalog.jsonb_array_elements(n->'items') x where x.value->>'slug'='${slug}')<>1 then raise exception 'PUBLIC_NAVIGATION_MISSING';end if;
 r:=public.coaching_cms_archive_page('${page}'::uuid,1,'${operations[4]}'::uuid);
 if r->>'status'<>'archived' then raise exception 'ARCHIVE_FAILED';end if;
 if public.coaching_cms_archive_page('${page}'::uuid,1,'${operations[4]}'::uuid)<>r then raise exception 'ARCHIVE_REPLAY_FAILED';end if;
 if public.coaching_cms_get_published_page('${slug}') is not null then raise exception 'ARCHIVED_PAGE_PUBLIC';end if;
 n:=public.coaching_cms_public_navigation();
 if (select count(*) from pg_catalog.jsonb_array_elements(n->'items') x where x.value->>'slug'='${slug}')<>0 then raise exception 'ARCHIVED_NAVIGATION_LEAK';end if;
end;
$teacher$;
select pg_catalog.set_config('request.jwt.claim.sub','${student}',true);
DO $student$
begin
 begin perform public.coaching_cms_get_settings_draft();raise exception 'EXPECTED_DENIAL';
 exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin perform public.coaching_cms_settings_write('publish',1,null,'${operations[6]}'::uuid);raise exception 'EXPECTED_DENIAL';
 exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
end;
$student$;
SET LOCAL ROLE anon;
select pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $anonymous$
declare s jsonb; n jsonb;
begin
 s:=public.coaching_cms_get_published_settings();
 if s->'settings'->>'siteTitle'<>'Musa Sir Coaching' or (s->'settings'->>'logoMediaId') is not null then raise exception 'PUBLIC_SETTINGS_UNSAFE';end if;
 n:=public.coaching_cms_public_navigation();
 if pg_catalog.jsonb_typeof(n->'items')<>'array' then raise exception 'NAVIGATION_INVALID';end if;
 if pg_catalog.has_table_privilege('anon','public.app_settings','SELECT') or
    pg_catalog.has_table_privilege('authenticated','public.app_settings','UPDATE') or
    pg_catalog.has_table_privilege('anon','public.site_pages','SELECT') then raise exception 'DIRECT_TABLE_GRANT_LEAK';end if;
end;
$anonymous$;
RESET ROLE;
DO $audit$
begin
 if (select count(*) from public.audit_logs where actor_id='${teacher}'::uuid and action like 'cms.%')<>5 then raise exception 'AUDIT_MISSING';end if;
 if (select count(*) from public.coaching_mutation_receipts where actor_id='${teacher}'::uuid and operation_type like 'cms.%')<>5 then raise exception 'RECEIPT_MISSING';end if;
end;
$audit$;
ROLLBACK;`;
const r=spawnSync('docker',['exec','-i','supabase_db_coaching','psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],{input:sql,encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:2*1024*1024});
if(r.error||r.status!==0){console.error('[FAILED] CMS J local PostgreSQL QA:',r.error?.message??r.stderr?.slice(-5000));process.exit(1);}
console.log('[PASS] Real local CMS J SQL: settings draft/publish/replay, page publish+archive, anonymous navigation, RLS, audit and receipt');
console.log('[PASS] Rollback complete: no QA fixture persisted');
