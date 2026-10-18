import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const target='supabase_db_coaching';
if(process.env.MUSA_LOCAL_OFFICE_QA!==target)throw Error('Exact Docker-only QA opt-in required');
if(process.env.DOCKER_HOST&&!/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('Remote Docker denied');
const [t,s1,s2,b]=Array.from({length:4},randomUUID),ops=Array.from({length:8},randomUUID),code='F'+randomUUID().replaceAll('-','').slice(0,14).toUpperCase();
const period='2026-10';
const sql=`BEGIN;
insert into auth.users(id) values ('${t}'::uuid),('${s1}'::uuid),('${s2}'::uuid);
update public.profiles set role='teacher'::public.app_role, account_status='active'::public.account_status where id='${t}'::uuid;
update public.profiles set account_status='active'::public.account_status where id in ('${s1}'::uuid,'${s2}'::uuid);
insert into public.batches(id,code,name,capacity) values('${b}'::uuid,'${code}','Finance QA',10);
insert into public.enrollments(student_id,batch_id,status,decided_at) values ('${s1}'::uuid,'${b}'::uuid,'active',now()),('${s2}'::uuid,'${b}'::uuid,'active',now());
SET LOCAL ROLE authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','${t}',true);
DO $teacher$
declare plan jsonb; dues jsonb; payment jsonb; waiver jsonb; refund jsonb; ann jsonb; published jsonb; notice jsonb; v_due uuid; msg text; v_left bigint;
begin
 plan:=public.coaching_create_fee_plan('${b}'::uuid,'${period}',50000,'2026-10-25'::date,'October tuition','${ops[0]}'::uuid);
 if public.coaching_create_fee_plan('${b}'::uuid,'${period}',50000,'2026-10-25'::date,'October tuition','${ops[0]}'::uuid)<>plan then raise exception 'PLAN_REPLAY'; end if;
 dues:=public.coaching_generate_monthly_dues((plan->>'id')::uuid,'${ops[1]}'::uuid);
 if (dues->>'created')::integer<>2 or public.coaching_generate_monthly_dues((plan->>'id')::uuid,'${ops[1]}'::uuid)<>dues then raise exception 'DUE_REPLAY'; end if;
 select id into v_due from public.monthly_dues where student_id='${s1}'::uuid and fee_plan_id=(plan->>'id')::uuid;
 if v_due is null then raise exception 'MISSING_DUE'; end if;
 payment:=public.coaching_post_payment(v_due,'${s1}'::uuid,12000,'cash','','${ops[2]}'::uuid);
 if public.coaching_post_payment(v_due,'${s1}'::uuid,12000,'cash','','${ops[2]}'::uuid)<>payment then raise exception 'PAYMENT_REPLAY'; end if;
 waiver:=public.coaching_waive_due(v_due,3000,'Scholarship waiver','${ops[3]}'::uuid);
 refund:=public.coaching_refund_payment((payment->>'id')::uuid,2000,'Duplicate received','${ops[4]}'::uuid);
 if public.coaching_refund_payment((payment->>'id')::uuid,2000,'Duplicate received','${ops[4]}'::uuid)<>refund then raise exception 'REFUND_REPLAY'; end if;
 select d.amount_minor - (select coalesce(sum(amount_minor),0) from public.payments where due_id=d.id)
  - (select coalesce(sum(case when kind='refund' then -amount_minor else amount_minor end),0) from public.payment_adjustments where due_id=d.id)
 into v_left from public.monthly_dues d where id=v_due;
 if v_left<>37000 then raise exception 'BAD_LEDGER_BALANCE %',v_left; end if;
 begin
   perform public.coaching_refund_payment((payment->>'id')::uuid,13000,'Excess refund test',gen_random_uuid());
   raise exception 'OVERREFUND_ALLOWED';
 exception when others then get stacked diagnostics msg=message_text;
  if msg<>'REFUND_EXCEEDS_PAYMENT' then raise; end if;
 end;
 ann:=public.coaching_create_announcement('${b}'::uuid,'Routine update','Monday class starts at noon',null,'${ops[5]}'::uuid);
 published:=public.coaching_publish_announcement((ann->>'id')::uuid,'${ops[6]}'::uuid);
 if published->>'status'<>'published' then raise exception 'ANNOUNCEMENT_NOT_PUBLISHED'; end if;
 notice:=public.coaching_dispatch_batch_notification('${b}'::uuid,gen_random_uuid(),'New routine','Routine has been updated','${ops[7]}'::uuid);
 if (notice->>'delivered')::int<>2 then raise exception 'WRONG_RECIPIENT_COUNT'; end if;
 if (select count(*) from public.notifications where event_id=(notice->>'eventId')::uuid)<>0 then raise exception 'TEACHER_NOTIFICATION_VISIBILITY_LEAK'; end if;
end;
$teacher$;
-- The notification row-count must be checked with a privileged role: authenticated
-- teacher is deliberately blocked by notifications_owner_read RLS.
RESET ROLE;
DO $notification_verify$
declare v_dispatches integer; v_all integer; v_expected integer;
begin
 select count(*) into v_dispatches from public.notification_dispatches
 where batch_id='${b}'::uuid and created_by='${t}'::uuid;
 if v_dispatches<>1 then raise exception 'WRONG_NOTIFICATION_DISPATCHES %',v_dispatches; end if;
 select count(*) into v_all from public.notifications n
 join public.notification_dispatches d on d.event_id=n.event_id
 where d.batch_id='${b}'::uuid and d.created_by='${t}'::uuid;
 select count(*) into v_expected from public.notifications n
 join public.notification_dispatches d on d.event_id=n.event_id
 where d.batch_id='${b}'::uuid and d.created_by='${t}'::uuid
   and n.recipient_id in ('${s1}'::uuid,'${s2}'::uuid);
 if v_all<>2 or v_expected<>2 then raise exception 'WRONG_NOTIFICATION_ROWS all=% expected=%',v_all,v_expected; end if;
end;
$notification_verify$;
SET LOCAL ROLE authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','${s1}',true);
DO $student$
declare msg text; v_count int;
begin
 begin
  perform public.coaching_create_fee_plan('${b}'::uuid,'2026-11',5000,'2026-11-15'::date,'Denied plan',gen_random_uuid());
  raise exception 'STUDENT_WRITE_ALLOWED';
 exception when others then get stacked diagnostics msg=message_text;
  if msg<>'FORBIDDEN' then raise; end if;
 end;
 begin
  update public.monthly_dues set amount_minor=1 where student_id='${s1}'::uuid;
  raise exception 'DIRECT_DML_ALLOWED';
 exception when insufficient_privilege then null;
 end;
 select count(*) into v_count from public.notifications where recipient_id='${s1}'::uuid;
 if v_count<>1 then raise exception 'STUDENT_NOTIFICATION_VISIBILITY_WRONG'; end if;
end;
$student$;
RESET ROLE;
DO $audit$
begin
 if (select count(*) from public.audit_logs where actor_id='${t}'::uuid)<>8 then raise exception 'AUDIT_COUNT'; end if;
 if (select count(*) from public.coaching_mutation_receipts where actor_id='${t}'::uuid)<>8 then raise exception 'RECEIPT_COUNT'; end if;
 if (select count(*) from public.financial_operations where actor_id='${t}'::uuid)<>5 then raise exception 'FINANCIAL_OPERATION_COUNT'; end if;
end;
$audit$;
ROLLBACK;`;
const r=spawnSync('docker',['exec','-i',target,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],{input:sql,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,windowsHide:true});
if(r.error||r.status!==0){console.error('[FAIL] Local Office SQL rollback QA:',r.error?.message??r.stderr?.slice(-4000));process.exit(1);}
console.log('[PASS] Real local SQL: 8 commands, balance=37000, idempotency, refund limit, RLS-private 2-recipient verification, student DML denial, 8 audit/receipts');
console.log('[PASS] All QA fixtures rolled back; no test rows persisted');
