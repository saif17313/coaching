-- 015: teacher exam publication and atomic, stable competition-ranking publication.
-- All graders lock batch -> exam -> result rows, consistent with draft-mark writer.
create function public.coaching_publish_exam(p_exam_id uuid,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid:=(select auth.uid());
 v_prior record;v_batch uuid;v_archived boolean;v_status text;v_result jsonb;
 v_payload jsonb;
begin
 if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
 if p_exam_id is null or p_operation_id is null then raise exception 'INVALID_INPUT'; end if;
 v_payload:=pg_catalog.jsonb_build_object('examId',p_exam_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
 where actor_id=v_actor and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'academic.exam.published' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return v_prior.result;
 end if;
 select batch_id into v_batch from public.exams where id=p_exam_id;
 if not found then raise exception 'EXAM_NOT_FOUND'; end if;
 select is_archived into v_archived from public.batches where id=v_batch for update;
 if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
 select status into v_status from public.exams where id=p_exam_id and batch_id=v_batch for update;
 if not found or v_status<>'draft' then raise exception 'EXAM_NOT_DRAFT'; end if;
 update public.exams set status='published',updated_at=pg_catalog.now() where id=p_exam_id;
 v_result:=pg_catalog.jsonb_build_object('id',p_exam_id,'status','published');
 insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'academic.exam.published',p_exam_id,v_payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
 values(v_actor,p_operation_id,'academic.exam.published',v_payload,v_result);
 return v_result;
end;
$$;
revoke all on function public.coaching_publish_exam(uuid,uuid) from public,anon,authenticated;
grant execute on function public.coaching_publish_exam(uuid,uuid) to authenticated;

create function public.coaching_publish_exam_results(p_exam_id uuid,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid:=(select auth.uid());v_prior record;v_batch uuid;v_archived boolean;
 v_status text;v_scheduled timestamptz;v_max integer;v_total integer;v_invalid integer;
 v_result jsonb;v_payload jsonb;
begin
 if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
 if p_exam_id is null or p_operation_id is null then raise exception 'INVALID_INPUT'; end if;
 v_payload:=pg_catalog.jsonb_build_object('examId',p_exam_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
 where actor_id=v_actor and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'academic.exam.results.published' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return v_prior.result;
 end if;
 select batch_id into v_batch from public.exams where id=p_exam_id;
 if not found then raise exception 'EXAM_NOT_FOUND'; end if;
 select is_archived into v_archived from public.batches where id=v_batch for update;
 if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
 select status,scheduled_at,max_marks into v_status,v_scheduled,v_max from public.exams
 where id=p_exam_id and batch_id=v_batch for update;
 if not found or v_status<>'published' then raise exception 'EXAM_NOT_PUBLISHED'; end if;
 if v_scheduled>pg_catalog.now() then raise exception 'EXAM_NOT_HELD'; end if;
 -- Serializes with draft grading (both use the exam row lock). Lock all results deterministically.
 perform id from public.exam_results where exam_id=p_exam_id order by id for update;
 select count(*)::integer,count(*) filter(where er.result_status<>'draft' or er.marks is null
    or er.marks<0 or er.marks>v_max or p.id is null or p.role<>'student'::public.app_role
    or p.account_status<>'active'::public.account_status or e.id is null)::integer
 into v_total,v_invalid from public.exam_results er
 left join public.profiles p on p.id=er.student_id
 left join public.enrollments e on e.student_id=er.student_id and e.batch_id=v_batch and e.status='active'
 where er.exam_id=p_exam_id;
 if v_total=0 or v_total>1000000 or v_invalid<>0 then raise exception 'RESULT_SET_NOT_READY'; end if;
 with ranked as (
   select id,pg_catalog.rank() over (order by marks desc)::integer as pos
   from public.exam_results where exam_id=p_exam_id
 )
 update public.exam_results er
 set rank=ranked.pos,result_status='published',updated_at=pg_catalog.now()
 from ranked where er.id=ranked.id;
 v_result:=pg_catalog.jsonb_build_object('examId',p_exam_id,'status','published','publishedCount',v_total);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'academic.exam.results.published',p_exam_id,v_payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
 values(v_actor,p_operation_id,'academic.exam.results.published',v_payload,v_result);
 return v_result;
end;
$$;
revoke all on function public.coaching_publish_exam_results(uuid,uuid) from public,anon,authenticated;
grant execute on function public.coaching_publish_exam_results(uuid,uuid) to authenticated;
