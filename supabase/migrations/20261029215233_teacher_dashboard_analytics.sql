-- Teacher dashboard analytics for one billing month: payment-status distribution and batch-wise collection
-- (same paid/partial/unpaid/waived rules as coaching_teacher_payment_ledger), Student lifecycle and admission
-- counts, enrollment per batch, syllabus completion per batch, upcoming exams and exams awaiting results.
-- Read-only, teacher-only SECURITY DEFINER; money is integer paisa returned as text.
create function public.coaching_teacher_dashboard_analytics(p_period text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare today date:=(pg_catalog.now() at time zone 'Asia/Dhaka')::date;period text;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_period is null or (p_period<>'' and p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$') then raise exception 'INVALID_FILTER';end if;
 period:=coalesce(nullif(p_period,''),pg_catalog.to_char(today,'YYYY-MM'));
 return (with dues as (
   select d.id,d.batch_id,d.amount_minor,f.due_on,
    coalesce((select sum(x.amount_minor) from public.payments x where x.due_id=d.id),0) paid,
    coalesce((select sum(x.amount_minor) from public.payment_adjustments x where x.due_id=d.id and x.kind='refund'),0) refunded,
    coalesce((select sum(x.amount_minor) from public.payment_adjustments x where x.due_id=d.id and x.kind='waiver'),0) waived,
    coalesce((select sum(x.amount_minor) from public.payment_adjustments x where x.due_id=d.id and x.kind='correction'),0) corrected
   from public.monthly_dues d join public.fee_plans f on f.id=d.fee_plan_id where d.bill_period=period
  ), calc as (
   select *,amount_minor-paid-waived+refunded-corrected outstanding,paid-refunded net_paid from dues
  ), labelled as (
   select *,case when outstanding<=0 and net_paid<=0 and waived>0 then 'waived' when outstanding<=0 then 'paid' when net_paid>0 then 'partial' else 'unpaid' end status,
    outstanding>0 and due_on<today overdue from calc
  ), live_batches as (
   select b.* from public.batches b where b.lifecycle_status not in ('cancelled','archived')
  ), leaves as (
   select s.batch_id,u.weight,u.status from public.syllabus_units u join public.academic_subjects s on s.id=u.subject_id
   where not exists(select 1 from public.syllabus_units c where c.parent_id=u.id)
  ), students as (
   select p.id,p.account_status,coalesce(l.status,'active') lifecycle from public.profiles p left join public.student_lifecycle l on l.student_id=p.id where p.role='student'
  )
  select pg_catalog.jsonb_build_object('period',period,
   'payments',pg_catalog.jsonb_build_object(
     'dues',(select count(*) from labelled),
     'paid',(select count(*) from labelled where status='paid'),'partial',(select count(*) from labelled where status='partial'),
     'unpaid',(select count(*) from labelled where status='unpaid'),'waived',(select count(*) from labelled where status='waived'),
     'overdue',(select count(*) from labelled where overdue),
     'expectedMinor',coalesce((select sum(amount_minor) from labelled),0)::text,
     'collectedMinor',coalesce((select sum(greatest(0,net_paid)) from labelled),0)::text,
     'outstandingMinor',coalesce((select sum(greatest(0,outstanding)) from labelled),0)::text),
   'batchCollection',coalesce((select pg_catalog.jsonb_agg(row_to_json(t)::jsonb order by t."expected" desc,t.name) from (
     select b.id "batchId",b.name,b.code,sum(l.amount_minor) "expected",sum(greatest(0,l.net_paid))::text "collectedMinor",sum(greatest(0,l.outstanding))::text "outstandingMinor",
      sum(l.amount_minor)::text "expectedMinor",count(*) dues
     from labelled l join public.batches b on b.id=l.batch_id group by b.id,b.name,b.code order by sum(l.amount_minor) desc,b.name limit 12) t),'[]'::jsonb),
   'students',pg_catalog.jsonb_build_object('total',(select count(*) from students),
     'active',(select count(*) from students where lifecycle='active' and account_status='active'),
     'inactive',(select count(*) from students where lifecycle='inactive'),'cancelled',(select count(*) from students where lifecycle='cancelled'),
     'completed',(select count(*) from students where lifecycle='completed'),
     'pendingAccounts',(select count(*) from students where account_status='pending'),
     'pendingEnrollments',(select count(*) from public.enrollments where status='pending'),
     'newThisMonth',(select count(*) from public.student_admission_details n where pg_catalog.to_char(n.admitted_on,'YYYY-MM')=period)),
   'batches',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('batchId',b.id,'name',b.name,'code',b.code,'status',b.lifecycle_status,'capacity',b.capacity,
     'enrolled',(select count(*) from public.enrollments e where e.batch_id=b.id and e.status='active'),
     'syllabusBasisPoints',coalesce((select (sum(weight) filter(where status='completed')*10000/nullif(sum(weight),0))::integer from leaves where leaves.batch_id=b.id),0),
     'syllabusUnits',(select count(*) from leaves where leaves.batch_id=b.id)) order by b.name) from live_batches b),'[]'::jsonb),
   'exams',pg_catalog.jsonb_build_object(
     'upcoming',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',x.id,'title',x.title,'batchName',b.name,'scheduledAt',x.scheduled_at) order by x.scheduled_at)
       from (select * from public.exams where scheduled_at>=pg_catalog.now() and scheduled_at<pg_catalog.now()+interval '30 days' order by scheduled_at limit 6) x join public.batches b on b.id=x.batch_id),'[]'::jsonb),
     'upcomingCount',(select count(*) from public.exams where scheduled_at>=pg_catalog.now() and scheduled_at<pg_catalog.now()+interval '30 days'),
     'awaitingResults',(select count(*) from public.exams x join public.batches b on b.id=x.batch_id where x.scheduled_at<pg_catalog.now() and b.lifecycle_status not in ('cancelled','archived')
       and not exists(select 1 from public.exam_results r where r.exam_id=x.id and r.result_status='published')),
     'published',(select count(distinct r.exam_id) from public.exam_results r where r.result_status='published'))));
end;$function$;
revoke all on function public.coaching_teacher_dashboard_analytics(text) from public,anon,authenticated;
grant execute on function public.coaching_teacher_dashboard_analytics(text) to authenticated;
