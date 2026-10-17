-- Teacher-only exam draft marking, never direct write access or student draft-score exposure.
-- Mark publication and rankings require separately-reviewed atomic RPCs.
create function public.coaching_save_exam_result_draft(p_exam_id uuid, p_student_id uuid, p_marks numeric, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_payload jsonb;
  v_result jsonb;
  v_id uuid;
  v_batch uuid;
  v_max integer;
  v_status text;
  v_archived boolean;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_exam_id is null or p_student_id is null or p_operation_id is null or p_marks is null or p_marks<0 or p_marks>10000 or p_marks<>round(p_marks,2) then raise exception 'INVALID_MARKS'; end if;
  v_payload := pg_catalog.jsonb_build_object('examId',p_exam_id,'studentId',p_student_id,'marks',p_marks);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'academic.exam.result.draft.saved' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select batch_id into v_batch from public.exams where id=p_exam_id;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;
  select is_archived into v_archived from public.batches where id=v_batch for update;
  if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
  select max_marks,status into v_max,v_status from public.exams where id=p_exam_id for update;
  if not found or v_status not in ('draft','published') then raise exception 'EXAM_NOT_EDITABLE'; end if;
  if p_marks>v_max then raise exception 'MARKS_EXCEED_MAX'; end if;
  if not exists(select 1 from public.profiles where id=p_student_id and role='student'::public.app_role and account_status='active'::public.account_status)
    then raise exception 'STUDENT_NOT_ACTIVE'; end if;
  if not exists(select 1 from public.enrollments where batch_id=v_batch and student_id=p_student_id and status='active')
    then raise exception 'STUDENT_NOT_ENROLLED'; end if;
  insert into public.exam_results(exam_id,student_id,marks,result_status,rank,graded_by)
    values(p_exam_id,p_student_id,p_marks,'draft',null,v_actor)
    on conflict (exam_id,student_id) do update set
      marks=excluded.marks,result_status='draft',rank=null,graded_by=excluded.graded_by,updated_at=now()
    where public.exam_results.result_status='draft'
    returning id into v_id;
  if v_id is null then raise exception 'RESULT_ALREADY_PUBLISHED'; end if;
  v_result:=pg_catalog.jsonb_build_object('id',v_id,'examId',p_exam_id,'studentId',p_student_id,'marks',p_marks,'resultStatus','draft');
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'academic.exam.result.draft.saved',v_id,v_payload);
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'academic.exam.result.draft.saved',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_save_exam_result_draft(uuid,uuid,numeric,uuid) from public,anon,authenticated;
grant execute on function public.coaching_save_exam_result_draft(uuid,uuid,numeric,uuid) to authenticated;
