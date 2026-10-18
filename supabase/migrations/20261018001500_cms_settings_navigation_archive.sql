-- Part J: CMS settings revisioned draft/publish, page archive and public navigation.
-- Local-first. No raw table grants, no storage/upload privilege, no service role.

create function public.coaching_cms_get_settings_draft()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.app_settings%rowtype;
 v_default jsonb := '{"siteTitle":"Musa Sir Coaching","tagline":"","contactEmail":"admin@example.org","contactPhone":null,"footerText":"","logoMediaId":null}'::jsonb;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
 select * into s from public.app_settings where id=1;
 if not found then return pg_catalog.jsonb_build_object('revision',0,'publishedRevision',null,'settings',v_default); end if;
 return pg_catalog.jsonb_build_object('revision',s.draft_revision,'publishedRevision',s.published_revision,
   'settings',v_default||s.draft_content);
end;
$$;
revoke all on function public.coaching_cms_get_settings_draft() from public,anon,authenticated;
grant execute on function public.coaching_cms_get_settings_draft() to authenticated;

create function public.coaching_cms_settings_write(
 p_action text,p_expected_revision bigint,p_settings jsonb,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := (select auth.uid()); v_prior record; s public.app_settings%rowtype;
 v_payload jsonb; v_result jsonb; v_new bigint; v_email text; v_phone text;
begin
 if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
 if p_action not in ('draft.update','publish') or p_action is null or p_operation_id is null or
   p_expected_revision is null or p_expected_revision < 0 or p_expected_revision > 1000000000
 then raise exception 'INVALID_CMS_SETTINGS_COMMAND'; end if;
 if p_action='draft.update' then
  if p_settings is null or pg_catalog.jsonb_typeof(p_settings)<>'object' or
     (select count(*) from pg_catalog.jsonb_object_keys(p_settings))<>6 or
     not(p_settings ?& array['siteTitle','tagline','contactEmail','contactPhone','footerText','logoMediaId']) or
     pg_catalog.jsonb_typeof(p_settings->'siteTitle')<>'string' or
     pg_catalog.jsonb_typeof(p_settings->'tagline')<>'string' or
     pg_catalog.jsonb_typeof(p_settings->'contactEmail')<>'string' or
     pg_catalog.jsonb_typeof(p_settings->'footerText')<>'string' or
     pg_catalog.jsonb_typeof(p_settings->'contactPhone') not in ('string','null') or
     pg_catalog.jsonb_typeof(p_settings->'logoMediaId')<>'null'
  then raise exception 'INVALID_CMS_SETTINGS';end if;
  v_email:=p_settings->>'contactEmail';v_phone:=p_settings->>'contactPhone';
  if pg_catalog.char_length(pg_catalog.btrim(p_settings->>'siteTitle')) not between 2 and 160 or
     pg_catalog.char_length(p_settings->>'tagline')>160 or
     pg_catalog.char_length(p_settings->>'footerText')>1000 or
     pg_catalog.char_length(v_email) not between 3 and 254 or
     v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
     v_email ~ '[[:cntrl:]]' or
     (v_phone is not null and (pg_catalog.char_length(v_phone) not between 7 and 20 or v_phone ~ '[[:cntrl:]]')) or
     (p_settings->>'siteTitle') ~ '[[:cntrl:]<>]' or
     (p_settings->>'tagline') ~ '[[:cntrl:]<>]' or
     (p_settings->>'footerText') ~ '[[:cntrl:]<>]'
  then raise exception 'INVALID_CMS_SETTINGS';end if;
 elsif p_settings is not null then raise exception 'INVALID_SETTINGS_PUBLISH'; end if;
 v_payload:=pg_catalog.jsonb_build_object('action',p_action,'expectedRevision',p_expected_revision,'settings',p_settings);
 perform pg_catalog.pg_advisory_xact_lock(572401,1);
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
   where actor_id=v_actor and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'cms.settings.'||p_action or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return v_prior.result;
 end if;
 select * into s from public.app_settings where id=1 for update;
 if not found then
  if p_action<>'draft.update' or p_expected_revision<>0 then raise exception 'REVISION_CONFLICT';end if;
  insert into public.app_settings(id,draft_revision,draft_content,published_revision,published_content,changed_by)
   values(1,1,p_settings,null,null,v_actor);
  v_result:=pg_catalog.jsonb_build_object('revision',1,'publishedRevision',null);
 else
  if s.draft_revision<>p_expected_revision then raise exception 'REVISION_CONFLICT';end if;
  if p_action='draft.update' then
   if s.draft_revision>=1000000000 then raise exception 'REVISION_LIMIT';end if;
   v_new:=s.draft_revision+1;
   update public.app_settings set draft_revision=v_new,draft_content=p_settings,changed_by=v_actor,updated_at=now() where id=1;
   v_result:=pg_catalog.jsonb_build_object('revision',v_new,'publishedRevision',s.published_revision);
  else
   if s.published_revision=s.draft_revision then raise exception 'ALREADY_PUBLISHED';end if;
   if s.draft_content='{}'::jsonb then raise exception 'SETTINGS_DRAFT_EMPTY';end if;
   update public.app_settings set published_revision=s.draft_revision,published_content=s.draft_content,
       changed_by=v_actor,updated_at=now() where id=1;
   v_result:=pg_catalog.jsonb_build_object('revision',s.draft_revision,'publishedRevision',s.draft_revision);
  end if;
 end if;
 insert into public.audit_logs(actor_id,action,entity_id,details)
  values(v_actor,'cms.settings.'||p_action,v_actor,pg_catalog.jsonb_build_object('revision',p_expected_revision));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
  values(v_actor,p_operation_id,'cms.settings.'||p_action,v_payload,v_result);
 return v_result;
end;
$$;
revoke all on function public.coaching_cms_settings_write(text,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_settings_write(text,bigint,jsonb,uuid) to authenticated;

create function public.coaching_cms_archive_page(
 p_page_id uuid,p_expected_revision bigint,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());p public.site_pages%rowtype;v_prior record;
 v_payload jsonb;v_result jsonb;
begin
 if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_page_id is null or p_operation_id is null or p_expected_revision is null or
    p_expected_revision<1 or p_expected_revision>1000000000 then raise exception 'INVALID_ARCHIVE';end if;
 v_payload:=pg_catalog.jsonb_build_object('page',p_page_id,'expectedRevision',p_expected_revision);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
  where actor_id=v_actor and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'cms.page.archive' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return v_prior.result;
 end if;
 select * into p from public.site_pages where id=p_page_id for update;
 if not found or p.status='archived' then raise exception 'PAGE_NOT_FOUND';end if;
 if p.draft_revision<>p_expected_revision then raise exception 'REVISION_CONFLICT';end if;
 update public.site_pages set status='archived',updated_at=now() where id=p_page_id;
 v_result:=pg_catalog.jsonb_build_object('id',p_page_id,'revision',p.draft_revision,'status','archived');
 insert into public.audit_logs(actor_id,action,entity_id,details)
  values(v_actor,'cms.page.archive',p_page_id,pg_catalog.jsonb_build_object('revision',p_expected_revision));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
  values(v_actor,p_operation_id,'cms.page.archive',v_payload,v_result);
 return v_result;
end;
$$;
revoke all on function public.coaching_cms_archive_page(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_archive_page(uuid,bigint,uuid) to authenticated;

create function public.coaching_cms_public_navigation()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_count integer;v_items jsonb;
begin
 select count(*) into v_count from public.site_pages where status='published' and published_snapshot is not null;
 if v_count>50 then raise exception 'PUBLIC_NAVIGATION_LIMIT';end if;
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('slug',p.slug,'title',p.published_snapshot->>'title')
     order by p.slug),'[]'::jsonb) into v_items from public.site_pages p
     where p.status='published' and p.published_snapshot is not null;
 return pg_catalog.jsonb_build_object('items',v_items);
end;
$$;
revoke all on function public.coaching_cms_public_navigation() from public,anon,authenticated;
grant execute on function public.coaching_cms_public_navigation() to anon,authenticated;
