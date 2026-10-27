-- Offline exams: type, duration, pass marks, instructions, syllabus coverage, attendance and remarks.
-- Backward compatible: existing columns, statuses and RPC signatures are unchanged.
-- "Not recorded" is the absence of an exam_results row; it is never treated as absent or zero.
-- Lifecycle (derived, guarded by the existing RPC transitions):
--   draft -> scheduled (published, future) -> completed (published, held, no results)
--   -> result_draft (draft rows exist) -> result_published (rows published).

alter table public.exams
 add column pass_marks integer,
 add column exam_type text not null default 'class_test',
 add column duration_minutes integer,
 add column instructions text not null default '',
 add column coverage_unit_ids uuid[] not null default '{}',
 add constraint exams_type_valid check (exam_type in ('class_test','weekly','monthly','model_test','assignment','final')),
 add constraint exams_duration_valid check (duration_minutes is null or duration_minutes between 5 and 600),
 add constraint exams_pass_marks_valid check (pass_marks is null or pass_marks between 0 and max_marks),
 add constraint exams_instructions_length check (char_length(instructions)<=4000),
 add constraint exams_coverage_bounded check (cardinality(coverage_unit_ids)<=200);

alter table public.exam_results
 add column attendance text not null default 'attempted',
 add column remarks text not null default '',
 add constraint exam_result_attendance_valid check (attendance in ('attempted','absent')),
 add constraint exam_result_remarks_length check (char_length(remarks)<=500),
 add constraint exam_result_absent_has_no_marks check (attendance='attempted' or (marks is null and rank is null));

-- Publication consistency, widened so absent results publish without marks or rank; attempted
-- results still need both. Every existing row is attempted, so the new rule is a superset.
alter table public.exam_results drop constraint exam_result_publication_consistent;
alter table public.exam_results add constraint exam_result_publication_consistent check (
 result_status<>'published' or (attendance='attempted' and marks is not null and rank is not null) or (attendance='absent' and marks is null and rank is null));

create function public.coaching_exam_lifecycle(p_status text,p_scheduled_at timestamptz,p_exam_id uuid)
returns text language sql stable security definer set search_path='' as $function$
 select case
  when p_status='archived' then 'archived'
  when p_status='draft' then 'draft'
  when exists(select 1 from public.exam_results r where r.exam_id=p_exam_id and r.result_status='published') then 'result_published'
  when exists(select 1 from public.exam_results r where r.exam_id=p_exam_id) then 'result_draft'
  when p_scheduled_at>pg_catalog.now() then 'scheduled'
  else 'completed' end;
$function$;
revoke all on function public.coaching_exam_lifecycle(text,timestamptz,uuid) from public,anon,authenticated;

-- Teacher edits exam details while the exam is a draft or scheduled (results not published).
create function public.coaching_update_exam_details(p_exam_id uuid,p_title text,p_scheduled_at timestamptz,p_max_marks integer,p_pass_marks integer,p_instructions text,p_coverage_unit_ids uuid[],p_exam_type text,p_duration_minutes integer,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;x record;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_exam_id is null or p_operation_id is null or p_title is null or char_length(btrim(p_title)) not between 2 and 120 or p_scheduled_at is null
  or p_max_marks is null or p_max_marks not between 1 and 10000 or (p_pass_marks is not null and p_pass_marks not between 0 and p_max_marks)
  or p_instructions is null or char_length(p_instructions)>4000 or p_coverage_unit_ids is null or cardinality(p_coverage_unit_ids)>200
  or p_exam_type is null or p_exam_type not in ('class_test','weekly','monthly','model_test','assignment','final') or (p_duration_minutes is not null and p_duration_minutes not between 5 and 600) then raise exception 'INVALID_EXAM';end if;
 payload:=pg_catalog.jsonb_build_object('examId',p_exam_id,'title',btrim(p_title),'scheduledAt',p_scheduled_at,'maxMarks',p_max_marks,'passMarks',p_pass_marks,'instructions',p_instructions,'coverage',to_jsonb(p_coverage_unit_ids),'examType',p_exam_type,'durationMinutes',p_duration_minutes);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'academic.exam.details.updated' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 select e.*,b.is_archived into x from public.exams e join public.batches b on b.id=e.batch_id where e.id=p_exam_id for update of e;
 if not found then raise exception 'EXAM_NOT_FOUND';end if;
 if x.is_archived then raise exception 'BATCH_UNAVAILABLE';end if;
 if x.status not in ('draft','published') or exists(select 1 from public.exam_results where exam_id=p_exam_id and result_status='published') then raise exception 'EXAM_NOT_EDITABLE';end if;
 if exists(select 1 from public.exam_results where exam_id=p_exam_id and marks>p_max_marks) then raise exception 'MARKS_EXCEED_MAX';end if;
 if exists(select 1 from unnest(p_coverage_unit_ids) u(id) where not exists(select 1 from public.syllabus_units s where s.id=u.id and s.subject_id=x.subject_id)) then raise exception 'COVERAGE_SUBJECT_MISMATCH';end if;
 update public.exams set title=btrim(p_title),scheduled_at=p_scheduled_at,max_marks=p_max_marks,pass_marks=p_pass_marks,instructions=p_instructions,
  coverage_unit_ids=(select coalesce(array_agg(distinct u),'{}') from unnest(p_coverage_unit_ids) u),exam_type=p_exam_type,duration_minutes=p_duration_minutes,updated_at=pg_catalog.now() where id=p_exam_id;
 result:=pg_catalog.jsonb_build_object('id',p_exam_id,'status',x.status,'lifecycle',public.coaching_exam_lifecycle(x.status,p_scheduled_at,p_exam_id));
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'academic.exam.details.updated',p_exam_id,payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'academic.exam.details.updated',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_update_exam_details(uuid,text,timestamptz,integer,integer,text,uuid[],text,integer,uuid) from public,anon,authenticated;
grant execute on function public.coaching_update_exam_details(uuid,text,timestamptz,integer,integer,text,uuid[],text,integer,uuid) to authenticated;

-- Record attempted (with marks) or absent (no marks) for one enrolled Student, as a draft.
create function public.coaching_record_exam_attendance(p_exam_id uuid,p_student_id uuid,p_attendance text,p_marks numeric,p_remarks text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;x record;rid uuid;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_exam_id is null or p_student_id is null or p_operation_id is null or p_attendance not in ('attempted','absent') or p_remarks is null or char_length(p_remarks)>500
  or (p_attendance='absent' and p_marks is not null)
  or (p_attendance='attempted' and (p_marks is null or p_marks<0 or p_marks>10000 or p_marks<>round(p_marks,2))) then raise exception 'INVALID_RESULT';end if;
 payload:=pg_catalog.jsonb_build_object('examId',p_exam_id,'studentId',p_student_id,'attendance',p_attendance,'marks',p_marks,'remarks',p_remarks);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'academic.exam.attendance.recorded' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 -- Same lock order as the existing draft and publish RPCs: batch, then exam.
 select e.id,e.batch_id,e.max_marks,e.status,e.scheduled_at into x from public.exams e where e.id=p_exam_id;
 if not found then raise exception 'EXAM_NOT_FOUND';end if;
 perform 1 from public.batches where id=x.batch_id and not is_archived for update;
 if not found then raise exception 'BATCH_UNAVAILABLE';end if;
 perform 1 from public.exams where id=p_exam_id for update;
 if x.status<>'published' then raise exception 'EXAM_NOT_SCHEDULED';end if;
 if x.scheduled_at>pg_catalog.now() then raise exception 'EXAM_NOT_HELD';end if;
 if p_marks>x.max_marks then raise exception 'MARKS_EXCEED_MAX';end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student' and account_status='active') then raise exception 'STUDENT_NOT_ACTIVE';end if;
 if not exists(select 1 from public.enrollments where batch_id=x.batch_id and student_id=p_student_id and status='active') then raise exception 'STUDENT_NOT_ENROLLED';end if;
 insert into public.exam_results(exam_id,student_id,marks,result_status,rank,graded_by,attendance,remarks)
  values(p_exam_id,p_student_id,p_marks,'draft',null,a,p_attendance,p_remarks)
  on conflict (exam_id,student_id) do update set marks=excluded.marks,attendance=excluded.attendance,remarks=excluded.remarks,rank=null,graded_by=excluded.graded_by,updated_at=pg_catalog.now()
  where public.exam_results.result_status='draft'
  returning id into rid;
 if rid is null then raise exception 'RESULT_ALREADY_PUBLISHED';end if;
 result:=pg_catalog.jsonb_build_object('id',rid,'examId',p_exam_id,'studentId',p_student_id,'attendance',p_attendance,'marks',p_marks,'resultStatus','draft');
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'academic.exam.attendance.recorded',rid,payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'academic.exam.attendance.recorded',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_record_exam_attendance(uuid,uuid,text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_record_exam_attendance(uuid,uuid,text,numeric,text,uuid) to authenticated;

-- Existing marks-only draft RPC: unchanged contract, but a re-graded absent row becomes attempted.
create or replace function public.coaching_save_exam_result_draft(p_exam_id uuid, p_student_id uuid, p_marks numeric, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
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
  insert into public.exam_results(exam_id,student_id,marks,result_status,rank,graded_by,attendance)
    values(p_exam_id,p_student_id,p_marks,'draft',null,v_actor,'attempted')
    on conflict (exam_id,student_id) do update set
      marks=excluded.marks,attendance='attempted',result_status='draft',rank=null,graded_by=excluded.graded_by,updated_at=now()
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
$function$;

-- Publication: absent rows publish without rank; ranking uses attempted rows only (competition rank, ties share).
create or replace function public.coaching_publish_exam_results(p_exam_id uuid, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
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
 perform id from public.exam_results where exam_id=p_exam_id order by id for update;
 select count(*)::integer,count(*) filter(where er.result_status<>'draft'
    or (er.attendance='attempted' and (er.marks is null or er.marks<0 or er.marks>v_max))
    or (er.attendance='absent' and er.marks is not null)
    or p.id is null or p.role<>'student'::public.app_role
    or p.account_status<>'active'::public.account_status or e.id is null)::integer
 into v_total,v_invalid from public.exam_results er
 left join public.profiles p on p.id=er.student_id
 left join public.enrollments e on e.student_id=er.student_id and e.batch_id=v_batch and e.status='active'
 where er.exam_id=p_exam_id;
 if v_total=0 or v_total>1000000 or v_invalid<>0 then raise exception 'RESULT_SET_NOT_READY'; end if;
 with ranked as (
   select id,case when attendance='attempted' then pg_catalog.rank() over (partition by attendance order by marks desc)::integer end as pos
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
$function$;

-- Aggregate progress counts attempted exams only; an absence is neither zero marks nor possible marks.
create or replace function public.coaching_student_progress()
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare a uuid:=(select auth.uid());v_exams bigint;v_earned numeric;v_possible numeric;v_assign bigint;v_points numeric;v_possible_points numeric;
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student'::public.app_role and account_status='active') then raise exception 'FORBIDDEN'; end if;
 select count(*),coalesce(sum(r.marks*100),0),coalesce(sum(x.max_marks*100),0) into v_exams,v_earned,v_possible from public.exam_results r join public.exams x on x.id=r.exam_id where r.student_id=a and r.result_status='published' and r.attendance='attempted' and x.status='published' and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active');
 select count(*),coalesce(sum(s.points),0),coalesce(sum(x.max_points),0) into v_assign,v_points,v_possible_points from public.assignment_submissions s join public.academic_assignments x on x.id=s.assignment_id where s.student_id=a and s.grade_status='published' and x.grades_published and x.status in ('published','closed') and x.release_at<=pg_catalog.now() and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active');
 return pg_catalog.jsonb_build_object('studentId',a,'publishedExamResults',v_exams,'gradedAssignments',v_assign,'earnedMarksX100',pg_catalog.trunc(v_earned)::text,'possibleMarksX100',v_possible::text,'earnedPoints',v_points::text,'possiblePoints',v_possible_points::text);
end;$function$;

-- Student exam history: upcoming (published, future) plus past exams with attempted /
-- absent / not_recorded. Draft or unpublished marks are never exposed.
create function public.coaching_student_exam_history()
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student' and account_status='active') then raise exception 'FORBIDDEN';end if;
 return pg_catalog.jsonb_build_object('exams',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id',x.id,'batchId',x.batch_id,'batchName',b.name,'subjectId',x.subject_id,'subject',s.title,'title',x.title,'scheduledAt',x.scheduled_at,
   'maxMarks',x.max_marks,'passMarks',x.pass_marks,'examType',x.exam_type,'durationMinutes',x.duration_minutes,'instructions',x.instructions,
   'coverage',coalesce((select pg_catalog.jsonb_agg(u.title order by u.position) from public.syllabus_units u where u.id=any(x.coverage_unit_ids)),'[]'::jsonb),
   'upcoming',x.scheduled_at>pg_catalog.now(),
   'resultPublished',r.result_status='published',
   'participation',case when x.scheduled_at>pg_catalog.now() then 'upcoming' when r.result_status='published' then r.attendance else 'not_recorded' end,
   'marks',case when r.result_status='published' then r.marks end,
   'rank',case when r.result_status='published' then r.rank end,
   'remarks',case when r.result_status='published' then r.remarks else '' end,
   'participants',case when r.result_status='published' then (select count(*) from public.exam_results q where q.exam_id=x.id and q.result_status='published' and q.attendance='attempted') end
  ) order by x.scheduled_at desc)
  from public.exams x join public.batches b on b.id=x.batch_id join public.academic_subjects s on s.id=x.subject_id
  join public.enrollments e on e.batch_id=x.batch_id and e.student_id=a and e.status='active'
  left join public.exam_results r on r.exam_id=x.id and r.student_id=a
  where x.status='published'),'[]'::jsonb));
end;$function$;
revoke all on function public.coaching_student_exam_history() from public,anon,authenticated;
grant execute on function public.coaching_student_exam_history() to authenticated;

-- Teacher exam sheet: every active enrollment with its recorded state (draft visible to Teacher).
-- Students whose lifecycle is not active are listed only when they already have a result.
create function public.coaching_teacher_exam_sheet(p_exam_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare x record;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 select e.*,b.name batch_name,b.code batch_code,s.title subject into x from public.exams e join public.batches b on b.id=e.batch_id join public.academic_subjects s on s.id=e.subject_id where e.id=p_exam_id;
 if not found then raise exception 'EXAM_NOT_FOUND';end if;
 return pg_catalog.jsonb_build_object('exam',pg_catalog.jsonb_build_object('id',x.id,'batchId',x.batch_id,'batchName',x.batch_name,'batchCode',x.batch_code,'subject',x.subject,'title',x.title,
   'scheduledAt',x.scheduled_at,'maxMarks',x.max_marks,'passMarks',x.pass_marks,'examType',x.exam_type,'durationMinutes',x.duration_minutes,'instructions',x.instructions,'coverageUnitIds',to_jsonb(x.coverage_unit_ids),
   'status',x.status,'lifecycle',public.coaching_exam_lifecycle(x.status,x.scheduled_at,x.id)),
  'rows',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('studentId',p.id,'fullName',p.full_name,'admissionRoll',ad.admission_roll,
    'participation',coalesce(r.attendance,'not_recorded'),'marks',r.marks,'rank',r.rank,'remarks',coalesce(r.remarks,''),'resultStatus',r.result_status) order by p.full_name,p.id)
   from public.enrollments en join public.profiles p on p.id=en.student_id
   left join public.student_admission_details ad on ad.student_id=p.id
   left join public.exam_results r on r.exam_id=x.id and r.student_id=p.id
   where en.batch_id=x.batch_id and en.status='active' and (r.id is not null or public.coaching_student_lifecycle_status(p.id)='active')),'[]'::jsonb));
end;$function$;
revoke all on function public.coaching_teacher_exam_sheet(uuid) from public,anon,authenticated;
grant execute on function public.coaching_teacher_exam_sheet(uuid) to authenticated;
notify pgrst,'reload schema';
