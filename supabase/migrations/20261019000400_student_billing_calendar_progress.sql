-- Student financial statement, integrated calendar and released academic progress.
-- Reads stay owner-bound even under SECURITY DEFINER. No base-table write grants.
create function public.coaching_student_billing_statement(p_bill_period text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());v_items jsonb;v_count bigint;v_billed numeric;v_paid numeric;v_waived numeric;v_refunded numeric;v_corrections numeric;v_outstanding numeric;v_min_outstanding numeric;
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student'::public.app_role and account_status='active') then raise exception 'FORBIDDEN'; end if;
 if p_bill_period is null or p_bill_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_PERIOD'; end if;
 select count(*) into v_count from public.monthly_dues where student_id=a and bill_period=p_bill_period;
 if v_count>100 then raise exception 'REPORT_LIMIT_EXCEEDED'; end if;
 with items as (
  select d.id,d.batch_id,d.bill_period,d.amount_minor::numeric as billed,
   coalesce((select sum(p.amount_minor) from public.payments p where p.due_id=d.id),0)::numeric as paid,
   coalesce((select sum(j.amount_minor) from public.payment_adjustments j where j.due_id=d.id and j.kind='waiver'),0)::numeric as waived,
   coalesce((select sum(j.amount_minor) from public.payment_adjustments j where j.due_id=d.id and j.kind='refund'),0)::numeric as refunded,
   coalesce((select sum(j.amount_minor) from public.payment_adjustments j where j.due_id=d.id and j.kind='correction'),0)::numeric as corrections
  from public.monthly_dues d where d.student_id=a and d.bill_period=p_bill_period
 ), checked as (
  select *, billed-paid-waived+refunded-corrections as outstanding from items
 )
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'batchId',batch_id,'billPeriod',bill_period,'billedMinor',billed::text,'paidMinor',paid::text,'waivedMinor',waived::text,'refundedMinor',refunded::text,'correctionsMinor',corrections::text,'outstandingMinor',outstanding::text) order by batch_id,id),'[]'::jsonb),
  coalesce(sum(billed),0),coalesce(sum(paid),0),coalesce(sum(waived),0),coalesce(sum(refunded),0),coalesce(sum(corrections),0),coalesce(sum(outstanding),0),coalesce(min(outstanding),0)
 into v_items,v_billed,v_paid,v_waived,v_refunded,v_corrections,v_outstanding,v_min_outstanding from checked;
 if v_min_outstanding<0 then raise exception 'INVALID_LEDGER_BALANCE'; end if;
 return pg_catalog.jsonb_build_object('studentId',a,'billPeriod',p_bill_period,'currency','BDT','totalsMinor',pg_catalog.jsonb_build_object('billed',v_billed::text,'paid',v_paid::text,'waived',v_waived::text,'refunded',v_refunded::text,'corrections',v_corrections::text,'outstanding',v_outstanding::text),'items',v_items);
end;$$;
revoke all on function public.coaching_student_billing_statement(text) from public,anon,authenticated;
grant execute on function public.coaching_student_billing_statement(text) to authenticated;

create function public.coaching_student_calendar(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());v_count bigint;v_items jsonb;
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student'::public.app_role and account_status='active') then raise exception 'FORBIDDEN'; end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>31 then raise exception 'INVALID_WINDOW'; end if;
 with upcoming as (
  select x.id,x.batch_id,'assignment'::text as kind,x.title,x.due_at as at from public.academic_assignments x where x.status in ('published','closed') and x.release_at<=pg_catalog.now() and x.due_at>=(p_from::timestamp at time zone 'UTC') and x.due_at<((p_to+1)::timestamp at time zone 'UTC') and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active')
  union all select x.id,x.batch_id,'exam'::text,x.title,x.scheduled_at from public.exams x where x.status='published' and x.scheduled_at>=(p_from::timestamp at time zone 'UTC') and x.scheduled_at<((p_to+1)::timestamp at time zone 'UTC') and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active')
 ) select count(*) into v_count from upcoming;
 if v_count>100 then raise exception 'CALENDAR_LIMIT_EXCEEDED'; end if;
 with upcoming as (
  select x.id,x.batch_id,'assignment'::text as kind,x.title,x.due_at as at from public.academic_assignments x where x.status in ('published','closed') and x.release_at<=pg_catalog.now() and x.due_at>=(p_from::timestamp at time zone 'UTC') and x.due_at<((p_to+1)::timestamp at time zone 'UTC') and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active')
  union all select x.id,x.batch_id,'exam'::text,x.title,x.scheduled_at from public.exams x where x.status='published' and x.scheduled_at>=(p_from::timestamp at time zone 'UTC') and x.scheduled_at<((p_to+1)::timestamp at time zone 'UTC') and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active')
 ) select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'batchId',batch_id,'kind',kind,'title',title,'at',pg_catalog.to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by at,id),'[]'::jsonb) into v_items from upcoming;
 return pg_catalog.jsonb_build_object('from',p_from::text,'to',p_to::text,'items',v_items);
end;$$;
revoke all on function public.coaching_student_calendar(date,date) from public,anon,authenticated;
grant execute on function public.coaching_student_calendar(date,date) to authenticated;

create function public.coaching_student_progress() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());v_exams bigint;v_earned numeric;v_possible numeric;v_assign bigint;v_points numeric;v_possible_points numeric;
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student'::public.app_role and account_status='active') then raise exception 'FORBIDDEN'; end if;
 select count(*),coalesce(sum(r.marks*100),0),coalesce(sum(x.max_marks*100),0) into v_exams,v_earned,v_possible from public.exam_results r join public.exams x on x.id=r.exam_id where r.student_id=a and r.result_status='published' and x.status='published' and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active');
 select count(*),coalesce(sum(s.points),0),coalesce(sum(x.max_points),0) into v_assign,v_points,v_possible_points from public.assignment_submissions s join public.academic_assignments x on x.id=s.assignment_id where s.student_id=a and s.grade_status='published' and x.grades_published and x.status in ('published','closed') and x.release_at<=pg_catalog.now() and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active');
 return pg_catalog.jsonb_build_object('studentId',a,'publishedExamResults',v_exams,'gradedAssignments',v_assign,'earnedMarksX100',v_earned::text,'possibleMarksX100',v_possible::text,'earnedPoints',v_points::text,'possiblePoints',v_possible_points::text);
end;$$;
revoke all on function public.coaching_student_progress() from public,anon,authenticated;
grant execute on function public.coaching_student_progress() to authenticated;
