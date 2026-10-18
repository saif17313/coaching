-- Website CMS Core Part I (local-first). No base-table grants, no Storage upload claims.
-- Original Shifat's Tales exact component field parity remains unverified.
-- All website writes require verified active-teacher auth, a unique operation receipt and audit.

create function public.coaching_cms_build_sections(p_page_id uuid, p_visible_only boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id',s.id,'kind',s.kind,'order',s.sort_order,'heading',s.heading,'body',s.body,
      'visible',s.visible,
      'items',(select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id',i.id,'order',i.sort_order,'title',i.title,
          'description',i.description,'mediaId',i.media_id,'url',i.link_url,
          'visible',i.visible) order by i.sort_order,i.id),'[]'::jsonb)
        from public.site_section_items i where i.section_id=s.id
          and (not p_visible_only or i.visible))
    ) order by s.sort_order,s.id),'[]'::jsonb)
  from public.site_page_sections s where s.page_id=p_page_id
    and (not p_visible_only or s.visible);
$$;
revoke all on function public.coaching_cms_build_sections(uuid,boolean) from public,anon,authenticated;

create function public.coaching_cms_list_pages()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_items jsonb; v_count integer;
begin
  if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  select count(*) into v_count from public.site_pages;
  if v_count>50 then raise exception 'CMS_LIST_LIMIT_EXCEEDED'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',p.id,'slug',p.slug,'title',p.title,'status',p.status,
    'draftRevision',p.draft_revision,'publishedRevision',p.published_revision
  ) order by p.slug),'[]'::jsonb) into v_items from public.site_pages p;
  return pg_catalog.jsonb_build_object('items',v_items);
end;
$$;
revoke all on function public.coaching_cms_list_pages() from public,anon,authenticated;
grant execute on function public.coaching_cms_list_pages() to authenticated;

create function public.coaching_cms_get_page(p_page_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p record;
begin
  if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_page_id is null then raise exception 'INVALID_PAGE_ID'; end if;
  select id,slug,title,seo_title,seo_description,status,draft_revision,published_revision
    into p from public.site_pages where id=p_page_id;
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object('id',p.id,'slug',p.slug,'title',p.title,
    'seoTitle',p.seo_title,'seoDescription',p.seo_description,'status',p.status,
    'draftRevision',p.draft_revision,'publishedRevision',p.published_revision,
    'sections',public.coaching_cms_build_sections(p_page_id,false));
end;
$$;
revoke all on function public.coaching_cms_get_page(uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_get_page(uuid) to authenticated;

create function public.coaching_cms_get_published_page(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select p.published_snapshot from public.site_pages p
  where p.slug=p_slug and p.status='published' and p.published_revision is not null;
$$;
revoke all on function public.coaching_cms_get_published_page(text) from public,anon,authenticated;
grant execute on function public.coaching_cms_get_published_page(text) to anon,authenticated;

create function public.coaching_cms_get_published_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when s.published_revision is null or s.published_content is null then null
    else pg_catalog.jsonb_build_object('revision',s.published_revision,'settings',
      pg_catalog.jsonb_build_object('siteTitle',s.published_content->>'siteTitle',
        'tagline',s.published_content->>'tagline',
        'contactEmail',s.published_content->>'contactEmail',
        'contactPhone',s.published_content->>'contactPhone',
        'footerText',s.published_content->>'footerText',
        'logoMediaId',s.published_content->>'logoMediaId'))
    end from public.app_settings s where s.id=1;
$$;
revoke all on function public.coaching_cms_get_published_settings() from public,anon,authenticated;
grant execute on function public.coaching_cms_get_published_settings() to anon,authenticated;

create function public.coaching_cms_write(
 p_action text,p_target uuid,p_parent uuid,p_expected_revision bigint,p_data jsonb,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := (select auth.uid()); v_prior record; v_payload jsonb; v_result jsonb;
 v_page public.site_pages%rowtype; v_section public.site_page_sections%rowtype;
 v_title text; v_slug text; v_seo text; v_desc text; v_kind text;
 v_sort integer; v_heading text; v_body text; v_visible boolean; v_item_section uuid;
 v_snapshot jsonb; v_sections jsonb;
begin
 if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
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
   if exists(select 1 from public.site_page_sections s join public.site_section_items i on i.section_id=s.id where s.page_id=p_target and s.visible and i.visible and i.media_id is not null) then raise exception 'MEDIA_NOT_VERIFIED'; end if;
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

-- CMS source tables remain RLS protected: no direct anon/authenticated table grants.
