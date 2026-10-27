-- Syllabus: subject -> chapter -> topic with planned/in-progress/completed tracking.
-- Existing units become top-level chapters (status planned, weight 1). Existing RPCs and the
-- direct-read policies keep working; new columns are additive.
--
-- Progress rule (documented, deterministic): progress is weighted over LEAF units
-- (topics, or chapters without topics). completed counts fully, in_progress and planned count
-- zero. Percent = sum(weight of completed leaves) / sum(weight of all leaves), in basis points.

alter table public.syllabus_units
 add column parent_id uuid,
 add column status text not null default 'planned',
 add column weight smallint not null default 1,
 add column planned_start date,
 add column planned_end date,
 add column completed_on date,
 add column notes text not null default '',
 add column updated_at timestamptz not null default now(),
 add constraint syllabus_unit_id_subject_unique unique (id,subject_id),
 add constraint syllabus_status_valid check (status in ('planned','in_progress','completed')),
 add constraint syllabus_weight_valid check (weight between 1 and 100),
 add constraint syllabus_planned_valid check (planned_start is null or planned_end is null or planned_start<=planned_end),
 add constraint syllabus_completed_consistent check ((status='completed')=(completed_on is not null)),
 add constraint syllabus_notes_length check (char_length(notes)<=1000),
 add constraint syllabus_not_own_parent check (parent_id is null or parent_id<>id);
-- A topic's parent must be a unit in the same subject.
alter table public.syllabus_units add constraint syllabus_parent_same_subject
 foreign key (parent_id,subject_id) references public.syllabus_units(id,subject_id) on delete restrict;
create index syllabus_units_parent_idx on public.syllabus_units(parent_id) where parent_id is not null;

-- Only two levels: a topic cannot itself have topics, and a chapter with topics cannot become a topic.
create function public.coaching_syllabus_depth_guard() returns trigger language plpgsql set search_path='' as $function$
begin
 if new.parent_id is not null and (
   exists(select 1 from public.syllabus_units p where p.id=new.parent_id and p.parent_id is not null)
   or exists(select 1 from public.syllabus_units c where c.parent_id=new.id)) then raise exception 'SYLLABUS_DEPTH_EXCEEDED';end if;
 return new;
end;$function$;
revoke all on function public.coaching_syllabus_depth_guard() from public,anon,authenticated;
create trigger syllabus_depth_guard before insert or update of parent_id on public.syllabus_units for each row execute function public.coaching_syllabus_depth_guard();

-- Teacher syllabus commands: create | update | status. Units are never deleted here; a unit that
-- is no longer taught keeps its history and can be left planned.
create function public.coaching_syllabus_unit_write(p_action text,p_unit_id uuid,p_subject_id uuid,p_data jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;u record;sid uuid;bid uuid;uid uuid;pos integer;
 v_title text;v_parent uuid;v_weight integer;v_ps date;v_pe date;v_status text;v_done date;v_notes text;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_operation_id is null or p_action not in ('create','update','status') or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'INVALID_SYLLABUS';end if;
 payload:=pg_catalog.jsonb_build_object('action',p_action,'unitId',p_unit_id,'subjectId',p_subject_id,'data',p_data);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'academic.syllabus.write' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 if p_action='create' then sid:=p_subject_id;
 else
  select * into u from public.syllabus_units where id=p_unit_id;
  if not found then raise exception 'UNIT_NOT_FOUND';end if;
  sid:=u.subject_id;
 end if;
 select batch_id into bid from public.academic_subjects where id=sid;
 if not found then raise exception 'SUBJECT_NOT_FOUND';end if;
 perform 1 from public.batches where id=bid and not is_archived for update;
 if not found then raise exception 'BATCH_UNAVAILABLE';end if;
 if p_action<>'create' then select * into u from public.syllabus_units where id=p_unit_id for update;end if;

 if p_action in ('create','update') then
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('title','parentId','weight','plannedStart','plannedEnd','notes')) then raise exception 'INVALID_SYLLABUS';end if;
  v_title:=btrim(coalesce(p_data->>'title',case when p_action='update' then u.title end,''));
  v_parent:=case when p_data ? 'parentId' then nullif(p_data->>'parentId','')::uuid when p_action='update' then u.parent_id end;
  v_weight:=coalesce((p_data->>'weight')::integer,case when p_action='update' then u.weight end,1);
  v_ps:=case when p_data ? 'plannedStart' then nullif(p_data->>'plannedStart','')::date when p_action='update' then u.planned_start end;
  v_pe:=case when p_data ? 'plannedEnd' then nullif(p_data->>'plannedEnd','')::date when p_action='update' then u.planned_end end;
  v_notes:=coalesce(p_data->>'notes',case when p_action='update' then u.notes end,'');
  if char_length(v_title) not between 2 and 160 or v_weight not between 1 and 100 or char_length(v_notes)>1000 or (v_ps is not null and v_pe is not null and v_ps>v_pe) then raise exception 'INVALID_SYLLABUS';end if;
  if v_parent is not null and not exists(select 1 from public.syllabus_units where id=v_parent and subject_id=sid) then raise exception 'PARENT_SUBJECT_MISMATCH';end if;
 end if;

 if p_action='create' then
  select coalesce(max(position),0)+1 into pos from public.syllabus_units where subject_id=sid;
  if pos>10000 then raise exception 'SYLLABUS_TOO_LARGE';end if;
  insert into public.syllabus_units(subject_id,title,position,parent_id,weight,planned_start,planned_end,notes)
   values(sid,v_title,pos,v_parent,v_weight,v_ps,v_pe,v_notes) returning id into uid;
 elsif p_action='update' then
  update public.syllabus_units set title=v_title,parent_id=v_parent,weight=v_weight,planned_start=v_ps,planned_end=v_pe,notes=v_notes,updated_at=pg_catalog.now() where id=p_unit_id;
  uid:=p_unit_id;
 else
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('status','completedOn')) then raise exception 'INVALID_SYLLABUS';end if;
  v_status:=p_data->>'status';
  if v_status not in ('planned','in_progress','completed') then raise exception 'INVALID_SYLLABUS';end if;
  v_done:=case when v_status='completed' then coalesce(nullif(p_data->>'completedOn','')::date,(pg_catalog.now() at time zone 'Asia/Dhaka')::date) end;
  if v_done>(pg_catalog.now() at time zone 'Asia/Dhaka')::date then raise exception 'COMPLETION_IN_FUTURE';end if;
  update public.syllabus_units set status=v_status,completed_on=v_done,updated_at=pg_catalog.now() where id=p_unit_id;
  uid:=p_unit_id;
 end if;
 result:=pg_catalog.jsonb_build_object('id',uid,'subjectId',sid,'action',p_action);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'academic.syllabus.'||p_action,uid,payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'academic.syllabus.write',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_syllabus_unit_write(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.coaching_syllabus_unit_write(text,uuid,uuid,jsonb,uuid) to authenticated;

-- Batch syllabus with weighted progress. Teacher, or an active Student actively enrolled in the batch.
create function public.coaching_batch_syllabus_progress(p_batch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());
begin
 if a is null or not (public.current_user_is_teacher() or (
   exists(select 1 from public.profiles where id=a and role='student' and account_status='active')
   and exists(select 1 from public.enrollments where student_id=a and batch_id=p_batch_id and status='active'))) then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.batches where id=p_batch_id) then raise exception 'BATCH_NOT_FOUND';end if;
 return (with leaves as (
   select u.* from public.syllabus_units u join public.academic_subjects s on s.id=u.subject_id
   where s.batch_id=p_batch_id and not exists(select 1 from public.syllabus_units c where c.parent_id=u.id)
 ), per_subject as (
   select subject_id,sum(weight) total,sum(weight) filter(where status='completed') done,count(*) filter(where status='in_progress') active from leaves group by subject_id
 ), per_chapter as (
   select coalesce(parent_id,id) chapter_id,sum(weight) total,sum(weight) filter(where status='completed') done from leaves group by 1
 )
 select pg_catalog.jsonb_build_object('batchId',p_batch_id,
  'progressBasisPoints',coalesce((select (sum(done)*10000/nullif(sum(total),0))::integer from per_subject),0),
  'subjects',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',s.id,'code',s.code,'title',s.title,
    'progressBasisPoints',coalesce((ps.done*10000/nullif(ps.total,0))::integer,0),'inProgressTopics',coalesce(ps.active,0),
    'chapters',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',c.id,'title',c.title,'position',c.position,'status',c.status,'weight',c.weight,
       'plannedStart',c.planned_start,'plannedEnd',c.planned_end,'completedOn',c.completed_on,'notes',c.notes,
       'progressBasisPoints',coalesce((pc.done*10000/nullif(pc.total,0))::integer,0),
       'topics',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',t.id,'title',t.title,'position',t.position,'status',t.status,'weight',t.weight,
          'plannedStart',t.planned_start,'plannedEnd',t.planned_end,'completedOn',t.completed_on,'notes',t.notes) order by t.position) from public.syllabus_units t where t.parent_id=c.id),'[]'::jsonb))
      order by c.position) from public.syllabus_units c left join per_chapter pc on pc.chapter_id=c.id where c.subject_id=s.id and c.parent_id is null),'[]'::jsonb))
   order by s.title),'[]'::jsonb))
 from public.academic_subjects s left join per_subject ps on ps.subject_id=s.id where s.batch_id=p_batch_id);
end;$function$;
revoke all on function public.coaching_batch_syllabus_progress(uuid) from public,anon,authenticated;
grant execute on function public.coaching_batch_syllabus_progress(uuid) to authenticated;
notify pgrst,'reload schema';
