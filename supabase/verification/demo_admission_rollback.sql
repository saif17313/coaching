select set_config('request.jwt.claim.sub',:'teacher_id',true);
set local role authenticated;
do $$declare w jsonb;r jsonb;payload jsonb;op uuid:=gen_random_uuid();student text;begin
 w:=public.coaching_demo_read();payload:='{"name":"Admission fixture","school":"DEMO School","class":"Class 10","guardian":"DEMO Guardian","phone":"DEMO contact","address":"DEMO Address","photoMediaId":""}';
 r:=public.coaching_demo_command('student.create',payload,(w->>'revision')::bigint,op);
 if jsonb_array_length(r->'state'->'students')<>51 or r->'state'->'students'->50->>'admissionStatus'<>'pending' then raise exception 'DEMO_ADMISSION_FAILED';end if;
 if public.coaching_demo_command('student.create',payload,(w->>'revision')::bigint,op)<>r then raise exception 'DEMO_ADMISSION_REPLAY_FAILED';end if;
 student:=r->'state'->'students'->50->>'id';r:=public.coaching_demo_command('profile.edit',jsonb_build_object('studentId',student,'phone','DEMO edited contact'),(r->>'revision')::bigint,gen_random_uuid());
 if r->'state'->'students'->50->>'phone'<>'DEMO edited contact' then raise exception 'DEMO_PROFILE_EDIT_FAILED';end if;
 r:=public.coaching_demo_command('admission.decide',jsonb_build_object('studentId',student,'status','approved'),(r->>'revision')::bigint,gen_random_uuid());if r->'state'->'students'->50->>'admissionStatus'<>'approved' then raise exception 'DEMO_APPROVAL_FAILED';end if;
 raise notice 'PASS Isolated admission create, permanent roll, idempotency, contact edit and eligible approval';
end;$$;
reset role;
