-- Teacher academic draft creation. Publication deliberately remains a separate reviewed capability.
-- Uses existing authorization, receipts and audit tables; no direct table grants.
create function public.coaching_create_assignment_draft(p_batch_id uuid, p_subject_id uuid, p_title text, p_instructions text, p_release_at timestamptz, p_due_at timestamptz, p_max_points integer, p_allow_resubmit boolean, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_payload jsonb;
  v_result jsonb;
  v_id uuid;
  v_archived boolean;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_batch_id is null or p_subject_id is null or p_operation_id is null or p_title is null or char_length(trim(p_title)) not between 2 and 160 or p_instructions is null or char_length(trim(p_instructions)) not between 2 and 20000 or p_release_at is null or p_due_at is null or p_due_at<=p_release_at or p_max_points is null or p_max_points not between 1 and 1000 or p_allow_resubmit is null then raise exception 'INVALID_ASSIGNMENT'; end if;
  v_payload := pg_catalog.jsonb_build_object('batchId',p_batch_id,'subjectId',p_subject_id,'title',trim(p_title),'instructions',trim(p_instructions),'releaseAt',p_release_at,'dueAt',p_due_at,'maxPoints',p_max_points,'allowResubmit',p_allow_resubmit);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'academic.assignment.draft.created' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select is_archived into v_archived from public.batches where id=p_batch_id for update;
  if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
  if not exists(select 1 from public.academic_subjects where id=p_subject_id and batch_id=p_batch_id)
    then raise exception 'SUBJECT_BATCH_MISMATCH'; end if;
  insert into public.academic_assignments(batch_id,subject_id,title,instructions,release_at,due_at,max_points,allow_resubmit,created_by)
    values(p_batch_id,p_subject_id,trim(p_title),trim(p_instructions),p_release_at,p_due_at,p_max_points,p_allow_resubmit,v_actor) returning id into v_id;
  v_result:=pg_catalog.jsonb_build_object('id',v_id,'batchId',p_batch_id,'subjectId',p_subject_id,'title',trim(p_title),'status','draft');
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'academic.assignment.draft.created',v_id,v_payload);
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'academic.assignment.draft.created',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_create_assignment_draft(uuid,uuid,text,text,timestamptz,timestamptz,integer,boolean,uuid) from public,anon,authenticated;
grant execute on function public.coaching_create_assignment_draft(uuid,uuid,text,text,timestamptz,timestamptz,integer,boolean,uuid) to authenticated;
create function public.coaching_create_exam_draft(p_batch_id uuid, p_subject_id uuid, p_title text, p_scheduled_at timestamptz, p_max_marks integer, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_payload jsonb;
  v_result jsonb;
  v_id uuid;
  v_archived boolean;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_batch_id is null or p_subject_id is null or p_operation_id is null or p_title is null or char_length(trim(p_title)) not between 2 and 120 or p_scheduled_at is null or p_max_marks is null or p_max_marks not between 1 and 10000 then raise exception 'INVALID_EXAM'; end if;
  v_payload := pg_catalog.jsonb_build_object('batchId',p_batch_id,'subjectId',p_subject_id,'title',trim(p_title),'scheduledAt',p_scheduled_at,'maxMarks',p_max_marks);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'academic.exam.draft.created' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select is_archived into v_archived from public.batches where id=p_batch_id for update;
  if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
  if not exists(select 1 from public.academic_subjects where id=p_subject_id and batch_id=p_batch_id)
    then raise exception 'SUBJECT_BATCH_MISMATCH'; end if;
  insert into public.exams(batch_id,subject_id,title,scheduled_at,max_marks,created_by)
    values(p_batch_id,p_subject_id,trim(p_title),p_scheduled_at,p_max_marks,v_actor) returning id into v_id;
  v_result:=pg_catalog.jsonb_build_object('id',v_id,'batchId',p_batch_id,'subjectId',p_subject_id,'title',trim(p_title),'status','draft');
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'academic.exam.draft.created',v_id,v_payload);
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'academic.exam.draft.created',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_create_exam_draft(uuid,uuid,text,timestamptz,integer,uuid) from public,anon,authenticated;
grant execute on function public.coaching_create_exam_draft(uuid,uuid,text,timestamptz,integer,uuid) to authenticated;
