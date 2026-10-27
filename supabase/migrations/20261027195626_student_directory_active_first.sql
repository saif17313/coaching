-- Student directory lists active Students first (inactive, completed, cancelled after), then newest admissions.
-- Output keys, filters, metrics and grants are unchanged.
create or replace function public.coaching_teacher_student_directory_v2(p_search text default '',p_status text default '',p_class text default '',p_fee_status text default '',p_lifecycle text default '',p_batch_id uuid default null,p_limit integer default 20,p_offset integer default 0)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare result jsonb;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_search is null or char_length(p_search)>100 or p_search ~ '[[:cntrl:]]' or p_status is null or p_status not in ('','pending','active','disabled','rejected')
  or p_class is null or char_length(p_class)>80 or p_fee_status is null or p_fee_status not in ('','paid','pending')
  or p_lifecycle is null or p_lifecycle not in ('','active','inactive','cancelled','completed')
  or p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'INVALID_FILTER';end if;
 with dues as (
  select d.student_id,greatest(0,d.amount_minor::numeric
   -coalesce((select sum(p.amount_minor) from public.payments p where p.due_id=d.id),0)
   -coalesce((select sum(a.amount_minor) from public.payment_adjustments a where a.due_id=d.id and a.kind='waiver'),0)
   +coalesce((select sum(a.amount_minor) from public.payment_adjustments a where a.due_id=d.id and a.kind='refund'),0)
   -coalesce((select sum(a.amount_minor) from public.payment_adjustments a where a.due_id=d.id and a.kind='correction'),0)) as outstanding
  from public.monthly_dues d
 ), balances as (select student_id,sum(outstanding) as outstanding from dues group by student_id),
 students as (
  select p.id,p.full_name,p.account_status,p.created_at,n.admission_roll,n.admitted_on,d.phone,d.school_name,d.class_name,d.stream,d.academic_session,d.photo_media_id,
   g.full_name as guardian_name,g.relationship,g.mobile as guardian_mobile,coalesce(b.outstanding,0) as outstanding,
   coalesce(l.status,'active') as lifecycle,coalesce(w.review_status,'') as review_status,
   case when exists(select 1 from auth.users u where u.id=p.id and u.email_confirmed_at is not null) then 'linked'
        when exists(select 1 from auth.users u where u.id=p.id) then 'invited'
        when exists(select 1 from public.student_login_links k where k.student_id=p.id and k.status='pending') then 'reserved' else 'none' end as login_state,
   coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'batchId',e.batch_id,'name',bt.name,'status',e.status) order by e.requested_at desc)
    from public.enrollments e join public.batches bt on bt.id=e.batch_id where e.student_id=p.id),'[]'::jsonb) as batches
  from public.profiles p left join public.student_details d on d.student_id=p.id left join public.student_guardians g on g.student_id=p.id
  left join public.student_admission_details n on n.student_id=p.id left join balances b on b.student_id=p.id
  left join public.student_lifecycle l on l.student_id=p.id left join public.student_application_workflows w on w.student_id=p.id
  where p.role='student'
 ), filtered as (
  select * from students s where (p_status='' or s.account_status::text=p_status) and (p_class='' or coalesce(s.class_name,'')=p_class)
   and (p_lifecycle='' or s.lifecycle=p_lifecycle)
   and (p_batch_id is null or exists(select 1 from public.enrollments e where e.student_id=s.id and e.batch_id=p_batch_id))
   and (p_fee_status='' or (p_fee_status='pending' and s.outstanding>0) or (p_fee_status='paid' and s.outstanding=0))
   and (p_search='' or position(lower(p_search) in lower(concat_ws(' ',s.full_name,s.admission_roll,s.phone,s.guardian_name,s.guardian_mobile,s.school_name)))>0)
 ), selected as (select * from filtered order by case lifecycle when 'active' then 0 when 'inactive' then 1 when 'completed' then 2 else 3 end,coalesce(admitted_on,created_at::date) desc,created_at desc,id limit p_limit offset p_offset)
 select jsonb_build_object('students',coalesce((select jsonb_agg(jsonb_build_object(
  'id',s.id,'fullName',s.full_name,'accountStatus',s.account_status,'lifecycleStatus',s.lifecycle,'reviewStatus',s.review_status,'loginState',s.login_state,
  'admissionRoll',s.admission_roll,'admittedOn',s.admitted_on,
  'phone',coalesce(s.phone,''),'schoolName',coalesce(s.school_name,''),'className',coalesce(s.class_name,''),'stream',coalesce(s.stream,''),'academicSession',coalesce(s.academic_session,''),
  'photoMediaId',s.photo_media_id,'guardianName',coalesce(s.guardian_name,''),'guardianRelationship',coalesce(s.relationship,''),'guardianMobile',coalesce(s.guardian_mobile,''),
  'outstandingMinor',s.outstanding::text,'batches',s.batches) order by case s.lifecycle when 'active' then 0 when 'inactive' then 1 when 'completed' then 2 else 3 end,coalesce(s.admitted_on,s.created_at::date) desc,s.created_at desc,s.id) from selected s),'[]'::jsonb),
  'total',(select count(*) from filtered),'limit',p_limit,'offset',p_offset,
  'classes',coalesce((select jsonb_agg(c.class_name order by c.class_name) from (select distinct class_name from students where coalesce(class_name,'')<>'') c),'[]'::jsonb),
  'metrics',jsonb_build_object('total',(select count(*) from students),'active',(select count(*) from students where lifecycle='active' and account_status='active'),
   'inactive',(select count(*) from students where lifecycle='inactive'),'cancelled',(select count(*) from students where lifecycle='cancelled'),
   'completed',(select count(*) from students where lifecycle='completed'),
   'newAdmissions',(select count(*) from students where admitted_on>=date_trunc('month',now() at time zone 'Asia/Dhaka')::date),'pendingDues',(select count(*) from students where outstanding>0))) into result;
 return result;
end;$function$;
