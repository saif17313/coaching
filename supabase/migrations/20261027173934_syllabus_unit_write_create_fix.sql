-- Fix: on create, the unit record must be initialised because PL/pgSQL evaluates every record
-- field referenced in an expression, even in an untaken CASE branch.
create or replace function public.coaching_syllabus_unit_write(p_action text,p_unit_id uuid,p_subject_id uuid,p_data jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;u public.syllabus_units%rowtype;sid uuid;bid uuid;uid uuid;pos integer;
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
