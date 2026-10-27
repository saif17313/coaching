-- Student lifecycle: active | inactive | cancelled | completed.
-- Kept separate from portal access (profiles.account_status), admission review
-- (student_application_workflows.review_status), batch enrollment (enrollments.status),
-- login activation (student_login_links) and payment status (derived from the ledger).
-- A Student without a row is active. Nothing here deletes or rewrites financial or academic history:
-- non-active Students are excluded from future enrollment and future monthly billing only.

create table public.student_lifecycle (
 student_id uuid primary key references public.profiles(id) on delete restrict,
 status text not null check (status in ('active','inactive','cancelled','completed')),
 reason text not null default '' check (char_length(reason)<=500),
 changed_by uuid not null references public.profiles(id) on delete restrict,
 changed_at timestamptz not null default now()
);
create index student_lifecycle_status_idx on public.student_lifecycle(status) where status<>'active';
create index student_lifecycle_changed_by_idx on public.student_lifecycle(changed_by);

-- Append-only transition history.
create table public.student_lifecycle_events (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.profiles(id) on delete restrict,
 from_status text not null check (from_status in ('active','inactive','cancelled','completed')),
 to_status text not null check (to_status in ('active','inactive','cancelled','completed')),
 reason text not null default '' check (char_length(reason)<=500),
 actor_id uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 check (from_status<>to_status)
);
create index student_lifecycle_events_student_idx on public.student_lifecycle_events(student_id,created_at desc);
create index student_lifecycle_events_actor_idx on public.student_lifecycle_events(actor_id);

alter table public.student_lifecycle enable row level security;
alter table public.student_lifecycle_events enable row level security;
revoke all on public.student_lifecycle,public.student_lifecycle_events from public,anon,authenticated;

create function public.coaching_student_lifecycle_status(p_student_id uuid)
returns text language sql stable security definer set search_path='' as $function$
 select coalesce((select l.status from public.student_lifecycle l where l.student_id=p_student_id),'active');
$function$;
revoke all on function public.coaching_student_lifecycle_status(uuid) from public,anon,authenticated;

-- Allowed transitions. Reinstating a cancelled or completed Student requires a reason.
--  active    -> inactive | cancelled | completed
--  inactive  -> active | cancelled
--  cancelled -> active
--  completed -> active
create function public.coaching_set_student_lifecycle(p_student_id uuid,p_status text,p_reason text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;v_from text;v_reason text:=btrim(coalesce(p_reason,''));
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_student_id is null or p_operation_id is null or p_status not in ('active','inactive','cancelled','completed') or char_length(v_reason)>500 or v_reason ~ '[[:cntrl:]]' then raise exception 'INVALID_LIFECYCLE';end if;
 payload:=pg_catalog.jsonb_build_object('studentId',p_student_id,'status',p_status,'reason',v_reason);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'student.lifecycle.changed' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 perform 1 from public.profiles where id=p_student_id and role='student' for update;
 if not found then raise exception 'STUDENT_NOT_FOUND';end if;
 select l.status into v_from from public.student_lifecycle l where l.student_id=p_student_id for update;
 v_from:=coalesce(v_from,'active');
 if v_from=p_status then raise exception 'LIFECYCLE_UNCHANGED';end if;
 if not ((v_from='active' and p_status in ('inactive','cancelled','completed')) or (v_from='inactive' and p_status in ('active','cancelled'))
   or (v_from in ('cancelled','completed') and p_status='active')) then raise exception 'INVALID_LIFECYCLE_TRANSITION';end if;
 if (p_status in ('cancelled','inactive') or v_from in ('cancelled','completed')) and char_length(v_reason)<3 then raise exception 'LIFECYCLE_REASON_REQUIRED';end if;
 insert into public.student_lifecycle(student_id,status,reason,changed_by,changed_at) values(p_student_id,p_status,v_reason,a,pg_catalog.now())
  on conflict (student_id) do update set status=excluded.status,reason=excluded.reason,changed_by=excluded.changed_by,changed_at=excluded.changed_at;
 insert into public.student_lifecycle_events(student_id,from_status,to_status,reason,actor_id) values(p_student_id,v_from,p_status,v_reason,a);
 result:=pg_catalog.jsonb_build_object('studentId',p_student_id,'from',v_from,'status',p_status);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'student.lifecycle.changed',p_student_id,payload||pg_catalog.jsonb_build_object('from',v_from));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'student.lifecycle.changed',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_set_student_lifecycle(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_set_student_lifecycle(uuid,text,text,uuid) to authenticated;

-- Teacher read: current lifecycle, its history, and a ledger/academic footprint summary that
-- shows what is preserved for a non-active Student.
create function public.coaching_student_lifecycle(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare l record;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student') then raise exception 'STUDENT_NOT_FOUND';end if;
 select * into l from public.student_lifecycle where student_id=p_student_id;
 return pg_catalog.jsonb_build_object('studentId',p_student_id,'status',coalesce(l.status,'active'),'reason',coalesce(l.reason,''),'changedAt',l.changed_at,
  'history',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('from',e.from_status,'to',e.to_status,'reason',e.reason,'at',e.created_at) order by e.created_at desc)
    from (select * from public.student_lifecycle_events where student_id=p_student_id order by created_at desc limit 50) e),'[]'::jsonb),
  'preserved',pg_catalog.jsonb_build_object(
    'enrollments',(select count(*) from public.enrollments where student_id=p_student_id),
    'dues',(select count(*) from public.monthly_dues where student_id=p_student_id),
    'payments',(select count(*) from public.payments where student_id=p_student_id),
    'receipts',(select count(*) from public.payment_receipts where student_id=p_student_id),
    'examResults',(select count(*) from public.exam_results where student_id=p_student_id)));
end;$function$;
revoke all on function public.coaching_student_lifecycle(uuid) from public,anon,authenticated;
grant execute on function public.coaching_student_lifecycle(uuid) to authenticated;

-- New or re-activated enrollments require an active lifecycle. Existing enrollments are untouched.
create function public.coaching_guard_enrollment_student_lifecycle() returns trigger language plpgsql security definer set search_path='' as $function$
begin
 if new.status in ('pending','active') and (tg_op='INSERT' or old.status is distinct from new.status)
  and public.coaching_student_lifecycle_status(new.student_id)<>'active' then raise exception 'STUDENT_LIFECYCLE_NOT_ACTIVE';end if;
 return new;
end;$function$;
revoke all on function public.coaching_guard_enrollment_student_lifecycle() from public,anon,authenticated;
create trigger enrollment_student_lifecycle_guard before insert or update of status on public.enrollments
 for each row execute function public.coaching_guard_enrollment_student_lifecycle();

-- Monthly due generation skips non-active lifecycle Students (unchanged otherwise).
create or replace function public.coaching_generate_monthly_dues(p_plan_id uuid, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
 v_actor uuid := (select auth.uid());
 v_prior record;
 v_payload jsonb;
 v_result jsonb;
v_plan record; v_archived boolean; v_created integer;
begin
if p_plan_id is null then raise exception 'INVALID_PLAN'; end if;
 v_payload := pg_catalog.jsonb_build_object('planId',p_plan_id);
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'finance.dues.generated' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
select batch_id into v_plan from public.fee_plans where id=p_plan_id;
if not found then raise exception 'PLAN_NOT_FOUND'; end if;
select is_archived into v_archived from public.batches where id=v_plan.batch_id for update;
if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
select * into v_plan from public.fee_plans where id=p_plan_id for update;
insert into public.monthly_dues(fee_plan_id,student_id,batch_id,bill_period,amount_minor)
select v_plan.id,e.student_id,v_plan.batch_id,v_plan.bill_period,v_plan.amount_minor
from public.enrollments e join public.profiles p on p.id=e.student_id
where e.batch_id=v_plan.batch_id and e.status='active' and p.account_status='active' and p.role='student'
 and not exists(select 1 from public.student_lifecycle l where l.student_id=e.student_id and l.status<>'active')
on conflict (fee_plan_id,student_id) do nothing;
get diagnostics v_created=row_count;
v_result:=pg_catalog.jsonb_build_object('planId',p_plan_id,'created',v_created);
insert into public.financial_operations(operation_id,action,target_id,actor_id,response_data) values (p_operation_id,'finance.dues.generated',p_plan_id,v_actor,v_result);
insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'finance.dues.generated',p_plan_id,v_payload);
insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(v_actor,p_operation_id,'finance.dues.generated',v_payload,v_result);
return v_result;
end;
$function$;

-- Student directory v2: the v1 projection plus lifecycle, login state and a lifecycle filter.
-- v1 stays unchanged so already-deployed clients keep validating its exact shape.
create function public.coaching_teacher_student_directory_v2(p_search text default '',p_status text default '',p_class text default '',p_fee_status text default '',p_lifecycle text default '',p_batch_id uuid default null,p_limit integer default 20,p_offset integer default 0)
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
 ), selected as (select * from filtered order by coalesce(admitted_on,created_at::date) desc,created_at desc,id limit p_limit offset p_offset)
 select jsonb_build_object('students',coalesce((select jsonb_agg(jsonb_build_object(
  'id',s.id,'fullName',s.full_name,'accountStatus',s.account_status,'lifecycleStatus',s.lifecycle,'reviewStatus',s.review_status,'loginState',s.login_state,
  'admissionRoll',s.admission_roll,'admittedOn',s.admitted_on,
  'phone',coalesce(s.phone,''),'schoolName',coalesce(s.school_name,''),'className',coalesce(s.class_name,''),'stream',coalesce(s.stream,''),'academicSession',coalesce(s.academic_session,''),
  'photoMediaId',s.photo_media_id,'guardianName',coalesce(s.guardian_name,''),'guardianRelationship',coalesce(s.relationship,''),'guardianMobile',coalesce(s.guardian_mobile,''),
  'outstandingMinor',s.outstanding::text,'batches',s.batches)) from selected s),'[]'::jsonb),
  'total',(select count(*) from filtered),'limit',p_limit,'offset',p_offset,
  'classes',coalesce((select jsonb_agg(c.class_name order by c.class_name) from (select distinct class_name from students where coalesce(class_name,'')<>'') c),'[]'::jsonb),
  'metrics',jsonb_build_object('total',(select count(*) from students),'active',(select count(*) from students where lifecycle='active' and account_status='active'),
   'inactive',(select count(*) from students where lifecycle='inactive'),'cancelled',(select count(*) from students where lifecycle='cancelled'),
   'completed',(select count(*) from students where lifecycle='completed'),
   'newAdmissions',(select count(*) from students where admitted_on>=date_trunc('month',now() at time zone 'Asia/Dhaka')::date),'pendingDues',(select count(*) from students where outstanding>0))) into result;
 return result;
end;$function$;
revoke all on function public.coaching_teacher_student_directory_v2(text,text,text,text,text,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.coaching_teacher_student_directory_v2(text,text,text,text,text,uuid,integer,integer) to authenticated;
notify pgrst,'reload schema';
