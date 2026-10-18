-- Student Portal Part H: reviewed SECURITY DEFINER RPCs. Local first; cloud requires approval.
-- Never grant client DML or SELECT on assignment_submissions. All mutations audited/idempotent.
create function public.coaching_submit_assignment(p_assignment_id uuid,p_answer_text text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 a uuid:=(select auth.uid()); v_prior record; v_assignment record; v_batch record;
 v_submission record; v_result jsonb; v_payload jsonb; v_now timestamptz:=pg_catalog.now(); v_repeat boolean:=false;
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student'::public.app_role and account_status='active') then raise exception 'FORBIDDEN'; end if;
 if p_assignment_id is null or p_operation_id is null or p_answer_text is null or pg_catalog.char_length(pg_catalog.btrim(p_answer_text)) not between 1 and 20000 then raise exception 'INVALID_SUBMISSION'; end if;
 v_payload:=pg_catalog.jsonb_build_object('assignmentId',p_assignment_id,'answerText',pg_catalog.btrim(p_answer_text));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=a and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'student.assignment.submitted' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return v_prior.result;
 end if;
 select batch_id into v_assignment from public.academic_assignments where id=p_assignment_id;
 if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
 select * into v_batch from public.batches where id=v_assignment.batch_id for update;
 if not found or v_batch.is_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
 select * into v_assignment from public.academic_assignments where id=p_assignment_id for update;
 if v_assignment.status not in ('published','closed') or v_assignment.release_at>v_now or v_assignment.due_at<=v_now then raise exception 'SUBMISSION_CLOSED'; end if;
 if not exists(select 1 from public.enrollments where student_id=a and batch_id=v_assignment.batch_id and status='active') then raise exception 'NOT_ENROLLED'; end if;
 select * into v_submission from public.assignment_submissions where assignment_id=p_assignment_id and student_id=a for update;
 if found then
  if not v_assignment.allow_resubmit or v_submission.grade_status<>'ungraded' or v_submission.attachment_id is not null then raise exception 'RESUBMISSION_NOT_ALLOWED'; end if;
  v_repeat:=true;
  update public.assignment_submissions set answer_text=pg_catalog.btrim(p_answer_text),submitted_at=v_now where id=v_submission.id;
 else
  insert into public.assignment_submissions(assignment_id,student_id,answer_text,submitted_at)
    values(p_assignment_id,a,pg_catalog.btrim(p_answer_text),v_now) returning * into v_submission;
 end if;
 v_result:=pg_catalog.jsonb_build_object('id',v_submission.id,'assignmentId',p_assignment_id,'studentId',a,
  'submittedAt',pg_catalog.to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'resubmitted',v_repeat);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'student.assignment.submitted',v_submission.id,pg_catalog.jsonb_build_object('assignmentId',p_assignment_id,'resubmitted',v_repeat));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
  values(a,p_operation_id,'student.assignment.submitted',v_payload,v_result);
 return v_result;
end;$$;
revoke all on function public.coaching_submit_assignment(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_submit_assignment(uuid,text,uuid) to authenticated;

create function public.coaching_grade_assignment_submission(p_submission_id uuid,p_points integer,p_feedback text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(select auth.uid()); v_prior record; v_sub record; v_assignment record; v_batch record; v_payload jsonb; v_result jsonb;
begin
 if a is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
 if p_submission_id is null or p_operation_id is null or p_points is null or p_points not between 0 and 1000 or p_feedback is null or pg_catalog.char_length(p_feedback)>2000 then raise exception 'INVALID_GRADE'; end if;
 v_payload:=pg_catalog.jsonb_build_object('submissionId',p_submission_id,'points',p_points,'feedback',pg_catalog.btrim(p_feedback));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=a and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'academic.assignment.graded' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return v_prior.result;
 end if;
 select assignment_id into v_sub from public.assignment_submissions where id=p_submission_id;
 if not found then raise exception 'SUBMISSION_NOT_FOUND'; end if;
 select batch_id into v_assignment from public.academic_assignments where id=v_sub.assignment_id;
 if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
 select * into v_batch from public.batches where id=v_assignment.batch_id for update;
 if not found or v_batch.is_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
 select * into v_assignment from public.academic_assignments where id=v_sub.assignment_id for update;
 if v_assignment.status not in ('published','closed') or v_assignment.grades_published or p_points>v_assignment.max_points then raise exception 'GRADING_CLOSED'; end if;
 select * into v_sub from public.assignment_submissions where id=p_submission_id for update;
 if v_sub.grade_status='published' then raise exception 'GRADING_CLOSED'; end if;
 update public.assignment_submissions set grade_status='draft',points=p_points,feedback=pg_catalog.btrim(p_feedback),graded_by=a,graded_at=pg_catalog.now() where id=p_submission_id;
 v_result:=pg_catalog.jsonb_build_object('id',p_submission_id,'assignmentId',v_assignment.id,'gradeStatus','draft','points',p_points);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'academic.assignment.graded',p_submission_id,v_payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
 values(a,p_operation_id,'academic.assignment.graded',v_payload,v_result);
 return v_result;
end;$$;
revoke all on function public.coaching_grade_assignment_submission(uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_grade_assignment_submission(uuid,integer,text,uuid) to authenticated;

create function public.coaching_publish_assignment_grades(p_assignment_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(select auth.uid()); v_prior record; v_assignment record; v_batch record; v_payload jsonb;v_result jsonb;v_count integer;
begin
 if a is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
 if p_assignment_id is null or p_operation_id is null then raise exception 'INVALID_PUBLICATION'; end if;
 v_payload:=pg_catalog.jsonb_build_object('assignmentId',p_assignment_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=a and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'academic.assignment.grades.published' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return v_prior.result;
 end if;
 select batch_id into v_assignment from public.academic_assignments where id=p_assignment_id;
 if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
 select * into v_batch from public.batches where id=v_assignment.batch_id for update;
 if not found or v_batch.is_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
 select * into v_assignment from public.academic_assignments where id=p_assignment_id for update;
 if v_assignment.status not in ('published','closed') or v_assignment.grades_published then raise exception 'GRADES_ALREADY_PUBLISHED'; end if;
 perform 1 from public.assignment_submissions where assignment_id=p_assignment_id for update;
 select count(*) into v_count from public.assignment_submissions where assignment_id=p_assignment_id;
 if v_count=0 or exists(select 1 from public.assignment_submissions where assignment_id=p_assignment_id and grade_status<>'draft') then raise exception 'GRADES_NOT_READY'; end if;
 update public.assignment_submissions set grade_status='published' where assignment_id=p_assignment_id;
 update public.academic_assignments set grades_published=true,updated_at=pg_catalog.now() where id=p_assignment_id;
 v_result:=pg_catalog.jsonb_build_object('assignmentId',p_assignment_id,'publishedCount',v_count,'gradesPublished',true);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'academic.assignment.grades.published',p_assignment_id,v_payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
  values(a,p_operation_id,'academic.assignment.grades.published',v_payload,v_result);
 return v_result;
end;$$;
revoke all on function public.coaching_publish_assignment_grades(uuid,uuid) from public,anon,authenticated;
grant execute on function public.coaching_publish_assignment_grades(uuid,uuid) to authenticated;
