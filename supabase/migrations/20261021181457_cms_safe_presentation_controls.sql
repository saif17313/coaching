-- Bounded presentation metadata; existing values and published snapshots are preserved.
create function public.coaching_cms_design_schema() returns jsonb language sql immutable set search_path='' as $fn$ select $schema${"type":"object","additionalProperties":false,"properties":{"layout":{"type":"string","enum":["full","contained"]},"background":{"type":"string","enum":["default","white","ivory","mint","navy"]},"paddingTop":{"type":"integer","minimum":0,"maximum":160},"paddingBottom":{"type":"integer","minimum":0,"maximum":160},"minHeight":{"type":"integer","minimum":0,"maximum":900},"align":{"type":"string","enum":["left","center","right"]},"headingScale":{"type":"integer","minimum":70,"maximum":150},"textScale":{"type":"integer","minimum":85,"maximum":120},"imageGap":{"type":"integer","minimum":0,"maximum":80},"images":{"type":"object","maxProperties":40,"patternProperties":{"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$":{"type":"object","additionalProperties":false,"properties":{"width":{"type":"integer","minimum":0,"maximum":1600},"height":{"type":"integer","minimum":0,"maximum":1200},"mobileWidth":{"type":"integer","minimum":25,"maximum":100},"scale":{"type":"integer","minimum":25,"maximum":200},"aspect":{"type":"string","enum":["auto","1/1","4/3","16/9","3/4"]},"fit":{"type":"string","enum":["cover","contain"]},"focalX":{"type":"integer","minimum":0,"maximum":100},"focalY":{"type":"integer","minimum":0,"maximum":100},"horizontal":{"type":"string","enum":["left","center","right"]},"vertical":{"type":"string","enum":["top","center","bottom"]},"radius":{"type":"integer","minimum":0,"maximum":100}}}},"additionalProperties":false}}}$schema$::jsonb $fn$;
revoke all on function public.coaching_cms_design_schema() from public,anon,authenticated;
alter table public.site_page_sections add column design jsonb not null default '{}' check(extensions.jsonb_matches_schema(public.coaching_cms_design_schema()::json,design));
alter table public.site_section_items add column design jsonb not null default '{}' check(extensions.jsonb_matches_schema(public.coaching_cms_design_schema()::json,design));
create or replace function public.coaching_cms_build_sections(p_page_id uuid,p_visible_only boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',s.id,'kind',s.kind,'order',s.sort_order,'heading',s.heading,'body',s.body,'visible',s.visible,
  'items',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',i.id,'order',i.sort_order,'title',i.title,'description',i.description,'mediaId',i.media_id,'url',i.link_url,'visible',i.visible)||case when i.design='{}'::jsonb then '{}'::jsonb else jsonb_build_object('design',i.design) end
    ||case when s.section_key is null then '{}'::jsonb else pg_catalog.jsonb_build_object('metadata',i.metadata) end order by i.sort_order,i.id),'[]'::jsonb)
   from public.site_section_items i where i.section_id=s.id and (not p_visible_only or i.visible)
    and (not p_visible_only or s.section_key is distinct from 'REVIEWS_ITEMS' or coalesce((i.metadata->>'approved')::boolean,false) and coalesce((i.metadata->>'consent')::boolean,false))
    and (not p_visible_only or s.section_key is distinct from 'RESULTS_STUDENTS' or coalesce((i.metadata->>'verified')::boolean,false) or coalesce((i.metadata->>'demo')::boolean,false))))
  ||case when s.design='{}'::jsonb then '{}'::jsonb else jsonb_build_object('design',s.design) end
  ||case when s.section_key is null then '{}'::jsonb else pg_catalog.jsonb_build_object('sectionKey',s.section_key,'content',s.content) end
  order by s.sort_order,s.id),'[]'::jsonb)
 from public.site_page_sections s where s.page_id=p_page_id and (not p_visible_only or s.visible);
$$;
revoke all on function public.coaching_cms_build_sections(uuid,boolean) from public,anon,authenticated;
create function public.coaching_cms_design_write(p_page_id uuid,p_section_id uuid,p_item_id uuid,p_design jsonb,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());prior record;payload jsonb;page public.site_pages%rowtype;sec public.site_page_sections%rowtype;card public.site_section_items%rowtype;result jsonb;image text;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if p_operation_id is null or p_page_id is null or p_section_id is null or p_expected_revision is null or p_design is null or octet_length(p_design::text)>24000 or not extensions.jsonb_matches_schema(public.coaching_cms_design_schema()::json,p_design) then raise exception 'INVALID_PRESENTATION';end if;
 payload:=jsonb_build_object('page',p_page_id,'section',p_section_id,'item',p_item_id,'design',p_design,'revision',p_expected_revision);
 perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(p_operation_id::text));select * into prior from public.coaching_mutation_receipts where actor_id=actor and operation_id=p_operation_id;
 if found then if prior.operation_type<>'cms.design.write' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 select * into page from public.site_pages where id=p_page_id and status<>'archived' for update;if not found then raise exception 'PAGE_NOT_FOUND';end if;
 if page.draft_revision<>p_expected_revision then raise exception 'REVISION_CONFLICT';end if;
 select * into sec from public.site_page_sections where id=p_section_id and page_id=p_page_id;if not found then raise exception 'SECTION_NOT_FOUND';end if;
 if p_item_id is not null then select * into card from public.site_section_items where id=p_item_id and section_id=sec.id;if not found then raise exception 'ITEM_NOT_FOUND';end if;end if;
 for image in select jsonb_object_keys(coalesce(p_design->'images','{}')) loop
  if p_item_id is not null then
   if image::uuid is distinct from card.media_id and not exists(select 1 from public.coaching_cms_content_media_ids(card.metadata) id where id=image::uuid) then raise exception 'INVALID_MEDIA_TARGET';end if;
  elsif not exists(select 1 from public.coaching_cms_content_media_ids(sec.content) id where id=image::uuid) and not exists(select 1 from public.site_section_items i where i.section_id=sec.id and (i.media_id=image::uuid or exists(select 1 from public.coaching_cms_content_media_ids(i.metadata) id where id=image::uuid))) then raise exception 'INVALID_MEDIA_TARGET';end if;
 end loop;
 if p_item_id is null then update public.site_page_sections set design=p_design,updated_at=now() where id=sec.id;else update public.site_section_items set design=p_design where id=card.id;end if;
 update public.site_pages set draft_revision=draft_revision+1,updated_at=now() where id=page.id;
 result:=jsonb_build_object('id',coalesce(p_item_id,p_section_id),'revision',page.draft_revision+1,'status',page.status);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(actor,'cms.design.write',coalesce(p_item_id,p_section_id),jsonb_build_object('page',page.id,'fields',(select jsonb_agg(key) from jsonb_object_keys(p_design) key)));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(actor,p_operation_id,'cms.design.write',payload,result);return result;
end;$$;
revoke all on function public.coaching_cms_design_write(uuid,uuid,uuid,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.coaching_cms_design_write(uuid,uuid,uuid,jsonb,bigint,uuid) to authenticated;
