-- Musa Sir Phase 3 final DB hardening. Local QA required before cloud deployment.
-- Existing migrations 00100-00700 are immutable.
-- Removing table DML grants does not affect postgres-owned SECURITY DEFINER RPCs.
revoke insert, update, delete on table public.profiles from anon, authenticated;
revoke insert, update, delete on table public.enrollments from anon, authenticated;

-- Serializes approval with a concurrent account status transition.
-- Lock order: batch -> enrollment -> student profile.
-- A later disable may still leave an active enrollment record; all reads must
-- enforce the active-account gate. This change prevents a stale approval.
create or replace function public.coaching_decide_enrollment(
  p_enrollment_id uuid, p_decision text, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_enrollment record;
  v_batch uuid;
  v_active integer;
  v_capacity integer;
  v_archived boolean;
  v_student_status public.account_status;
  v_status public.enrollment_status;
  v_payload jsonb := jsonb_build_object('enrollmentId',p_enrollment_id,'decision',p_decision);
  v_result jsonb;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_enrollment_id is null or p_operation_id is null or (p_decision is null or p_decision not in ('approve','reject','cancel')) then raise exception 'INVALID_COMMAND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'enrollment-decision' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select batch_id into v_batch from public.enrollments where id=p_enrollment_id;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND'; end if;
  -- A batch lock serializes capacity-changing commands with approvals.
  select capacity,is_archived into v_capacity,v_archived from public.batches where id=v_batch for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  select id,student_id,status,batch_id into v_enrollment from public.enrollments where id=p_enrollment_id for update;
  if not found or v_enrollment.batch_id<>v_batch then raise exception 'ENROLLMENT_CHANGED'; end if;
  if p_decision='approve' then
    if v_enrollment.status<>'pending' or v_archived then raise exception 'INVALID_ENROLLMENT_TRANSITION'; end if;
    select account_status into v_student_status from public.profiles
      where id=v_enrollment.student_id and role='student'::public.app_role for update;
    if v_student_status is distinct from 'active'::public.account_status then raise exception 'STUDENT_NOT_ACTIVE'; end if;
    select count(*) into v_active from public.enrollments where batch_id=v_batch and status='active';
    if v_active>=v_capacity then raise exception 'BATCH_FULL'; end if;
    v_status:='active';
  elsif p_decision='reject' then
    if v_enrollment.status<>'pending' then raise exception 'INVALID_ENROLLMENT_TRANSITION'; end if;
    v_status:='rejected';
  else
    if v_enrollment.status not in ('pending','active') then raise exception 'INVALID_ENROLLMENT_TRANSITION'; end if;
    v_status:='cancelled';
  end if;
  update public.enrollments set status=v_status,decided_at=now() where id=p_enrollment_id;
  v_result:=jsonb_build_object('id',p_enrollment_id,'status',v_status);
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'enrollment.decided',p_enrollment_id,jsonb_build_object('from',v_enrollment.status,'to',v_status));
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'enrollment-decision',v_payload,v_result);
  return v_result;
end;
$$;

-- Preserve existing authenticated-only RPC execution privilege and reject anon.
revoke all on function public.coaching_decide_enrollment(uuid,text,uuid) from public, anon;
grant execute on function public.coaching_decide_enrollment(uuid,text,uuid) to authenticated;
