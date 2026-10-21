-- LOCAL only: base admission migration + workflow migration + admission fixtures first.
select gen_random_uuid() as workflow_batch_id \gset
insert into public.batches(id,code,name,capacity) values(:'workflow_batch_id','DEMO_W_'||substr(replace(:'workflow_batch_id','-',''),1,8),'DEMO Workflow Batch',10);
update public.student_details set class_name='DEMO Grade' where student_id=:'student_id';
update public.student_guardians set mobile='01700000000' where student_id=:'student_id';
select set_config('test.workflow_batch',:'workflow_batch_id',true),set_config('request.jwt.claim.sub',:'teacher_id',true);
set local role authenticated;
do $$declare s uuid:=current_setting('test.student')::uuid;b uuid:=current_setting('test.workflow_batch')::uuid;r jsonb;plan jsonb;op uuid:=gen_random_uuid();data jsonb;begin
 r:=public.coaching_student_workflow_read(s);if (r->>'revision')::int<>0 then raise exception 'WORKFLOW_INITIAL_FAILED';end if;
 data:='{"gender":"female","guardianEmail":"guardian@example.invalid","previousSchool":"DEMO Previous School","previousClass":"DEMO Class","previousResult":"DEMO result","privateNotes":"DEMO teacher private note","applicationStatus":"approved","reviewReason":"DEMO reviewed complete profile","documents":[],"expectedRevision":0}';
 r:=public.coaching_student_workflow_command(s,'details.save',data,op);if r->'details'->>'privateNotes'<>'DEMO teacher private note' or (r->>'revision')::int<>1 then raise exception 'WORKFLOW_SAVE_FAILED';end if;
 if public.coaching_student_workflow_command(s,'details.save',data,op)<>r then raise exception 'WORKFLOW_REPLAY_FAILED';end if;
 begin perform public.coaching_student_workflow_command(s,'details.save',data,gen_random_uuid());raise exception 'STALE_ALLOWED';exception when others then if sqlerrm<>'REVISION_CONFLICT' then raise;end if;end;
 plan:=public.coaching_create_fee_plan(b,to_char(current_date,'YYYY-MM'),100,current_date+10,'DEMO Admission and tuition',gen_random_uuid());
 r:=public.coaching_student_workflow_command(s,'charge.assign',jsonb_build_object('feePlanId',plan->>'id','admissionMinor','20','tuitionMinor','80','otherMinor','0'),gen_random_uuid());
 if r->'summary'->>'outstandingMinor'<>'100' or r->'charges'->0->>'admissionMinor'<>'20' then raise exception 'BREAKDOWN_FAILED';end if;
 perform set_config('test.workflow_due',r->'charges'->0->>'id',true);
 r:=public.coaching_student_workflow_command(s,'policy.save',jsonb_build_object('batchId',b,'requireReview',true,'requireSettled',true,'minimumPaidMinor','50'),gen_random_uuid());
 raise notice 'PASS Details, optimistic locking, idempotency, charge breakdown and explicit policy';
end;$$;
reset role;
select gen_random_uuid() as workflow_document \gset
insert into public.media_assets(id,storage_key,content_type,size_bytes,sha256,alt,status,created_by) values(:'workflow_document',:'teacher_id'||'/'||:'workflow_document'||'.png','image/png',10,repeat('0',64),'DEMO private document','ready',:'teacher_id');
select set_config('test.workflow_document',:'workflow_document',true);
update public.student_application_workflows set documents=jsonb_build_array(:'workflow_document'::text) where student_id=:'student_id';
insert into public.enrollments(student_id,batch_id,status) values(:'student_id',:'workflow_batch_id','pending');
do $$begin begin update public.enrollments set status='active',decided_at=now() where student_id=current_setting('test.student')::uuid and batch_id=current_setting('test.workflow_batch')::uuid;raise exception 'UNPAID_APPROVAL_ALLOWED';exception when others then if sqlerrm<>'VERIFIED_PAYMENT_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub',:'student_id',true);
set local role authenticated;
do $$declare s uuid:=current_setting('test.student')::uuid;r jsonb;begin
 r:=public.coaching_student_workflow_read(s);if r->'details'?'privateNotes' then raise exception 'PRIVATE_NOTES_LEAKED';end if;
 if public.coaching_student_document(s,current_setting('test.workflow_document')::uuid)->>'id'<>current_setting('test.workflow_document') then raise exception 'OWN_DOCUMENT_FAILED';end if;
 begin perform public.coaching_student_document(current_setting('test.other')::uuid,current_setting('test.workflow_document')::uuid);raise exception 'FOREIGN_DOCUMENT_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin perform public.coaching_student_workflow_read(current_setting('test.other')::uuid);raise exception 'CROSS_STUDENT_READ_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin perform public.coaching_student_workflow_command(s,'details.save','{}',gen_random_uuid());raise exception 'STUDENT_REVIEW_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 r:=public.coaching_student_workflow_command(s,'payment.submit',jsonb_build_object('dueId',current_setting('test.workflow_due'),'amountMinor','60','method','bank','reference','DEMO-TRANSFER-A','paidOn',current_date),gen_random_uuid());
 if r->'summary'->>'receivedMinor'<>'0' or r->'summary'->>'outstandingMinor'<>'100' or r->'claims'->0->>'status'<>'pending' then raise exception 'CLAIM_COUNTED_AS_COLLECTION';end if;
 perform set_config('test.workflow_claim',r->'claims'->0->>'id',true);
 raise notice 'PASS Student isolation, private-note redaction, pending claim is not collection';
end;$$;
reset role;
select set_config('request.jwt.claim.sub',:'teacher_id',true);
set local role authenticated;
do $$declare s uuid:=current_setting('test.student')::uuid;r jsonb;op uuid:=gen_random_uuid();data jsonb;begin
 data:=jsonb_build_object('claimId',current_setting('test.workflow_claim'),'decision','verify','reason','DEMO bank transfer reviewed');
 r:=public.coaching_student_workflow_command(s,'payment.review',data,op);
 if r->'summary'->>'receivedMinor'<>'60' or r->'summary'->>'outstandingMinor'<>'40' or r->'claims'->0->>'status'<>'verified' then raise exception 'VERIFIED_TOTAL_FAILED';end if;
 if r->'charges'->0->>'status'<>'partially_paid' then raise exception 'PARTIAL_STATUS_FAILED';end if;
 if public.coaching_student_workflow_command(s,'payment.review',data,op)<>r then raise exception 'PAYMENT_REPLAY_FAILED';end if;
 begin perform public.coaching_post_payment(current_setting('test.workflow_due')::uuid,s,10,'bank','demo-transfer-a',gen_random_uuid());raise exception 'DUPLICATE_REFERENCE_ALLOWED';exception when others then if sqlerrm<>'PAYMENT_REFERENCE_EXISTS' then raise;end if;end;
 begin perform public.coaching_student_workflow_command(s,'payment.review',data,gen_random_uuid());raise exception 'DOUBLE_VERIFICATION_ALLOWED';exception when others then if sqlerrm<>'PAYMENT_REPORT_REVIEWED' then raise;end if;end;
 perform public.coaching_post_payment(current_setting('test.workflow_due')::uuid,s,40,'cash','DEMO-TRANSFER-B',gen_random_uuid());
 r:=public.coaching_student_workflow_read(s);if r->'summary'->>'outstandingMinor'<>'0' or r->'charges'->0->>'status'<>'fully_paid' then raise exception 'FULL_PAYMENT_FAILED';end if;
 r:=public.coaching_management_summary(null);if not exists(select 1 from jsonb_array_elements(r->'batches') b where b->>'batchId'=current_setting('test.workflow_batch') and b->>'collectedMinor'='100' and b->>'outstandingMinor'='0') then raise exception 'BATCH_TOTAL_RECONCILIATION_FAILED';end if;
 if public.coaching_teacher_student_identity('demo-admission-student@example.invalid')->>'studentId'<>s::text then raise exception 'IDENTITY_MATCH_FAILED';end if;
 raise notice 'PASS Verified ledger, reference duplicate guard, replay, installments, exact balance';
end;$$;
reset role;
update public.enrollments set status='active',decided_at=now() where student_id=:'student_id' and batch_id=:'workflow_batch_id';
set local role anon;
do $$begin begin perform public.coaching_student_workflow_read(null);raise exception 'ANON_ALLOWED';exception when insufficient_privilege then null;end;raise notice 'PASS Anonymous denied; settled admission policy permits enrollment';end;$$;
reset role;
