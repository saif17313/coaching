-- After student_admission_rollback.sql, inside the same LOCAL transaction.
set local role authenticated;
do $$
declare r jsonb;first_id text;
begin
 r:=public.coaching_teacher_student_directory('01900000000','','','',20,0);
 if (r->>'total')::integer<>1 or r->'students'->0->>'guardianName'<>'DEMO Guardian' or r->'students'->0->>'schoolName'<>'DEMO School' then raise exception 'DIRECTORY_MISSING_PERSISTED_FIELDS';end if;
 r:=public.coaching_teacher_student_directory('DEMO Guardian','','','',1,0);
 if (r->>'total')::integer<>1 or jsonb_array_length(r->'students')<>1 then raise exception 'DIRECTORY_GUARDIAN_SEARCH_FAILED';end if;
 r:=public.coaching_teacher_student_directory('','','','',1,0);first_id:=r->'students'->0->>'id';
 r:=public.coaching_teacher_student_directory('','','','',1,1);
 if first_id=r->'students'->0->>'id' then raise exception 'DIRECTORY_PAGINATION_FAILED';end if;
 begin perform public.coaching_teacher_student_directory(repeat('x',101));raise exception 'DIRECTORY_INVALID_SEARCH_ALLOWED';exception when others then if sqlerrm<>'INVALID_FILTER' then raise;end if;end;
 raise notice 'PASS complete persisted directory fields, guardian/phone search, bounded pagination and invalid filter';
end;$$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.student'),true);
set local role authenticated;
do $$begin
 begin perform public.coaching_teacher_student_directory();raise exception 'DIRECTORY_STUDENT_ACCESS_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 raise notice 'PASS Student directory access denied';
end;$$;
reset role;
