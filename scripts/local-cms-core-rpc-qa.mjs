import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const container='supabase_db_coaching';
if(process.env.MUSA_LOCAL_CMS_QA!=='supabase_db_coaching')throw Error('CMS QA requires exact local opt-in');
if(process.env.DOCKER_HOST&&!/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('Remote Docker target denied');
const [teacher,student,page,section,item]=Array.from({length:5},randomUUID);
const ops=Array.from({length:7},randomUUID);const slug='cms-'+randomUUID().replaceAll('-','').slice(0,18);
const sql=`BEGIN;
insert into auth.users(id) values('${teacher}'::uuid),('${student}'::uuid);
update public.profiles set role='teacher'::public.app_role,account_status='active'::public.account_status where id='${teacher}'::uuid;
update public.profiles set account_status='active'::public.account_status where id='${student}'::uuid;
SET LOCAL ROLE authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','${teacher}',true);
DO $cms_teacher$
declare p jsonb;s jsonb;i jsonb;r jsonb;v jsonb;err text;
begin
 p:=public.coaching_cms_write('page.create','${page}'::uuid,null,null,
   pg_catalog.jsonb_build_object('slug','${slug}','title','Musa Sir Coaching','seoTitle','Official Coaching','seoDescription','Course offerings'),'${ops[0]}'::uuid);
 if p->>'status'<>'draft' or p->>'revision'<>'1' then raise exception 'CMS_PAGE_CREATE_FAILED'; end if;
 if public.coaching_cms_write('page.create','${page}'::uuid,null,null,
   pg_catalog.jsonb_build_object('slug','${slug}','title','Musa Sir Coaching','seoTitle','Official Coaching','seoDescription','Course offerings'),'${ops[0]}'::uuid)<>p then raise exception 'CMS_IDEMPOTENCY_FAILED'; end if;
 if public.coaching_cms_get_published_page('${slug}') is not null then raise exception 'DRAFT_PUBLIC_LEAK'; end if;
 s:=public.coaching_cms_write('section.upsert','${section}'::uuid,'${page}'::uuid,1,
  '{"kind":"hero","order":0,"heading":"Learn Together","body":"Course and support","visible":true}'::jsonb,'${ops[1]}'::uuid);
 if s->>'revision'<>'2' then raise exception 'CMS_SECTION_FAILED';end if;
 i:=public.coaching_cms_write('item.upsert','${item}'::uuid,'${page}'::uuid,2,
  pg_catalog.jsonb_build_object('sectionId','${section}','order',0,'title','Join a batch','description','Contact us','url','https://example.org','visible',true),'${ops[2]}'::uuid);
 if i->>'revision'<>'3' then raise exception 'CMS_ITEM_FAILED';end if;
 v:=public.coaching_cms_get_page('${page}'::uuid);
 if v->>'draftRevision'<>'3' or pg_catalog.jsonb_array_length(v->'sections')<>1 or pg_catalog.jsonb_array_length(v->'sections'->0->'items')<>1 then raise exception 'CMS_DRAFT_PROJECTION_FAILED';end if;
 if pg_catalog.jsonb_array_length(public.coaching_cms_list_pages()->'items')<1 then raise exception 'CMS_INDEX_FAILED';end if;
 r:=public.coaching_cms_write('page.publish','${page}'::uuid,null,3,'{}'::jsonb,'${ops[3]}'::uuid);
 if r->>'status'<>'published' or r->>'revision'<>'3' then raise exception 'CMS_PUBLISH_FAILED';end if;
 if public.coaching_cms_write('page.publish','${page}'::uuid,null,3,'{}'::jsonb,'${ops[3]}'::uuid)<>r then raise exception 'CMS_PUBLISH_REPLAY_FAILED';end if;
 begin
  perform public.coaching_cms_write('page.publish','${page}'::uuid,null,3,'{}'::jsonb,'${ops[4]}'::uuid);
  raise exception 'EXPECTED_SAME_REVISION_DENIAL';
 exception when others then get stacked diagnostics err=message_text;if err<>'ALREADY_PUBLISHED' then raise;end if;end;
 r:=public.coaching_cms_write('page.update','${page}'::uuid,null,3,
  '{"title":"Updated Private Draft"}'::jsonb,'${ops[5]}'::uuid);
 if r->>'revision'<>'4' then raise exception 'CMS_REVISION_NOT_INCREMENTED';end if;
 if public.coaching_cms_get_published_page('${slug}')->>'title'<>'Musa Sir Coaching' then raise exception 'PUBLIC_SNAPSHOT_MUTATED';end if;
end;
$cms_teacher$;
select pg_catalog.set_config('request.jwt.claim.sub','${student}',true);
DO $cms_student$
declare err text;
begin
 begin perform public.coaching_cms_list_pages();raise exception 'EXPECTED_FORBIDDEN';
 exception when others then get stacked diagnostics err=message_text;if err<>'FORBIDDEN' then raise;end if;end;
 begin perform public.coaching_cms_write('page.publish','${page}'::uuid,null,4,'{}'::jsonb,'${ops[6]}'::uuid);raise exception 'EXPECTED_FORBIDDEN';
 exception when others then get stacked diagnostics err=message_text;if err<>'FORBIDDEN' then raise;end if;end;
end;
$cms_student$;
SET LOCAL ROLE anon;
select pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $cms_public$
declare p jsonb;
begin
 p:=public.coaching_cms_get_published_page('${slug}');
 if p->>'schemaVersion'<>'1' or p->>'revision'<>'3' or p->>'title'<>'Musa Sir Coaching' then raise exception 'PUBLIC_SNAPSHOT_INVALID';end if;
 if pg_catalog.jsonb_array_length(p->'sections')<>1 or pg_catalog.jsonb_array_length(p->'sections'->0->'items')<>1 then raise exception 'PUBLIC_SECTION_MISSING';end if;
 if (p->'sections'->0) ? 'visible' or (p->'sections'->0->'items'->0) ? 'visible' then raise exception 'DRAFT_FLAGS_PUBLIC';end if;
 if public.coaching_cms_get_published_settings() is not null then raise exception 'UNPUBLISHED_GLOBAL_LEAK';end if;
 if pg_catalog.has_table_privilege('anon','public.site_pages','SELECT') or pg_catalog.has_table_privilege('authenticated','public.site_pages','INSERT') then raise exception 'DIRECT_CMS_TABLE_ACCESS';end if;
end;
$cms_public$;
RESET ROLE;
DO $cms_integrity$
begin
 if (select count(*) from public.audit_logs where actor_id='${teacher}'::uuid and action like 'cms.%')<>5 then raise exception 'CMS_AUDIT_COUNT_BAD';end if;
 if (select count(*) from public.coaching_mutation_receipts where actor_id='${teacher}'::uuid and operation_type like 'cms.%')<>5 then raise exception 'CMS_RECEIPT_COUNT_BAD';end if;
end;
$cms_integrity$;
ROLLBACK;`;
const r=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],{input:sql,encoding:'utf8',windowsHide:true,timeout:65000,maxBuffer:2*1024*1024});
if(r.error||r.status!==0){console.error('[FAILED] CMS local SQL QA:',r.error?.message??r.stderr?.slice(-5000));process.exit(1);}
console.log('[PASS] Real local CMS SQL QA: active teacher + anon boundaries, draft edits, immutable published snapshot, idempotency and audit');
console.log('[PASS] All CMS QA fixtures rolled back, no data persisted');
