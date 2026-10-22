reset role;
select gen_random_uuid() as protected_photo \gset
insert into public.media_assets(id,storage_key,content_type,size_bytes,sha256,alt,status,created_by) values(:'protected_photo',:'teacher_id'||'/'||:'protected_photo'||'.png','image/png',10,repeat('0',64),'DEMO protected private portrait','ready',:'teacher_id');
update public.student_details set photo_media_id=:'protected_photo' where student_id=:'student_id';
select set_config('test.protected_photo',:'protected_photo',true);
do $$begin begin update public.media_assets set status='archived' where id=current_setting('test.protected_photo')::uuid;raise exception 'ASSIGNED_PHOTO_ARCHIVED';exception when others then if sqlerrm<>'MEDIA_DRAFT_IN_USE' then raise;end if;end;raise notice 'PASS Assigned private portrait protected from archival';end;$$;
update public.student_details set photo_media_id=null where student_id=:'student_id';
update public.media_assets set status='archived' where id=:'protected_photo';
do $$begin if not exists(select 1 from public.media_assets where id=current_setting('test.protected_photo')::uuid and status='archived') then raise exception 'UNREFERENCED_MEDIA_BLOCKED';end if;end;$$;
