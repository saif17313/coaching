-- Connect existing Teacher profile storage; no Auth, role, preference or ledger changes.
create function public.coaching_teacher_account_profile()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());r jsonb;
begin
 if a is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 select jsonb_build_object('id',p.id,'displayName',coalesce(t.display_name,p.full_name),'bio',coalesce(t.bio,''),'phone',t.phone,'avatarMediaId',t.avatar_media_id,
  'email',u.email,'emailConfirmed',u.email_confirmed_at is not null,'updatedAt',case when t.updated_at is null then null else to_char(t.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end)
 into r from public.profiles p join auth.users u on u.id=p.id left join public.teacher_profiles t on t.id=p.id where p.id=a;
 return r;
end;$$;
revoke all on function public.coaching_teacher_account_profile() from public,anon,authenticated;
grant execute on function public.coaching_teacher_account_profile() to authenticated;

create function public.coaching_teacher_account_profile_write(p_data jsonb,p_expected_updated_at timestamptz,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(select auth.uid());prior record;current_profile record;payload jsonb;result jsonb;photo uuid;name text;
begin
 if a is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_operation_id is null or p_data is null or jsonb_typeof(p_data)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(p_data) as x(key)) is distinct from array['avatarMediaId','bio','displayName','phone']::text[]
  or jsonb_typeof(p_data->'displayName')<>'string' or length(btrim(p_data->>'displayName')) not between 2 and 160 or (p_data->>'displayName') ~ '[[:cntrl:]]'
  or jsonb_typeof(p_data->'bio')<>'string' or length(p_data->>'bio')>1200 or (p_data->>'bio') ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  or jsonb_typeof(p_data->'phone') not in ('string','null') or (p_data->>'phone' is not null and (length(p_data->>'phone') not between 7 and 20 or (p_data->>'phone') ~ '[[:cntrl:]]'))
  or jsonb_typeof(p_data->'avatarMediaId') not in ('string','null') then raise exception 'INVALID_PROFILE';end if;
 name:=btrim(p_data->>'displayName');photo:=nullif(p_data->>'avatarMediaId','')::uuid;
 payload:=jsonb_build_object('data',p_data,'expectedUpdatedAt',p_expected_updated_at);
 perform pg_advisory_xact_lock(hashtext(a::text),hashtext(p_operation_id::text));
 select * into prior from public.coaching_mutation_receipts where actor_id=a and operation_id=p_operation_id for update;
 if found then if prior.operation_type<>'teacher.account.profile' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 perform 1 from public.profiles where id=a and role='teacher' and account_status='active' for update;
 if not found then raise exception 'FORBIDDEN';end if;
 select * into current_profile from public.teacher_profiles where id=a for update;
 if current_profile.updated_at is distinct from p_expected_updated_at then raise exception 'REVISION_CONFLICT';end if;
 if photo is not null and not exists(select 1 from public.media_assets where id=photo and status='ready' and (created_by=a or id=current_profile.avatar_media_id)) then raise exception 'INVALID_PHOTO';end if;
 insert into public.teacher_profiles(id,display_name,bio,phone,avatar_media_id,updated_at)
 values(a,name,p_data->>'bio',p_data->>'phone',photo,clock_timestamp())
 on conflict(id) do update set display_name=excluded.display_name,bio=excluded.bio,phone=excluded.phone,avatar_media_id=excluded.avatar_media_id,updated_at=excluded.updated_at;
 result:=public.coaching_teacher_account_profile();
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'teacher.profile.updated',a,jsonb_build_object('fields',jsonb_build_array('displayName','bio','phone','avatarMediaId')));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'teacher.account.profile',payload,result);
 return result;
end;$$;
revoke all on function public.coaching_teacher_account_profile_write(jsonb,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.coaching_teacher_account_profile_write(jsonb,timestamptz,uuid) to authenticated;
