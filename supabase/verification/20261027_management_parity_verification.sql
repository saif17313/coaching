-- ---------------------------------------------------------------------------------------------
-- Management parity verification (migrations 20261027094139..20261027173934). Runs every workflow as
-- a real active Teacher (and the security checks as a real active Student) inside a sub-transaction
-- that is ALWAYS rolled back, so no fixture, audit row or ledger entry survives. The block always ends
-- with an exception: VERIFICATION_PASSED (with every check value) or VERIFICATION_FAILED (with the
-- mismatches). Executed against production on 2026-10-27: all 41 checks passed, nothing committed.
-- ---------------------------------------------------------------------------------------------
do $verify$
declare
 t uuid;st uuid;log jsonb:='{}'::jsonb;step text:='start';
 r jsonb;bid uuid;b2 uuid;bd uuid;s1 uuid;s2 uuid;s3 uuid;e uuid;d1 uuid;subj uuid;ex uuid;ch uuid;t1 uuid;t2 uuid;
 period text:=to_char(now() at time zone 'Asia/Dhaka','YYYY-MM');
 expected jsonb;k text;bad text:='';
begin
 select p.id into t from public.profiles p where p.role='teacher' and p.account_status='active' order by p.created_at limit 1;
 select p.id into st from public.profiles p join auth.users u on u.id=p.id where p.role='student' and p.account_status='active' and u.email_confirmed_at is not null order by p.created_at limit 1;
 begin
  perform set_config('request.jwt.claims',json_build_object('sub',t,'role','authenticated')::text,true);
  execute 'set local role authenticated';

  step:='batch';
  r:=public.coaching_batch_profile_write('create',null,jsonb_build_object('code','ZZV-PHY27','name','Physics HSC 2027 (verification)','capacity',3,'status','running','admissionOpen',true,
    'subject','Physics','academicLevel','HSC 2027','academicSession','2026-27','description','Verification fixture','scheduleDays',jsonb_build_array(6,1,3),'classStartMinute',960,'classEndMinute',1050,
    'startsOn',period||'-01','monthlyFeeMinor',300000,'admissionFeeMinor',100000,'dueDay',10),gen_random_uuid());
  bid:=(r->>'id')::uuid;
  r:=public.coaching_batch_profile(bid);
  log:=log||jsonb_build_object('batch_profile',concat_ws('|',r->>'status',r->>'admissionOpen',r->>'scheduleDays',r->'currentFee'->>'monthlyFeeMinor',r->'currentFee'->>'effectiveFrom'));
  begin perform public.coaching_batch_profile_write('create',null,jsonb_build_object('code','zzv-phy27','name','dup','capacity',2),gen_random_uuid());log:=log||'{"batch_duplicate_code":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('batch_duplicate_code',sqlerrm);end;
  begin perform public.coaching_batch_profile_write('delete',bid,'{}'::jsonb,gen_random_uuid());log:=log||'{"batch_no_delete":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('batch_no_delete',sqlerrm);end;

  step:='students';
  s1:=(public.coaching_create_offline_student('Verification Student One',gen_random_uuid())->>'id')::uuid;
  s2:=(public.coaching_create_offline_student('Verification Student Two',gen_random_uuid())->>'id')::uuid;
  s3:=(public.coaching_create_offline_student('Verification Student Three',gen_random_uuid())->>'id')::uuid;
  foreach e in array array[s1,s2,s3] loop
   r:=public.coaching_request_enrollment(e,bid,gen_random_uuid());perform public.coaching_decide_enrollment((r->>'id')::uuid,'approve',gen_random_uuid());
  end loop;
  log:=log||jsonb_build_object('batch_active_enrollments',(select count(*) from public.enrollments where batch_id=bid and status='active')::text);
  begin perform public.coaching_batch_profile_write('update',bid,jsonb_build_object('capacity',2),gen_random_uuid());log:=log||'{"batch_capacity_below_active":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('batch_capacity_below_active',sqlerrm);end;
  begin perform public.coaching_batch_profile_write('update',bid,jsonb_build_object('code','ZZV-NEW'),gen_random_uuid());log:=log||'{"batch_code_locked":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('batch_code_locked',sqlerrm);end;
  bd:=(public.coaching_batch_profile_write('create',null,jsonb_build_object('code','ZZV-DRAFT','name','Draft (verification)','capacity',5,'status','draft'),gen_random_uuid())->>'id')::uuid;
  r:=public.coaching_batch_profile_write('update',bd,jsonb_build_object('code','ZZV-DRAFT2','status','cancelled'),gen_random_uuid());
  log:=log||jsonb_build_object('batch_draft_retired',(r->>'code')||'|'||(r->>'status')||'|'||(r->>'isArchived'));
  b2:=(public.coaching_batch_profile_write('create',null,jsonb_build_object('code','ZZV-CHEM','name','Chemistry (verification)','capacity',5,'status','open','admissionOpen',false),gen_random_uuid())->>'id')::uuid;
  begin perform public.coaching_request_enrollment(s1,b2,gen_random_uuid());log:=log||'{"batch_admission_closed":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('batch_admission_closed',sqlerrm);end;
  perform public.coaching_batch_profile_write('update',b2,jsonb_build_object('status','completed','admissionOpen',true),gen_random_uuid());
  begin perform public.coaching_request_enrollment(s1,b2,gen_random_uuid());log:=log||'{"batch_completed_not_accepting":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('batch_completed_not_accepting',sqlerrm);end;
  r:=public.coaching_batch_profile_write('update',b2,jsonb_build_object('status','cancelled'),gen_random_uuid());
  log:=log||jsonb_build_object('batch_cancelled_closed',(r->>'status')||'|'||(r->>'isArchived'));
  perform public.coaching_update_batch(b2,'Chemistry (verification)',5,false,gen_random_uuid());
  log:=log||jsonb_build_object('batch_legacy_unarchive',(select lifecycle_status||'|'||is_archived from public.batches where id=b2));
  r:=public.coaching_teacher_batch_directory_v2('ZZV-','','','',20,0);
  log:=log||jsonb_build_object('batch_directory',(r->>'total')||'|'||(select string_agg((x->>'code')||':'||(x->>'status')||':'||coalesce(x->>'monthlyFeeMinor','none')||':'||(x->>'enrolled'),',' order by x->>'code') from jsonb_array_elements(r->'batches') x));

  step:='lifecycle';
  begin perform public.coaching_set_student_lifecycle(s3,'inactive','',gen_random_uuid());log:=log||'{"lifecycle_reason_required":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('lifecycle_reason_required',sqlerrm);end;
  r:=public.coaching_set_student_lifecycle(s3,'inactive','Exam break for two months',gen_random_uuid());
  begin perform public.coaching_set_student_lifecycle(s3,'completed','Not allowed',gen_random_uuid());log:=log||'{"lifecycle_inactive_to_completed":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('lifecycle_inactive_to_completed',sqlerrm);end;
  begin perform public.coaching_request_enrollment(s3,b2,gen_random_uuid());log:=log||'{"lifecycle_inactive_enrollment":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('lifecycle_inactive_enrollment',sqlerrm);end;
  perform public.coaching_set_student_lifecycle(s3,'active','',gen_random_uuid());
  perform public.coaching_set_student_lifecycle(s3,'cancelled','Admission cancelled by guardian',gen_random_uuid());
  begin perform public.coaching_set_student_lifecycle(s3,'inactive','Not allowed',gen_random_uuid());log:=log||'{"lifecycle_cancelled_to_inactive":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('lifecycle_cancelled_to_inactive',sqlerrm);end;
  r:=public.coaching_student_lifecycle(s3);
  log:=log||jsonb_build_object('lifecycle_history',(r->>'status')||'|'||jsonb_array_length(r->'history')||'|'||(r->'preserved'->>'enrollments'));
  r:=public.coaching_teacher_student_directory_v2('Verification Student','','','','cancelled',null,20,0);
  log:=log||jsonb_build_object('lifecycle_directory',(r->>'total')||'|'||(r->'students'->0->>'lifecycleStatus')||'|'||(r->'students'->0->>'loginState'));

  step:='finance';
  perform public.coaching_fee_concession_write('grant',null,jsonb_build_object('studentId',s2,'batchId',bid,'kind','percent','value',10,'startsPeriod',period,'reason','Sibling discount'),gen_random_uuid());
  r:=public.coaching_bill_batch_period(bid,period,gen_random_uuid());
  log:=log||jsonb_build_object('finance_billed',concat_ws('|',r->>'amountMinor',r->>'planCreated',r->>'created',r->>'concessionsApplied'));
  r:=public.coaching_bill_batch_period(bid,period,gen_random_uuid());
  log:=log||jsonb_build_object('finance_rebill',concat_ws('|',r->>'planCreated',r->>'created',r->>'concessionsApplied'));
  select id into d1 from public.monthly_dues where batch_id=bid and student_id=s1;
  perform public.coaching_post_payment(d1,s1,100000,'cash','',gen_random_uuid());
  perform public.coaching_post_payment(d1,s1,150000,'mobile_banking','TRX-VERIFY-1',gen_random_uuid());
  r:=public.coaching_teacher_payment_ledger(period,bid,'','','',null,50,0);
  log:=log||jsonb_build_object('finance_ledger',(select string_agg((x->>'studentName')||':'||(x->>'amountMinor')||'/'||(x->>'paidMinor')||'/'||(x->>'waivedMinor')||'/'||(x->>'outstandingMinor')||':'||(x->>'status')||':'||jsonb_array_length(x->'payments'),', ' order by x->>'studentName') from jsonb_array_elements(r->'rows') x));
  log:=log||jsonb_build_object('finance_summary',concat_ws('|',r->'summary'->>'expectedMinor',r->'summary'->>'collectedMinor',r->'summary'->>'waivedMinor',r->'summary'->>'outstandingMinor',r->'summary'->>'partial',r->'summary'->>'unpaid',r->'summary'->'methods'->>'mobileBanking'));
  begin perform public.coaching_post_payment(d1,s1,60000,'cash','',gen_random_uuid());log:=log||'{"finance_overpayment":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('finance_overpayment',sqlerrm);end;
  perform public.coaching_post_payment(d1,s1,50000,'cash','',gen_random_uuid());
  r:=public.coaching_teacher_payment_ledger(period,bid,'paid','','',null,50,0);
  log:=log||jsonb_build_object('finance_paid_filter',(r->>'total')||'|'||(r->'rows'->0->>'studentName'));
  r:=public.coaching_teacher_payment_ledger('',null,'','','',s1,50,0);
  log:=log||jsonb_build_object('finance_student_ledger',(r->>'total')||'|'||(r->'summary'->>'collectedMinor'));

  step:='syllabus';
  subj:=(public.coaching_create_subject(bid,'PHY','Physics',gen_random_uuid())->>'id')::uuid;
  ch:=(public.coaching_syllabus_unit_write('create',null,subj,jsonb_build_object('title','Vectors','weight',2),gen_random_uuid())->>'id')::uuid;
  t1:=(public.coaching_syllabus_unit_write('create',null,subj,jsonb_build_object('title','Vector addition','parentId',ch,'weight',1),gen_random_uuid())->>'id')::uuid;
  t2:=(public.coaching_syllabus_unit_write('create',null,subj,jsonb_build_object('title','Resolution','parentId',ch,'weight',3),gen_random_uuid())->>'id')::uuid;
  perform public.coaching_syllabus_unit_write('create',null,subj,jsonb_build_object('title','Motion'),gen_random_uuid());
  begin perform public.coaching_syllabus_unit_write('create',null,subj,jsonb_build_object('title','Too deep','parentId',t1),gen_random_uuid());log:=log||'{"syllabus_depth":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('syllabus_depth',sqlerrm);end;
  perform public.coaching_syllabus_unit_write('status',t2,null,jsonb_build_object('status','completed'),gen_random_uuid());
  perform public.coaching_syllabus_unit_write('status',t1,null,jsonb_build_object('status','in_progress'),gen_random_uuid());
  r:=public.coaching_batch_syllabus_progress(bid);
  log:=log||jsonb_build_object('syllabus_progress',(r->>'progressBasisPoints')||'|'||(r->'subjects'->0->'chapters'->0->>'title')||'|'||(r->'subjects'->0->'chapters'->0->>'progressBasisPoints'));

  step:='exam';
  ex:=(public.coaching_create_exam_draft(bid,subj,'Vectors weekly (verification)',now()+interval '2 days',50,gen_random_uuid())->>'id')::uuid;
  r:=public.coaching_update_exam_details(ex,'Vectors weekly (verification)',now()+interval '2 days',50,20,'Bring a calculator',array[ch],'weekly',60,gen_random_uuid());
  log:=log||jsonb_build_object('exam_details',r->>'lifecycle');
  perform public.coaching_publish_exam(ex,gen_random_uuid());
  begin perform public.coaching_record_exam_attendance(ex,s1,'attempted',42,'',gen_random_uuid());log:=log||'{"exam_not_held":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('exam_not_held',sqlerrm);end;
  execute 'reset role';
  update public.exams set scheduled_at=now()-interval '1 hour' where id=ex;
  execute 'set local role authenticated';
  perform public.coaching_record_exam_attendance(ex,s1,'attempted',42,'Good work',gen_random_uuid());
  perform public.coaching_record_exam_attendance(ex,s2,'absent',null,'Sick leave',gen_random_uuid());
  begin perform public.coaching_record_exam_attendance(ex,s2,'absent',10,'',gen_random_uuid());log:=log||'{"exam_absent_with_marks":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('exam_absent_with_marks',sqlerrm);end;
  r:=public.coaching_teacher_exam_sheet(ex);
  log:=log||jsonb_build_object('exam_sheet_draft',(r->'exam'->>'lifecycle')||'|'||(select string_agg((x->>'fullName')||':'||(x->>'participation')||':'||coalesce(x->>'marks','-'),', ' order by x->>'fullName') from jsonb_array_elements(r->'rows') x));
  perform public.coaching_publish_exam_results(ex,gen_random_uuid());
  r:=public.coaching_teacher_exam_sheet(ex);
  log:=log||jsonb_build_object('exam_sheet_published',(r->'exam'->>'lifecycle')||'|'||(select string_agg((x->>'fullName')||':'||(x->>'participation')||':'||coalesce(x->>'rank','-'),', ' order by x->>'fullName') from jsonb_array_elements(r->'rows') x));

  step:='security';
  perform set_config('request.jwt.claims',json_build_object('sub',st,'role','authenticated')::text,true);
  begin perform public.coaching_set_student_lifecycle(s1,'cancelled','intrusion test',gen_random_uuid());log:=log||'{"security_lifecycle":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('security_lifecycle',sqlerrm);end;
  begin perform public.coaching_teacher_payment_ledger('',null,'','','',null,50,0);log:=log||'{"security_ledger":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('security_ledger',sqlerrm);end;
  begin perform public.coaching_batch_profile(bid);log:=log||'{"security_batch_profile":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('security_batch_profile',sqlerrm);end;
  begin perform public.coaching_bill_batch_period(bid,period,gen_random_uuid());log:=log||'{"security_billing":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('security_billing',sqlerrm);end;
  begin perform public.coaching_teacher_batch_directory_v2('','','','',20,0);log:=log||'{"security_batch_directory":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('security_batch_directory',sqlerrm);end;
  begin perform public.coaching_teacher_exam_sheet(ex);log:=log||'{"security_exam_sheet":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('security_exam_sheet',sqlerrm);end;
  begin perform count(*) from public.student_lifecycle;log:=log||'{"security_direct_table":"NOT RAISED"}';
  exception when others then log:=log||jsonb_build_object('security_direct_table',sqlerrm);end;
  step:='done';
  raise exception 'VERIFY_ROLLBACK';
 exception when others then
  if sqlerrm<>'VERIFY_ROLLBACK' then raise exception 'VERIFICATION_FAILED at %: % (%)',step,sqlerrm,log;end if;
 end;
 expected:=jsonb_build_object(
  'batch_profile','running|true|[1, 3, 6]|300000|'||period,
  'batch_duplicate_code','BATCH_CODE_EXISTS','batch_no_delete','INVALID_BATCH',
  'batch_active_enrollments','3',
  'batch_capacity_below_active','CAPACITY_BELOW_ACTIVE',
  'batch_code_locked','BATCH_CODE_IMMUTABLE',
  'batch_draft_retired','ZZV-DRAFT2|cancelled|true',
  'batch_admission_closed','ADMISSION_CLOSED',
  'batch_completed_not_accepting','BATCH_NOT_ACCEPTING',
  'batch_cancelled_closed','cancelled|true',
  'batch_legacy_unarchive','running|false',
  'batch_directory','3|ZZV-CHEM:running:none:0,ZZV-DRAFT2:cancelled:none:0,ZZV-PHY27:running:300000:3',
  'lifecycle_reason_required','LIFECYCLE_REASON_REQUIRED',
  'lifecycle_inactive_to_completed','INVALID_LIFECYCLE_TRANSITION',
  'lifecycle_inactive_enrollment','STUDENT_LIFECYCLE_NOT_ACTIVE',
  'lifecycle_cancelled_to_inactive','INVALID_LIFECYCLE_TRANSITION',
  'lifecycle_history','cancelled|3|1',
  'lifecycle_directory','1|cancelled|none',
  'finance_billed','300000|true|2|1',
  'finance_rebill','false|0|0',
  'finance_ledger','Verification Student One:300000/250000/0/50000:partial:2, Verification Student Two:300000/0/30000/270000:unpaid:0',
  'finance_summary','600000|250000|30000|320000|1|1|150000',
  'finance_paid_filter','1|Verification Student One',
  'finance_student_ledger','1|300000',
  'syllabus_depth','SYLLABUS_DEPTH_EXCEEDED',
  'syllabus_progress','6000|Vectors|7500',
  'exam_details','draft',
  'exam_not_held','EXAM_NOT_HELD',
  'exam_absent_with_marks','INVALID_RESULT',
  'exam_sheet_draft','result_draft|Verification Student One:attempted:42.00, Verification Student Two:absent:-',
  'exam_sheet_published','result_published|Verification Student One:attempted:1, Verification Student Two:absent:-',
  'security_lifecycle','FORBIDDEN','security_ledger','FORBIDDEN','security_batch_profile','FORBIDDEN','security_billing','FORBIDDEN',
  'security_batch_directory','FORBIDDEN','security_exam_sheet','FORBIDDEN',
  'security_direct_table','permission denied for table student_lifecycle');
 for k in select jsonb_object_keys(expected) loop
  if log->>k is distinct from expected->>k then bad:=bad||k||' expected ['||(expected->>k)||'] got ['||coalesce(log->>k,'null')||']; ';end if;
 end loop;
 if log->>'finance_overpayment' is null or log->>'finance_overpayment'='NOT RAISED' then bad:=bad||'finance_overpayment; ';end if;
 if bad<>'' then raise exception 'VERIFICATION_FAILED: % || %',bad,log;end if;
 raise exception 'VERIFICATION_PASSED (rolled back) % checks: %',(select count(*) from jsonb_object_keys(log)),log;
end $verify$;
