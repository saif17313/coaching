-- Internal: apply active concessions to a plan's dues that have none yet. Each application is a
-- waiver with a deterministic operation id (command operation + due), capped at the remaining balance.
create function public.coaching_apply_concessions_internal(p_plan_id uuid,p_actor uuid,p_operation_id uuid)
returns integer language plpgsql security definer set search_path='' as $function$
declare d record;c record;amount bigint;remaining bigint;op uuid;adj uuid;applied integer:=0;
begin
 for d in select * from public.monthly_dues where fee_plan_id=p_plan_id and not exists(select 1 from public.concession_applications x where x.due_id=monthly_dues.id) order by id for update loop
  select * into c from public.student_fee_concessions where student_id=d.student_id and batch_id=d.batch_id and status='active'
   and starts_period<=d.bill_period and coalesce(ends_period,'9999-12')>=d.bill_period order by created_at limit 1;
  if not found then continue;end if;
  select d.amount_minor-coalesce((select sum(amount_minor) from public.payments where due_id=d.id),0)
   +coalesce((select sum(amount_minor) from public.payment_adjustments where due_id=d.id and kind='refund'),0)
   -coalesce((select sum(amount_minor) from public.payment_adjustments where due_id=d.id and kind in ('waiver','correction')),0) into remaining;
  amount:=least(remaining,case when c.kind='percent' then (d.amount_minor*c.value)/100 else c.value end);
  if amount<=0 then continue;end if;
  op:=(pg_catalog.md5(p_operation_id::text||':'||d.id::text))::uuid;
  insert into public.financial_operations(operation_id,action,target_id,actor_id,response_data) values(op,'finance.concession.waiver',d.id,p_actor,pg_catalog.jsonb_build_object('concessionId',c.id,'amountMinor',amount::text));
  insert into public.payment_adjustments(due_id,payment_id,kind,amount_minor,reason,operation_id,created_by)
   values(d.id,null,'waiver',amount,pg_catalog.left('Concession: '||c.reason,500),op,p_actor) returning id into adj;
  insert into public.concession_applications(due_id,concession_id,adjustment_id) values(d.id,c.id,adj);
  insert into public.audit_logs(actor_id,action,entity_id,details) values(p_actor,'finance.concession.applied',d.id,pg_catalog.jsonb_build_object('concessionId',c.id,'amountMinor',amount::text,'adjustmentId',adj));
  applied:=applied+1;
 end loop;
 return applied;
end;$function$;
revoke all on function public.coaching_apply_concessions_internal(uuid,uuid,uuid) from public,anon,authenticated;

-- Apply active concessions to dues already generated for a fee plan. Re-running is safe.
create function public.coaching_apply_fee_concessions(p_plan_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;f record;applied integer;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_plan_id is null or p_operation_id is null then raise exception 'INVALID_INPUT';end if;
 payload:=pg_catalog.jsonb_build_object('planId',p_plan_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'finance.concessions.applied' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 select * into f from public.fee_plans where id=p_plan_id;
 if not found then raise exception 'PLAN_NOT_FOUND';end if;
 perform 1 from public.batches where id=f.batch_id and not is_archived for update;
 if not found then raise exception 'BATCH_UNAVAILABLE';end if;
 applied:=public.coaching_apply_concessions_internal(p_plan_id,a,p_operation_id);
 result:=pg_catalog.jsonb_build_object('planId',p_plan_id,'applied',applied);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'finance.concessions.applied',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_apply_fee_concessions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.coaching_apply_fee_concessions(uuid,uuid) to authenticated;

-- One-step monthly billing for an open/running batch: uses the fee rule in force for the period to
-- create the period's fee plan if it does not exist (an existing plan is never rewritten), issues dues
-- to every eligible Student (active enrollment, active account, active lifecycle) who has none for the
-- period, then applies active concessions. Re-running for the same period only fills gaps.
create function public.coaching_bill_batch_period(p_batch_id uuid,p_period text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;b record;r record;plan record;created integer;applied integer;plan_created boolean:=false;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_batch_id is null or p_operation_id is null or coalesce(p_period,'') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT';end if;
 payload:=pg_catalog.jsonb_build_object('batchId',p_batch_id,'period',p_period);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'finance.batch.billed' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 select * into b from public.batches where id=p_batch_id for update;
 if not found then raise exception 'BATCH_NOT_FOUND';end if;
 if b.is_archived or b.lifecycle_status not in ('open','running') then raise exception 'BATCH_NOT_BILLABLE';end if;
 select * into plan from public.fee_plans where batch_id=p_batch_id and bill_period=p_period for update;
 if not found then
  select * into r from public.batch_fee_rules where batch_id=p_batch_id and effective_from<=p_period order by effective_from desc limit 1;
  if not found then raise exception 'NO_FEE_RULE';end if;
  insert into public.fee_plans(batch_id,bill_period,amount_minor,due_on,label,created_by)
   values(p_batch_id,p_period,r.monthly_fee_minor,pg_catalog.make_date(split_part(p_period,'-',1)::integer,split_part(p_period,'-',2)::integer,r.due_day),'Monthly tuition '||p_period,a)
   returning * into plan;
  plan_created:=true;
 end if;
 insert into public.monthly_dues(fee_plan_id,student_id,batch_id,bill_period,amount_minor)
  select plan.id,e.student_id,p_batch_id,p_period,plan.amount_minor
  from public.enrollments e join public.profiles p on p.id=e.student_id
  where e.batch_id=p_batch_id and e.status='active' and p.account_status='active' and p.role='student'
   and not exists(select 1 from public.student_lifecycle l where l.student_id=e.student_id and l.status<>'active')
  on conflict do nothing;
 get diagnostics created=row_count;
 applied:=public.coaching_apply_concessions_internal(plan.id,a,p_operation_id);
 result:=pg_catalog.jsonb_build_object('planId',plan.id,'period',p_period,'amountMinor',plan.amount_minor::text,'dueOn',plan.due_on,'planCreated',plan_created,'created',created,'concessionsApplied',applied);
 insert into public.financial_operations(operation_id,action,target_id,actor_id,response_data) values(p_operation_id,'finance.batch.billed',plan.id,a,result);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'finance.batch.billed',plan.id,payload||result);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'finance.batch.billed',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_bill_batch_period(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_bill_batch_period(uuid,text,uuid) to authenticated;

-- Teacher-wide payment ledger: one row per monthly due with its payments, across batches.
-- status: paid | partial | unpaid | waived (derived from payments); overdue = outstanding after the due date.
create function public.coaching_teacher_payment_ledger(p_period text default '',p_batch_id uuid default null,p_status text default '',p_method text default '',p_search text default '',p_student_id uuid default null,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare result jsonb;today date:=(pg_catalog.now() at time zone 'Asia/Dhaka')::date;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_period is null or (p_period<>'' and p_period !~ '^[0-9]{4}(-(0[1-9]|1[0-2]))?$') or p_status is null or p_status not in ('','paid','partial','unpaid','waived','overdue','refunded')
  or p_method is null or p_method not in ('','cash','bank','mobile_banking') or p_search is null or char_length(p_search)>100 or p_search ~ '[[:cntrl:]]'
  or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'INVALID_FILTER';end if;
 with base as (
  select d.id,d.bill_period,d.amount_minor,d.batch_id,d.student_id,f.due_on,f.label,b.name batch_name,b.code batch_code,p.full_name,n.admission_roll,
   coalesce((select sum(x.amount_minor) from public.payments x where x.due_id=d.id),0) paid,
   coalesce((select sum(x.amount_minor) from public.payment_adjustments x where x.due_id=d.id and x.kind='refund'),0) refunded,
   coalesce((select sum(x.amount_minor) from public.payment_adjustments x where x.due_id=d.id and x.kind='waiver'),0) waived,
   coalesce((select sum(x.amount_minor) from public.payment_adjustments x where x.due_id=d.id and x.kind='correction'),0) corrected
  from public.monthly_dues d join public.fee_plans f on f.id=d.fee_plan_id join public.batches b on b.id=d.batch_id join public.profiles p on p.id=d.student_id
  left join public.student_admission_details n on n.student_id=d.student_id
  where (p_period='' or d.bill_period=p_period or (char_length(p_period)=4 and left(d.bill_period,4)=p_period))
   and (p_batch_id is null or d.batch_id=p_batch_id) and (p_student_id is null or d.student_id=p_student_id)
   and (p_search='' or position(lower(p_search) in lower(concat_ws(' ',p.full_name,n.admission_roll,b.name,b.code)))>0)
   and (p_method='' or exists(select 1 from public.payments x where x.due_id=d.id and x.method=p_method))
 ), calc as (
  select *,amount_minor-paid-waived+refunded-corrected outstanding,paid-refunded net_paid from base
 ), labelled as (
  select *,case when outstanding<=0 and net_paid<=0 and waived>0 then 'waived' when outstanding<=0 then 'paid' when net_paid>0 then 'partial' else 'unpaid' end status,
   outstanding>0 and due_on<today overdue from calc
 ), filtered as (
  select * from labelled where p_status='' or status=p_status or (p_status='overdue' and overdue) or (p_status='refunded' and refunded>0)
 ), selected as (select * from filtered order by bill_period desc,due_on desc,full_name,id limit p_limit offset p_offset)
 select pg_catalog.jsonb_build_object(
  'rows',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('dueId',s.id,'period',s.bill_period,'dueOn',s.due_on,'label',s.label,
    'batchId',s.batch_id,'batchName',s.batch_name,'batchCode',s.batch_code,'studentId',s.student_id,'studentName',s.full_name,'admissionRoll',s.admission_roll,
    'amountMinor',s.amount_minor::text,'paidMinor',s.net_paid::text,'waivedMinor',s.waived::text,'refundedMinor',s.refunded::text,'correctedMinor',s.corrected::text,
    'outstandingMinor',greatest(0,s.outstanding)::text,'status',s.status,'overdue',s.overdue,
    'payments',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',x.id,'amountMinor',x.amount_minor::text,'method',x.method,'reference',x.reference,'createdAt',x.created_at,
       'receiptNumber',(select r.receipt_number from public.payment_receipts r where r.payment_id=x.id)) order by x.created_at) from public.payments x where x.due_id=s.id),'[]'::jsonb))
   order by s.bill_period desc,s.due_on desc,s.full_name,s.id) from selected s),'[]'::jsonb),
  'total',(select count(*) from filtered),'limit',p_limit,'offset',p_offset,
  'summary',pg_catalog.jsonb_build_object(
   'expectedMinor',(select coalesce(sum(amount_minor),0) from filtered)::text,
   'collectedMinor',(select coalesce(sum(net_paid),0) from filtered)::text,
   'waivedMinor',(select coalesce(sum(waived),0) from filtered)::text,
   'outstandingMinor',(select coalesce(sum(greatest(0,outstanding)),0) from filtered)::text,
   'paid',(select count(*) from filtered where status='paid'),'partial',(select count(*) from filtered where status='partial'),
   'unpaid',(select count(*) from filtered where status='unpaid'),'waived',(select count(*) from filtered where status='waived'),
   'overdue',(select count(*) from filtered where overdue),
   'methods',pg_catalog.jsonb_build_object(
     'cash',(select coalesce(sum(x.amount_minor),0) from public.payments x join filtered f on f.id=x.due_id where x.method='cash')::text,
     'bank',(select coalesce(sum(x.amount_minor),0) from public.payments x join filtered f on f.id=x.due_id where x.method='bank')::text,
     'mobileBanking',(select coalesce(sum(x.amount_minor),0) from public.payments x join filtered f on f.id=x.due_id where x.method='mobile_banking')::text))) into result;
 return result;
end;$function$;
revoke all on function public.coaching_teacher_payment_ledger(text,uuid,text,text,text,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.coaching_teacher_payment_ledger(text,uuid,text,text,text,uuid,integer,integer) to authenticated;

-- Batch directory v2: lifecycle, admission gate, profile, schedule and current fee. v1 is unchanged.
create function public.coaching_teacher_batch_directory_v2(p_search text default '',p_status text default '',p_admission text default '',p_level text default '',p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare result jsonb;today date:=(pg_catalog.now() at time zone 'Asia/Dhaka')::date;period text:=pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Dhaka','YYYY-MM');
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_search is null or char_length(p_search)>100 or p_search ~ '[[:cntrl:]]' or p_status is null or p_status not in ('','draft','open','running','completed','archived','cancelled','current','upcoming')
  or p_admission is null or p_admission not in ('','open','closed') or p_level is null or char_length(p_level)>80
  or p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'INVALID_FILTER';end if;
 with source as (
  select b.*,
   (select count(*)::integer from public.enrollments e where e.batch_id=b.id and e.status='active') enrolled,
   (select count(*)::integer from public.enrollments e where e.batch_id=b.id and e.status='pending') pending,
   (select count(*)::integer from public.enrollments e where e.batch_id=b.id) total_enrollments,
   (select r.monthly_fee_minor from public.batch_fee_rules r where r.batch_id=b.id and r.effective_from<=period order by r.effective_from desc limit 1) fee_now,
   (select r.monthly_fee_minor from public.batch_fee_rules r where r.batch_id=b.id order by r.effective_from limit 1) fee_first,
   (select r.admission_fee_minor from public.batch_fee_rules r where r.batch_id=b.id and r.effective_from<=period order by r.effective_from desc limit 1) adm_now,
   (select r.admission_fee_minor from public.batch_fee_rules r where r.batch_id=b.id order by r.effective_from limit 1) adm_first,
   coalesce((select pg_catalog.jsonb_agg(s.title order by s.title) from public.academic_subjects s where s.batch_id=b.id),'[]'::jsonb) subjects
  from public.batches b
 ), filtered as (
  select * from source where (p_search='' or position(lower(p_search) in lower(concat_ws(' ',name,code,subject,academic_level)))>0)
   and (p_status='' or lifecycle_status=p_status or (p_status='current' and lifecycle_status in ('open','running')) or (p_status='upcoming' and lifecycle_status in ('draft','open','running') and starts_on>today))
   and (p_admission='' or admission_open=(p_admission='open')) and (p_level='' or academic_level=p_level)
 ), selected as (select * from filtered order by is_archived,lifecycle_status in ('completed'),created_at desc,id limit p_limit offset p_offset)
 select pg_catalog.jsonb_build_object('batches',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'capacity',b.capacity,
   'status',b.lifecycle_status,'admissionOpen',b.admission_open,'isArchived',b.is_archived,'startsOn',b.starts_on,'endsOn',b.ends_on,
   'subject',b.subject,'academicLevel',b.academic_level,'academicSession',b.academic_session,'coverMediaId',b.cover_media_id,
   'scheduleDays',to_jsonb(b.schedule_days),'classStartMinute',b.class_start_minute,'classEndMinute',b.class_end_minute,
   'monthlyFeeMinor',coalesce(b.fee_now,b.fee_first)::text,'admissionFeeMinor',coalesce(b.adm_now,b.adm_first)::text,
   'enrolled',b.enrolled,'pending',b.pending,'availableSeats',greatest(0,b.capacity-b.enrolled),'hasHistory',b.total_enrollments>0,'subjects',b.subjects)
   order by b.is_archived,b.lifecycle_status in ('completed'),b.created_at desc,b.id) from selected b),'[]'::jsonb),
  'total',(select count(*) from filtered),'limit',p_limit,'offset',p_offset,
  'levels',coalesce((select pg_catalog.jsonb_agg(l.academic_level order by l.academic_level) from (select distinct academic_level from source where academic_level<>'') l),'[]'::jsonb),
  'metrics',pg_catalog.jsonb_build_object('total',(select count(*) from source),'running',(select count(*) from source where lifecycle_status='running'),
   'open',(select count(*) from source where lifecycle_status='open'),'draft',(select count(*) from source where lifecycle_status='draft'),
   'completed',(select count(*) from source where lifecycle_status='completed'),'closed',(select count(*) from source where lifecycle_status in ('archived','cancelled')),
   'activeEnrollments',(select coalesce(sum(enrolled),0) from source where not is_archived),'availableSeats',(select coalesce(sum(greatest(0,capacity-enrolled)),0) from source where lifecycle_status in ('open','running')))) into result;
 return result;
end;$function$;
revoke all on function public.coaching_teacher_batch_directory_v2(text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.coaching_teacher_batch_directory_v2(text,text,text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
