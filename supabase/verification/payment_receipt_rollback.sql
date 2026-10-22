-- Run after admission and workflow fixtures inside a rollback transaction.
select id as receipt_payment from public.payments where due_id=current_setting('test.workflow_due')::uuid order by amount_minor desc limit 1 \gset
select set_config('test.receipt_payment',:'receipt_payment',true),set_config('request.jwt.claim.sub',:'teacher_id',true);
set local role authenticated;
do $$declare p uuid:=current_setting('test.receipt_payment')::uuid;r jsonb;begin
 begin perform public.coaching_payment_receipt(p,false);raise exception 'GET_ISSUED_RECEIPT';exception when others then if sqlerrm<>'RECEIPT_NOT_FOUND' then raise;end if;end;
 r:=public.coaching_payment_receipt(p,true);
 if r->'snapshot'->>'paymentMinor'<>'60' or r->'snapshot'->>'demo'<>'true' then raise exception 'INVALID_RECEIPT_SNAPSHOT';end if;
 if public.coaching_payment_receipt(p,true)<>r then raise exception 'RECEIPT_REPLAY_FAILED';end if;
 perform set_config('test.receipt_snapshot',(r->'snapshot')::text,true);
 begin update public.payment_receipts set snapshot='{}' where payment_id=p;raise exception 'DIRECT_UPDATE_ALLOWED';exception when insufficient_privilege then null;end;
 raise notice 'PASS Teacher receipt issuance, retry, no GET mutation, direct write denied';
end;$$;
reset role;
do $$begin begin update public.payment_receipts set snapshot='{}' where payment_id=current_setting('test.receipt_payment')::uuid;raise exception 'SNAPSHOT_MUTATED';exception when others then if sqlerrm<>'IMMUTABLE_RECEIPT' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub',:'student_id',true);
set local role authenticated;
do $$declare r jsonb;begin r:=public.coaching_payment_receipt(current_setting('test.receipt_payment')::uuid,false);if r->'snapshot'<>current_setting('test.receipt_snapshot')::jsonb then raise exception 'OWN_READ_MISMATCH';end if;end;$$;
reset role;
select set_config('request.jwt.claim.sub',:'other_id',true);
set local role authenticated;
do $$begin begin perform public.coaching_payment_receipt(current_setting('test.receipt_payment')::uuid,true);raise exception 'FOREIGN_RECEIPT_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;raise notice 'PASS Student own-only and immutable issuance';end;$$;
reset role;
set local role anon;
do $$begin begin perform public.coaching_payment_receipt(current_setting('test.receipt_payment')::uuid,false);raise exception 'ANON_RECEIPT_ALLOWED';exception when insufficient_privilege then null;end;end;$$;
reset role;
