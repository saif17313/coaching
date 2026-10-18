/** Local-only rollback PostgreSQL security QA. Does not touch cloud or Supabase Storage HTTP. */
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
if(process.env.MUSA_CMS_MEDIA_LOCAL_QA!=='supabase_db_coaching')throw Error('LOCAL_DOCKER_QA_OPT_IN_REQUIRED');
if(process.env.DOCKER_HOST&&!/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('REMOTE_DOCKER_DENIED');
const teacher=randomUUID(),student=randomUUID(),media=randomUUID(),page=randomUUID(),section=randomUUID(),item=randomUUID(),missing=randomUUID();
const op=Array.from({length:9},randomUUID),slug='media-'+randomUUID().replaceAll('-','').slice(0,12),key=`${teacher}/${media}.png`;
const sql=`BEGIN;
insert into auth.users(id) values ('${teacher}'::uuid),('${student}'::uuid);
update public.profiles set role='teacher'::public.app_role,account_status='active'::public.account_status where id='${teacher}'::uuid;
update public.profiles set role='student'::public.app_role,account_status='active'::public.account_status where id='${student}'::uuid;
insert into storage.objects(bucket_id,name,metadata)
 values ('musa-site-media','${key}',pg_catalog.jsonb_build_object('size',512,'mimetype','image/png'));
SET LOCAL ROLE authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','${teacher}',true);
DO $teacher$
declare p jsonb;r jsonb;s jsonb;a jsonb;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'TEACHER_NOT_ACTIVE';end if;
 p:=public.coaching_cms_write('page.create','${page}'::uuid,null,null,
  pg_catalog.jsonb_build_object('slug','${slug}','title','Musa Gallery','seoTitle','Media in class','seoDescription','Our learning gallery'),
  '${op[0]}'::uuid);
 p:=public.coaching_cms_write('section.upsert','${section}'::uuid,'${page}'::uuid,1,
  '{"kind":"gallery","order":1,"heading":"Photos","body":"School moments","visible":true}'::jsonb,'${op[1]}'::uuid);
 p:=public.coaching_cms_write('item.upsert','${item}'::uuid,'${page}'::uuid,2,
  pg_catalog.jsonb_build_object('sectionId','${section}','order',1,'title','Photo','description','Class memory','url',null,'visible',true),
  '${op[2]}'::uuid);
 a:=public.coaching_media_register('${media}'::uuid,'${key}','image/png',512,pg_catalog.repeat('a',64),'Classroom image','${op[3]}'::uuid);
 if a->>'status'<>'ready' then raise exception 'MEDIA_REGISTER_FAILED';end if;
 if public.coaching_media_register('${media}'::uuid,'${key}','image/png',512,pg_catalog.repeat('a',64),'Classroom image','${op[3]}'::uuid)<>a then raise exception 'MEDIA_REPLAY_FAILED';end if;
 if public.coaching_media_resolve('${media}'::uuid) is not null then raise exception 'DRAFT_MEDIA_LEAK';end if;
 begin perform public.coaching_media_register('${missing}'::uuid,'${teacher}/${missing}.png','image/png',512,pg_catalog.repeat('a',64),'Missing object','${op[8]}'::uuid);
 raise exception 'EXPECTED_MISSING_STORAGE_DENIAL';exception when others then if sqlerrm<>'MEDIA_STORAGE_NOT_VERIFIED' then raise;end if;end;
 r:=public.coaching_cms_media_mutation('attach','${media}'::uuid,'${page}'::uuid,'${item}'::uuid,3,'${op[4]}'::uuid);
 if r->>'revision'<>'4' then raise exception 'MEDIA_ATTACH_REVISION_FAILED';end if;
 if public.coaching_cms_media_mutation('attach','${media}'::uuid,'${page}'::uuid,'${item}'::uuid,3,'${op[4]}'::uuid)<>r then raise exception 'ATTACH_REPLAY_FAILED';end if;
 s:=public.coaching_cms_write('page.publish','${page}'::uuid,null,4,'{}'::jsonb,'${op[5]}'::uuid);
 if s->>'status'<>'published' then raise exception 'MEDIA_PAGE_PUBLISH_FAILED';end if;
 p:=public.coaching_cms_get_published_page('${slug}');
 if (select count(*) from pg_catalog.jsonb_array_elements(p->'sections') x,
    lateral pg_catalog.jsonb_array_elements(x.value->'items') y where y.value->>'mediaId'='${media}')<>1 then raise exception 'MEDIA_SNAPSHOT_MISSING';end if;
 if public.coaching_media_resolve('${media}'::uuid)->>'contentType'<>'image/png' then raise exception 'MEDIA_PUBLIC_RESOLVE_FAILED';end if;
 begin perform public.coaching_cms_media_mutation('archive','${media}'::uuid,null,null,null,'${op[6]}'::uuid);
 raise exception 'EXPECTED_PUBLISHED_MEDIA_ARCHIVE_DENIAL';exception when others then if sqlerrm<>'MEDIA_PUBLIC_IN_USE' then raise;end if;end;
end;
$teacher$;
select pg_catalog.set_config('request.jwt.claim.sub','${student}',true);
DO $student$
begin
 if public.coaching_media_actor_is_active_teacher() then raise exception 'STUDENT_TEACHER_ESCALATION';end if;
 begin perform public.coaching_media_list();raise exception 'EXPECTED_DENIAL';
 exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin perform public.coaching_media_register('${missing}'::uuid,'${teacher}/${missing}.png','image/png',512,pg_catalog.repeat('a',64),'Other image','${op[7]}'::uuid);
 raise exception 'EXPECTED_DENIAL';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
end;
$student$;
SET LOCAL ROLE anon;
select pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $anon$
begin
 if not public.coaching_media_is_published_path('${key}') then raise exception 'PUBLIC_POLICY_CANNOT_FIND_PUBLISHED';end if;
 if public.coaching_media_resolve('${media}'::uuid)->>'id'<>'${media}' then raise exception 'ANON_MEDIA_RESOLUTION_FAILED';end if;
 if pg_catalog.has_table_privilege('anon','public.media_assets','SELECT') or
    pg_catalog.has_table_privilege('authenticated','public.media_assets','INSERT') then raise exception 'MEDIA_TABLE_ACCESS_LEAK';end if;
end;
$anon$;
RESET ROLE;
DO $audit$
begin
 if (select count(*) from public.audit_logs where actor_id='${teacher}'::uuid and action like 'cms.%')<6 then raise exception 'MEDIA_AUDIT_MISSING';end if;
 if (select count(*) from public.coaching_mutation_receipts where actor_id='${teacher}'::uuid and operation_type like 'cms.%')<6 then raise exception 'MEDIA_RECEIPT_MISSING';end if;
end;
$audit$;
ROLLBACK;`;
const r=spawnSync('docker',['exec','-i','supabase_db_coaching','psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],{input:sql,encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:4*1024*1024});
if(r.error||r.status!==0){console.error('[FAIL] Part M local SQL QA:',r.error?.message||r.stderr?.slice(-6000));process.exit(1);}
console.log('[PASS] Real local PostgreSQL: teacher media registry/replay, verified attachment, published snapshot and anonymous read, student denial, audit+receipts');
console.log('[PASS] ROLLBACK: no QA fixture persisted');
