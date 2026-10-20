-- Recovery option: disable the new capability without deleting files or business rows.
-- Review and apply as a NEW migration, with the server in read-only mode.
revoke execute on function public.coaching_learning_upload_register(uuid,uuid,text,bigint,text,uuid) from authenticated;
revoke execute on function public.coaching_learning_material_write(text,uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid) from authenticated;
revoke execute on function public.coaching_learning_material_download(uuid) from authenticated;
drop policy if exists learning_teacher_insert on storage.objects;
drop policy if exists learning_authorized_select on storage.objects;
-- Retain learning_material_uploads, its FK and private Storage objects for recovery.
