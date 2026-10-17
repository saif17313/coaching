-- Teacher Academic Control Part C1: authenticated-only, audited and idempotent RPCs.
-- Direct INSERT/UPDATE/DELETE privileges on academic base tables remain revoked.
-- CLOUD DEPLOYMENT REQUIRES EXPLICIT APPROVAL. Apply locally first.
create function public.coaching_create_subject(p_batch_id uuid, p_code text, p_title text, p_operation_id uuid) returns jsonb
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
  if p_batch_id is null or p_operation_id is null or p_code is null or p_code !~ '^[A-Z0-9][A-Z0-9_-]{1,23}$' or p_title is null or char_length(trim(p_title)) not between 2 and 120 then raise exception 'INVALID_SUBJECT'; end if;
  v_payload := pg_catalog.jsonb_build_object('batchId',p_batch_id,'code',p_code,'title',trim(p_title));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'academic.subject.created' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select is_archived into v_archived from public.batches where id=p_batch_id for update;
  if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
  insert into public.academic_subjects(batch_id,code,title,created_by)
    values(p_batch_id,p_code,trim(p_title),v_actor) returning id into v_id;
  v_result:=pg_catalog.jsonb_build_object('id',v_id,'batchId',p_batch_id,'code',p_code,'title',trim(p_title));
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'academic.subject.created',v_id,v_payload);
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'academic.subject.created',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_create_subject(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_create_subject(uuid,text,text,uuid) to authenticated;
create function public.coaching_add_syllabus_unit(p_subject_id uuid, p_title text, p_position integer, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_payload jsonb;
  v_result jsonb;
  v_id uuid;
  v_batch uuid;
  v_archived boolean;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_subject_id is null or p_operation_id is null or p_title is null or char_length(trim(p_title)) not between 2 and 160 or p_position is null or p_position not between 1 and 10000 then raise exception 'INVALID_UNIT'; end if;
  v_payload := pg_catalog.jsonb_build_object('subjectId',p_subject_id,'title',trim(p_title),'position',p_position);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'academic.syllabus.created' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select batch_id into v_batch from public.academic_subjects where id=p_subject_id;
  if not found then raise exception 'SUBJECT_NOT_FOUND'; end if;
  select is_archived into v_archived from public.batches where id=v_batch for update;
  if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
  insert into public.syllabus_units(subject_id,title,position)
    values(p_subject_id,trim(p_title),p_position) returning id into v_id;
  v_result:=pg_catalog.jsonb_build_object('id',v_id,'subjectId',p_subject_id,'title',trim(p_title),'position',p_position);
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'academic.syllabus.created',v_id,v_payload);
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'academic.syllabus.created',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_add_syllabus_unit(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.coaching_add_syllabus_unit(uuid,text,integer,uuid) to authenticated;
create function public.coaching_create_routine_slot(p_batch_id uuid, p_subject_id uuid, p_day_of_week integer, p_start_minute integer, p_end_minute integer, p_room text, p_operation_id uuid) returns jsonb
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
  if p_batch_id is null or p_subject_id is null or p_operation_id is null or p_day_of_week is null or p_day_of_week not between 0 and 6 or p_start_minute is null or p_start_minute not between 0 and 1439 or p_end_minute is null or p_end_minute not between 1 and 1440 or p_end_minute<=p_start_minute or p_room is null or char_length(p_room)>100 then raise exception 'INVALID_ROUTINE'; end if;
  v_payload := pg_catalog.jsonb_build_object('batchId',p_batch_id,'subjectId',p_subject_id,'dayOfWeek',p_day_of_week,'startMinute',p_start_minute,'endMinute',p_end_minute,'room',trim(p_room));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'academic.routine.created' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select is_archived into v_archived from public.batches where id=p_batch_id for update;
  if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
  if not exists(select 1 from public.academic_subjects where id=p_subject_id and batch_id=p_batch_id)
    then raise exception 'SUBJECT_BATCH_MISMATCH'; end if;
  -- routine_batch_overlap_exclusion blocks overlapping slots within the same batch/day.
  insert into public.routine_slots(batch_id,subject_id,day_of_week,start_minute,end_minute,room,created_by)
    values(p_batch_id,p_subject_id,p_day_of_week,p_start_minute,p_end_minute,trim(p_room),v_actor) returning id into v_id;
  v_result:=pg_catalog.jsonb_build_object('id',v_id,'batchId',p_batch_id,'subjectId',p_subject_id,
    'dayOfWeek',p_day_of_week,'startMinute',p_start_minute,'endMinute',p_end_minute,'room',trim(p_room),'status','active');
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'academic.routine.created',v_id,v_payload);
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'academic.routine.created',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_create_routine_slot(uuid,uuid,integer,integer,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_create_routine_slot(uuid,uuid,integer,integer,integer,text,uuid) to authenticated;
