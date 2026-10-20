-- Additive typed reference CMS. No existing records are rewritten.
-- Recovery definitions are captured in typed_cms_pre_migration_recovery.sql.
create extension if not exists pg_jsonschema with schema extensions;
alter table public.site_page_sections add column section_key text,
 add column content jsonb not null default '{}'::jsonb;
alter table public.site_section_items add column metadata jsonb not null default '{}'::jsonb;
create unique index site_sections_semantic_key on public.site_page_sections(page_id,section_key) where section_key is not null;

create function public.coaching_cms_field_schema(p_key text,p_item boolean)
returns jsonb language sql immutable set search_path='' as $$
 select ($schemas$__CMS_SCHEMAS__$schemas$::jsonb)->p_key->(case when p_item then 'item' else 'section' end);
$$;
revoke all on function public.coaching_cms_field_schema(text,boolean) from public,anon,authenticated;

create function public.coaching_cms_content_media_ids(p_content jsonb)
returns setof uuid language sql immutable set search_path='' as $$
 with recursive nodes(value,key) as (
  select p_content,''::text
  union all
  select child.value,child.key from nodes n cross join lateral (
   select e.value,e.key from pg_catalog.jsonb_each(case when pg_catalog.jsonb_typeof(n.value)='object' then n.value else '{}'::jsonb end) e
   union all
   select a.value,n.key from pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(n.value)='array' then n.value else '[]'::jsonb end) a
  ) child
 ) select distinct (value#>>'{}')::uuid from nodes where key in ('teacherImage','imageMediaId','mediaId')
 and pg_catalog.jsonb_typeof(value)='string' and (value#>>'{}')<>'';
$$;
revoke all on function public.coaching_cms_content_media_ids(jsonb) from public,anon,authenticated;

create function public.coaching_cms_validate_relations(p_content jsonb)
returns void language plpgsql stable security definer set search_path='' as $$
declare field record;target_slug text;target_id text;source_snapshot jsonb;
begin
 for field in select * from pg_catalog.jsonb_each(p_content) loop
  target_slug:=case field.key when 'selectedCourseIds' then 'courses' when 'selectedStudentIds' then 'results'
   when 'selectedTestimonialIds' then 'reviews' when 'selectedAlbumIds' then 'gallery'
   when 'selectedRightIds' then 'news-events' when 'featuredId' then 'news-events' else null end;
  if target_slug is not null then
   select published_snapshot into source_snapshot from public.site_pages where slug=target_slug and status='published';
   for target_id in select value#>>'{}' from pg_catalog.jsonb_array_elements(
    case when field.key='featuredId' then pg_catalog.jsonb_build_array(field.value) else field.value end
   ) loop
    if target_id<>'' and not exists(
     select 1 from pg_catalog.jsonb_array_elements(coalesce(source_snapshot->'sections','[]'::jsonb)) s,
      pg_catalog.jsonb_array_elements(coalesce(s.value->'items','[]'::jsonb)) i where i.value->>'id'=target_id
      and (target_slug<>'reviews' or coalesce((i.value#>>'{metadata,approved}')::boolean,false)
       and coalesce((i.value#>>'{metadata,consent}')::boolean,false))
    ) then raise exception 'INVALID_CONTENT_REFERENCE'; end if;
   end loop;
  end if;
  if pg_catalog.jsonb_typeof(field.value)='object' then perform public.coaching_cms_validate_relations(field.value);
  elsif pg_catalog.jsonb_typeof(field.value)='array' then
   perform public.coaching_cms_validate_relations(x.value) from pg_catalog.jsonb_array_elements(field.value) x where pg_catalog.jsonb_typeof(x.value)='object';
  end if;
 end loop;
end;$$;
revoke all on function public.coaching_cms_validate_relations(jsonb) from public,anon,authenticated;

create function public.coaching_cms_fields_write(p_page_id uuid,p_section_id uuid,p_item_id uuid,
 p_section_key text,p_content jsonb,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());prior record;payload jsonb;page public.site_pages%rowtype;sec public.site_page_sections%rowtype;schema jsonb;result jsonb;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if p_operation_id is null or p_page_id is null or p_section_id is null or p_expected_revision is null then raise exception 'INVALID_CMS_COMMAND';end if;
 schema:=public.coaching_cms_field_schema(p_section_key,p_item_id is not null);
 if schema is null or p_content is null or pg_catalog.octet_length(p_content::text)>60000 or
  not extensions.jsonb_matches_schema(schema::json,p_content) then raise exception 'INVALID_TYPED_CONTENT';end if;
 payload:=pg_catalog.jsonb_build_object('page',p_page_id,'section',p_section_id,'item',p_item_id,'key',p_section_key,'content',p_content,'revision',p_expected_revision);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(actor::text),pg_catalog.hashtext(p_operation_id::text));
 select * into prior from public.coaching_mutation_receipts where actor_id=actor and operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'cms.fields.write' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 select * into page from public.site_pages where id=p_page_id for update;
 if not found or page.status='archived' then raise exception 'PAGE_NOT_FOUND';end if;
 if page.draft_revision<>p_expected_revision then raise exception 'REVISION_CONFLICT';end if;
 select * into sec from public.site_page_sections where id=p_section_id and page_id=p_page_id;
 if not found then raise exception 'SECTION_NOT_FOUND';end if;
 if sec.section_key is not null and sec.section_key<>p_section_key then raise exception 'SECTION_KEY_CONFLICT';end if;
 perform public.coaching_cms_validate_relations(p_content);
 if exists(select 1 from public.coaching_cms_content_media_ids(p_content) m(id) left join public.media_assets a on a.id=m.id
  where a.id is null or a.created_by<>actor or a.status<>'ready') then raise exception 'MEDIA_NOT_VERIFIED';end if;
 if p_item_id is null then
  update public.site_page_sections set section_key=p_section_key,content=p_content,updated_at=now() where id=p_section_id;
 else
  if sec.section_key is null then raise exception 'SECTION_KEY_REQUIRED';end if;
  update public.site_section_items set metadata=p_content where id=p_item_id and section_id=p_section_id;
  if not found then raise exception 'ITEM_NOT_FOUND';end if;
 end if;
 update public.site_pages set draft_revision=draft_revision+1,updated_at=now() where id=p_page_id;
 result:=pg_catalog.jsonb_build_object('id',coalesce(p_item_id,p_section_id),'revision',page.draft_revision+1,'status',page.status);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(actor,'cms.fields.write',coalesce(p_item_id,p_section_id),pg_catalog.jsonb_build_object('page',p_page_id,'key',p_section_key));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(actor,p_operation_id,'cms.fields.write',payload,result);
 return result;
end;$$;
revoke all on function public.coaching_cms_fields_write(uuid,uuid,uuid,text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_fields_write(uuid,uuid,uuid,text,jsonb,bigint,uuid) to authenticated;

create or replace function public.coaching_cms_build_sections(p_page_id uuid,p_visible_only boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',s.id,'kind',s.kind,'order',s.sort_order,'heading',s.heading,'body',s.body,'visible',s.visible,
  'items',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',i.id,'order',i.sort_order,'title',i.title,'description',i.description,'mediaId',i.media_id,'url',i.link_url,'visible',i.visible)
    ||case when s.section_key is null then '{}'::jsonb else pg_catalog.jsonb_build_object('metadata',i.metadata) end order by i.sort_order,i.id),'[]'::jsonb)
   from public.site_section_items i where i.section_id=s.id and (not p_visible_only or i.visible)
    and (not p_visible_only or s.section_key is distinct from 'REVIEWS_ITEMS' or coalesce((i.metadata->>'approved')::boolean,false) and coalesce((i.metadata->>'consent')::boolean,false))
    and (not p_visible_only or s.section_key is distinct from 'RESULTS_STUDENTS' or coalesce((i.metadata->>'verified')::boolean,false) or coalesce((i.metadata->>'demo')::boolean,false))))
  ||case when s.section_key is null then '{}'::jsonb else pg_catalog.jsonb_build_object('sectionKey',s.section_key,'content',s.content) end
  order by s.sort_order,s.id),'[]'::jsonb)
 from public.site_page_sections s where s.page_id=p_page_id and (not p_visible_only or s.visible);
$$;

-- Keep the original audited writer intact, callable only by the new guarded wrapper.
alter function public.coaching_cms_write(text,uuid,uuid,bigint,jsonb,uuid) rename to coaching_cms_write_base;
revoke all on function public.coaching_cms_write_base(text,uuid,uuid,bigint,jsonb,uuid) from public,anon,authenticated;
create function public.coaching_cms_write(p_action text,p_target uuid,p_parent uuid,p_expected_revision bigint,p_data jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;sections jsonb;sec record;m uuid;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 -- The original writer handles operation receipts, page locks, revision checks and audits.
 result:=public.coaching_cms_write_base(p_action,p_target,p_parent,p_expected_revision,p_data,p_operation_id);
 if p_action='page.publish' then
  -- A replay must not rebuild an older snapshot from a newer draft.
  if exists(select 1 from public.site_pages where id=p_target and draft_revision=p_expected_revision and published_revision=p_expected_revision) then
   for sec in select s.content from public.site_page_sections s where s.page_id=p_target and s.visible
    union all select i.metadata from public.site_page_sections s join public.site_section_items i on i.section_id=s.id where s.page_id=p_target and s.visible and i.visible loop
    perform public.coaching_cms_validate_relations(sec.content);
    for m in select * from public.coaching_cms_content_media_ids(sec.content) loop
     perform 1 from public.media_assets a join storage.objects o on o.bucket_id='musa-site-media' and o.name=a.storage_key
      where a.id=m and a.status='ready' and o.metadata->>'mimetype'=a.content_type and o.metadata->>'size'=a.size_bytes::text for share of a;
     if not found then raise exception 'MEDIA_NOT_VERIFIED';end if;
    end loop;
   end loop;
   select coalesce(pg_catalog.jsonb_agg((s.value-'visible')||pg_catalog.jsonb_build_object('items',
    (select coalesce(pg_catalog.jsonb_agg(i.value-'visible' order by (i.value->>'order')::integer),'[]'::jsonb) from pg_catalog.jsonb_array_elements(s.value->'items') i))
    order by (s.value->>'order')::integer),'[]'::jsonb) into sections from pg_catalog.jsonb_array_elements(public.coaching_cms_build_sections(p_target,true)) s;
   update public.site_pages set published_snapshot=pg_catalog.jsonb_set(published_snapshot,'{sections}',sections) where id=p_target;
  end if;
 end if;
 return result;
end;$$;
revoke all on function public.coaching_cms_write(text,uuid,uuid,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_write(text,uuid,uuid,bigint,jsonb,uuid) to authenticated;

create or replace function public.coaching_media_is_published_path(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_assets a join public.site_pages p on p.status='published'
  where a.storage_key=p_name and a.status='ready' and (
   exists(select 1 from pg_catalog.jsonb_array_elements(coalesce(p.published_snapshot->'sections','[]'::jsonb)) s,
     pg_catalog.jsonb_array_elements(coalesce(s.value->'items','[]'::jsonb)) i where i.value->>'mediaId'=a.id::text)
   or a.id in (select * from public.coaching_cms_content_media_ids(p.published_snapshot))));
$$;
notify pgrst,'reload schema';
