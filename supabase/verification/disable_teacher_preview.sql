-- Disable the added private preview read without touching media, records or public delivery.
revoke execute on function public.coaching_media_teacher_preview(uuid) from public,anon,authenticated;
