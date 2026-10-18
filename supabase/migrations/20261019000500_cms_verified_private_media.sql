-- Part M: private, verified image pipeline. Existing 26 migrations are immutable.
-- No public storage bucket, no direct media_assets DML, no service role.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('musa-site-media','musa-site-media',false,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
 on conflict(id) do nothing;
do $bucket$
begin
 if not exists(select 1 from storage.buckets where id='musa-site-media' and public=false and
     file_size_limit between 1 and 5242880 and allowed_mime_types @> array['image/jpeg','image/png','image/webp','image/avif']::text[] and
     allowed_mime_types <@ array['image/jpeg','image/png','image/webp','image/avif']::text[])
 then raise exception 'CMS_MEDIA_BUCKET_UNSAFE';end if;
end;
$bucket$;

create function public.coaching_media_actor_is_active_teacher()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid())
   and p.role='teacher'::public.app_role and p.account_status='active'::public.account_status);
$$;
revoke all on function public.coaching_media_actor_is_active_teacher() from public,anon,authenticated;
grant execute on function public.coaching_media_actor_is_active_teacher() to authenticated;

create function public.coaching_media_is_published_path(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.media_assets a join public.site_pages p on p.status='published'
  where a.storage_key=p_name and a.status='ready' and
   exists(select 1 from pg_catalog.jsonb_array_elements(coalesce(p.published_snapshot->'sections','[]'::jsonb)) s
     where exists(select 1 from pg_catalog.jsonb_array_elements(coalesce(s.value->'items','[]'::jsonb)) i
       where i.value->>'mediaId'=a.id::text))
 );
$$;
revoke all on function public.coaching_media_is_published_path(text) from public,anon,authenticated;
grant execute on function public.coaching_media_is_published_path(text) to anon,authenticated;

create policy musa_site_media_insert on storage.objects for insert to authenticated
 with check(bucket_id='musa-site-media' and public.coaching_media_actor_is_active_teacher()
  and pg_catalog.split_part(name,'/',1)=(select auth.uid())::text and
  name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|avif)$');
create policy musa_site_media_read on storage.objects for select to anon,authenticated
 using(bucket_id='musa-site-media' and
   (public.coaching_media_is_published_path(name) or
    (public.coaching_media_actor_is_active_teacher() and
       pg_catalog.split_part(name,'/',1)=(select auth.uid())::text)));
-- No UPDATE/DELETE storage policies; overwrites and client deletion remain denied.

create function public.coaching_media_register(
 p_media_id uuid,p_storage_key text,p_content_type text,p_size_bytes bigint,
 p_sha256 text,p_alt text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_prior record;v_payload jsonb;v_result jsonb;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if p_media_id is null or p_operation_id is null or p_size_bytes not between 1 and 5242880
   or p_content_type not in ('image/jpeg','image/png','image/webp','image/avif')
   or p_sha256 !~ '^[0-9a-f]{64}$' or
   p_alt is null or pg_catalog.char_length(pg_catalog.btrim(p_alt)) not between 2 and 200
   or p_storage_key is null or p_storage_key not like v_actor::text||'/'||p_media_id::text||'.%'
 then raise exception 'INVALID_MEDIA';end if;
 -- MIME extension must match the exact verified object path; avoid CASE parsing ambiguity.
 if not (
   (p_content_type='image/jpeg' and p_storage_key=v_actor::text||'/'||p_media_id::text||'.jpg') or
   (p_content_type='image/png' and p_storage_key=v_actor::text||'/'||p_media_id::text||'.png') or
   (p_content_type='image/webp' and p_storage_key=v_actor::text||'/'||p_media_id::text||'.webp') or
   (p_content_type='image/avif' and p_storage_key=v_actor::text||'/'||p_media_id::text||'.avif')
 ) then raise exception 'INVALID_MEDIA_PATH';end if;
 v_payload:=pg_catalog.jsonb_build_object('id',p_media_id,'key',p_storage_key,'contentType',p_content_type,
  'sizeBytes',p_size_bytes,'sha256',p_sha256,'alt',p_alt);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
   where actor_id=v_actor and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'cms.media.register' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return v_prior.result;
 end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='musa-site-media' and o.name=p_storage_key
  and o.metadata->>'mimetype'=p_content_type and coalesce(o.metadata->>'size','') ~ '^[0-9]{1,10}$'
  and (o.metadata->>'size')::bigint=p_size_bytes)
 then raise exception 'MEDIA_STORAGE_NOT_VERIFIED';end if;
 insert into public.media_assets(id,storage_key,content_type,size_bytes,sha256,alt,status,created_by)
 values(p_media_id,p_storage_key,p_content_type,p_size_bytes,p_sha256,pg_catalog.btrim(p_alt),'ready',v_actor);
 v_result:=pg_catalog.jsonb_build_object('id',p_media_id,'status','ready','contentType',p_content_type,'sizeBytes',p_size_bytes,'alt',pg_catalog.btrim(p_alt));
 insert into public.audit_logs(actor_id,action,entity_id,details)
 values(v_actor,'cms.media.register',p_media_id,pg_catalog.jsonb_build_object('size',p_size_bytes,'type',p_content_type));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
 values(v_actor,p_operation_id,'cms.media.register',v_payload,v_result);
 return v_result;
end;$$;
revoke all on function public.coaching_media_register(uuid,text,text,bigint,text,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_media_register(uuid,text,text,bigint,text,text,uuid) to authenticated;

create function public.coaching_media_list()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_count integer;v_items jsonb;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 select count(*) into v_count from public.media_assets where created_by=(select auth.uid());
 if v_count>100 then raise exception 'CMS_MEDIA_LIMIT';end if;
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'contentType',content_type,
  'sizeBytes',size_bytes,'alt',alt,'status',status) order by created_at desc,id),'[]'::jsonb) into v_items
 from public.media_assets where created_by=(select auth.uid());
 return pg_catalog.jsonb_build_object('items',v_items);
end;$$;
revoke all on function public.coaching_media_list() from public,anon,authenticated;
grant execute on function public.coaching_media_list() to authenticated;

create function public.coaching_media_resolve(p_media_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.media_assets%rowtype;
begin
 if p_media_id is null then return null;end if;
 select * into a from public.media_assets where id=p_media_id and status='ready';
 if not found then return null;end if;
 if not public.coaching_media_is_published_path(a.storage_key) then return null;end if;
 return pg_catalog.jsonb_build_object('id',a.id,'key',a.storage_key,'contentType',a.content_type,
  'sizeBytes',a.size_bytes,'sha256',a.sha256);
end;$$;
revoke all on function public.coaching_media_resolve(uuid) from public,anon,authenticated;
grant execute on function public.coaching_media_resolve(uuid) to anon,authenticated;

create function public.coaching_cms_media_mutation(p_action text,p_media_id uuid,p_page_id uuid,
 p_item_id uuid,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_page public.site_pages%rowtype;
 v_media public.media_assets%rowtype;v_prior record;v_payload jsonb;v_result jsonb;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if p_action not in ('attach','archive') or p_media_id is null or p_operation_id is null then raise exception 'INVALID_MEDIA_COMMAND';end if;
 v_payload:=pg_catalog.jsonb_build_object('action',p_action,'media',p_media_id,'page',p_page_id,'item',p_item_id,'revision',p_expected_revision);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=v_actor and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'cms.media.'||p_action or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return v_prior.result;
 end if;
 select * into v_media from public.media_assets where id=p_media_id and created_by=v_actor for update;
 if not found then raise exception 'MEDIA_NOT_FOUND';end if;
 if p_action='attach' then
  if p_page_id is null or p_item_id is null or p_expected_revision is null then raise exception 'INVALID_MEDIA_TARGET';end if;
  if v_media.status<>'ready' or not exists(select 1 from storage.objects where bucket_id='musa-site-media' and name=v_media.storage_key)
  then raise exception 'MEDIA_NOT_VERIFIED';end if;
  select * into v_page from public.site_pages where id=p_page_id for update;
  if not found or v_page.status='archived' then raise exception 'PAGE_NOT_FOUND';end if;
  if v_page.draft_revision<>p_expected_revision then raise exception 'REVISION_CONFLICT';end if;
  update public.site_section_items i set media_id=p_media_id
   from public.site_page_sections s where i.id=p_item_id and i.section_id=s.id and s.page_id=p_page_id;
  if not found then raise exception 'ITEM_NOT_FOUND';end if;
  update public.site_pages set draft_revision=draft_revision+1,updated_at=now() where id=p_page_id;
  v_result:=pg_catalog.jsonb_build_object('id',p_media_id,'revision',v_page.draft_revision+1,'status','ready');
 else
  if p_page_id is not null or p_item_id is not null or p_expected_revision is not null then raise exception 'INVALID_MEDIA_TARGET';end if;
  if public.coaching_media_is_published_path(v_media.storage_key) then raise exception 'MEDIA_PUBLIC_IN_USE';end if;
  if exists(select 1 from public.site_section_items where media_id=p_media_id) or
    exists(select 1 from public.teacher_profiles where avatar_media_id=p_media_id)
  then raise exception 'MEDIA_DRAFT_IN_USE';end if;
  update public.media_assets set status='archived' where id=p_media_id and status='ready';
  if not found then raise exception 'MEDIA_ALREADY_ARCHIVED';end if;
  v_result:=pg_catalog.jsonb_build_object('id',p_media_id,'status','archived');
 end if;
 insert into public.audit_logs(actor_id,action,entity_id,details)
 values(v_actor,'cms.media.'||p_action,p_media_id,pg_catalog.jsonb_build_object('page',p_page_id,'item',p_item_id));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
 values(v_actor,p_operation_id,'cms.media.'||p_action,v_payload,v_result);
 return v_result;
end;$$;
revoke all on function public.coaching_cms_media_mutation(text,uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_media_mutation(text,uuid,uuid,uuid,bigint,uuid) to authenticated;

-- Replace only the old conservative publication guard: verified private Storage objects
-- may be snapshotted. All other original write/RLS/idempotency contracts stay intact.

create or replace function public.coaching_cms_write(
 p_action text,p_target uuid,p_parent uuid,p_expected_revision bigint,p_data jsonb,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := (select auth.uid()); v_prior record; v_payload jsonb; v_result jsonb;
 v_page public.site_pages%rowtype; v_section public.site_page_sections%rowtype;
 v_title text; v_slug text; v_seo text; v_desc text; v_kind text;
 v_sort integer; v_heading text; v_body text; v_visible boolean; v_item_section uuid;
 v_snapshot jsonb; v_sections jsonb;
begin
 if v_actor is null or not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN'; end if;
 if p_action not in ('page.create','page.update','section.upsert','item.upsert','page.publish')
    or p_action is null or p_target is null or p_operation_id is null
    or p_data is null or pg_catalog.jsonb_typeof(p_data)<>'object'
     then raise exception 'INVALID_CMS_COMMAND'; end if;
 v_payload:=pg_catalog.jsonb_build_object('action',p_action,'target',p_target,
   'parent',p_parent,'expectedRevision',p_expected_revision,'data',p_data);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
  where actor_id=v_actor and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'cms.'||p_action or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return v_prior.result;
 end if;
 if p_action='page.create' then
  if p_parent is not null or p_expected_revision is not null or
   (select count(*) from pg_catalog.jsonb_object_keys(p_data))<>4 or
   not (p_data ?& array['slug','title','seoTitle','seoDescription']) then raise exception 'INVALID_PAGE'; end if;
  v_slug:=p_data->>'slug';v_title:=p_data->>'title';v_seo:=p_data->>'seoTitle';v_desc:=p_data->>'seoDescription';
  if v_slug is null or v_slug !~ '^[a-z][a-z0-9-]{1,62}$' or v_slug like '%--%' or pg_catalog.right(v_slug,1)='-'
    or v_title is null or pg_catalog.char_length(pg_catalog.btrim(v_title)) not between 2 and 160
    or v_seo is null or pg_catalog.char_length(pg_catalog.btrim(v_seo)) not between 2 and 160
    or v_desc is null or pg_catalog.char_length(v_desc)>300 then raise exception 'INVALID_PAGE'; end if;
  insert into public.site_pages(id,slug,title,seo_title,seo_description,created_by)
    values(p_target,v_slug,pg_catalog.btrim(v_title),pg_catalog.btrim(v_seo),pg_catalog.btrim(v_desc),v_actor);
  v_result:=pg_catalog.jsonb_build_object('id',p_target,'revision',1,'status','draft');
 else
  if p_action in ('page.update','page.publish') and p_parent is not null then raise exception 'INVALID_PARENT'; end if;
  if p_action in ('section.upsert','item.upsert') and p_parent is null then raise exception 'INVALID_PARENT'; end if;
  if p_expected_revision is null or p_expected_revision<1 then raise exception 'INVALID_REVISION'; end if;
  select * into v_page from public.site_pages where id=coalesce(p_parent,p_target) for update;
  if not found or v_page.status='archived' then raise exception 'PAGE_NOT_FOUND'; end if;
  if v_page.draft_revision<>p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_action='page.update' then
   if (select count(*) from pg_catalog.jsonb_object_keys(p_data)) not between 1 and 3
    or exists (select 1 from pg_catalog.jsonb_object_keys(p_data) k where k not in ('title','seoTitle','seoDescription'))
    or p_data @> '{"title":null}'::jsonb or p_data @> '{"seoTitle":null}'::jsonb or p_data @> '{"seoDescription":null}'::jsonb
    then raise exception 'INVALID_PAGE_PATCH'; end if;
   v_title:=coalesce(p_data->>'title',v_page.title);v_seo:=coalesce(p_data->>'seoTitle',v_page.seo_title);v_desc:=coalesce(p_data->>'seoDescription',v_page.seo_description);
   if pg_catalog.char_length(pg_catalog.btrim(v_title)) not between 2 and 160 or pg_catalog.char_length(pg_catalog.btrim(v_seo)) not between 2 and 160 or pg_catalog.char_length(v_desc)>300 then raise exception 'INVALID_PAGE_PATCH'; end if;
   update public.site_pages set title=pg_catalog.btrim(v_title),seo_title=pg_catalog.btrim(v_seo),seo_description=pg_catalog.btrim(v_desc),draft_revision=draft_revision+1,updated_at=now() where id=p_target;
   v_result:=pg_catalog.jsonb_build_object('id',p_target,'revision',v_page.draft_revision+1,'status',v_page.status);
  elsif p_action='section.upsert' then
   if (select count(*) from pg_catalog.jsonb_object_keys(p_data))<>5 or
    not (p_data ?& array['kind','order','heading','body','visible']) then raise exception 'INVALID_SECTION'; end if;
   if pg_catalog.jsonb_typeof(p_data->'order')<>'number' or pg_catalog.jsonb_typeof(p_data->'visible')<>'boolean' then raise exception 'INVALID_SECTION'; end if;
   v_kind:=p_data->>'kind';v_sort:=(p_data->>'order')::integer;v_heading:=p_data->>'heading';v_body:=p_data->>'body';v_visible:=(p_data->>'visible')::boolean;
   if v_kind not in ('hero','rich-text','cards','gallery','results','courses','contact','cta','faq','news','reviews','academic-calendar','routine','materials','footer')
      or v_sort not between 0 and 1000 or v_heading is null or pg_catalog.char_length(v_heading)>160
      or v_body is null or pg_catalog.char_length(v_body)>6000 or v_visible is null then raise exception 'INVALID_SECTION'; end if;
   if not exists(select 1 from public.site_page_sections where id=p_target) and (select count(*) from public.site_page_sections where page_id=p_parent)>=60 then raise exception 'CMS_SECTION_LIMIT'; end if;
   if exists(select 1 from public.site_page_sections where page_id=p_parent and id<>p_target and sort_order=v_sort) then raise exception 'DUPLICATE_SECTION_ORDER'; end if;
   insert into public.site_page_sections(id,page_id,kind,sort_order,heading,body,visible)
    values(p_target,p_parent,v_kind,v_sort,v_heading,v_body,v_visible)
    on conflict(id) do update set kind=excluded.kind,sort_order=excluded.sort_order,heading=excluded.heading,body=excluded.body,visible=excluded.visible,updated_at=now()
    where public.site_page_sections.page_id=excluded.page_id;
   if not found then raise exception 'FOREIGN_SECTION'; end if;
   update public.site_pages set draft_revision=draft_revision+1,updated_at=now() where id=p_parent;
   v_result:=pg_catalog.jsonb_build_object('id',p_target,'revision',v_page.draft_revision+1,'status',v_page.status);
  elsif p_action='item.upsert' then
   if (select count(*) from pg_catalog.jsonb_object_keys(p_data))<>6 or not (p_data ?& array['sectionId','order','title','description','url','visible']) then raise exception 'INVALID_ITEM'; end if;
   if pg_catalog.jsonb_typeof(p_data->'order')<>'number' or pg_catalog.jsonb_typeof(p_data->'visible')<>'boolean' then raise exception 'INVALID_ITEM'; end if;
   v_item_section:=(p_data->>'sectionId')::uuid;v_sort:=(p_data->>'order')::integer;v_title:=p_data->>'title';v_desc:=p_data->>'description';v_visible:=(p_data->>'visible')::boolean;
   select * into v_section from public.site_page_sections where id=v_item_section and page_id=p_parent;
   if not found then raise exception 'FOREIGN_SECTION'; end if;
   if v_sort not between 0 and 1000 or v_title is null or pg_catalog.char_length(v_title)>160 or v_desc is null or pg_catalog.char_length(v_desc)>2000 or v_visible is null
     or (p_data->>'url') is not null and ((p_data->>'url') !~ '^https://[^[:space:]]+' or pg_catalog.char_length(p_data->>'url')>2048)
   then raise exception 'INVALID_ITEM'; end if;
   if not exists(select 1 from public.site_section_items where id=p_target) and (select count(*) from public.site_section_items where section_id=v_item_section)>=100 then raise exception 'CMS_ITEM_LIMIT'; end if;
   if exists(select 1 from public.site_section_items where section_id=v_item_section and id<>p_target and sort_order=v_sort) then raise exception 'DUPLICATE_ITEM_ORDER'; end if;
   insert into public.site_section_items(id,section_id,sort_order,title,description,media_id,link_url,visible)
    values(p_target,v_item_section,v_sort,v_title,v_desc,null,p_data->>'url',v_visible)
    on conflict(id) do update set sort_order=excluded.sort_order,title=excluded.title,description=excluded.description,link_url=excluded.link_url,visible=excluded.visible
    where public.site_section_items.section_id=excluded.section_id;
   if not found then raise exception 'FOREIGN_ITEM'; end if;
   update public.site_pages set draft_revision=draft_revision+1,updated_at=now() where id=p_parent;
   v_result:=pg_catalog.jsonb_build_object('id',p_target,'revision',v_page.draft_revision+1,'status',v_page.status);
  elsif p_action='page.publish' then
   if p_data<>'{}'::jsonb then raise exception 'INVALID_PUBLISH'; end if;
   if v_page.published_revision=v_page.draft_revision then raise exception 'ALREADY_PUBLISHED'; end if;
   -- Pin referenced ready-media rows against concurrent archive until snapshot commit.
   perform 1 from public.media_assets a where a.id in
     (select i.media_id from public.site_page_sections s join public.site_section_items i on i.section_id=s.id
        where s.page_id=p_target and s.visible and i.visible and i.media_id is not null) for share;
   if exists(
     select 1 from public.site_page_sections s join public.site_section_items i on i.section_id=s.id
     left join public.media_assets a on a.id=i.media_id and a.status='ready'
     left join storage.objects o on o.bucket_id='musa-site-media' and o.name=a.storage_key
     where s.page_id=p_target and s.visible and i.visible and i.media_id is not null
       and (a.id is null or o.id is null or
          coalesce(o.metadata->>'mimetype','')<>a.content_type or
          coalesce(o.metadata->>'size','') !~ '^[0-9]{1,10}$' or
          (o.metadata->>'size')::bigint<>a.size_bytes)
   ) then raise exception 'MEDIA_NOT_VERIFIED'; end if;
   if (select count(*) from public.site_page_sections where page_id=p_target and visible)>60 or
     exists(select 1 from public.site_page_sections s where s.page_id=p_target and (select count(*) from public.site_section_items i where i.section_id=s.id and i.visible)>100)
     then raise exception 'CMS_SNAPSHOT_LIMIT'; end if;
   v_sections:=public.coaching_cms_build_sections(p_target,true);
   -- Published schema excludes draft visibility flags (no mutable storage keys).
   select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id',s.value->'id','kind',s.value->'kind','order',s.value->'order',
        'heading',s.value->'heading','body',s.value->'body',
        'items',(select coalesce(pg_catalog.jsonb_agg(i.value - 'visible' order by (i.value->>'order')::integer),'[]'::jsonb)
           from pg_catalog.jsonb_array_elements(s.value->'items') i)
      ) order by (s.value->>'order')::integer),'[]'::jsonb)
    into v_sections from pg_catalog.jsonb_array_elements(v_sections) s;
   v_snapshot:=pg_catalog.jsonb_build_object('schemaVersion',1,'slug',v_page.slug,'revision',v_page.draft_revision,
     'title',v_page.title,'seoTitle',v_page.seo_title,'seoDescription',v_page.seo_description,'sections',v_sections);
   update public.site_pages set status='published',published_revision=draft_revision,published_snapshot=v_snapshot,updated_at=now() where id=p_target;
   v_result:=pg_catalog.jsonb_build_object('id',p_target,'revision',v_page.draft_revision,'status','published');
  end if;
 end if;
 insert into public.audit_logs(actor_id,action,entity_id,details)
   values(v_actor,'cms.'||p_action,p_target,pg_catalog.jsonb_build_object('expectedRevision',p_expected_revision));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
   values(v_actor,p_operation_id,'cms.'||p_action,v_payload,v_result);
 return v_result;
end;
$$;
revoke all on function public.coaching_cms_write(text,uuid,uuid,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_write(text,uuid,uuid,bigint,jsonb,uuid) to authenticated;
