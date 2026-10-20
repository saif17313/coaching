-- Run after the PREPARED migration inside one local transaction. Always ROLLBACK.
select gen_random_uuid() as teacher_id,gen_random_uuid() as student_id,gen_random_uuid() as other_id \gset
insert into auth.users(id,email) values(:'teacher_id','demo-admission-teacher@example.invalid'),(:'student_id','demo-admission-student@example.invalid'),(:'other_id','demo-admission-other@example.invalid');
update public.profiles set role='teacher',account_status='active',full_name='DEMO Admission Teacher' where id=:'teacher_id';
update public.profiles set account_status='active',full_name='DEMO Admission Student' where id in (:'student_id',:'other_id');
select set_config('test.student',:'student_id',true),set_config('test.other',:'other_id',true),set_config('test.operation',gen_random_uuid()::text,true),set_config('request.jwt.claim.sub',:'teacher_id',true);
set local role authenticated;
do $$
declare s uuid:=current_setting('test.student')::uuid;op uuid:=current_setting('test.operation')::uuid;r jsonb;r2 jsonb;data jsonb:='{"phone":"01700000000","guardianName":"DEMO Guardian","emergencyContact":"DEMO private contact","schoolName":"DEMO School"}';
begin
 r:=public.coaching_student_admission_write(s,data,0,op);
 if (r->>'revision')::integer<>1 or r->>'admissionRoll' !~ '^EC-[0-9]{4}-[0-9]{8}$' then raise exception 'TEST_CREATE_FAILED'; end if;
 r2:=public.coaching_student_admission_write(s,data,0,op);
 if r<>r2 then raise exception 'TEST_IDEMPOTENCY_FAILED'; end if;
 begin
  perform public.coaching_student_admission_write(s,'{"phone":"01800000000"}',0,gen_random_uuid());
  raise exception 'TEST_CONFLICT_NOT_REJECTED';
 exception when others then if sqlerrm<>'REVISION_CONFLICT' then raise; end if;end;
 begin
  perform public.coaching_student_admission_write(s,'{"phone":"01800000000"}',1,op);
  raise exception 'TEST_REPLAY_NOT_REJECTED';
 exception when others then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if;end;
 raise notice 'PASS Teacher create, unique generated roll, idempotency, stale revision and mismatched replay';
end;$$;
reset role;
select set_config('request.jwt.claim.sub',:'student_id',true);
set local role authenticated;
do $$
declare s uuid:=current_setting('test.student')::uuid;r jsonb;
begin
 r:=public.coaching_student_admission_read();
 if r->'guardian'?'emergencyContact' then raise exception 'TEST_EMERGENCY_CONTACT_EXPOSED'; end if;
 r:=public.coaching_student_admission_write(s,'{"phone":"01900000000","presentAddress":"DEMO updated address"}',1,gen_random_uuid());
 if (r->>'revision')::integer<>2 or r->'personal'->>'phone'<>'01900000000' then raise exception 'TEST_SELF_UPDATE_FAILED';end if;
 begin
  perform public.coaching_student_admission_read(current_setting('test.other')::uuid);
  raise exception 'TEST_OTHER_STUDENT_EXPOSED';
 exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin
  perform public.coaching_student_admission_write(s,'{"guardianName":"Changed"}',2,gen_random_uuid());
  raise exception 'TEST_GUARDIAN_EDIT_ALLOWED';
 exception when others then if sqlerrm<>'INVALID_ADMISSION' then raise;end if;end;
 begin
  perform 1 from public.student_guardians;
  raise exception 'TEST_DIRECT_GUARDIAN_READ_ALLOWED';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS Student permitted self-edit, emergency-contact redaction, other-student isolation and guardian denial';
end;$$;
reset role;
select set_config('request.jwt.claim.sub',:'teacher_id',true);
set local role authenticated;
do $$
declare r jsonb;
begin
 r:=public.coaching_student_admission_read(current_setting('test.student')::uuid);
 if r->'guardian'->>'emergencyContact'<>'DEMO private contact' or r->'guardian'->>'fullName'<>'DEMO Guardian' or r->'personal'->>'phone'<>'01900000000' then raise exception 'TEST_SHARED_RECORD_READBACK_FAILED';end if;
 raise notice 'PASS Teacher reads the same updated Student records; guardian administrative data preserved';
end;$$;
reset role;
set local role anon;
do $$begin
 begin perform public.coaching_student_admission_read(null);raise exception 'TEST_ANON_READ_ALLOWED';exception when insufficient_privilege then null;end;
 raise notice 'PASS Anonymous admission RPC execution denied';
end;$$;
reset role;
