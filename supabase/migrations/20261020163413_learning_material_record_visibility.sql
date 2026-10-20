-- Bind download authorization to the requested material, including release time.
create or replace function public.coaching_learning_material_download(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if (select auth.uid()) is null then raise exception 'FORBIDDEN';end if;
 select jsonb_build_object('id',c.id,'uploadId',u.id,'key',u.storage_key,'filename',u.filename,'contentType',u.content_type,'sizeBytes',u.size_bytes,'sha256',u.sha256) into result
 from public.batch_contents c join public.learning_material_uploads u on u.id=c.upload_id
 join public.profiles p on p.id=(select auth.uid()) and p.account_status='active'
 join public.batches b on b.id=c.batch_id and not b.is_archived
 where c.id=p_id and c.status<>'archived' and (
 p.role='teacher' or (p.role='student' and c.status='published' and (c.release_at is null or c.release_at<=now())
 and exists(select 1 from public.enrollments e where e.batch_id=c.batch_id and e.student_id=p.id and e.status='active')));
 return result;
end;$$;
revoke all on function public.coaching_learning_material_download(uuid) from public,anon,authenticated;
grant execute on function public.coaching_learning_material_download(uuid) to authenticated;
notify pgrst,'reload schema';
