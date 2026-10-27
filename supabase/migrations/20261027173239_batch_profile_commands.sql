-- Teacher batch profile command: create | update in one audited RPC. Batches are never deleted;
-- an unused draft is retired by moving it to cancelled or archived.
-- Create may include the first default fee (monthlyFeeMinor/admissionFeeMinor/dueDay), recorded as
-- a fee rule effective from the start month. Later fee changes go through coaching_add_batch_fee_rule.
create function public.coaching_batch_profile_write(p_action text,p_batch_id uuid,p_data jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;b record;bid uuid;v_status text;v_cover uuid;v_active integer;
 v_days smallint[];v_start integer;v_end integer;v_fee bigint;v_adm bigint;v_due integer;v_from text;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_operation_id is null or p_action not in ('create','update') or p_data is null or jsonb_typeof(p_data)<>'object'
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('code','name','capacity','startsOn','endsOn','status','admissionOpen','coverMediaId','subject','academicLevel','academicSession','description',
   'scheduleDays','classStartMinute','classEndMinute','monthlyFeeMinor','admissionFeeMinor','dueDay'))
  or (p_action<>'create' and (p_data ? 'monthlyFeeMinor' or p_data ? 'admissionFeeMinor' or p_data ? 'dueDay')) then raise exception 'INVALID_BATCH';end if;
 payload:=pg_catalog.jsonb_build_object('action',p_action,'batchId',p_batch_id,'data',p_data);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'batch.profile.write' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 if p_action='update' then
  select * into b from public.batches where id=p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND';end if;
 end if;
 v_status:=coalesce(p_data->>'status',case when p_action='update' then b.lifecycle_status else 'open' end);
 if v_status not in ('draft','open','running','completed','archived','cancelled') then raise exception 'INVALID_BATCH';end if;
 if p_action='update' and b.lifecycle_status<>'draft' and v_status='draft' then raise exception 'INVALID_LIFECYCLE_TRANSITION';end if;
 if p_data ? 'admissionOpen' and jsonb_typeof(p_data->'admissionOpen')<>'boolean' then raise exception 'INVALID_BATCH';end if;
 v_cover:=case when p_data ? 'coverMediaId' then nullif(p_data->>'coverMediaId','')::uuid when p_action='update' then b.cover_media_id end;
 if v_cover is not null and not exists(select 1 from public.media_assets where id=v_cover and status='ready' and content_type in ('image/jpeg','image/png','image/webp')) then raise exception 'COVER_MEDIA_INVALID';end if;
 if p_data ? 'scheduleDays' then
  if jsonb_typeof(p_data->'scheduleDays')<>'array' or jsonb_array_length(p_data->'scheduleDays')>7
   or exists(select 1 from jsonb_array_elements(p_data->'scheduleDays') d where jsonb_typeof(d)<>'number' or d::text !~ '^[0-6]$') then raise exception 'INVALID_SCHEDULE';end if;
  select coalesce(array_agg(distinct d::text::smallint order by d::text::smallint),'{}') into v_days from jsonb_array_elements(p_data->'scheduleDays') d;
 else v_days:=case when p_action='update' then b.schedule_days else '{}' end;
 end if;
 v_start:=case when p_data ? 'classStartMinute' then (p_data->>'classStartMinute')::integer when p_action='update' then b.class_start_minute end;
 v_end:=case when p_data ? 'classEndMinute' then (p_data->>'classEndMinute')::integer when p_action='update' then b.class_end_minute end;
 if p_action='create' then
  if coalesce(p_data->>'code','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$' then raise exception 'INVALID_BATCH';end if;
  if exists(select 1 from public.batches where lower(code)=lower(p_data->>'code')) then raise exception 'BATCH_CODE_EXISTS';end if;
  v_fee:=(p_data->>'monthlyFeeMinor')::bigint;v_adm:=coalesce((p_data->>'admissionFeeMinor')::bigint,0);v_due:=coalesce((p_data->>'dueDay')::integer,10);
  if (v_fee is not null and v_fee not between 1 and 100000000000) or v_adm not between 0 and 100000000000 or v_due not between 1 and 28 then raise exception 'INVALID_FEE_RULE';end if;
  insert into public.batches(code,name,capacity,starts_on,ends_on,lifecycle_status,is_archived,admission_open,cover_media_id,subject,academic_level,academic_session,description,schedule_days,class_start_minute,class_end_minute)
   values(p_data->>'code',btrim(coalesce(p_data->>'name','')),(p_data->>'capacity')::integer,nullif(p_data->>'startsOn','')::date,nullif(p_data->>'endsOn','')::date,
    v_status,v_status in ('archived','cancelled'),coalesce((p_data->>'admissionOpen')::boolean,true),v_cover,btrim(coalesce(p_data->>'subject','')),btrim(coalesce(p_data->>'academicLevel','')),
    btrim(coalesce(p_data->>'academicSession','')),coalesce(p_data->>'description',''),v_days,v_start,v_end) returning id into bid;
  if v_fee is not null then
   v_from:=pg_catalog.to_char(coalesce(nullif(p_data->>'startsOn','')::date,(pg_catalog.now() at time zone 'Asia/Dhaka')::date),'YYYY-MM');
   insert into public.batch_fee_rules(batch_id,effective_from,monthly_fee_minor,admission_fee_minor,due_day,reason,created_by) values(bid,v_from,v_fee,v_adm,v_due,'Initial batch fee',a);
  end if;
 else
  if p_data ? 'code' and p_data->>'code'<>b.code then
   if b.lifecycle_status<>'draft' or exists(select 1 from public.enrollments where batch_id=p_batch_id) then raise exception 'BATCH_CODE_IMMUTABLE';end if;
   if coalesce(p_data->>'code','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$' then raise exception 'INVALID_BATCH';end if;
   if exists(select 1 from public.batches where lower(code)=lower(p_data->>'code') and id<>p_batch_id) then raise exception 'BATCH_CODE_EXISTS';end if;
  end if;
  if p_data ? 'capacity' then
   select count(*) into v_active from public.enrollments where batch_id=p_batch_id and status='active';
   if (p_data->>'capacity')::integer<v_active then raise exception 'CAPACITY_BELOW_ACTIVE';end if;
  end if;
  update public.batches set code=coalesce(p_data->>'code',code),name=coalesce(btrim(p_data->>'name'),name),capacity=coalesce((p_data->>'capacity')::integer,capacity),
   starts_on=case when p_data ? 'startsOn' then nullif(p_data->>'startsOn','')::date else starts_on end,
   ends_on=case when p_data ? 'endsOn' then nullif(p_data->>'endsOn','')::date else ends_on end,
   lifecycle_status=v_status,is_archived=v_status in ('archived','cancelled'),admission_open=coalesce((p_data->>'admissionOpen')::boolean,admission_open),cover_media_id=v_cover,
   subject=coalesce(btrim(p_data->>'subject'),subject),academic_level=coalesce(btrim(p_data->>'academicLevel'),academic_level),
   academic_session=coalesce(btrim(p_data->>'academicSession'),academic_session),description=coalesce(p_data->>'description',description),
   schedule_days=v_days,class_start_minute=v_start,class_end_minute=v_end,updated_at=pg_catalog.now()
   where id=p_batch_id;
  bid:=p_batch_id;
 end if;
 select pg_catalog.jsonb_build_object('id',x.id,'code',x.code,'name',x.name,'capacity',x.capacity,'status',x.lifecycle_status,'admissionOpen',x.admission_open,'isArchived',x.is_archived) into result from public.batches x where x.id=bid;
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'batch.profile.'||p_action,bid,payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'batch.profile.write',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_batch_profile_write(text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.coaching_batch_profile_write(text,uuid,jsonb,uuid) to authenticated;

-- Batch profile read for Teacher or an enrolled active Student. Fee history and concessions are Teacher-only.
create function public.coaching_batch_profile(p_batch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());t boolean:=public.current_user_is_teacher();b record;r record;
begin
 if a is null or not (t or (exists(select 1 from public.profiles where id=a and role='student' and account_status='active')
   and exists(select 1 from public.enrollments where student_id=a and batch_id=p_batch_id and status='active'))) then raise exception 'FORBIDDEN';end if;
 select * into b from public.batches where id=p_batch_id;
 if not found then raise exception 'BATCH_NOT_FOUND';end if;
 select * into r from public.batch_fee_rules where batch_id=p_batch_id and effective_from<=pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Dhaka','YYYY-MM') order by effective_from desc limit 1;
 if r.id is null then select * into r from public.batch_fee_rules where batch_id=p_batch_id order by effective_from limit 1;end if;
 return pg_catalog.jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'capacity',b.capacity,'startsOn',b.starts_on,'endsOn',b.ends_on,
  'status',b.lifecycle_status,'admissionOpen',b.admission_open,'isArchived',b.is_archived,'coverMediaId',b.cover_media_id,'subject',b.subject,'academicLevel',b.academic_level,
  'academicSession',b.academic_session,'description',b.description,'scheduleDays',to_jsonb(b.schedule_days),'classStartMinute',b.class_start_minute,'classEndMinute',b.class_end_minute,
  'enrolled',(select count(*) from public.enrollments where batch_id=b.id and status='active'),
  'pending',(select count(*) from public.enrollments where batch_id=b.id and status='pending'),
  'hasHistory',exists(select 1 from public.enrollments where batch_id=b.id) or exists(select 1 from public.fee_plans where batch_id=b.id) or exists(select 1 from public.academic_subjects where batch_id=b.id),
  'currentFee',case when r.id is null then null else pg_catalog.jsonb_build_object('effectiveFrom',r.effective_from,'monthlyFeeMinor',r.monthly_fee_minor::text,'admissionFeeMinor',r.admission_fee_minor::text,'dueDay',r.due_day) end,
  'feeHistory',case when t then coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',f.id,'effectiveFrom',f.effective_from,'monthlyFeeMinor',f.monthly_fee_minor::text,
     'admissionFeeMinor',f.admission_fee_minor::text,'dueDay',f.due_day,'reason',f.reason,'createdAt',f.created_at) order by f.effective_from desc) from public.batch_fee_rules f where f.batch_id=b.id),'[]'::jsonb) else '[]'::jsonb end,
  'concessions',case when t then coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',c.id,'studentId',c.student_id,'studentName',p.full_name,'kind',c.kind,'value',c.value::text,
     'startsPeriod',c.starts_period,'endsPeriod',c.ends_period,'reason',c.reason,'status',c.status,'createdAt',c.created_at) order by c.created_at desc)
     from public.student_fee_concessions c join public.profiles p on p.id=c.student_id where c.batch_id=b.id),'[]'::jsonb) else '[]'::jsonb end);
end;$function$;
revoke all on function public.coaching_batch_profile(uuid) from public,anon,authenticated;
grant execute on function public.coaching_batch_profile(uuid) to authenticated;

-- Storage read guard for a batch cover (same storage bucket rules as CMS media).
create function public.coaching_batch_cover(p_batch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare r jsonb;
begin
 perform public.coaching_batch_profile(p_batch_id);
 select pg_catalog.jsonb_build_object('id',m.id,'key',m.storage_key,'contentType',m.content_type,'sizeBytes',m.size_bytes,'sha256',m.sha256)
  into r from public.batches b join public.media_assets m on m.id=b.cover_media_id where b.id=p_batch_id and m.status='ready';
 if r is null then raise exception 'MEDIA_NOT_FOUND';end if;
 return r;
end;$function$;
revoke all on function public.coaching_batch_cover(uuid) from public,anon,authenticated;
grant execute on function public.coaching_batch_cover(uuid) to authenticated;
notify pgrst,'reload schema';
