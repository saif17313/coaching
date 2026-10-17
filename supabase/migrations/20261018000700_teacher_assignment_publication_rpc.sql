-- 014: teacher-owned audited assignment publication, no client table-write grants.
create function public.coaching_publish_assignment(p_assignment_id uuid,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := (select auth.uid());
 v_prior record;
 v_batch uuid;
 v_archived boolean;
 v_status text;
 v_due timestamptz;
 v_result jsonb;
 v_payload jsonb;
begin
 if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
 if p_assignment_id is null or p_operation_id is null then raise exception 'INVALID_INPUT'; end if;
 v_payload:=pg_catalog.jsonb_build_object('assignmentId',p_assignment_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
   where actor_id=v_actor and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'academic.assignment.published' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return v_prior.result;
 end if;
 select batch_id into v_batch from public.academic_assignments where id=p_assignment_id;
 if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
 select is_archived into v_archived from public.batches where id=v_batch for update;
 if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
 select status,due_at into v_status,v_due from public.academic_assignments where id=p_assignment_id and batch_id=v_batch for update;
 if not found or v_status<>'draft' then raise exception 'ASSIGNMENT_NOT_DRAFT'; end if;
 if v_due<=pg_catalog.now() then raise exception 'ASSIGNMENT_EXPIRED'; end if;
 update public.academic_assignments set status='published',updated_at=pg_catalog.now() where id=p_assignment_id;
 v_result:=pg_catalog.jsonb_build_object('id',p_assignment_id,'status','published');
 insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'academic.assignment.published',p_assignment_id,v_payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
 values(v_actor,p_operation_id,'academic.assignment.published',v_payload,v_result);
 return v_result;
end;
$$;
revoke all on function public.coaching_publish_assignment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.coaching_publish_assignment(uuid,uuid) to authenticated;
