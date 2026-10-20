-- PREPARED ONLY: requires explicit DEV approval before applying.
-- Existing Auth identities, enrollments and financial/academic history are untouched.
create sequence public.student_admission_roll_seq;
revoke all on sequence public.student_admission_roll_seq from public,anon,authenticated;

create table public.student_details (
 student_id uuid primary key references public.profiles(id) on delete restrict,
 phone text not null default '' check(char_length(phone)<=30 and phone !~ '[[:cntrl:]]'),
 date_of_birth date check(date_of_birth between date '1900-01-01' and current_date),
 school_name text not null default '' check(char_length(school_name)<=200),
 class_name text not null default '' check(char_length(class_name)<=80),
 stream text not null default '' check(char_length(stream)<=80),
 academic_session text not null default '' check(char_length(academic_session)<=80),
 present_address text not null default '' check(char_length(present_address)<=1000),
 district text not null default '' check(char_length(district)<=100),
 photo_media_id uuid references public.media_assets(id) on delete restrict,
 updated_at timestamptz not null default now()
);
create index student_details_photo_idx on public.student_details(photo_media_id) where photo_media_id is not null;
create table public.student_guardians (
 student_id uuid primary key references public.profiles(id) on delete restrict,
 full_name text not null default '' check(char_length(full_name)<=160),
 relationship text not null default '' check(char_length(relationship)<=80),
 mobile text not null default '' check(char_length(mobile)<=30),
 emergency_contact text not null default '' check(char_length(emergency_contact)<=160),
 updated_at timestamptz not null default now()
);
create table public.student_admission_details (
 student_id uuid primary key references public.profiles(id) on delete restrict,
 admission_roll text not null unique default ('EC-'||pg_catalog.to_char(current_date,'YYYY')||'-'||pg_catalog.lpad(pg_catalog.nextval('public.student_admission_roll_seq')::text,8,'0')),
 admitted_on date not null default current_date check(admitted_on>=date '2000-01-01'),
 admission_due_id uuid references public.monthly_dues(id) on delete restrict,
 revision bigint not null default 1 check(revision>0),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index student_admission_due_idx on public.student_admission_details(admission_due_id) where admission_due_id is not null;
create index student_admission_date_idx on public.student_admission_details(admitted_on desc,student_id);
create index student_admission_creator_idx on public.student_admission_details(created_by);
alter table public.student_details enable row level security;
alter table public.student_guardians enable row level security;
alter table public.student_admission_details enable row level security;
revoke all on public.student_details,public.student_guardians,public.student_admission_details from public,anon,authenticated;
-- No direct writes: audited commands below own the transaction and revision lock.
create policy student_details_read on public.student_details for select to authenticated
 using(public.current_user_is_teacher() or (student_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='student' and account_status='active')));
create policy student_guardians_teacher_read on public.student_guardians for select to authenticated using(public.current_user_is_teacher());
create policy student_admission_read on public.student_admission_details for select to authenticated
 using(public.current_user_is_teacher() or (student_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='student' and account_status='active')));
-- API reads use the explicit RPC allowlist, including redacted Student guardian data.

create function public.coaching_student_admission_read(p_student_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());s uuid:=coalesce(p_student_id,a);t boolean:=public.current_user_is_teacher();p record;d record;g record;n record;
begin
 if a is null or (not t and (s<>a or not exists(select 1 from public.profiles where id=a and role='student' and account_status='active'))) then raise exception 'FORBIDDEN'; end if;
 select pr.id,pr.full_name,pr.account_status,u.email into p from public.profiles pr join auth.users u on u.id=pr.id where pr.id=s and pr.role='student';
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
end;$$;
revoke all on function public.coaching_student_admission_read(uuid) from public,anon,authenticated;
grant execute on function public.coaching_student_admission_read(uuid) to authenticated;

create function public.coaching_student_admission_write(p_student_id uuid,p_data jsonb,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(select auth.uid());t boolean:=public.current_user_is_teacher();n record;prior record;k text;v jsonb;r jsonb;payload jsonb;photo uuid;due uuid;allowed text[];
begin
 if a is null or (not t and (p_student_id is distinct from a or not exists(select 1 from public.profiles where id=a and role='student' and account_status='active'))) then raise exception 'FORBIDDEN'; end if;
 if p_student_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision<0 or p_data is null or pg_catalog.jsonb_typeof(p_data)<>'object' or p_data='{}'::jsonb then raise exception 'INVALID_ADMISSION'; end if;
 allowed:=case when t then array['fullName','phone','dateOfBirth','photoMediaId','schoolName','className','stream','academicSession','presentAddress','district','guardianName','relationship','guardianMobile','emergencyContact','admittedOn','admissionDueId'] else array['fullName','phone','dateOfBirth','presentAddress','district'] end;
 for k,v in select * from pg_catalog.jsonb_each(p_data) loop
  if not(k=any(allowed)) or pg_catalog.jsonb_typeof(v) not in ('string','null') then raise exception 'INVALID_ADMISSION'; end if;
  if v<>'null'::jsonb and (pg_catalog.length(p_data->>k)>case when k='presentAddress' then 1000 when k='schoolName' then 200 when k in ('phone','guardianMobile') then 30 when k in ('className','stream','academicSession','relationship') then 80 when k='district' then 100 else 160 end or (p_data->>k) ~ '[[:cntrl:]]') then raise exception 'INVALID_ADMISSION'; end if;
 end loop;
 if p_data?'fullName' and (p_data->>'fullName' is null or pg_catalog.length(pg_catalog.btrim(p_data->>'fullName')) not between 2 and 160) then raise exception 'INVALID_ADMISSION'; end if;
 payload:=pg_catalog.jsonb_build_object('studentId',p_student_id,'data',p_data,'expectedRevision',p_expected_revision);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select * into prior from public.coaching_mutation_receipts where actor_id=a and operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'student.admission.write' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return prior.result;
 end if;
 perform 1 from public.profiles where id=p_student_id and role='student' for update;
 if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
 select * into n from public.student_admission_details where student_id=p_student_id for update;
 if coalesce(n.revision,0)<>p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
 if n.student_id is null and not t then raise exception 'ADMISSION_NOT_CREATED'; end if;
 if p_data?'photoMediaId' then
  photo:=nullif(p_data->>'photoMediaId','')::uuid;
  if photo is not null and not exists(select 1 from public.media_assets where id=photo and status='ready' and (created_by=a or id=(select photo_media_id from public.student_details where student_id=p_student_id))) then raise exception 'INVALID_PHOTO'; end if;
 end if;
 if p_data?'admissionDueId' then
  due:=nullif(p_data->>'admissionDueId','')::uuid;
  if due is not null and not exists(select 1 from public.monthly_dues where id=due and student_id=p_student_id) then raise exception 'INVALID_ADMISSION_DUE'; end if;
 end if;
 if n.student_id is null then
  insert into public.student_admission_details(student_id,created_by) values(p_student_id,a);
 else
  update public.student_admission_details set revision=revision+1,updated_at=pg_catalog.now() where student_id=p_student_id;
 end if;
 insert into public.student_details(student_id) values(p_student_id) on conflict(student_id) do nothing;
 if t then insert into public.student_guardians(student_id) values(p_student_id) on conflict(student_id) do nothing; end if;
 if p_data?'fullName' then update public.profiles set full_name=pg_catalog.btrim(p_data->>'fullName'),updated_at=pg_catalog.now() where id=p_student_id; end if;
 update public.student_details set
  phone=case when p_data?'phone' then coalesce(p_data->>'phone','') else phone end,
  date_of_birth=case when p_data?'dateOfBirth' then nullif(p_data->>'dateOfBirth','')::date else date_of_birth end,
  photo_media_id=case when p_data?'photoMediaId' then photo else photo_media_id end,
  school_name=case when p_data?'schoolName' then coalesce(p_data->>'schoolName','') else school_name end,
  class_name=case when p_data?'className' then coalesce(p_data->>'className','') else class_name end,
  stream=case when p_data?'stream' then coalesce(p_data->>'stream','') else stream end,
  academic_session=case when p_data?'academicSession' then coalesce(p_data->>'academicSession','') else academic_session end,
  present_address=case when p_data?'presentAddress' then coalesce(p_data->>'presentAddress','') else present_address end,
  district=case when p_data?'district' then coalesce(p_data->>'district','') else district end,updated_at=pg_catalog.now()
 where student_id=p_student_id;
 if t then
  update public.student_guardians set full_name=case when p_data?'guardianName' then coalesce(p_data->>'guardianName','') else full_name end,
   relationship=case when p_data?'relationship' then coalesce(p_data->>'relationship','') else relationship end,
   mobile=case when p_data?'guardianMobile' then coalesce(p_data->>'guardianMobile','') else mobile end,
   emergency_contact=case when p_data?'emergencyContact' then coalesce(p_data->>'emergencyContact','') else emergency_contact end,updated_at=pg_catalog.now() where student_id=p_student_id;
  update public.student_admission_details set admitted_on=case when p_data?'admittedOn' then coalesce(nullif(p_data->>'admittedOn','')::date,current_date) else admitted_on end,
   admission_due_id=case when p_data?'admissionDueId' then due else admission_due_id end where student_id=p_student_id;
 end if;
 r:=public.coaching_student_admission_read(p_student_id);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'student.admission.updated',p_student_id,pg_catalog.jsonb_build_object('fields',(select pg_catalog.jsonb_agg(key) from pg_catalog.jsonb_object_keys(p_data) as x(key)),'revision',r->'revision'));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'student.admission.write',payload,r);
 return r;
end;$$;
revoke all on function public.coaching_student_admission_write(uuid,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.coaching_student_admission_write(uuid,jsonb,bigint,uuid) to authenticated;

create function public.coaching_student_photo_readable(p_key text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_details d join public.media_assets m on m.id=d.photo_media_id
  join public.profiles p on p.id=d.student_id where d.student_id=(select auth.uid())
  and p.role='student' and p.account_status='active' and m.status='ready' and m.storage_key=p_key);
$$;
revoke all on function public.coaching_student_photo_readable(text) from public,anon,authenticated;
grant execute on function public.coaching_student_photo_readable(text) to authenticated;
create policy musa_student_own_photo_read on storage.objects for select to authenticated
 using(bucket_id='musa-site-media' and public.coaching_student_photo_readable(name));

create function public.coaching_student_photo(p_student_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s uuid:=coalesce(p_student_id,(select auth.uid()));r jsonb;
begin
 perform public.coaching_student_admission_read(s); -- Identical verified Teacher / self-only boundary.
 select pg_catalog.jsonb_build_object('id',m.id,'key',m.storage_key,'contentType',m.content_type,'sizeBytes',m.size_bytes,'sha256',m.sha256)
 into r from public.student_details d join public.media_assets m on m.id=d.photo_media_id where d.student_id=s and m.status='ready';
 if r is null then raise exception 'MEDIA_NOT_FOUND'; end if;
 return r;
end;$$;
revoke all on function public.coaching_student_photo(uuid) from public,anon,authenticated;
grant execute on function public.coaching_student_photo(uuid) to authenticated;
