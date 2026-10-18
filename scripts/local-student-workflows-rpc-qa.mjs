import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const target='supabase_db_coaching';
if(process.env.MUSA_LOCAL_STUDENT_WORKFLOWS_QA!==target)throw Error('Student workflow SQL QA requires explicit Docker-only opt-in');
if(process.env.DOCKER_HOST&&!/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('Remote Docker target denied');
const [teacher,student,foreign,batch]=Array.from({length:4},randomUUID),ops=Array.from({length:10},randomUUID),event=randomUUID(),code='H'+randomUUID().replaceAll('-','').slice(0,15).toUpperCase();
const sql=`BEGIN;
insert into auth.users(id) values('${teacher}'::uuid),('${student}'::uuid),('${foreign}'::uuid);
update public.profiles set role='teacher'::public.app_role,account_status='active'::public.account_status where id='${teacher}'::uuid;
update public.profiles set account_status='active'::public.account_status where id in ('${student}'::uuid,'${foreign}'::uuid);
insert into public.batches(id,code,name,capacity) values('${batch}'::uuid,'${code}','Student H QA',5);
insert into public.enrollments(student_id,batch_id,status,decided_at) values('${student}'::uuid,'${batch}'::uuid,'active',now());
SET LOCAL ROLE authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','${teacher}',true);
DO $teacher$
declare s jsonb;a jsonb;pub jsonb;n jsonb;
begin
 s:=public.coaching_create_subject('${batch}'::uuid,'QA17','QA Subject','${ops[0]}'::uuid);
 a:=public.coaching_create_assignment_draft('${batch}'::uuid,(s->>'id')::uuid,'QA Assignment','Answer the question',now()-interval '1 day',now()+interval '1 day',100,true,'${ops[1]}'::uuid);
 pub:=public.coaching_publish_assignment((a->>'id')::uuid,'${ops[2]}'::uuid);
 n:=public.coaching_dispatch_batch_notification('${batch}'::uuid,'${event}'::uuid,'Homework','Assignment due soon','${ops[3]}'::uuid);
 if (n->>'delivered')::integer<>1 then raise exception 'NOTIFICATION_DELIVERY_MISMATCH'; end if;
 perform pg_catalog.set_config('musa.qa.assignment',(a->>'id'),true);
end;
$teacher$;
select pg_catalog.set_config('request.jwt.claim.sub','${student}',true);
DO $student$
declare a uuid:=(current_setting('musa.qa.assignment'))::uuid;s jsonb;s2 jsonb;r jsonb;n uuid;msg text;
begin
 if (public.coaching_count_my_unread_notifications()->>'unreadCount')::integer<>1 then raise exception 'UNREAD_NOT_ONE'; end if;
 s:=public.coaching_submit_assignment(a,'First answer','${ops[4]}'::uuid);
 if s->>'resubmitted'<>'false' or public.coaching_submit_assignment(a,'First answer','${ops[4]}'::uuid)<>s then raise exception 'FIRST_SUBMISSION_FAILED'; end if;
 if public.coaching_get_my_assignment_submission(a)->>'gradePublished'<>'false' or public.coaching_get_my_assignment_submission(a)->>'points' is not null then raise exception 'DRAFT_GRADE_LEAK'; end if;
 s2:=public.coaching_submit_assignment(a,'Second answer','${ops[5]}'::uuid);
 if s2->>'resubmitted'<>'true' or s2->>'id'<>s->>'id' then raise exception 'RESUBMISSION_FAILED'; end if;
 n:=(select id from public.notifications where recipient_id='${student}'::uuid limit 1);
 r:=public.coaching_mark_notification_read(n,'${ops[6]}'::uuid);
 if r->>'recipientId'<>'${student}' or public.coaching_mark_notification_read(n,'${ops[6]}'::uuid)<>r then raise exception 'READ_RECEIPT_MISMATCH'; end if;
 if (public.coaching_count_my_unread_notifications()->>'unreadCount')::integer<>0 then raise exception 'UNREAD_NOT_ZERO'; end if;
 if pg_catalog.has_table_privilege('authenticated','public.assignment_submissions','SELECT') then raise exception 'STUDENT_BASE_TABLE_GRANT'; end if;
 begin
  perform public.coaching_grade_assignment_submission((s->>'id')::uuid,85,'Good','${ops[7]}'::uuid);
  raise exception 'EXPECTED_FORBIDDEN';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'FORBIDDEN' then raise;end if;end;
end;
$student$;
select pg_catalog.set_config('request.jwt.claim.sub','${foreign}',true);
DO $foreign$
declare a uuid:=(current_setting('musa.qa.assignment'))::uuid;msg text;
begin
 begin
  perform public.coaching_get_my_assignment_submission(a);
  raise exception 'EXPECTED_NOT_ENROLLED';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'NOT_ENROLLED' then raise;end if;end;
 if (public.coaching_count_my_unread_notifications()->>'unreadCount')::integer<>0 then raise exception 'FOREIGN_UNREAD_LEAK'; end if;
end;
$foreign$;
select pg_catalog.set_config('request.jwt.claim.sub','${teacher}',true);
DO $teacher2$
declare a uuid:=(current_setting('musa.qa.assignment'))::uuid;l jsonb;sid uuid;r jsonb;msg text;
begin
 l:=public.coaching_list_assignment_submissions(a);
 if jsonb_array_length(l->'items')<>1 or l->'items'->0->>'gradeStatus'<>'ungraded' then raise exception 'LIST_BAD'; end if;
 sid:=(l->'items'->0->>'id')::uuid;
 r:=public.coaching_grade_assignment_submission(sid,85,'Great work','${ops[7]}'::uuid);
 if r->>'gradeStatus'<>'draft' or public.coaching_grade_assignment_submission(sid,85,'Great work','${ops[7]}'::uuid)<>r then raise exception 'GRADE_FAILED'; end if;
 if public.coaching_list_assignment_submissions(a)->'items'->0->>'gradeStatus'<>'draft' then raise exception 'DRAFT_GRADE_NOT_SET'; end if;
 r:=public.coaching_publish_assignment_grades(a,'${ops[8]}'::uuid);
 if r->>'gradesPublished'<>'true' or r->>'publishedCount'<>'1' or public.coaching_publish_assignment_grades(a,'${ops[8]}'::uuid)<>r then raise exception 'GRADE_RELEASE_FAILED'; end if;
 if public.coaching_list_assignment_submissions(a)->'items'->0->>'gradeStatus'<>'published' then raise exception 'GRADE_NOT_VISIBLE_TO_TEACHER'; end if;
end;
$teacher2$;
select pg_catalog.set_config('request.jwt.claim.sub','${student}',true);
DO $student2$
declare a uuid:=(current_setting('musa.qa.assignment'))::uuid;v jsonb;msg text;
begin
 v:=public.coaching_get_my_assignment_submission(a);
 if v->>'gradePublished'<>'true' or v->>'points'<>'85' or v->>'feedback'<>'Great work' then raise exception 'GRADE_NOT_VISIBLE_TO_OWNER'; end if;
 begin
  perform public.coaching_submit_assignment(a,'Too late','${ops[9]}'::uuid);
  raise exception 'EXPECTED_RESUBMISSION_CLOSED';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'RESUBMISSION_NOT_ALLOWED' then raise;end if;end;
end;
$student2$;
RESET ROLE;
DO $integrity$
begin
 if (select count(*) from public.audit_logs where actor_id in ('${teacher}'::uuid,'${student}'::uuid))<>9 then raise exception 'AUDIT_COUNT_NOT_NINE'; end if;
 if (select count(*) from public.coaching_mutation_receipts where actor_id in ('${teacher}'::uuid,'${student}'::uuid))<>9 then raise exception 'RECEIPTS_COUNT_NOT_NINE'; end if;
end;
$integrity$;
ROLLBACK;`;
const result=spawnSync('docker',['exec','-i',target,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],{input:sql,encoding:'utf8',timeout:65000,maxBuffer:2*1024*1024,windowsHide:true});
if(result.error||result.status!==0){console.error('[FAIL] Student Part H local SQL QA:',result.error?.message??result.stderr?.slice(-5000));process.exit(1);}
console.log('[PASS] Real local SQL: submit/resubmit, owned grade masking, notification read/unread, teacher draft grade + publish, receipts/audit');
console.log('[PASS] QA transaction rolled back. No fixture persisted.');
