-- Canonical integer strings for centimarks after numeric(10,2) marks are aggregated.
CREATE OR REPLACE FUNCTION public.coaching_student_progress()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=(select auth.uid());v_exams bigint;v_earned numeric;v_possible numeric;v_assign bigint;v_points numeric;v_possible_points numeric;
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student'::public.app_role and account_status='active') then raise exception 'FORBIDDEN'; end if;
 select count(*),coalesce(sum(r.marks*100),0),coalesce(sum(x.max_marks*100),0) into v_exams,v_earned,v_possible from public.exam_results r join public.exams x on x.id=r.exam_id where r.student_id=a and r.result_status='published' and x.status='published' and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active');
 select count(*),coalesce(sum(s.points),0),coalesce(sum(x.max_points),0) into v_assign,v_points,v_possible_points from public.assignment_submissions s join public.academic_assignments x on x.id=s.assignment_id where s.student_id=a and s.grade_status='published' and x.grades_published and x.status in ('published','closed') and x.release_at<=pg_catalog.now() and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active');
 return pg_catalog.jsonb_build_object('studentId',a,'publishedExamResults',v_exams,'gradedAssignments',v_assign,'earnedMarksX100',pg_catalog.trunc(v_earned)::text,'possibleMarksX100',v_possible::text,'earnedPoints',v_points::text,'possiblePoints',v_possible_points::text);
end;$function$;
notify pgrst,'reload schema';
