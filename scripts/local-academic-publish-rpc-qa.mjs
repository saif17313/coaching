import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const target='supabase_db_coaching';
if(process.env.MUSA_LOCAL_PUBLISH_QA!==target)throw Error('Local QA requires explicit Docker-only opt-in');
if(process.env.DOCKER_HOST&&!/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('Remote Docker target denied');
const [teacher,s1,s2,s3,batch]=Array.from({length:5},randomUUID);
const ops=Array.from({length:9},randomUUID),code='Q'+randomUUID().replaceAll('-','').slice(0,15).toUpperCase();
const sql=`BEGIN;
insert into auth.users(id) values('${teacher}'::uuid),('${s1}'::uuid),('${s2}'::uuid),('${s3}'::uuid);
update public.profiles set role='teacher'::public.app_role,account_status='active'::public.account_status where id='${teacher}'::uuid;
update public.profiles set account_status='active'::public.account_status where id in ('${s1}'::uuid,'${s2}'::uuid,'${s3}'::uuid);
insert into public.batches(id,code,name,capacity) values('${batch}'::uuid,'${code}','Publish QA',5);
insert into public.enrollments(student_id,batch_id,status,decided_at) values
 ('${s1}'::uuid,'${batch}'::uuid,'active',now()),('${s2}'::uuid,'${batch}'::uuid,'active',now()),('${s3}'::uuid,'${batch}'::uuid,'active',now());
SET LOCAL ROLE authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','${teacher}',true);
DO $teacher$
declare s jsonb;a jsonb;e jsonb;pub jsonb;res jsonb;msg text; v_exam_id uuid;
begin
 s:=public.coaching_create_subject('${batch}'::uuid,'MATHQA','Mathematics','${ops[0]}'::uuid);
 a:=public.coaching_create_assignment_draft('${batch}'::uuid,(s->>'id')::uuid,'Homework QA','Solve all',now()-interval '1 hour',now()+interval '2 days',100,false,'${ops[1]}'::uuid);
 e:=public.coaching_create_exam_draft('${batch}'::uuid,(s->>'id')::uuid,'Exam QA',now()-interval '2 days',100,'${ops[2]}'::uuid);
 v_exam_id:=(e->>'id')::uuid;
 pub:=public.coaching_publish_assignment((a->>'id')::uuid,'${ops[3]}'::uuid);
 if pub->>'status'<>'published' or public.coaching_publish_assignment((a->>'id')::uuid,'${ops[3]}'::uuid)<>pub then raise exception 'ASSIGNMENT_PUBLISH_FAILURE'; end if;
 pub:=public.coaching_publish_exam(v_exam_id,'${ops[4]}'::uuid);
 if pub->>'status'<>'published' or public.coaching_publish_exam(v_exam_id,'${ops[4]}'::uuid)<>pub then raise exception 'EXAM_PUBLISH_FAILURE'; end if;
 perform public.coaching_save_exam_result_draft(v_exam_id,'${s1}'::uuid,90,'${ops[5]}'::uuid);
 perform public.coaching_save_exam_result_draft(v_exam_id,'${s2}'::uuid,90,'${ops[6]}'::uuid);
 perform public.coaching_save_exam_result_draft(v_exam_id,'${s3}'::uuid,70,'${ops[7]}'::uuid);
 res:=public.coaching_publish_exam_results(v_exam_id,'${ops[8]}'::uuid);
 if res->>'publishedCount'<>'3' or public.coaching_publish_exam_results(v_exam_id,'${ops[8]}'::uuid)<>res then raise exception 'RESULT_PUBLICATION_FAILED'; end if;
 if (select count(*) from public.exam_results where exam_id=v_exam_id and result_status='published')<>3 then raise exception 'MISSING_PUBLISHED'; end if;
 if (select count(*) from public.exam_results where exam_id=v_exam_id and rank=1)<>2 or
    (select count(*) from public.exam_results where exam_id=v_exam_id and rank=3)<>1 then raise exception 'TIE_RANK_FAILURE'; end if;
 begin
  perform public.coaching_publish_exam_results(v_exam_id,gen_random_uuid());
  raise exception 'EXPECTED_REPUBLICATION_REJECTION';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'RESULT_SET_NOT_READY' then raise; end if;
 end;
end;
$teacher$;
select pg_catalog.set_config('request.jwt.claim.sub','${s1}',true);
DO $student$
declare data jsonb;msg text;visible_count integer;
begin
 data:=public.coaching_get_my_published_exam_results(20,0);
 if pg_catalog.jsonb_array_length(data->'items')<>1 or (data->'items'->0->>'rank')::integer<>1 or (data->'items'->0->>'marks')::numeric<>90 then raise exception 'OWN_RESULTS_WRONG'; end if;
 begin
  perform public.coaching_publish_assignment(gen_random_uuid(),gen_random_uuid());
  raise exception 'EXPECTED_TEACHER_ONLY';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'FORBIDDEN' then raise; end if;
 end;
 select count(*) into visible_count from public.exam_results;
 if visible_count<>0 then raise exception 'RAW_RESULT_TABLE_VISIBLE_TO_STUDENT'; end if;
end;
$student$;
RESET ROLE;
DO $audit$
begin
 if (select count(*) from public.audit_logs where actor_id='${teacher}'::uuid)<>9 then raise exception 'AUDIT_WRONG'; end if;
 if (select count(*) from public.coaching_mutation_receipts where actor_id='${teacher}'::uuid)<>9 then raise exception 'RECEIPTS_WRONG'; end if;
end;
$audit$;
ROLLBACK;`;
const r=spawnSync('docker',['exec','-i',target,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],{input:sql,encoding:'utf8',timeout:55000,maxBuffer:1024*1024,windowsHide:true});
if(r.error||r.status!==0){console.error('[FAIL] Local publish SQL rollback QA:',r.error?.message??r.stderr?.slice(-3000));process.exit(1);}
console.log('[PASS] Local publish QA: teacher guard, immutable replay, three students, competition ties 1/1/3, student owned visibility, direct grade-table denial');
console.log('[PASS] QA transaction ROLLBACK; zero fixture persisted');
