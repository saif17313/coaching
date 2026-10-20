-- LOCAL only. Enclose migration + these fixtures in BEGIN/ROLLBACK.
select gen_random_uuid() as profile_teacher_id,gen_random_uuid() as profile_student_id \gset
insert into auth.users(id,email) values(:'profile_teacher_id','demo-profile-teacher@example.invalid'),(:'profile_student_id','demo-profile-student@example.invalid');
update public.profiles set role='teacher',account_status='active',full_name='DEMO Existing Teacher' where id=:'profile_teacher_id';
update public.profiles set account_status='active' where id=:'profile_student_id';
select set_config('request.jwt.claim.sub',:'profile_teacher_id',true);
update public.profiles set full_name='' where id=:'profile_teacher_id';
set local role authenticated;
do $$begin if public.coaching_teacher_account_profile()->>'displayName'<>'Teacher account' then raise exception 'EMPTY_NAME_FALLBACK_FAILED';end if;raise notice 'PASS Empty identity name has a neutral display fallback';end;$$;
reset role;
update public.profiles set full_name='DEMO Existing Teacher' where id=:'profile_teacher_id';
set local role authenticated;
do $$declare r jsonb;replay jsonb;op uuid:=gen_random_uuid();payload jsonb:='{"displayName":"DEMO Teacher Display","bio":"DEMO biography","phone":null,"avatarMediaId":null}';begin
 r:=public.coaching_teacher_account_profile();if r->>'displayName'<>'DEMO Existing Teacher' or r->'updatedAt'<>'null'::jsonb then raise exception 'PROFILE_FALLBACK_FAILED';end if;
 r:=public.coaching_teacher_account_profile_write(payload,null,op);if r->>'displayName'<>'DEMO Teacher Display' or r->>'bio'<>'DEMO biography' or r->>'updatedAt' is null then raise exception 'PROFILE_WRITE_FAILED';end if;
 replay:=public.coaching_teacher_account_profile_write(payload,null,op);if r<>replay then raise exception 'PROFILE_REPLAY_FAILED';end if;
 begin perform public.coaching_teacher_account_profile_write(payload,null,gen_random_uuid());raise exception 'PROFILE_STALE_ALLOWED';exception when others then if sqlerrm<>'REVISION_CONFLICT' then raise;end if;end;
 begin perform public.coaching_teacher_account_profile_write('{}',null,gen_random_uuid());raise exception 'PROFILE_INVALID_ALLOWED';exception when others then if sqlerrm<>'INVALID_PROFILE' then raise;end if;end;
 raise notice 'PASS Teacher own profile read/save/idempotency/conflict/invalid input';
end;$$;
reset role;
do $$begin if (select full_name from public.profiles where id=(select auth.uid()))<>'DEMO Existing Teacher' then raise exception 'AUTH_NAME_CHANGED';end if;raise notice 'PASS Existing identity name preserved';end;$$;
select set_config('request.jwt.claim.sub',:'profile_student_id',true);
set local role authenticated;
do $$begin
 begin perform public.coaching_teacher_account_profile();raise exception 'STUDENT_PROFILE_READ_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin perform public.coaching_teacher_account_profile_write('{}',null,gen_random_uuid());raise exception 'STUDENT_PROFILE_WRITE_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 raise notice 'PASS Student cannot access Teacher profile';
end;$$;
reset role;
