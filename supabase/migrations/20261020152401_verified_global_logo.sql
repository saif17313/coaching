-- Verified global logo: revisioned drafts, published-only bytes, archive serialization.
-- Recovery: supabase/verification/global_logo_pre_migration_recovery.sql.
CREATE OR REPLACE FUNCTION public.coaching_cms_settings_write(p_action text, p_expected_revision bigint, p_settings jsonb, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid := (select auth.uid()); v_prior record; s public.app_settings%rowtype;
 v_payload jsonb; v_result jsonb; v_new bigint; v_email text; v_phone text; v_logo uuid;
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
     (pg_catalog.jsonb_typeof(p_settings->'logoMediaId')<>'null' and (pg_catalog.jsonb_typeof(p_settings->'logoMediaId')<>'string' or (p_settings->>'logoMediaId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
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

 if p_action='draft.update' then v_logo:=(p_settings->>'logoMediaId')::uuid;
 else select (draft_content->>'logoMediaId')::uuid into v_logo from public.app_settings where id=1;
 end if;
 if v_logo is not null then
  perform 1 from public.media_assets a join storage.objects o on o.bucket_id='musa-site-media' and o.name=a.storage_key
   where a.id=v_logo and a.status='ready' and a.created_by=v_actor and o.metadata->>'mimetype'=a.content_type and o.metadata->>'size'=a.size_bytes::text for share of a;
  if not found then raise exception 'MEDIA_NOT_VERIFIED';end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.coaching_cms_media_mutation(p_action text, p_media_id uuid, p_page_id uuid, p_item_id uuid, p_expected_revision bigint, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from public.coaching_mutation_receipts where actor_id=(select auth.uid()) and operation_id=p_operation_id) then
  return public.coaching_cms_media_mutation_base(p_action,p_media_id,p_page_id,p_item_id,p_expected_revision,p_operation_id);
 end if;
 if p_action='attach' then perform 1 from public.site_pages where id=p_page_id for update;end if;
 if p_action='archive' then
  perform pg_catalog.pg_advisory_xact_lock(572401,1);
  if exists(select 1 from public.app_settings where draft_content->>'logoMediaId'=p_media_id::text) then raise exception 'MEDIA_DRAFT_IN_USE';end if;
  perform 1 from public.media_assets where id=p_media_id and created_by=(select auth.uid()) for update;
  if exists(select 1 from public.site_page_sections s where p_media_id in (select * from public.coaching_cms_content_media_ids(s.content))) or
   exists(select 1 from public.site_section_items i where p_media_id in (select * from public.coaching_cms_content_media_ids(i.metadata))) then raise exception 'MEDIA_DRAFT_IN_USE';end if;
 end if;
 return public.coaching_cms_media_mutation_base(p_action,p_media_id,p_page_id,p_item_id,p_expected_revision,p_operation_id);
end;$function$;

create or replace function public.coaching_media_is_published_path(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_assets a where a.storage_key=p_name and a.status='ready' and (
  exists(select 1 from public.app_settings s where s.published_revision is not null and s.published_content->>'logoMediaId'=a.id::text)
  or exists(select 1 from public.site_pages p where p.status='published' and (
   exists(select 1 from pg_catalog.jsonb_array_elements(coalesce(p.published_snapshot->'sections','[]'::jsonb)) s,
    pg_catalog.jsonb_array_elements(coalesce(s.value->'items','[]'::jsonb)) i where i.value->>'mediaId'=a.id::text)
   or a.id in (select * from public.coaching_cms_content_media_ids(p.published_snapshot))))));
$$;
notify pgrst,'reload schema';

