-- Explicit Teacher-only draft deletion; published snapshots change only on Publish.
alter function public.coaching_cms_organize(text,uuid,uuid,uuid,uuid[],bigint,uuid) rename to coaching_cms_organize_base;
revoke all on function public.coaching_cms_organize_base(text,uuid,uuid,uuid,uuid[],bigint,uuid) from public,anon,authenticated;
create function public.coaching_cms_organize(p_action text,p_page_id uuid,p_section_id uuid,p_item_id uuid,p_order_ids uuid[],p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());page public.site_pages%rowtype;prior record;payload jsonb;result jsonb;removed jsonb;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if p_action is null or p_action not in ('item.delete','section.delete') then
  return public.coaching_cms_organize_base(p_action,p_page_id,p_section_id,p_item_id,p_order_ids,p_expected_revision,p_operation_id);
 end if;
 if p_page_id is null or p_section_id is null or p_expected_revision is null or p_expected_revision<1 or p_operation_id is null or p_order_ids is not null or (p_action='item.delete' and p_item_id is null) or (p_action='section.delete' and p_item_id is not null) then raise exception 'INVALID_CMS_COMMAND';end if;
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
 if not exists(select 1 from public.site_page_sections where id=p_section_id and page_id=p_page_id) then raise exception 'SECTION_NOT_FOUND';end if;
 if p_action='item.delete' then
  select pg_catalog.to_jsonb(i) into removed from public.site_section_items i where id=p_item_id and section_id=p_section_id;
  if not found then raise exception 'ITEM_NOT_FOUND';end if;
  delete from public.site_section_items where id=p_item_id and section_id=p_section_id;
 else
  select pg_catalog.jsonb_build_object('section',pg_catalog.to_jsonb(s),'items',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i)),'[]'::jsonb) from public.site_section_items i where section_id=s.id)) into removed from public.site_page_sections s where id=p_section_id and page_id=p_page_id;
  delete from public.site_section_items where section_id=p_section_id;
  delete from public.site_page_sections where id=p_section_id and page_id=p_page_id;
 end if;
 update public.site_pages set draft_revision=draft_revision+1,updated_at=now() where id=p_page_id;
 result:=pg_catalog.jsonb_build_object('id',p_page_id,'revision',page.draft_revision+1,'status',page.status);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(actor,'cms.'||p_action,p_page_id,pg_catalog.jsonb_build_object('section',p_section_id,'item',p_item_id,'removed',removed));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(actor,p_operation_id,'cms.organize',payload,result);
 return result;
end;$$;
revoke all on function public.coaching_cms_organize(text,uuid,uuid,uuid,uuid[],bigint,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_organize(text,uuid,uuid,uuid,uuid[],bigint,uuid) to authenticated;
