-- Offline admission: a Student record can exist before any Auth identity.
-- Additive and backward compatible. Existing profiles keep id = auth.users.id, and every
-- RPC that compares profiles.id with auth.uid() keeps working. An offline profile is later
-- linked by creating its Auth user with the SAME id (server-side admin call), so enrollment,
-- finance and academic rows never move.

-- 1. Profiles no longer require an Auth row. Deleting an Auth user now leaves the profile
--    (and all of its history) in place instead of attempting a cascade.
alter table public.profiles drop constraint if exists profiles_id_fkey;

create table public.student_login_links (
 student_id uuid primary key references public.profiles(id) on delete restrict,
 email text not null check(char_length(email) between 3 and 254 and email ~ '^\S+@\S+\.\S+$'),
 status text not null default 'pending' check(status in ('pending','linked','cancelled')),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 linked_at timestamptz,
 check((status='linked')=(linked_at is not null))
);
create unique index student_login_links_email_active_idx on public.student_login_links(lower(email)) where status in ('pending','linked');
create index student_login_links_creator_idx on public.student_login_links(created_by);
alter table public.student_login_links enable row level security;
revoke all on public.student_login_links from public,anon,authenticated;

-- 2. Signup trigger: if the Auth user id matches a prepared offline profile, link it
--    (never change its role or status); otherwise create the usual pending Student.
create or replace function public.create_student_profile()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  -- An email reserved for an offline Student can only become that Student's own login
  -- (same id). Any other signup or invitation with that email is refused, so no duplicate
  -- Student identity can be created around an existing record.
  if exists(select 1 from public.student_login_links l where lower(l.email)=lower(coalesce(new.email,'')) and l.status in ('pending','linked') and l.student_id<>new.id) then
    raise exception 'EMAIL_RESERVED_FOR_STUDENT';
  end if;
  insert into public.profiles (id, role, full_name)
  values (new.id, 'student'::public.app_role, '')
  on conflict (id) do nothing;
  update public.student_login_links set status='linked',linked_at=pg_catalog.now()
   where student_id=new.id and status='pending' and lower(email)=lower(coalesce(new.email,''));
  return new;
end;
$function$;
revoke all on function public.create_student_profile() from public,anon,authenticated;

-- 3. Reads tolerate a missing Auth row (email is empty until linked).
create or replace function public.coaching_student_admission_read(p_student_id uuid default null::uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare a uuid:=(select auth.uid());s uuid:=coalesce(p_student_id,a);t boolean:=public.current_user_is_teacher();p record;d record;g record;n record;
begin
 if a is null or (not t and (s<>a or not exists(select 1 from public.profiles where id=a and role='student' and account_status='active'))) then raise exception 'FORBIDDEN'; end if;
 select pr.id,pr.full_name,pr.account_status,coalesce(u.email,'') email into p from public.profiles pr left join auth.users u on u.id=pr.id where pr.id=s and pr.role='student';
 if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
 select * into d from public.student_details where student_id=s;
 select * into g from public.student_guardians where student_id=s;
 select * into n from public.student_admission_details where student_id=s;
 return pg_catalog.jsonb_build_object('id',s,'fullName',p.full_name,'email',p.email,'accountStatus',p.account_status,
  'revision',coalesce(n.revision,0),'admissionRoll',n.admission_roll,'admittedOn',n.admitted_on,
  'personal',pg_catalog.jsonb_build_object('phone',coalesce(d.phone,''),'dateOfBirth',d.date_of_birth,'photoMediaId',d.photo_media_id,
    'schoolName',coalesce(d.school_name,''),'className',coalesce(d.class_name,''),'stream',coalesce(d.stream,''),'academicSession',coalesce(d.academic_session,''),'presentAddress',coalesce(d.present_address,''),'district',coalesce(d.district,'')),
  'guardian',pg_catalog.jsonb_build_object('fullName',coalesce(g.full_name,''),'relationship',coalesce(g.relationship,''),'mobile',coalesce(g.mobile,''))||case when t then pg_catalog.jsonb_build_object('emergencyContact',coalesce(g.emergency_contact,'')) else '{}'::jsonb end,
  'admissionDueId',case when t then n.admission_due_id else null end,
  'enrollments',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',e.id,'batchId',e.batch_id,'batchName',b.name,'status',e.status) order by e.requested_at desc) from public.enrollments e join public.batches b on b.id=e.batch_id where e.student_id=s),'[]'::jsonb),
  'feePlans',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',f.id,'batchId',f.batch_id,'billPeriod',f.bill_period,'amountMinor',f.amount_minor,'currency',f.currency,'label',f.label) order by f.bill_period desc) from public.fee_plans f where exists(select 1 from public.enrollments e where e.student_id=s and e.batch_id=f.batch_id and e.status='active')),'[]'::jsonb));
end;$function$;

-- 4. Teacher creates an offline Student (active, no login). Details/guardian/photo are then
--    saved through the existing audited coaching_student_admission_write.
create function public.coaching_create_offline_student(p_full_name text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;sid uuid;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_operation_id is null or p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 160 or p_full_name ~ '[[:cntrl:]]' then raise exception 'INVALID_STUDENT';end if;
 payload:=pg_catalog.jsonb_build_object('fullName',btrim(p_full_name));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'student.offline.created' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 sid:=pg_catalog.gen_random_uuid();
 insert into public.profiles(id,role,full_name,account_status) values(sid,'student'::public.app_role,btrim(p_full_name),'active'::public.account_status);
 result:=pg_catalog.jsonb_build_object('id',sid,'fullName',btrim(p_full_name),'accountStatus','active','login','none');
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'student.offline.created',sid,payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'student.offline.created',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_create_offline_student(text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_create_offline_student(text,uuid) to authenticated;

-- 5. Reserve an email for a later login. The server then creates the Auth user with
--    id = student id; the trigger above marks the link as linked.
create function public.coaching_prepare_student_login(p_student_id uuid,p_email text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;e text:=lower(btrim(coalesce(p_email,'')));
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_student_id is null or p_operation_id is null or char_length(e) not between 3 and 254 or e !~ '^\S+@\S+\.\S+$' then raise exception 'INVALID_LOGIN_LINK';end if;
 payload:=pg_catalog.jsonb_build_object('studentId',p_student_id,'email',e);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'student.login.prepared' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 perform 1 from public.profiles where id=p_student_id and role='student' for update;
 if not found then raise exception 'STUDENT_NOT_FOUND';end if;
 if exists(select 1 from auth.users where id=p_student_id) then raise exception 'STUDENT_ALREADY_HAS_LOGIN';end if;
 if exists(select 1 from auth.users where lower(email)=e) then raise exception 'EMAIL_ALREADY_REGISTERED';end if;
 if exists(select 1 from public.student_login_links where lower(email)=e and status in ('pending','linked') and student_id<>p_student_id) then raise exception 'EMAIL_ALREADY_RESERVED';end if;
 insert into public.student_login_links(student_id,email,status,created_by) values(p_student_id,e,'pending',a)
  on conflict (student_id) do update set email=excluded.email,status='pending',created_by=excluded.created_by,created_at=pg_catalog.now(),linked_at=null
  where public.student_login_links.status<>'linked';
 result:=pg_catalog.jsonb_build_object('studentId',p_student_id,'email',e,'status','pending');
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'student.login.prepared',p_student_id,payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'student.login.prepared',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_prepare_student_login(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_prepare_student_login(uuid,text,uuid) to authenticated;

-- Teacher-only login state for a Student:
--   none (offline only) | reserved (email reserved, no Auth user yet)
--   | invited (Auth user exists, email not yet verified) | linked (verified login).
create function public.coaching_student_login_state(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare l record;u record;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student') then raise exception 'STUDENT_NOT_FOUND';end if;
 select * into l from public.student_login_links where student_id=p_student_id;
 select email,email_confirmed_at into u from auth.users where id=p_student_id;
 return pg_catalog.jsonb_build_object('studentId',p_student_id,
  'state',case when u.email is not null and u.email_confirmed_at is not null then 'linked' when u.email is not null then 'invited' when l.status='pending' then 'reserved' else 'none' end,
  'email',coalesce(u.email,l.email,''));
end;$function$;
revoke all on function public.coaching_student_login_state(uuid) from public,anon,authenticated;
grant execute on function public.coaching_student_login_state(uuid) to authenticated;
notify pgrst,'reload schema';
