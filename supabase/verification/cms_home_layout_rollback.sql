-- Run only inside a transaction after typed CMS and homepage-layout migrations, then ROLLBACK.
select gen_random_uuid() as layout_teacher,gen_random_uuid() as layout_student,gen_random_uuid() as layout_page,gen_random_uuid() as layout_section \gset
insert into auth.users(id,email) values(:'layout_teacher','layout-teacher@example.invalid'),(:'layout_student','layout-student@example.invalid');
update public.profiles set role='teacher',account_status='active' where id=:'layout_teacher';
update public.profiles set account_status='active' where id=:'layout_student';
insert into public.site_pages(id,slug,title,seo_title,created_by) values(:'layout_page','rollback-layout','Layout fixture','Layout fixture',:'layout_teacher');
insert into public.site_page_sections(id,page_id,kind,heading,sort_order) values(:'layout_section',:'layout_page','footer','Arrangement',0);
select set_config('test.layout_page',:'layout_page',true),set_config('test.layout_section',:'layout_section',true),set_config('request.jwt.claim.sub',:'layout_teacher',true);
set local role authenticated;
do $$ declare p uuid:=current_setting('test.layout_page')::uuid;s uuid:=current_setting('test.layout_section')::uuid;r jsonb;begin
 r:=public.coaching_cms_fields_write(p,s,null,'HOME_LAYOUT','{"sectionOrder":["HOME_YOUTUBE_CLASSES","HOME_HERO"],"hiddenSections":["HOME_TESTIMONIALS"]}',1,gen_random_uuid());
 if (r->>'revision')::integer<>2 then raise exception 'LAYOUT_REVISION_FAILED';end if;
 begin perform public.coaching_cms_fields_write(p,s,null,'HOME_LAYOUT','{"sectionOrder":["arbitrary"]}',2,gen_random_uuid());raise exception 'INVALID_LAYOUT_ACCEPTED';exception when others then if sqlerrm<>'INVALID_TYPED_CONTENT' then raise;end if;end;
 perform public.coaching_cms_write('page.publish',p,null,2,'{}',gen_random_uuid());
 raise notice 'PASS Home layout save, exact revision, invalid field rejection and publication';
end;$$;
reset role;
do $$ begin if not exists(select 1 from public.site_pages where id=current_setting('test.layout_page')::uuid and published_snapshot->'sections'->0->'content'->'hiddenSections'='["HOME_TESTIMONIALS"]'::jsonb) then raise exception 'LAYOUT_PUBLIC_SNAPSHOT_FAILED';end if;end;$$;
select set_config('request.jwt.claim.sub',:'layout_student',true);
set local role authenticated;
do $$ begin begin perform public.coaching_cms_fields_write(current_setting('test.layout_page')::uuid,current_setting('test.layout_section')::uuid,null,'HOME_LAYOUT','{}',2,gen_random_uuid());raise exception 'STUDENT_LAYOUT_WRITE_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;raise notice 'PASS Student layout write denied';end;$$;
reset role;
