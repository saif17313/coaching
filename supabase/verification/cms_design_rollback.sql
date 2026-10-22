-- Use after typed CMS, Home layout, presentation migration and Home fixture, inside BEGIN/ROLLBACK.
select set_config('request.jwt.claim.sub',:'layout_teacher',true),set_config('test.design_op',gen_random_uuid()::text,true);
set local role authenticated;
do $$declare p uuid:=current_setting('test.layout_page')::uuid;s uuid:=current_setting('test.layout_section')::uuid;op uuid:=current_setting('test.design_op')::uuid;r jsonb;d jsonb:='{"layout":"full","background":"mint","paddingTop":48,"headingScale":110}';begin
 r:=public.coaching_cms_design_write(p,s,null,d,2,op);
 if r->>'revision'<>'3' then raise exception 'DESIGN_REVISION_FAILED';end if;
 if public.coaching_cms_design_write(p,s,null,d,2,op)<>r then raise exception 'DESIGN_REPLAY_FAILED';end if;
 begin perform public.coaching_cms_design_write(p,s,null,'{"css":"position:fixed"}',3,gen_random_uuid());raise exception 'UNSAFE_CSS_ACCEPTED';exception when others then if sqlerrm<>'INVALID_PRESENTATION' then raise;end if;end;
 begin perform public.coaching_cms_design_write(p,s,null,'{"paddingTop":9999}',3,gen_random_uuid());raise exception 'UNBOUNDED_DESIGN_ACCEPTED';exception when others then if sqlerrm<>'INVALID_PRESENTATION' then raise;end if;end;
 begin perform public.coaching_cms_design_write(p,s,null,'{}',2,gen_random_uuid());raise exception 'STALE_DESIGN_ACCEPTED';exception when others then if sqlerrm<>'REVISION_CONFLICT' then raise;end if;end;
 begin perform public.coaching_cms_design_write(p,s,null,jsonb_build_object('images',jsonb_build_object(gen_random_uuid()::text,'{}'::jsonb)),3,gen_random_uuid());raise exception 'FOREIGN_IMAGE_DESIGN_ACCEPTED';exception when others then if sqlerrm<>'INVALID_MEDIA_TARGET' then raise;end if;end;
 raise notice 'PASS bounded appearance, replay, unsafe CSS denial, stale revision and image reference checks';
end;$$;
reset role;
do $$begin if exists(select 1 from public.site_pages where id=current_setting('test.layout_page')::uuid and published_snapshot->'sections'->0 ? 'design') then raise exception 'DESIGN_DRAFT_BECAME_PUBLIC';end if;end;$$;
set local role authenticated;
select public.coaching_cms_write('page.publish',:'layout_page',null,3,'{}',gen_random_uuid());
reset role;
do $$begin if not exists(select 1 from public.site_pages where id=current_setting('test.layout_page')::uuid and published_snapshot->'sections'->0->'design'->>'background'='mint') then raise exception 'PUBLISHED_DESIGN_MISSING';end if;raise notice 'PASS exact appearance published through existing snapshot writer';end;$$;
select set_config('request.jwt.claim.sub',:'layout_student',true);
set local role authenticated;
do $$begin begin perform public.coaching_cms_design_write(current_setting('test.layout_page')::uuid,current_setting('test.layout_section')::uuid,null,'{}',3,gen_random_uuid());raise exception 'STUDENT_DESIGN_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;raise notice 'PASS Student cannot customize website appearance';end;$$;
reset role;
