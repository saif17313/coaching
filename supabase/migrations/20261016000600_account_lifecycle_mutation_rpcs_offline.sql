-- UNAPPLIED DRAFT. Requires 00100 core and 00200 resources/audit migrations first.
-- Review with a real Supabase project before enabling COACHING_ENABLE_MUTATION_APIS.
-- Each RPC executes as one PostgreSQL transaction and independently enforces actor role/status.

create type public.account_status as enum ('pending','active','disabled','rejected');
alter table public.profiles add column account_status public.account_status not null default 'pending';
create index profiles_account_status_idx on public.profiles(account_status,role);

-- Provisioned teachers must explicitly be marked active by a trusted DBA workflow.
create or replace function public.current_user_is_teacher()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles
    where id = (select auth.uid()) and role = 'teacher'::public.app_role
      and account_status = 'active'::public.account_status);
$$;
revoke all on function public.current_user_is_teacher() from public, anon;
grant execute on function public.current_user_is_teacher() to authenticated;

create function public.coaching_current_user_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles
    where id = (select auth.uid()) and account_status = 'active'::public.account_status);
$$;
revoke all on function public.coaching_current_user_is_active() from public,anon;
grant execute on function public.coaching_current_user_is_active() to authenticated;

-- Old Phase-1 batch policies would permit unaudited direct writes. Remove them.
drop policy if exists batches_teacher_insert on public.batches;
drop policy if exists batches_teacher_update on public.batches;
revoke insert,update,delete on public.batches from authenticated;
drop policy if exists batches_authenticated_read on public.batches;
create policy batches_active_account_read on public.batches for select to authenticated
  using ((select public.coaching_current_user_is_active()));
-- Explicitly tighten student enrollment reading for disabled/pending accounts.
drop policy if exists enrollments_student_read on public.enrollments;
create policy enrollments_active_student_read on public.enrollments for select to authenticated
  using (student_id=(select auth.uid()) and (select public.coaching_current_user_is_active()));

-- Existing student SELECT policies must also enforce account status: enrollment
-- alone must NEVER grant disabled accounts access to resources or financial data.
alter policy batch_contents_student_published_read on public.batch_contents using (
  (select public.coaching_current_user_is_active()) and status='published'
  and (release_at is null or release_at<=now()) and exists
  (select 1 from public.enrollments e where e.batch_id=batch_contents.batch_id
    and e.student_id=(select auth.uid()) and e.status='active'));
alter policy announcements_student_published_read on public.announcements using (
  (select public.coaching_current_user_is_active()) and status='published'
  and (visible_from is null or visible_from<=now()) and exists
  (select 1 from public.enrollments e where e.batch_id=announcements.batch_id
    and e.student_id=(select auth.uid()) and e.status='active'));
alter policy notifications_owner_read on public.notifications using (
  recipient_id=(select auth.uid()) and (select public.coaching_current_user_is_active()));
alter policy dues_student_select on public.monthly_dues using (
  student_id=(select auth.uid()) and (select public.coaching_current_user_is_active()));
alter policy payments_student_select on public.payments using (
  student_id=(select auth.uid()) and (select public.coaching_current_user_is_active()));
alter policy adjustments_student_select on public.payment_adjustments using (
  (select public.coaching_current_user_is_active()) and exists
  (select 1 from public.monthly_dues d where d.id=payment_adjustments.due_id
    and d.student_id=(select auth.uid())));
alter policy subjects_student_enrolled_read on public.academic_subjects using (
  (select public.coaching_current_user_is_active()) and exists
  (select 1 from public.enrollments e where e.student_id=(select auth.uid())
    and e.batch_id=academic_subjects.batch_id and e.status='active'));
alter policy syllabus_student_read on public.syllabus_units using (
  (select public.coaching_current_user_is_active()) and exists
  (select 1 from public.academic_subjects s join public.enrollments e on e.batch_id=s.batch_id
    where s.id=syllabus_units.subject_id and e.student_id=(select auth.uid()) and e.status='active'));
alter policy routine_enrolled_active_read on public.routine_slots using (
  (select public.coaching_current_user_is_active()) and status='active' and exists
  (select 1 from public.enrollments e where e.batch_id=routine_slots.batch_id
    and e.student_id=(select auth.uid()) and e.status='active'));
alter policy assignments_active_released_read on public.academic_assignments using (
  (select public.coaching_current_user_is_active()) and status in ('published','closed')
  and release_at<=now() and exists
  (select 1 from public.enrollments e where e.batch_id=academic_assignments.batch_id
    and e.student_id=(select auth.uid()) and e.status='active'));

-- This table is private to SECURITY DEFINER RPCs; no direct client policies or grants.
create table public.coaching_mutation_receipts (
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  operation_type text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,operation_id)
);
alter table public.coaching_mutation_receipts enable row level security;
revoke all on public.coaching_mutation_receipts from public,anon,authenticated;

create function public.coaching_change_student_status(
  p_student_id uuid, p_next_status text, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_old public.account_status;
  v_payload jsonb := jsonb_build_object('studentId',p_student_id,'status',p_next_status);
  v_result jsonb;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_student_id is null or p_operation_id is null or (p_next_status is null or p_next_status not in ('active','disabled','rejected')) then raise exception 'INVALID_COMMAND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'student-status' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select account_status into v_old from public.profiles
    where id=p_student_id and role='student'::public.app_role for update;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  if not ((v_old='pending' and p_next_status in ('active','rejected'))
    or (v_old='active' and p_next_status='disabled')
    or (v_old='disabled' and p_next_status='active')) then raise exception 'INVALID_STATUS_TRANSITION'; end if;
  update public.profiles set account_status=p_next_status::public.account_status,updated_at=now()
    where id=p_student_id;
  v_result:=jsonb_build_object('id',p_student_id,'status',p_next_status);
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'student.status.changed',p_student_id,jsonb_build_object('from',v_old,'to',p_next_status));
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'student-status',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_change_student_status(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_change_student_status(uuid,text,uuid) to authenticated;

create function public.coaching_decide_enrollment(
  p_enrollment_id uuid, p_decision text, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_enrollment record;
  v_batch uuid;
  v_active integer;
  v_capacity integer;
  v_archived boolean;
  v_student_status public.account_status;
  v_status public.enrollment_status;
  v_payload jsonb := jsonb_build_object('enrollmentId',p_enrollment_id,'decision',p_decision);
  v_result jsonb;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_enrollment_id is null or p_operation_id is null or (p_decision is null or p_decision not in ('approve','reject','cancel')) then raise exception 'INVALID_COMMAND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'enrollment-decision' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select batch_id into v_batch from public.enrollments where id=p_enrollment_id;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND'; end if;
  -- A batch lock serializes capacity-changing commands with approvals.
  select capacity,is_archived into v_capacity,v_archived from public.batches where id=v_batch for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  select id,student_id,status,batch_id into v_enrollment from public.enrollments where id=p_enrollment_id for update;
  if not found or v_enrollment.batch_id<>v_batch then raise exception 'ENROLLMENT_CHANGED'; end if;
  if p_decision='approve' then
    if v_enrollment.status<>'pending' or v_archived then raise exception 'INVALID_ENROLLMENT_TRANSITION'; end if;
    select account_status into v_student_status from public.profiles
      where id=v_enrollment.student_id and role='student'::public.app_role;
    if v_student_status is distinct from 'active'::public.account_status then raise exception 'STUDENT_NOT_ACTIVE'; end if;
    select count(*) into v_active from public.enrollments where batch_id=v_batch and status='active';
    if v_active>=v_capacity then raise exception 'BATCH_FULL'; end if;
    v_status:='active';
  elsif p_decision='reject' then
    if v_enrollment.status<>'pending' then raise exception 'INVALID_ENROLLMENT_TRANSITION'; end if;
    v_status:='rejected';
  else
    if v_enrollment.status not in ('pending','active') then raise exception 'INVALID_ENROLLMENT_TRANSITION'; end if;
    v_status:='cancelled';
  end if;
  update public.enrollments set status=v_status,decided_at=now() where id=p_enrollment_id;
  v_result:=jsonb_build_object('id',p_enrollment_id,'status',v_status);
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'enrollment.decided',p_enrollment_id,jsonb_build_object('from',v_enrollment.status,'to',v_status));
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'enrollment-decision',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_decide_enrollment(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_decide_enrollment(uuid,text,uuid) to authenticated;

create function public.coaching_create_batch(
  p_code text, p_name text, p_capacity integer, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_id uuid;
  v_payload jsonb:=jsonb_build_object('code',p_code,'name',p_name,'capacity',p_capacity);
  v_result jsonb;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null or p_code is null or p_code !~ '^[A-Z0-9][A-Z0-9_-]{1,23}$'
    or p_name is null or char_length(trim(p_name)) not between 2 and 120
    or p_capacity is null or p_capacity not between 1 and 100000 then raise exception 'INVALID_BATCH'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'batch-create' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  insert into public.batches(code,name,capacity) values(p_code,trim(p_name),p_capacity) returning id into v_id;
  v_result:=jsonb_build_object('id',v_id,'code',p_code,'name',trim(p_name),'capacity',p_capacity,'isArchived',false);
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'batch.created',v_id,jsonb_build_object('code',p_code));
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'batch-create',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_create_batch(text,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.coaching_create_batch(text,text,integer,uuid) to authenticated;

create function public.coaching_update_batch(
  p_batch_id uuid, p_name text, p_capacity integer, p_archived boolean, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_batch record;
  v_active integer;
  v_payload jsonb:=jsonb_build_object('batchId',p_batch_id,'name',p_name,'capacity',p_capacity,'isArchived',p_archived);
  v_result jsonb;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_batch_id is null or p_operation_id is null or (p_name is null and p_capacity is null and p_archived is null)
    or (p_name is not null and char_length(trim(p_name)) not between 2 and 120)
    or (p_capacity is not null and p_capacity not between 1 and 100000) then raise exception 'INVALID_BATCH_PATCH'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'batch-update' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select id,code,name,capacity,is_archived into v_batch from public.batches where id=p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if p_capacity is not null then
    select count(*) into v_active from public.enrollments where batch_id=p_batch_id and status='active';
    if p_capacity<v_active then raise exception 'CAPACITY_BELOW_ACTIVE'; end if;
  end if;
  update public.batches set name=coalesce(trim(p_name),v_batch.name),
    capacity=coalesce(p_capacity,v_batch.capacity),is_archived=coalesce(p_archived,v_batch.is_archived),updated_at=now()
    where id=p_batch_id;
  v_result:=jsonb_build_object('id',p_batch_id,'code',v_batch.code,'name',coalesce(trim(p_name),v_batch.name),
    'capacity',coalesce(p_capacity,v_batch.capacity),'isArchived',coalesce(p_archived,v_batch.is_archived));
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'batch.updated',p_batch_id,jsonb_build_object('name',p_name,'capacity',p_capacity,'isArchived',p_archived));
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'batch-update',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_update_batch(uuid,text,integer,boolean,uuid) from public,anon,authenticated;
grant execute on function public.coaching_update_batch(uuid,text,integer,boolean,uuid) to authenticated;

-- No service-role key is required by the HTTP adapter; RPC definer role grants are narrow.
-- Teacher provisioning (role/account_status) must occur through a separate trusted process.
