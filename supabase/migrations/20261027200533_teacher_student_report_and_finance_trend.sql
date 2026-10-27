-- Teacher-built progress report for any one Student, and the organisation-wide monthly finance trend.
-- Both are read-only, teacher-only SECURITY DEFINER functions with no client table grants.

-- Same rows the Student sees in their own exam history (published exams in active enrollments,
-- marks only once published), so a teacher-built report never discloses more than the Student's own.
create function public.coaching_teacher_student_exam_history(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_student_id is null then raise exception 'INVALID_FILTER';end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student') then raise exception 'STUDENT_NOT_FOUND';end if;
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
  join public.enrollments e on e.batch_id=x.batch_id and e.student_id=p_student_id and e.status='active'
  left join public.exam_results r on r.exam_id=x.id and r.student_id=p_student_id
  where x.status='published'),'[]'::jsonb));
end;$function$;
revoke all on function public.coaching_teacher_student_exam_history(uuid) from public,anon,authenticated;
grant execute on function public.coaching_teacher_student_exam_history(uuid) to authenticated;

-- Month-by-month totals for the last p_months Dhaka calendar months (oldest first), all integer paisa as text:
-- billed (dues issued for that bill period), collected (payments received that month), refunded, expenses
-- (unreversed office expenses dated that month) and net (collected - refunded - expenses).
create function public.coaching_teacher_finance_trend(p_months integer default 12)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare current_month date:=pg_catalog.date_trunc('month',pg_catalog.now() at time zone 'Asia/Dhaka')::date;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_months is null or p_months not between 3 and 24 then raise exception 'INVALID_FILTER';end if;
 return (with months as (
   select (current_month-(pg_catalog.make_interval(months=>n)))::date as month from pg_catalog.generate_series(0,p_months-1) n
  ), totals as (
   select m.month,pg_catalog.to_char(m.month,'YYYY-MM') as period,
    coalesce((select sum(d.amount_minor) from public.monthly_dues d where d.bill_period=pg_catalog.to_char(m.month,'YYYY-MM')),0) as billed,
    coalesce((select sum(p.amount_minor) from public.payments p where (p.created_at at time zone 'Asia/Dhaka')>=m.month and (p.created_at at time zone 'Asia/Dhaka')<m.month+interval '1 month'),0) as collected,
    coalesce((select sum(a.amount_minor) from public.payment_adjustments a where a.kind='refund' and (a.created_at at time zone 'Asia/Dhaka')>=m.month and (a.created_at at time zone 'Asia/Dhaka')<m.month+interval '1 month'),0) as refunded,
    coalesce((select sum(x.amount_minor) from public.office_expenses x where x.expense_on>=m.month and x.expense_on<(m.month+interval '1 month')::date
      and not exists(select 1 from public.office_expense_reversals v where v.expense_id=x.id)),0) as expenses
   from months m)
  select pg_catalog.jsonb_build_object('months',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('period',t.period,
    'billedMinor',t.billed::text,'collectedMinor',t.collected::text,'refundedMinor',t.refunded::text,'expensesMinor',t.expenses::text,
    'netMinor',(t.collected-t.refunded-t.expenses)::text) order by t.month),'[]'::jsonb),
   'totals',pg_catalog.jsonb_build_object('billedMinor',coalesce(sum(t.billed),0)::text,'collectedMinor',coalesce(sum(t.collected),0)::text,
    'refundedMinor',coalesce(sum(t.refunded),0)::text,'expensesMinor',coalesce(sum(t.expenses),0)::text,
    'netMinor',coalesce(sum(t.collected-t.refunded-t.expenses),0)::text))
  from totals t);
end;$function$;
revoke all on function public.coaching_teacher_finance_trend(integer) from public,anon,authenticated;
grant execute on function public.coaching_teacher_finance_trend(integer) to authenticated;
