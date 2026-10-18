-- Part F: atomic teacher finance commands. LOCAL DB FIRST; remote approval required.
-- Immutable payment postings, integer BDT minor units, row-locked balances,
-- no direct client DML or additional RLS table policies.
create function public.coaching_create_fee_plan(p_batch_id uuid,p_period text,p_amount_minor bigint,p_due_on date,p_label text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := (select auth.uid());
 v_prior record;
 v_payload jsonb;
 v_result jsonb;
v_id uuid; v_archived boolean;
begin
if p_batch_id is null or p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_amount_minor is null or p_amount_minor not between 1 and 100000000000 or p_due_on is null or p_due_on < (p_period||'-01')::date or p_label is null or pg_catalog.char_length(pg_catalog.btrim(p_label)) not between 2 and 120 then raise exception 'INVALID_PLAN'; end if;
 v_payload := pg_catalog.jsonb_build_object('batchId',p_batch_id,'period',p_period,'amountMinor',p_amount_minor,'dueOn',p_due_on,'label',pg_catalog.btrim(p_label));

  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'finance.fee_plan.created' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
select is_archived into v_archived from public.batches where id=p_batch_id for update;
if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
insert into public.fee_plans(batch_id,bill_period,amount_minor,due_on,label,created_by) values(p_batch_id,p_period,p_amount_minor,p_due_on,pg_catalog.btrim(p_label),v_actor) returning id into v_id;
v_result:=pg_catalog.jsonb_build_object('id',v_id,'batchId',p_batch_id,'period',p_period,'amountMinor',p_amount_minor,'dueOn',p_due_on,'label',pg_catalog.btrim(p_label));
insert into public.financial_operations(operation_id,action,target_id,actor_id,response_data) values (p_operation_id,'finance.fee_plan.created',v_id,v_actor,v_result);
insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'finance.fee_plan.created',v_id,v_payload);
insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(v_actor,p_operation_id,'finance.fee_plan.created',v_payload,v_result);
return v_result;
end;
$$;
revoke all on function public.coaching_create_fee_plan(uuid,text,bigint,date,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_create_fee_plan(uuid,text,bigint,date,text,uuid) to authenticated;

create function public.coaching_generate_monthly_dues(p_plan_id uuid,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := (select auth.uid());
 v_prior record;
 v_payload jsonb;
 v_result jsonb;
v_plan record; v_archived boolean; v_created integer;
begin
if p_plan_id is null then raise exception 'INVALID_PLAN'; end if;
 v_payload := pg_catalog.jsonb_build_object('planId',p_plan_id);

  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'finance.dues.generated' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
select batch_id into v_plan from public.fee_plans where id=p_plan_id;
if not found then raise exception 'PLAN_NOT_FOUND'; end if;
select is_archived into v_archived from public.batches where id=v_plan.batch_id for update;
if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
select * into v_plan from public.fee_plans where id=p_plan_id for update;
insert into public.monthly_dues(fee_plan_id,student_id,batch_id,bill_period,amount_minor)
select v_plan.id,e.student_id,v_plan.batch_id,v_plan.bill_period,v_plan.amount_minor
from public.enrollments e join public.profiles p on p.id=e.student_id
where e.batch_id=v_plan.batch_id and e.status='active' and p.account_status='active' and p.role='student'
on conflict (fee_plan_id,student_id) do nothing;
get diagnostics v_created=row_count;
v_result:=pg_catalog.jsonb_build_object('planId',p_plan_id,'created',v_created);
insert into public.financial_operations(operation_id,action,target_id,actor_id,response_data) values (p_operation_id,'finance.dues.generated',p_plan_id,v_actor,v_result);
insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'finance.dues.generated',p_plan_id,v_payload);
insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(v_actor,p_operation_id,'finance.dues.generated',v_payload,v_result);
return v_result;
end;
$$;
revoke all on function public.coaching_generate_monthly_dues(uuid,uuid) from public,anon,authenticated;
grant execute on function public.coaching_generate_monthly_dues(uuid,uuid) to authenticated;

create function public.coaching_post_payment(p_due_id uuid,p_student_id uuid,p_amount_minor bigint,p_method text,p_reference text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := (select auth.uid());
 v_prior record;
 v_payload jsonb;
 v_result jsonb;
v_due record; v_paid bigint; v_waived bigint; v_refunded bigint; v_remaining bigint; v_id uuid; v_archived boolean;
begin
if p_due_id is null or p_student_id is null or p_amount_minor is null or p_amount_minor not between 1 and 100000000000 or p_method is null or p_method not in ('cash','bank','mobile_banking') or p_reference is null or pg_catalog.char_length(p_reference)>120 or p_reference ~ '[[:cntrl:]]' then raise exception 'INVALID_PAYMENT'; end if;
 v_payload := pg_catalog.jsonb_build_object('dueId',p_due_id,'studentId',p_student_id,'amountMinor',p_amount_minor,'method',p_method,'reference',pg_catalog.btrim(p_reference));

  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'finance.payment.posted' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
select * into v_due from public.monthly_dues where id=p_due_id;
if not found or v_due.student_id<>p_student_id then raise exception 'DUE_NOT_FOUND'; end if;
select is_archived into v_archived from public.batches where id=v_due.batch_id for update;
if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
select * into v_due from public.monthly_dues where id=p_due_id for update;
select coalesce(sum(amount_minor),0) into v_paid from public.payments where due_id=p_due_id;
select coalesce(sum(case when kind='waiver' then amount_minor when kind='refund' then -amount_minor else amount_minor end),0) into v_waived from public.payment_adjustments where due_id=p_due_id;
v_remaining:=v_due.amount_minor-v_paid-v_waived;
if v_remaining<0 or p_amount_minor>v_remaining then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;
v_id:=pg_catalog.gen_random_uuid();
-- Financial operation must exist before the FK-dependent payment row; response finalized below.
insert into public.financial_operations(operation_id,action,target_id,actor_id,response_data) values(p_operation_id,'finance.payment.posted',p_due_id,v_actor,null);
insert into public.payments(id,due_id,student_id,amount_minor,method,reference,operation_id,created_by)
values(v_id,p_due_id,p_student_id,p_amount_minor,p_method,pg_catalog.btrim(p_reference),p_operation_id,v_actor);
v_result:=pg_catalog.jsonb_build_object('id',v_id,'dueId',p_due_id,'studentId',p_student_id,'amountMinor',p_amount_minor,'method',p_method);
update public.financial_operations set response_data=v_result where operation_id=p_operation_id;
insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'finance.payment.posted',p_due_id,v_payload);
insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(v_actor,p_operation_id,'finance.payment.posted',v_payload,v_result);
return v_result;
end;
$$;
revoke all on function public.coaching_post_payment(uuid,uuid,bigint,text,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_post_payment(uuid,uuid,bigint,text,text,uuid) to authenticated;

create function public.coaching_waive_due(p_due_id uuid,p_amount_minor bigint,p_reason text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := (select auth.uid());
 v_prior record;
 v_payload jsonb;
 v_result jsonb;
v_due record; v_paid bigint; v_adjusted bigint; v_remaining bigint; v_id uuid; v_archived boolean;
begin
if p_due_id is null or p_amount_minor is null or p_amount_minor not between 1 and 100000000000 or p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 5 and 500 then raise exception 'INVALID_WAIVER'; end if;
 v_payload := pg_catalog.jsonb_build_object('dueId',p_due_id,'amountMinor',p_amount_minor,'reason',pg_catalog.btrim(p_reason));

  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'finance.due.waived' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
select * into v_due from public.monthly_dues where id=p_due_id;
if not found then raise exception 'DUE_NOT_FOUND'; end if;
select is_archived into v_archived from public.batches where id=v_due.batch_id for update;
if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
select * into v_due from public.monthly_dues where id=p_due_id for update;
select coalesce(sum(amount_minor),0) into v_paid from public.payments where due_id=p_due_id;
select coalesce(sum(case when kind='refund' then -amount_minor else amount_minor end),0) into v_adjusted from public.payment_adjustments where due_id=p_due_id;
v_remaining:=v_due.amount_minor-v_paid-v_adjusted;
if v_remaining<0 or p_amount_minor>v_remaining then raise exception 'WAIVER_EXCEEDS_BALANCE'; end if;
v_id:=pg_catalog.gen_random_uuid();
insert into public.financial_operations(operation_id,action,target_id,actor_id,response_data) values(p_operation_id,'finance.due.waived',p_due_id,v_actor,null);
insert into public.payment_adjustments(id,due_id,payment_id,kind,amount_minor,reason,operation_id,created_by)
values(v_id,p_due_id,null,'waiver',p_amount_minor,pg_catalog.btrim(p_reason),p_operation_id,v_actor);
v_result:=pg_catalog.jsonb_build_object('id',v_id,'dueId',p_due_id,'paymentId',null,'kind','waiver','amountMinor',p_amount_minor);
update public.financial_operations set response_data=v_result where operation_id=p_operation_id;
insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'finance.due.waived',p_due_id,v_payload);
insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(v_actor,p_operation_id,'finance.due.waived',v_payload,v_result);
return v_result;
end;
$$;
revoke all on function public.coaching_waive_due(uuid,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_waive_due(uuid,bigint,text,uuid) to authenticated;

create function public.coaching_refund_payment(p_payment_id uuid,p_amount_minor bigint,p_reason text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := (select auth.uid());
 v_prior record;
 v_payload jsonb;
 v_result jsonb;
v_payment record; v_due record; v_refunded bigint; v_id uuid; v_archived boolean;
begin
if p_payment_id is null or p_amount_minor is null or p_amount_minor not between 1 and 100000000000 or p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 5 and 500 then raise exception 'INVALID_REFUND'; end if;
 v_payload := pg_catalog.jsonb_build_object('paymentId',p_payment_id,'amountMinor',p_amount_minor,'reason',pg_catalog.btrim(p_reason));

  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'finance.payment.refunded' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
select * into v_payment from public.payments where id=p_payment_id;
if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
select * into v_due from public.monthly_dues where id=v_payment.due_id;
if not found then raise exception 'DUE_NOT_FOUND'; end if;
select is_archived into v_archived from public.batches where id=v_due.batch_id for update;
if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
perform 1 from public.monthly_dues where id=v_payment.due_id for update;
select * into v_payment from public.payments where id=p_payment_id for update;
select coalesce(sum(amount_minor),0) into v_refunded from public.payment_adjustments where payment_id=p_payment_id and kind='refund';
if p_amount_minor>v_payment.amount_minor-v_refunded then raise exception 'REFUND_EXCEEDS_PAYMENT'; end if;
v_id:=pg_catalog.gen_random_uuid();
insert into public.financial_operations(operation_id,action,target_id,actor_id,response_data) values(p_operation_id,'finance.payment.refunded',p_payment_id,v_actor,null);
insert into public.payment_adjustments(id,due_id,payment_id,kind,amount_minor,reason,operation_id,created_by)
values(v_id,v_payment.due_id,p_payment_id,'refund',p_amount_minor,pg_catalog.btrim(p_reason),p_operation_id,v_actor);
v_result:=pg_catalog.jsonb_build_object('id',v_id,'dueId',v_payment.due_id,'paymentId',p_payment_id,'kind','refund','amountMinor',p_amount_minor);
update public.financial_operations set response_data=v_result where operation_id=p_operation_id;
insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'finance.payment.refunded',p_payment_id,v_payload);
insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(v_actor,p_operation_id,'finance.payment.refunded',v_payload,v_result);
return v_result;
end;
$$;
revoke all on function public.coaching_refund_payment(uuid,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_refund_payment(uuid,bigint,text,uuid) to authenticated;
