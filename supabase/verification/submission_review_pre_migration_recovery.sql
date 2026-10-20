CREATE OR REPLACE FUNCTION public.coaching_list_assignment_submissions(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end;$function$;
