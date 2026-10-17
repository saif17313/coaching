-- Teacher Admin: audited, idempotent student full-name update.
-- Profile role, account status, auth identity and email are never editable here.
create function public.coaching_update_student_profile(
  p_student_id uuid, p_full_name text, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_prior record;
  v_old_name text;
  v_name text := pg_catalog.btrim(p_full_name);
  v_payload jsonb := pg_catalog.jsonb_build_object('studentId', p_student_id, 'fullName', v_name);
  v_result jsonb;
begin
  if v_actor is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN'; end if;
  if p_student_id is null or p_operation_id is null or p_full_name is null or
     pg_catalog.char_length(v_name) not between 2 and 160 or v_name ~ '[[:cntrl:]]'
     then raise exception 'INVALID_STUDENT_PROFILE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text), pg_catalog.hashtext(p_operation_id::text));
  select operation_type,payload,result into v_prior from public.coaching_mutation_receipts
    where actor_id=v_actor and operation_id=p_operation_id for update;
  if found then
    if v_prior.operation_type <> 'student-profile-update' or v_prior.payload <> v_payload
      then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.result;
  end if;
  select full_name into v_old_name from public.profiles
    where id=p_student_id and role='student'::public.app_role for update;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  update public.profiles set full_name=v_name, updated_at=now() where id=p_student_id;
  v_result := pg_catalog.jsonb_build_object('id',p_student_id,'fullName',v_name);
  insert into public.audit_logs(actor_id,action,entity_id,details)
    values(v_actor,'student.profile.updated',p_student_id,
      pg_catalog.jsonb_build_object('field','full_name','changed',v_old_name is distinct from v_name));
  insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result)
    values(v_actor,p_operation_id,'student-profile-update',v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.coaching_update_student_profile(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_update_student_profile(uuid,text,uuid) to authenticated;
