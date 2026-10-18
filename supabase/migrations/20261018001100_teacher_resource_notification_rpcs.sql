-- Part F resources: in-app notifications only. File uploads require separate verified storage integration.
create function public.coaching_create_announcement(p_batch_id uuid,p_title text,p_body text,p_visible_from timestamptz,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := (select auth.uid());
 v_prior record;
 v_payload jsonb;
 v_result jsonb;
v_id uuid; v_archived boolean;
begin
if p_batch_id is null or p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 2 and 160 or p_body is null or pg_catalog.char_length(pg_catalog.btrim(p_body)) not between 2 and 10000 or p_title ~ '[[:cntrl:]]' then raise exception 'INVALID_ANNOUNCEMENT'; end if;
 v_payload := pg_catalog.jsonb_build_object('batchId',p_batch_id,'title',pg_catalog.btrim(p_title),'body',pg_catalog.btrim(p_body),'visibleFrom',p_visible_from);

  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'resources.announcement.draft.created' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
select is_archived into v_archived from public.batches where id=p_batch_id for update;
if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
insert into public.announcements(batch_id,title,body,visible_from,created_by) values(p_batch_id,pg_catalog.btrim(p_title),pg_catalog.btrim(p_body),p_visible_from,v_actor) returning id into v_id;
v_result:=pg_catalog.jsonb_build_object('id',v_id,'batchId',p_batch_id,'title',pg_catalog.btrim(p_title),'status','draft');
insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'resources.announcement.draft.created',v_id,v_payload);
insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(v_actor,p_operation_id,'resources.announcement.draft.created',v_payload,v_result);
return v_result;
end;
$$;
revoke all on function public.coaching_create_announcement(uuid,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.coaching_create_announcement(uuid,text,text,timestamptz,uuid) to authenticated;

create function public.coaching_publish_announcement(p_announcement_id uuid,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := (select auth.uid());
 v_prior record;
 v_payload jsonb;
 v_result jsonb;
v_batch uuid; v_archived boolean; v_status text;
begin
if p_announcement_id is null then raise exception 'INVALID_ANNOUNCEMENT'; end if;
 v_payload := pg_catalog.jsonb_build_object('announcementId',p_announcement_id);

  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'resources.announcement.published' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
select batch_id into v_batch from public.announcements where id=p_announcement_id;
if not found then raise exception 'ANNOUNCEMENT_NOT_FOUND'; end if;
select is_archived into v_archived from public.batches where id=v_batch for update;
if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
select status into v_status from public.announcements where id=p_announcement_id for update;
if not found or v_status<>'draft' then raise exception 'ANNOUNCEMENT_NOT_DRAFT'; end if;
update public.announcements set status='published',updated_at=pg_catalog.now() where id=p_announcement_id;
v_result:=pg_catalog.jsonb_build_object('id',p_announcement_id,'status','published');
insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'resources.announcement.published',p_announcement_id,v_payload);
insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(v_actor,p_operation_id,'resources.announcement.published',v_payload,v_result);
return v_result;
end;
$$;
revoke all on function public.coaching_publish_announcement(uuid,uuid) from public,anon,authenticated;
grant execute on function public.coaching_publish_announcement(uuid,uuid) to authenticated;

create function public.coaching_dispatch_batch_notification(p_batch_id uuid,p_event_id uuid,p_title text,p_body text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := (select auth.uid());
 v_prior record;
 v_payload jsonb;
 v_result jsonb;
v_archived boolean; v_delivered integer;
begin
if p_batch_id is null or p_event_id is null or p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 2 and 160 or p_body is null or pg_catalog.char_length(pg_catalog.btrim(p_body)) not between 2 and 2000 or p_title ~ '[[:cntrl:]]' then raise exception 'INVALID_NOTIFICATION'; end if;
 v_payload := pg_catalog.jsonb_build_object('batchId',p_batch_id,'eventId',p_event_id,'title',pg_catalog.btrim(p_title),'body',pg_catalog.btrim(p_body));

  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type<>'resources.notification.dispatched' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
select is_archived into v_archived from public.batches where id=p_batch_id for update;
if not found or v_archived then raise exception 'BATCH_UNAVAILABLE'; end if;
insert into public.notification_dispatches(event_id,batch_id,created_by) values(p_event_id,p_batch_id,v_actor);
insert into public.notifications(event_id,recipient_id,title,body)
select p_event_id,e.student_id,pg_catalog.btrim(p_title),pg_catalog.btrim(p_body) from public.enrollments e
join public.profiles p on p.id=e.student_id
where e.batch_id=p_batch_id and e.status='active' and p.role='student' and p.account_status='active';
get diagnostics v_delivered=row_count;
v_result:=pg_catalog.jsonb_build_object('eventId',p_event_id,'batchId',p_batch_id,'delivered',v_delivered);
insert into public.audit_logs(actor_id,action,entity_id,details) values(v_actor,'resources.notification.dispatched',p_event_id,v_payload);
insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(v_actor,p_operation_id,'resources.notification.dispatched',v_payload,v_result);
return v_result;
end;
$$;
revoke all on function public.coaching_dispatch_batch_notification(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_dispatch_batch_notification(uuid,uuid,text,text,uuid) to authenticated;
