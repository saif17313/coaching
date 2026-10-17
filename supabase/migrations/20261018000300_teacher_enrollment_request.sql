-- Teacher Admin: create a pending request for an existing active student and open batch.
-- Approval/capacity enforcement remains exclusively in coaching_decide_enrollment RPC.
create function public.coaching_request_enrollment(
  p_student_id uuid, p_batch_id uuid, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_archived boolean;
  v_student_status public.account_status;
  v_id uuid;
  v_payload jsonb := pg_catalog.jsonb_build_object('studentId',p_student_id,'batchId',p_batch_id);
  v_result jsonb;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_student_id is null or p_batch_id is null or p_operation_id is null
    then raise exception 'INVALID_ENROLLMENT_REQUEST'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type <> 'enrollment-request' or v_prior.payload <> v_payload
      then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  -- Same batch-first lock order as approval/capacity changes.
  select is_archived into v_archived from public.batches where id=p_batch_id for update;
  if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
  select account_status into v_student_status from public.profiles
    where id=p_student_id and role='student'::public.app_role for update;
  if not found or v_student_status <> 'active'::public.account_status
    then raise exception 'STUDENT_NOT_ACTIVE'; end if;
  if exists(select 1 from public.enrollments where student_id=p_student_id and batch_id=p_batch_id)
    then raise exception 'ENROLLMENT_ALREADY_EXISTS'; end if;
  insert into public.enrollments(student_id,batch_id,status)
    values(p_student_id,p_batch_id,'pending'::public.enrollment_status) returning id into v_id;
  v_result:=pg_catalog.jsonb_build_object('id',v_id,'studentId',p_student_id,'batchId',p_batch_id,'status','pending');
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'enrollment.requested',v_id,
      pg_catalog.jsonb_build_object('studentId',p_student_id,'batchId',p_batch_id));
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'enrollment-request',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_request_enrollment(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.coaching_request_enrollment(uuid,uuid,uuid) to authenticated;
