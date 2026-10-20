-- Prepared for explicit DEV approval. Read-only; existing public resolver is unchanged.
create function public.coaching_media_teacher_preview(p_media_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.media_assets%rowtype;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 select * into a from public.media_assets where id=p_media_id and status='ready';
 if not found then return null;end if;
 if a.created_by<>(select auth.uid()) and not public.coaching_media_is_published_path(a.storage_key) then return null;end if;
 return pg_catalog.jsonb_build_object('id',a.id,'key',a.storage_key,'contentType',a.content_type,'sizeBytes',a.size_bytes,'sha256',a.sha256);
end;$$;
revoke all on function public.coaching_media_teacher_preview(uuid) from public,anon,authenticated;
grant execute on function public.coaching_media_teacher_preview(uuid) to authenticated;
notify pgrst,'reload schema';
