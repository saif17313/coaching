-- Use the same neutral role label as the portal when legacy identity names are empty.
create or replace function public.coaching_teacher_account_profile()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());r jsonb;
begin
 if a is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 select jsonb_build_object('id',p.id,'displayName',coalesce(nullif(btrim(t.display_name),''),nullif(btrim(p.full_name),''),'Teacher account'),'bio',coalesce(t.bio,''),'phone',t.phone,'avatarMediaId',t.avatar_media_id,
  'email',u.email,'emailConfirmed',u.email_confirmed_at is not null,'updatedAt',case when t.updated_at is null then null else to_char(t.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end)
 into r from public.profiles p join auth.users u on u.id=p.id left join public.teacher_profiles t on t.id=p.id where p.id=a;
 return r;
end;$$;
revoke all on function public.coaching_teacher_account_profile() from public,anon,authenticated;
grant execute on function public.coaching_teacher_account_profile() to authenticated;
