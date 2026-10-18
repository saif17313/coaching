-- Safe projection-only academic readers and recipient-only notification state.
create function public.coaching_get_my_assignment_submission(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());v_batch uuid;v_row record;v_publish boolean;
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student'::public.app_role and account_status='active') then raise exception 'FORBIDDEN'; end if;
 if p_assignment_id is null then raise exception 'INVALID_INPUT'; end if;
 select batch_id,grades_published into v_batch,v_publish from public.academic_assignments where id=p_assignment_id and status in ('published','closed') and release_at<=pg_catalog.now();
 if not found or not exists(select 1 from public.enrollments where student_id=a and batch_id=v_batch and status='active') then raise exception 'NOT_ENROLLED'; end if;
 select * into v_row from public.assignment_submissions where assignment_id=p_assignment_id and student_id=a;
 if not found then return null; end if;
 return pg_catalog.jsonb_build_object('id',v_row.id,'assignmentId',p_assignment_id,'studentId',a,
 'submittedAt',pg_catalog.to_char(v_row.submitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'gradePublished',(v_publish and v_row.grade_status='published'),
 'points',case when v_publish and v_row.grade_status='published' then v_row.points else null end,
 'feedback',case when v_publish and v_row.grade_status='published' then v_row.feedback else null end);
end;$$;
revoke all on function public.coaching_get_my_assignment_submission(uuid) from public,anon,authenticated;
grant execute on function public.coaching_get_my_assignment_submission(uuid) to authenticated;

create function public.coaching_list_assignment_submissions(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());v_batch uuid;v_items jsonb;
begin
 if a is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
 if p_assignment_id is null then raise exception 'INVALID_INPUT'; end if;
 select batch_id into v_batch from public.academic_assignments where id=p_assignment_id;
 if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
 if exists(select 1 from public.assignment_submissions where assignment_id=p_assignment_id offset 50 limit 1) then raise exception 'LIST_TOO_LARGE'; end if;
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',s.id,'assignmentId',s.assignment_id,'studentId',s.student_id,
 'submittedAt',pg_catalog.to_char(s.submitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'gradeStatus',s.grade_status,'points',case when s.grade_status='ungraded' then null else s.points end,
 'feedback',case when s.grade_status='ungraded' then null else s.feedback end) order by s.submitted_at), '[]'::jsonb)
 into v_items from public.assignment_submissions s where s.assignment_id=p_assignment_id;
 return pg_catalog.jsonb_build_object('items',v_items);
end;$$;
revoke all on function public.coaching_list_assignment_submissions(uuid) from public,anon,authenticated;
grant execute on function public.coaching_list_assignment_submissions(uuid) to authenticated;

create function public.coaching_mark_notification_read(p_notification_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(select auth.uid());v_prior record;v_row record;v_result jsonb;v_payload jsonb;
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student'::public.app_role and account_status='active') then raise exception 'FORBIDDEN'; end if;
 if p_notification_id is null or p_operation_id is null then raise exception 'INVALID_INPUT'; end if;
 v_payload:=pg_catalog.jsonb_build_object('notificationId',p_notification_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=a and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'student.notification.read' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return v_prior.result;
 end if;
 select * into v_row from public.notifications where id=p_notification_id and recipient_id=a for update;
 if not found then raise exception 'NOTIFICATION_NOT_FOUND'; end if;
 if v_row.read_at is null then update public.notifications set read_at=pg_catalog.now() where id=p_notification_id returning * into v_row; end if;
 v_result:=pg_catalog.jsonb_build_object('id',v_row.id,'recipientId',a,
  'readAt',pg_catalog.to_char(v_row.read_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'student.notification.read',p_notification_id,v_payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
  values(a,p_operation_id,'student.notification.read',v_payload,v_result);
 return v_result;
end;$$;
revoke all on function public.coaching_mark_notification_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.coaching_mark_notification_read(uuid,uuid) to authenticated;

create function public.coaching_count_my_unread_notifications()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());v_count bigint;
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student'::public.app_role and account_status='active') then raise exception 'FORBIDDEN'; end if;
 select count(*) into v_count from public.notifications where recipient_id=a and read_at is null;
 return pg_catalog.jsonb_build_object('unreadCount',v_count);
end;$$;
revoke all on function public.coaching_count_my_unread_notifications() from public,anon,authenticated;
grant execute on function public.coaching_count_my_unread_notifications() to authenticated;
