import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const target='supabase_db_coaching';
if(process.env.MUSA_LOCAL_STUDENT_PARTL_QA!==target)throw Error('Explicit exact local PostgreSQL QA opt-in required');
if(process.env.DOCKER_HOST&&!/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('Remote Docker forbidden');
const [teacher,student,batch,plan,due,pay,finOp,adjust,adjOp,subject,assignment,exam,profileOp]=Array.from({length:13},randomUUID);
const code='L'+randomUUID().replaceAll('-','').slice(0,14).toUpperCase();
const now=new Date(),day=now.toISOString().slice(0,10),period=day.slice(0,7),to=new Date(now.getTime()+7*86400000).toISOString().slice(0,10);
const sql=`BEGIN;
insert into auth.users(id) values('${teacher}'::uuid),('${student}'::uuid);
update public.profiles set role='teacher'::public.app_role,account_status='active'::public.account_status,full_name='Test Teacher' where id='${teacher}'::uuid;
update public.profiles set account_status='active'::public.account_status,full_name='Test Student' where id='${student}'::uuid;
insert into public.batches(id,code,name,capacity) values('${batch}'::uuid,'${code}','Student Part L QA',10);
insert into public.enrollments(student_id,batch_id,status,decided_at) values('${student}'::uuid,'${batch}'::uuid,'active',now());
insert into public.fee_plans(id,batch_id,bill_period,amount_minor,currency,due_on,label,created_by) values('${plan}'::uuid,'${batch}'::uuid,'${period}',50000,'BDT','${day}','Student QA fee plan','${teacher}'::uuid);
insert into public.monthly_dues(id,fee_plan_id,student_id,batch_id,bill_period,amount_minor,currency) values('${due}'::uuid,'${plan}'::uuid,'${student}'::uuid,'${batch}'::uuid,'${period}',50000,'BDT');
insert into public.financial_operations(operation_id,action,target_id,actor_id,response_data) values('${finOp}'::uuid,'payment-post','${due}'::uuid,'${teacher}'::uuid,'{}');
insert into public.payments(id,due_id,student_id,amount_minor,currency,method,reference,operation_id,created_by) values('${pay}'::uuid,'${due}'::uuid,'${student}'::uuid,20000,'BDT','cash','','${finOp}'::uuid,'${teacher}'::uuid);
insert into public.financial_operations(operation_id,action,target_id,actor_id,response_data) values('${adjOp}'::uuid,'payment-waiver','${due}'::uuid,'${teacher}'::uuid,'{}');
insert into public.payment_adjustments(id,due_id,payment_id,kind,amount_minor,reason,operation_id,created_by) values('${adjust}'::uuid,'${due}'::uuid,null,'waiver',1000,'Scholarship support','${adjOp}'::uuid,'${teacher}'::uuid);
insert into public.academic_subjects(id,batch_id,code,title,created_by) values('${subject}'::uuid,'${batch}'::uuid,'MATH01','Mathematics','${teacher}'::uuid);
insert into public.academic_assignments(id,batch_id,subject_id,title,instructions,release_at,due_at,max_points,status,created_by) values('${assignment}'::uuid,'${batch}'::uuid,'${subject}'::uuid,'Math homework','Solve questions',now()-interval '1 day',now()+interval '1 day',100,'published','${teacher}'::uuid);
insert into public.exams(id,batch_id,subject_id,title,scheduled_at,max_marks,status,created_by) values('${exam}'::uuid,'${batch}'::uuid,'${subject}'::uuid,'Algebra test',now()+interval '2 days',100,'published','${teacher}'::uuid);
SET LOCAL ROLE authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','${student}',true);
DO $student$
declare profile jsonb; patched jsonb; dashboard jsonb; ledger jsonb;calendar jsonb; progress jsonb;msg text;
begin
 profile:=public.coaching_student_profile();
 if profile->>'fullName'<>'Test Student' or profile->>'id'<>'${student}' then raise exception 'PROFILE_WRONG %',profile; end if;
 patched:=public.coaching_student_update_own_profile('Updated Student','${profileOp}'::uuid);
 if patched<>public.coaching_student_update_own_profile('Updated Student','${profileOp}'::uuid) then raise exception 'PROFILE_REPLAY'; end if;
 begin perform public.coaching_student_update_own_profile('Different Name','${profileOp}'::uuid);raise exception 'PROFILE_REPLAY_CONFLICT_NOT_DENIED';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'IDEMPOTENCY_CONFLICT' then raise; end if;end;
 if patched->>'fullName'<>'Updated Student' or patched->>'id'<>'${student}' then raise exception 'PROFILE_PATCH_WRONG'; end if;
 dashboard:=public.coaching_student_dashboard();
 if dashboard->>'outstandingMinor'<>'29000' or dashboard->'counts'->>'activeBatches'<>'1' or dashboard->'counts'->>'upcomingAssignments'<>'1' or dashboard->'counts'->>'upcomingExams'<>'1' then raise exception 'DASHBOARD_WRONG %',dashboard;end if;
 if jsonb_array_length(dashboard->'upcoming')<>2 then raise exception 'DASHBOARD_UPCOMING';end if;
 ledger:=public.coaching_student_billing_statement('${period}');
 if ledger->'totalsMinor'->>'outstanding'<>'29000' or ledger->'totalsMinor'->>'paid'<>'20000' or ledger->'totalsMinor'->>'waived'<>'1000' or jsonb_array_length(ledger->'items')<>1 then raise exception 'LEDGER_WRONG %',ledger;end if;
 calendar:=public.coaching_student_calendar('${day}'::date,'${to}'::date);
 if jsonb_array_length(calendar->'items')<>2 then raise exception 'CALENDAR_WRONG %',calendar;end if;
 progress:=public.coaching_student_progress();
 if progress->>'publishedExamResults'<>'0' or progress->>'gradedAssignments'<>'0' or progress->>'earnedMarksX100'<>'0' then raise exception 'DRAFT_VISIBILITY_WRONG';end if;
 begin perform public.coaching_student_calendar('${day}'::date,('${to}'::date + interval '60 days')::date);raise exception 'CALENDAR_WINDOW_ALLOWED';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'INVALID_WINDOW' then raise;end if;end;
 begin update public.profiles set role='teacher'::public.app_role where id='${student}'::uuid;raise exception 'DIRECT_ROLE_DML_ALLOWED';
 exception when insufficient_privilege then null;end;
end;$student$;
select pg_catalog.set_config('request.jwt.claim.sub','${teacher}',true);
DO $teacher$
declare msg text;begin
 begin perform public.coaching_student_dashboard();raise exception 'TEACHER_DASHBOARD_ALLOWED';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'FORBIDDEN' then raise;end if;end;
 begin perform public.coaching_student_update_own_profile('Fake student',gen_random_uuid());raise exception 'TEACHER_PROFILE_ALLOWED';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'FORBIDDEN' then raise;end if;end;
 begin perform public.coaching_student_billing_statement('${period}');raise exception 'TEACHER_BILL_ALLOWED';
 exception when others then get stacked diagnostics msg=message_text;if msg<>'FORBIDDEN' then raise;end if;end;
end;$teacher$;
RESET ROLE;
DO $verify$ begin
 if (select count(*) from public.audit_logs where actor_id='${student}'::uuid and action='student.profile.self')<>1 then raise exception 'AUDIT_MISSING';end if;
 if (select count(*) from public.coaching_mutation_receipts where actor_id='${student}'::uuid and operation_type='student.profile.self')<>1 then raise exception 'RECEIPT_MISSING';end if;
end;$verify$;
ROLLBACK;`;
const r=spawnSync('docker',['exec','-i',target,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],{input:sql,encoding:'utf8',timeout:90000,maxBuffer:1024*1024,windowsHide:true});
if(r.error||r.status!==0){console.error('[FAIL] Part L real SQL QA:',r.error?.message??r.stderr?.slice(-6000));process.exit(1);}
console.log('[PASS] Student profile self-edit/replay, dashboard, billing ledger, calendar, published-only progress, teacher denial, DML denial, audit/receipts');
console.log('[PASS] All local PostgreSQL test fixtures rolled back');
