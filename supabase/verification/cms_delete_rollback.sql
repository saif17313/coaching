-- BEGIN/ROLLBACK runner supplies the current organization function and migration first.
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='teacher' and account_status='active' limit 1),true);
select set_config('test.delete_page',gen_random_uuid()::text,true),set_config('test.delete_section',gen_random_uuid()::text,true),set_config('test.delete_item',gen_random_uuid()::text,true),set_config('test.delete_op',gen_random_uuid()::text,true);
set local role authenticated;
do $$declare p uuid:=current_setting('test.delete_page')::uuid;s uuid:=current_setting('test.delete_section')::uuid;i uuid:=current_setting('test.delete_item')::uuid;op uuid:=current_setting('test.delete_op')::uuid;r jsonb;begin
 perform public.coaching_cms_write('page.create',p,null,null,'{"slug":"demo-delete-rollback","title":"DEMO delete fixture","seoTitle":"DEMO delete fixture","seoDescription":""}',gen_random_uuid());
 perform public.coaching_cms_write('section.upsert',s,p,1,'{"kind":"gallery","order":0,"heading":"DEMO cards","body":"","visible":true}',gen_random_uuid());
 perform public.coaching_cms_write('item.upsert',i,p,2,jsonb_build_object('sectionId',s,'order',0,'title','DEMO card','description','','url',null,'visible',true),gen_random_uuid());
 perform public.coaching_cms_write('page.publish',p,null,3,'{}',gen_random_uuid());
 begin perform public.coaching_cms_organize('item.delete',p,gen_random_uuid(),i,null,3,gen_random_uuid());raise exception 'FOREIGN_SECTION_ACCEPTED';exception when others then if sqlerrm<>'SECTION_NOT_FOUND' then raise;end if;end;
 begin perform public.coaching_cms_organize('item.delete',p,s,i,null,2,gen_random_uuid());raise exception 'STALE_DELETE_ACCEPTED';exception when others then if sqlerrm<>'REVISION_CONFLICT' then raise;end if;end;
 r:=public.coaching_cms_organize('item.delete',p,s,i,null,3,op);
 if r->>'revision'<>'4' or public.coaching_cms_organize('item.delete',p,s,i,null,3,op)<>r then raise exception 'DELETE_REPLAY_FAILED';end if;
 perform public.coaching_cms_organize('section.delete',p,s,null,null,4,gen_random_uuid());
end;$$;
reset role;
do $$declare p uuid:=current_setting('test.delete_page')::uuid;begin
 if exists(select 1 from public.site_page_sections where page_id=p) then raise exception 'DRAFT_NOT_DELETED';end if;
 if not exists(select 1 from public.site_pages where id=p and jsonb_array_length(published_snapshot->'sections'->0->'items')=1 and draft_revision=5 and published_revision=3) then raise exception 'PUBLISHED_SNAPSHOT_CHANGED';end if;
 if not exists(select 1 from public.audit_logs where entity_id=p and action='cms.item.delete' and details->'removed'->>'title'='DEMO card') then raise exception 'DELETION_AUDIT_MISSING';end if;
end;$$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$begin begin perform public.coaching_cms_organize('section.delete',current_setting('test.delete_page')::uuid,current_setting('test.delete_section')::uuid,null,null,5,gen_random_uuid());raise exception 'NONTEACHER_DELETE_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;end;$$;
reset role;
do $$begin raise notice 'PASS deletion, stale/foreign denial, replay, audit, published snapshot preservation and non-Teacher denial';end;$$;
