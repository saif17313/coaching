-- Immutable receipts capture verified ledger facts once; corrections remain separate postings.
create table public.payment_receipts (
 payment_id uuid primary key references public.payments(id) on delete restrict,
 student_id uuid not null references public.profiles(id) on delete restrict,
 receipt_number text not null unique,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 issued_by uuid not null references public.profiles(id) on delete restrict,
 issued_at timestamptz not null default now()
);
alter table public.payment_receipts enable row level security;
revoke all on public.payment_receipts from public,anon,authenticated;
create index payment_receipts_student_idx on public.payment_receipts(student_id);
create function public.coaching_receipt_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'IMMUTABLE_RECEIPT';end;$$;
revoke all on function public.coaching_receipt_immutable() from public,anon,authenticated;
create trigger receipt_immutable before update or delete on public.payment_receipts for each row execute function public.coaching_receipt_immutable();
create function public.coaching_payment_receipt(p_payment_id uuid,p_issue boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(select auth.uid());p public.payments%rowtype;d record;r public.payment_receipts%rowtype;s jsonb;paid bigint;waived bigint;refunded bigint;corrected bigint;adjustments jsonb;
begin
 if a is null then raise exception 'FORBIDDEN';end if;
 select * into p from public.payments where id=p_payment_id;
 if not found then raise exception 'PAYMENT_NOT_FOUND';end if;
 -- Reuse the established active-account and own-Student authorization boundary.
 perform public.coaching_student_admission_read(p.student_id);
 perform pg_advisory_xact_lock(hashtext('payment.receipt'),hashtext(p_payment_id::text));
 select * into r from public.payment_receipts where payment_id=p.id;
 if not found then
  if not p_issue then raise exception 'RECEIPT_NOT_FOUND';end if;
  select due.*,b.name batch_name,f.label,pr.full_name student_name,coalesce(ad.admission_roll,'') admission_roll,
   coalesce(issuer.full_name,'EduCentre') issuer_name
   into d from public.monthly_dues due join public.batches b on b.id=due.batch_id
   join public.fee_plans f on f.id=due.fee_plan_id join public.profiles pr on pr.id=due.student_id
   left join public.student_admission_details ad on ad.student_id=due.student_id
   join public.profiles issuer on issuer.id=p.created_by where due.id=p.due_id;
  select coalesce(sum(amount_minor),0) into paid from public.payments where due_id=p.due_id and created_at<=p.created_at;
  select coalesce(sum(amount_minor) filter(where kind='waiver'),0),coalesce(sum(amount_minor) filter(where kind='refund'),0),coalesce(sum(amount_minor) filter(where kind='correction'),0)
   into waived,refunded,corrected from public.payment_adjustments where due_id=p.due_id and created_at<=p.created_at;
  s:=jsonb_build_object('version',1,'receiptNumber','EC-'||upper(replace(p.id::text,'-','')),'paymentId',p.id,'studentId',p.student_id,
   'studentName',d.student_name,'admissionRoll',d.admission_roll,'batchName',d.batch_name,'billPeriod',btrim(d.bill_period),'chargeLabel',d.label,
   'currency','BDT','paymentMinor',p.amount_minor::text,'chargeMinor',d.amount_minor::text,'paidMinor',paid::text,'waivedMinor',waived::text,'refundedMinor',refunded::text,'correctionMinor',corrected::text,
   'balanceMinor',greatest(0,d.amount_minor-paid-waived+refunded-corrected)::text,'method',p.method,'reference',p.reference,'paidAt',p.created_at,'issuerName',d.issuer_name,
   'issuedAt',now(),'demo',d.student_name~*'(^|[^a-z])demo([^a-z]|$)' or d.batch_name~*'(^|[^a-z])demo([^a-z]|$)');
  insert into public.payment_receipts(payment_id,student_id,receipt_number,snapshot,issued_by) values(p.id,p.student_id,s->>'receiptNumber',s,a) returning * into r;
  insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'payment.receipt.issue',p.id,jsonb_build_object('receiptNumber',r.receipt_number));
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amountMinor',amount_minor::text,'reason',reason,'recordedAt',created_at) order by created_at,id),'[]') into adjustments from public.payment_adjustments where due_id=p.due_id;
 return jsonb_build_object('snapshot',r.snapshot,'adjustments',adjustments);
end;$$;
revoke all on function public.coaching_payment_receipt(uuid,boolean) from public,anon,authenticated;
grant execute on function public.coaching_payment_receipt(uuid,boolean) to authenticated;
