-- Authorized ordering and draft detachment. Retains every historical record.
-- An anon policy must not call the authenticated-only Teacher helper. Postgres
-- may evaluate both branches of an OR; the old combined policy denied public
-- downloads even after publication with "permission denied for function".
drop policy musa_site_media_read on storage.objects;
create policy musa_site_media_public_read on storage.objects for select to anon
 using(bucket_id='musa-site-media' and public.coaching_media_is_published_path(name));
create policy musa_site_media_teacher_read on storage.objects for select to authenticated
 using(bucket_id='musa-site-media' and (public.coaching_media_is_published_path(name) or
  public.coaching_media_actor_is_active_teacher() and pg_catalog.split_part(name,'/',1)=(select auth.uid())::text));
create function public.coaching_cms_organize(p_action text,p_page_id uuid,p_section_id uuid,p_item_id uuid,
 p_order_ids uuid[],p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());page public.site_pages%rowtype;prior record;payload jsonb;result jsonb;actual uuid[];requested uuid[];
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if p_action is null or p_action not in ('sections.reorder','items.reorder','media.detach') or p_page_id is null or p_expected_revision is null or p_operation_id is null then raise exception 'INVALID_CMS_COMMAND';end if;
 payload:=pg_catalog.jsonb_build_object('action',p_action,'page',p_page_id,'section',p_section_id,'item',p_item_id,'order',p_order_ids,'revision',p_expected_revision);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(actor::text),pg_catalog.hashtext(p_operation_id::text));
 select * into prior from public.coaching_mutation_receipts where actor_id=actor and operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'cms.organize' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 select * into page from public.site_pages where id=p_page_id for update;
 if not found or page.status='archived' then raise exception 'PAGE_NOT_FOUND';end if;
 if page.draft_revision<>p_expected_revision then raise exception 'REVISION_CONFLICT';end if;
 if p_action='media.detach' then
  if p_item_id is null or p_section_id is not null or p_order_ids is not null then raise exception 'INVALID_MEDIA_TARGET';end if;
  update public.site_section_items i set media_id=null from public.site_page_sections s where i.id=p_item_id and i.section_id=s.id and s.page_id=p_page_id;
  if not found then raise exception 'ITEM_NOT_FOUND';end if;
 else
  if p_item_id is not null or p_order_ids is null or pg_catalog.cardinality(p_order_ids)>100 or
   (select count(distinct id) from pg_catalog.unnest(p_order_ids) x(id))<>pg_catalog.cardinality(p_order_ids) then raise exception 'INVALID_CONTENT_ORDER';end if;
  select coalesce(pg_catalog.array_agg(id order by id),'{}'::uuid[]) into requested from pg_catalog.unnest(p_order_ids) x(id);
  if p_action='sections.reorder' then
   if p_section_id is not null or pg_catalog.cardinality(p_order_ids)>60 then raise exception 'INVALID_CONTENT_ORDER';end if;
   select coalesce(pg_catalog.array_agg(id order by id),'{}'::uuid[]) into actual from public.site_page_sections where page_id=p_page_id;
   if requested<>actual then raise exception 'INVALID_CONTENT_ORDER';end if;
   update public.site_page_sections s set sort_order=x.position-1,updated_at=now() from pg_catalog.unnest(p_order_ids) with ordinality x(id,position) where s.id=x.id;
  else
   if p_section_id is null or not exists(select 1 from public.site_page_sections where id=p_section_id and page_id=p_page_id) then raise exception 'SECTION_NOT_FOUND';end if;
   select coalesce(pg_catalog.array_agg(id order by id),'{}'::uuid[]) into actual from public.site_section_items where section_id=p_section_id;
   if requested<>actual then raise exception 'INVALID_CONTENT_ORDER';end if;
   update public.site_section_items i set sort_order=x.position-1 from pg_catalog.unnest(p_order_ids) with ordinality x(id,position) where i.id=x.id;
  end if;
 end if;
 update public.site_pages set draft_revision=draft_revision+1,updated_at=now() where id=p_page_id;
 result:=pg_catalog.jsonb_build_object('id',case when p_action='media.detach' then p_item_id else p_page_id end,'revision',page.draft_revision+1,'status',page.status);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(actor,'cms.'||p_action,p_page_id,pg_catalog.jsonb_build_object('section',p_section_id,'item',p_item_id));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(actor,p_operation_id,'cms.organize',payload,result);
 return result;
end;$$;
revoke all on function public.coaching_cms_organize(text,uuid,uuid,uuid,uuid[],bigint,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_organize(text,uuid,uuid,uuid,uuid[],bigint,uuid) to authenticated;

-- Typed draft media and archival serialize on media rows, after the page lock.
alter function public.coaching_cms_fields_write(uuid,uuid,uuid,text,jsonb,bigint,uuid) rename to coaching_cms_fields_write_base;
revoke all on function public.coaching_cms_fields_write_base(uuid,uuid,uuid,text,jsonb,bigint,uuid) from public,anon,authenticated;
create function public.coaching_cms_fields_write(p_page_id uuid,p_section_id uuid,p_item_id uuid,p_section_key text,p_content jsonb,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m uuid;schema jsonb;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from public.coaching_mutation_receipts where actor_id=(select auth.uid()) and operation_id=p_operation_id) then
  return public.coaching_cms_fields_write_base(p_page_id,p_section_id,p_item_id,p_section_key,p_content,p_expected_revision,p_operation_id);
 end if;
 schema:=public.coaching_cms_field_schema(p_section_key,p_item_id is not null);
 if schema is null or p_content is null or not extensions.jsonb_matches_schema(schema::json,p_content) then raise exception 'INVALID_TYPED_CONTENT';end if;
 perform 1 from public.site_pages where id=p_page_id for update;
 for m in select * from public.coaching_cms_content_media_ids(p_content) order by 1 loop
  perform 1 from public.media_assets where id=m and status='ready' and created_by=(select auth.uid()) for share;
  if not found then raise exception 'MEDIA_NOT_VERIFIED';end if;
 end loop;
 return public.coaching_cms_fields_write_base(p_page_id,p_section_id,p_item_id,p_section_key,p_content,p_expected_revision,p_operation_id);
end;$$;
revoke all on function public.coaching_cms_fields_write(uuid,uuid,uuid,text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_fields_write(uuid,uuid,uuid,text,jsonb,bigint,uuid) to authenticated;

alter function public.coaching_cms_media_mutation(text,uuid,uuid,uuid,bigint,uuid) rename to coaching_cms_media_mutation_base;
revoke all on function public.coaching_cms_media_mutation_base(text,uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated;
create function public.coaching_cms_media_mutation(p_action text,p_media_id uuid,p_page_id uuid,p_item_id uuid,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from public.coaching_mutation_receipts where actor_id=(select auth.uid()) and operation_id=p_operation_id) then
  return public.coaching_cms_media_mutation_base(p_action,p_media_id,p_page_id,p_item_id,p_expected_revision,p_operation_id);
 end if;
 if p_action='attach' then perform 1 from public.site_pages where id=p_page_id for update;end if;
 if p_action='archive' then
  perform 1 from public.media_assets where id=p_media_id and created_by=(select auth.uid()) for update;
  if exists(select 1 from public.site_page_sections s where p_media_id in (select * from public.coaching_cms_content_media_ids(s.content))) or
   exists(select 1 from public.site_section_items i where p_media_id in (select * from public.coaching_cms_content_media_ids(i.metadata))) then raise exception 'MEDIA_DRAFT_IN_USE';end if;
 end if;
 return public.coaching_cms_media_mutation_base(p_action,p_media_id,p_page_id,p_item_id,p_expected_revision,p_operation_id);
end;$$;
revoke all on function public.coaching_cms_media_mutation(text,uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_media_mutation(text,uuid,uuid,uuid,bigint,uuid) to authenticated;
notify pgrst,'reload schema';
