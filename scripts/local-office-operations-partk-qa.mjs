import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const target='supabase_db_coaching';
if(process.env.MUSA_LOCAL_OFFICE_PARTK_QA!==target)throw Error('Explicit exact local Docker QA opt-in required');
if(process.env.DOCKER_HOST&&!/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('Remote Docker forbidden');
const [teacher,student,batch,first,second,reverseOp,planOp,duesOp,payOp,refOp,waivOp,annOp,editOp,pubOp,archiveOp]=Array.from({length:15},randomUUID);
const code='K'+randomUUID().replaceAll('-','').slice(0,14).toUpperCase();
const today=new Date().toISOString().slice(0,10),period=today.slice(0,7);
const sql=`BEGIN;
insert into auth.users(id) values('${teacher}'::uuid),('${student}'::uuid);
update public.profiles set role='teacher'::public.app_role,account_status='active'::public.account_status where id='${teacher}'::uuid;
update public.profiles set account_status='active'::public.account_status where id='${student}'::uuid;
insert into public.batches(id,code,name,capacity) values('${batch}'::uuid,'${code}','Office Part K QA',10);
insert into public.enrollments(student_id,batch_id,status,decided_at) values('${student}'::uuid,'${batch}'::uuid,'active',now());
SET LOCAL ROLE authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','${teacher}',true);
DO $teacher$
declare x jsonb;y jsonb;z jsonb;statement jsonb; plan jsonb;due uuid;pay jsonb;ann jsonb;msg text;
begin
 x:=public.coaching_record_office_expense('${batch}'::uuid,'${today}'::date,'supplies','Exam stationery','Paper and ink',6000,'cash','','${first}'::uuid);
 if x<>public.coaching_record_office_expense('${batch}'::uuid,'${today}'::date,'supplies','Exam stationery','Paper and ink',6000,'cash','','${first}'::uuid) then raise exception 'EXPENSE_REPLAY_FAILED'; end if;
 begin
  perform public.coaching_record_office_expense('${batch}'::uuid,'${today}'::date,'supplies','Exam stationery','Paper and ink',7000,'cash','','${first}'::uuid);
  raise exception 'CONFLICT_NOT_DENIED';
 exception when others then get stacked diagnostics msg=message_text; if msg<>'IDEMPOTENCY_CONFLICT' then raise; end if;
 end;
 y:=public.coaching_record_office_expense('${batch}'::uuid,'${today}'::date,'utilities','Electric company','October electricity',3000,'bank','b2','${second}'::uuid);
 if (public.coaching_list_office_expenses('${batch}'::uuid,'${period}',10,0)->>'total')::int<>2 then raise exception 'LIST_COUNT_WRONG'; end if;
 if (public.coaching_export_office_expenses('${batch}'::uuid,'${period}')->>'total')::int<>2 then raise exception 'EXPORT_COUNT_WRONG'; end if;
 z:=public.coaching_reverse_office_expense((x->>'id')::uuid,'Wrong invoice recorded','${reverseOp}'::uuid);
 if z<>public.coaching_reverse_office_expense((x->>'id')::uuid,'Wrong invoice recorded','${reverseOp}'::uuid) then raise exception 'REVERSE_REPLAY'; end if;
 begin
  perform public.coaching_reverse_office_expense((x->>'id')::uuid,'Second reversal attempt',gen_random_uuid());
  raise exception 'DOUBLE_REVERSAL_ALLOWED';
 exception when others then get stacked diagnostics msg=message_text; if msg<>'ALREADY_REVERSED' then raise; end if;
 end;
 if (public.coaching_get_office_expense((x->>'id')::uuid)->>'reversed')::boolean is not true then raise exception 'DETAIL_REVERSAL_HIDDEN'; end if;
 plan:=public.coaching_create_fee_plan('${batch}'::uuid,'${period}',50000,'${today}'::date,'QA monthly plan','${planOp}'::uuid);
 perform public.coaching_generate_monthly_dues((plan->>'id')::uuid,'${duesOp}'::uuid);
 select id into due from public.monthly_dues where batch_id='${batch}'::uuid and student_id='${student}'::uuid;
 pay:=public.coaching_post_payment(due,'${student}'::uuid,12000,'cash','','${payOp}'::uuid);
 perform public.coaching_refund_payment((pay->>'id')::uuid,2000,'Payment was duplicated','${refOp}'::uuid);
 perform public.coaching_waive_due(due,1000,'Special waiver support','${waivOp}'::uuid);
 statement:=public.coaching_office_cashflow_statement('${batch}'::uuid,'${period}');
 if statement->>'grossCollectionsMinor'<>'12000' or statement->>'refundsMinor'<>'2000'
   or statement->>'netCollectionsMinor'<>'10000' or statement->>'grossExpensesMinor'<>'9000'
   or statement->>'reversedExpensesMinor'<>'6000' or statement->>'netExpensesMinor'<>'3000'
   or statement->>'netCashFlowMinor'<>'7000' or statement->>'waiversMemoMinor'<>'1000'
   or statement->>'billedMemoMinor'<>'50000' or statement->>'basis'<>'posted_utc' then raise exception 'STATEMENT_WRONG %',statement; end if;
 ann:=public.coaching_create_announcement('${batch}'::uuid,'Upcoming class','Class is on Monday',null,'${annOp}'::uuid);
 if (public.coaching_edit_announcement_draft((ann->>'id')::uuid,'Updated class','Class starts at noon',null,'${editOp}'::uuid)->>'status')<>'draft' then raise exception 'EDIT_FAILED'; end if;
 perform public.coaching_publish_announcement((ann->>'id')::uuid,'${pubOp}'::uuid);
 begin
  perform public.coaching_edit_announcement_draft((ann->>'id')::uuid,'Unreleased edit','Not allowed',null,gen_random_uuid());raise exception 'EDIT_PUBLISHED_ALLOWED';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'EDIT_REQUIRES_DRAFT' then raise; end if;
 end;
 perform public.coaching_archive_announcement((ann->>'id')::uuid,'${archiveOp}'::uuid);
 if (select status from public.announcements where id=(ann->>'id')::uuid)<>'archived' then raise exception 'ARCHIVE_FAILED'; end if;
end;
$teacher$;
select pg_catalog.set_config('request.jwt.claim.sub','${student}',true);
DO $student$
declare msg text;begin
 begin
  perform public.coaching_office_cashflow_statement('${batch}'::uuid,'${period}');raise exception 'STUDENT_REPORT_ALLOWED';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'FORBIDDEN' then raise; end if;end;
 begin
  perform public.coaching_record_office_expense('${batch}'::uuid,'${today}'::date,'rent','Someone','',2000,'cash','',gen_random_uuid());raise exception 'STUDENT_POST_ALLOWED';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'FORBIDDEN' then raise; end if;end;
 begin
  update public.office_expenses set amount_minor=1 where batch_id='${batch}'::uuid;raise exception 'DIRECT_DML_ALLOWED';
 exception when insufficient_privilege then null;end;
end;
$student$;
RESET ROLE;
DO $audit$ begin
 if (select count(*) from public.office_expenses where batch_id='${batch}'::uuid)<>2 then raise exception 'EXPENSE_INSERT_COUNT'; end if;
 if (select count(*) from public.office_expense_reversals where expense_id in(select id from public.office_expenses where batch_id='${batch}'::uuid))<>1 then raise exception 'REVERSAL_COUNT'; end if;
 if (select count(*) from public.coaching_mutation_receipts where actor_id='${teacher}'::uuid)<>12 then raise exception 'RECEIPT_COUNT'; end if;
 if (select count(*) from public.audit_logs where actor_id='${teacher}'::uuid)<>12 then raise exception 'AUDIT_COUNT'; end if;
end;$audit$;
ROLLBACK;`;
const r=spawnSync('docker',['exec','-i',target,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],{input:sql,encoding:'utf8',timeout:90000,maxBuffer:1024*1024,windowsHide:true});
if(r.error||r.status!==0){console.error('[FAIL] Part K live local SQL QA:',r.error?.message??r.stderr?.slice(-5500));process.exit(1);}
console.log('[PASS] Local SQL: expense replay/conflict, immutable reversal, cashflow, waiver/billing separation, announcement edit/archive, student and DML denial, audit+receipts');
console.log('[PASS] Rollback-only QA: no test data persisted');
