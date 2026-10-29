-- Dated class sessions: each class on a specific date with subject, optional syllabus topic, location (room or
-- online link) and a status (scheduled -> completed / cancelled). Sessions can be generated from the weekly
-- routine. No delete command: a class that does not happen is cancelled, keeping its history.
-- RLS on with no client grants; all access goes through the SECURITY DEFINER functions below.
create table public.class_sessions(
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.batches(id) on delete restrict,
 subject_id uuid,
 routine_slot_id uuid references public.routine_slots(id) on delete restrict,
 session_date date not null,
 start_minute smallint not null,
 end_minute smallint not null,
 topic text not null default '',
 syllabus_unit_id uuid references public.syllabus_units(id) on delete restrict,
 location text not null default '',
 status text not null default 'scheduled',
 notes text not null default '',
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint class_session_subject_fk foreign key (subject_id,batch_id) references public.academic_subjects(id,batch_id) on delete restrict,
 constraint class_session_time check (start_minute between 0 and 1439 and end_minute between 1 and 1440 and end_minute>start_minute),
 constraint class_session_status check (status in ('scheduled','completed','cancelled')),
 constraint class_session_text check (char_length(topic)<=200 and char_length(location)<=300 and char_length(notes)<=1000)
);
create unique index class_session_slot_date on public.class_sessions(routine_slot_id,session_date) where routine_slot_id is not null;
create index class_session_batch_date on public.class_sessions(batch_id,session_date);
alter table public.class_sessions enable row level security;
revoke all on public.class_sessions from public,anon,authenticated;

-- Teacher commands: create | update | status. data keys are validated exactly.
create function public.coaching_class_session_write(p_action text,p_session_id uuid,p_data jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;s public.class_sessions%rowtype;sid uuid;
 v_batch uuid;v_subject uuid;v_unit uuid;v_date date;v_start integer;v_end integer;v_topic text;v_location text;v_notes text;v_status text;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_operation_id is null or p_action is null or p_action not in ('create','update','status') or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'INVALID_SESSION';end if;
 payload:=pg_catalog.jsonb_build_object('action',p_action,'sessionId',p_session_id,'data',p_data);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'academic.session.write' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 if p_action<>'create' then
  select * into s from public.class_sessions where id=p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND';end if;
 end if;
 if p_action in ('create','update') then
  if exists(select 1 from pg_catalog.jsonb_object_keys(p_data) k where k not in ('batchId','subjectId','date','startMinute','endMinute','topic','unitId','location','notes')) then raise exception 'INVALID_SESSION';end if;
  if p_action='update' and p_data ? 'batchId' and (p_data->>'batchId')::uuid<>s.batch_id then raise exception 'INVALID_SESSION';end if;
  v_batch:=case when p_action='create' then nullif(p_data->>'batchId','')::uuid else s.batch_id end;
  v_subject:=case when p_data ? 'subjectId' then nullif(p_data->>'subjectId','')::uuid when p_action='update' then s.subject_id end;
  v_unit:=case when p_data ? 'unitId' then nullif(p_data->>'unitId','')::uuid when p_action='update' then s.syllabus_unit_id end;
  v_date:=case when p_data ? 'date' then nullif(p_data->>'date','')::date when p_action='update' then s.session_date end;
  v_start:=case when p_data ? 'startMinute' then (p_data->>'startMinute')::integer when p_action='update' then s.start_minute end;
  v_end:=case when p_data ? 'endMinute' then (p_data->>'endMinute')::integer when p_action='update' then s.end_minute end;
  v_topic:=btrim(coalesce(p_data->>'topic',case when p_action='update' then s.topic end,''));
  v_location:=btrim(coalesce(p_data->>'location',case when p_action='update' then s.location end,''));
  v_notes:=coalesce(p_data->>'notes',case when p_action='update' then s.notes end,'');
  if v_batch is null or v_date is null or v_start is null or v_end is null or v_start not between 0 and 1439 or v_end not between 1 and 1440 or v_end<=v_start
   or char_length(v_topic)>200 or char_length(v_location)>300 or char_length(v_notes)>1000 then raise exception 'INVALID_SESSION';end if;
  perform 1 from public.batches where id=v_batch and lifecycle_status not in ('cancelled','archived') for update;
  if not found then raise exception 'BATCH_UNAVAILABLE';end if;
  if v_subject is not null and not exists(select 1 from public.academic_subjects where id=v_subject and batch_id=v_batch) then raise exception 'SUBJECT_NOT_FOUND';end if;
  if v_unit is not null and (v_subject is null or not exists(select 1 from public.syllabus_units where id=v_unit and subject_id=v_subject)) then raise exception 'UNIT_NOT_FOUND';end if;
  if p_action='create' then
   insert into public.class_sessions(batch_id,subject_id,session_date,start_minute,end_minute,topic,syllabus_unit_id,location,notes,created_by)
    values(v_batch,v_subject,v_date,v_start,v_end,v_topic,v_unit,v_location,v_notes,a) returning id into sid;
  else
   update public.class_sessions set subject_id=v_subject,session_date=v_date,start_minute=v_start,end_minute=v_end,topic=v_topic,syllabus_unit_id=v_unit,
    location=v_location,notes=v_notes,updated_at=pg_catalog.now() where id=p_session_id;
   sid:=p_session_id;
  end if;
 else
  if exists(select 1 from pg_catalog.jsonb_object_keys(p_data) k where k not in ('status','markTopicCompleted')) then raise exception 'INVALID_SESSION';end if;
  v_status:=p_data->>'status';
  if v_status is null or v_status not in ('scheduled','completed','cancelled') or v_status=s.status then raise exception 'INVALID_SESSION_TRANSITION';end if;
  if v_status='completed' and s.session_date>(pg_catalog.now() at time zone 'Asia/Dhaka')::date then raise exception 'SESSION_IN_FUTURE';end if;
  update public.class_sessions set status=v_status,updated_at=pg_catalog.now() where id=p_session_id;
  -- Optional academic-progress link: completing a class can mark its syllabus topic completed on that date.
  if v_status='completed' and coalesce((p_data->>'markTopicCompleted')::boolean,false) and s.syllabus_unit_id is not null then
   update public.syllabus_units set status='completed',completed_on=s.session_date,updated_at=pg_catalog.now() where id=s.syllabus_unit_id and status<>'completed';
  end if;
  sid:=p_session_id;
 end if;
 result:=pg_catalog.jsonb_build_object('id',sid,'action',p_action);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'academic.session.'||p_action,sid,payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'academic.session.write',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_class_session_write(text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.coaching_class_session_write(text,uuid,jsonb,uuid) to authenticated;

-- Create sessions from the batch's active weekly routine for a date range (max 62 days); existing slot/date
-- sessions are kept as they are, so running it twice never duplicates a class.
create function public.coaching_generate_class_sessions(p_batch_id uuid,p_from date,p_to date,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;created integer;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_batch_id is null or p_from is null or p_to is null or p_operation_id is null or p_to<p_from or p_to-p_from>61 then raise exception 'INVALID_SESSION';end if;
 payload:=pg_catalog.jsonb_build_object('batchId',p_batch_id,'from',p_from,'to',p_to);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'academic.session.generate' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 perform 1 from public.batches where id=p_batch_id and lifecycle_status not in ('cancelled','archived') for update;
 if not found then raise exception 'BATCH_UNAVAILABLE';end if;
 insert into public.class_sessions(batch_id,subject_id,routine_slot_id,session_date,start_minute,end_minute,location,created_by)
  select r.batch_id,r.subject_id,r.id,d::date,r.start_minute,least(r.end_minute,1440),r.room,a
  from public.routine_slots r cross join pg_catalog.generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
  where r.batch_id=p_batch_id and r.status='active' and extract(dow from d)::integer=r.day_of_week
  on conflict (routine_slot_id,session_date) where routine_slot_id is not null do nothing;
 get diagnostics created=row_count;
 result:=pg_catalog.jsonb_build_object('batchId',p_batch_id,'created',created);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'academic.session.generate',p_batch_id,payload||pg_catalog.jsonb_build_object('created',created));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'academic.session.generate',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_generate_class_sessions(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.coaching_generate_class_sessions(uuid,date,date,uuid) to authenticated;

-- Sessions of one batch in a date range. Teacher, or an active Student actively enrolled in that batch.
create function public.coaching_class_sessions(p_batch_id uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());
begin
 if a is null or not (public.current_user_is_teacher() or (
   exists(select 1 from public.profiles where id=a and role='student' and account_status='active')
   and exists(select 1 from public.enrollments where student_id=a and batch_id=p_batch_id and status='active'))) then raise exception 'FORBIDDEN';end if;
 if p_batch_id is null or p_from is null or p_to is null or p_to<p_from or p_to-p_from>370 then raise exception 'INVALID_FILTER';end if;
 return pg_catalog.jsonb_build_object('batchId',p_batch_id,'from',p_from,'to',p_to,'sessions',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id',c.id,'date',c.session_date,'startMinute',c.start_minute,'endMinute',c.end_minute,'status',c.status,'topic',c.topic,'location',c.location,
   'notes',case when public.current_user_is_teacher() then c.notes else '' end,'fromRoutine',c.routine_slot_id is not null,
   'subjectId',c.subject_id,'subject',coalesce(s.title,''),'unitId',c.syllabus_unit_id,'unit',coalesce(u.title,''),'unitStatus',u.status)
   order by c.session_date,c.start_minute)
  from public.class_sessions c left join public.academic_subjects s on s.id=c.subject_id left join public.syllabus_units u on u.id=c.syllabus_unit_id
  where c.batch_id=p_batch_id and c.session_date between p_from and p_to),'[]'::jsonb));
end;$function$;
revoke all on function public.coaching_class_sessions(uuid,date,date) from public,anon,authenticated;
grant execute on function public.coaching_class_sessions(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
