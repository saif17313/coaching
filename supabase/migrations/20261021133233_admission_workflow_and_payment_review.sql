-- Additive workflow metadata. Existing admission, Auth and ledger contracts stay intact.
create table public.student_application_workflows (
 student_id uuid primary key references public.profiles(id) on delete restrict,
 gender text not null default '' check(gender in ('','female','male','other','prefer_not_to_say')),
 guardian_email text not null default '' check(length(guardian_email)<=254),
 previous_school text not null default '' check(length(previous_school)<=200),
 previous_class text not null default '' check(length(previous_class)<=80),
 previous_result text not null default '' check(length(previous_result)<=200),
 private_notes text not null default '' check(length(private_notes)<=2000),
 review_status text not null default 'draft' check(review_status in ('draft','submitted','approved','rejected')),
 review_reason text not null default '' check(length(review_reason)<=500),
 documents jsonb not null default '[]' check(jsonb_typeof(documents)='array' and jsonb_array_length(documents)<=20),
 revision bigint not null default 1 check(revision>0),updated_at timestamptz not null default now()
);
create table public.student_due_breakdowns (
 due_id uuid primary key references public.monthly_dues(id) on delete restrict,
 admission_minor bigint not null default 0 check(admission_minor>=0),
 tuition_minor bigint not null default 0 check(tuition_minor>=0),
 other_minor bigint not null default 0 check(other_minor>=0),created_by uuid not null references public.profiles(id) on delete restrict
);
create index student_due_breakdowns_creator_idx on public.student_due_breakdowns(created_by);
create table public.student_payment_claims (
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles(id) on delete restrict,
 due_id uuid not null references public.monthly_dues(id) on delete restrict,
 amount_minor bigint not null check(amount_minor between 1 and 100000000000),
 method text not null check(method in ('cash','bank','mobile_banking')),reference text not null default '' check(length(reference)<=120),
 paid_on date not null check(paid_on between date '2000-01-01' and (now() at time zone 'Asia/Dhaka')::date),
 status text not null default 'pending' check(status in ('pending','verified','rejected')),
 payment_id uuid references public.payments(id) on delete restrict,review_reason text not null default '' check(length(review_reason)<=500),
 reviewed_by uuid references public.profiles(id) on delete restrict,reviewed_at timestamptz,created_at timestamptz not null default now(),
 check((status='pending' and payment_id is null and reviewed_at is null and reviewed_by is null) or (status='verified' and payment_id is not null and reviewed_at is not null and reviewed_by is not null) or (status='rejected' and payment_id is null and reviewed_at is not null and reviewed_by is not null))
);
create index payment_claim_student_idx on public.student_payment_claims(student_id,created_at desc);
create index payment_claim_due_idx on public.student_payment_claims(due_id);
create index payment_claim_payment_idx on public.student_payment_claims(payment_id) where payment_id is not null;
create index payment_claim_reviewer_idx on public.student_payment_claims(reviewed_by) where reviewed_by is not null;
create unique index payment_claim_reference_idx on public.student_payment_claims(student_id,due_id,method,lower(reference)) where reference<>'' and status in ('pending','verified');
create table public.batch_admission_policies (
 batch_id uuid primary key references public.batches(id) on delete restrict,
 require_review boolean not null default false,require_settled boolean not null default false,
 minimum_paid_minor bigint not null default 0 check(minimum_paid_minor between 0 and 100000000000),
 updated_by uuid not null references public.profiles(id) on delete restrict,updated_at timestamptz not null default now()
);
create index batch_admission_policy_actor_idx on public.batch_admission_policies(updated_by);
alter table public.student_application_workflows enable row level security;
alter table public.student_due_breakdowns enable row level security;
alter table public.student_payment_claims enable row level security;
alter table public.batch_admission_policies enable row level security;
revoke all on public.student_application_workflows,public.student_due_breakdowns,public.student_payment_claims,public.batch_admission_policies from public,anon,authenticated;
create policy workflow_teacher_only on public.student_application_workflows for select to authenticated using(public.current_user_is_teacher());
create policy claims_teacher_or_self on public.student_payment_claims for select to authenticated using(public.current_user_is_teacher() or student_id=(select auth.uid()));
-- These tables intentionally have no direct Data API grants. RPCs redact private notes.

create function public.coaching_student_workflow_read(p_student_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s uuid:=coalesce(p_student_id,(select auth.uid()));t boolean:=public.current_user_is_teacher();w record;charges jsonb;payments jsonb;claims jsonb;summary jsonb;policies jsonb;details jsonb;
begin
 perform public.coaching_student_admission_read(s);
 if (select count(*) from public.monthly_dues where student_id=s)>1000 or (select count(*) from public.payments where student_id=s)>2000 or (select count(*) from public.student_payment_claims where student_id=s)>2000 then raise exception 'LIST_TOO_LARGE';end if;
 select * into w from public.student_application_workflows where student_id=s;
 details:=jsonb_build_object('gender',coalesce(w.gender,''),'guardianEmail',coalesce(w.guardian_email,''),'previousSchool',coalesce(w.previous_school,''),'previousClass',coalesce(w.previous_class,''),'previousResult',coalesce(w.previous_result,''),'applicationStatus',coalesce(w.review_status,'draft'),'reviewReason',coalesce(w.review_reason,''),'documents',coalesce(w.documents,'[]'::jsonb));
 if t then details:=details||jsonb_build_object('privateNotes',coalesce(w.private_notes,''));end if;
 with ledger as (
  select d.*,f.label,f.due_on,b.name batch_name,coalesce(x.admission_minor,0) admission_minor,coalesce(x.tuition_minor,d.amount_minor) tuition_minor,coalesce(x.other_minor,0) other_minor,
   coalesce((select sum(p.amount_minor) from public.payments p where p.due_id=d.id),0) paid,
   coalesce((select sum(a.amount_minor) from public.payment_adjustments a where a.due_id=d.id and a.kind='waiver'),0) waived,
   coalesce((select sum(a.amount_minor) from public.payment_adjustments a where a.due_id=d.id and a.kind='refund'),0) refunded,
   coalesce((select sum(a.amount_minor) from public.payment_adjustments a where a.due_id=d.id and a.kind='correction'),0) corrected
  from public.monthly_dues d join public.fee_plans f on f.id=d.fee_plan_id join public.batches b on b.id=d.batch_id left join public.student_due_breakdowns x on x.due_id=d.id where d.student_id=s
 ), totals as (select *,greatest(0,amount_minor-paid-waived+refunded-corrected) outstanding from ledger)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'batchId',batch_id,'batchName',batch_name,'billPeriod',btrim(bill_period),'label',label,'dueOn',due_on,'amountMinor',amount_minor::text,'admissionMinor',admission_minor::text,'tuitionMinor',tuition_minor::text,'otherMinor',other_minor::text,'paidMinor',paid::text,'waivedMinor',waived::text,'refundedMinor',refunded::text,'correctionMinor',corrected::text,'outstandingMinor',outstanding::text,'status',case when outstanding=0 then 'fully_paid' when due_on<(now() at time zone 'Asia/Dhaka')::date then 'overdue' when paid+corrected-refunded>0 then 'partially_paid' else 'unpaid' end) order by bill_period desc,id),'[]'::jsonb),
 jsonb_build_object('payableMinor',coalesce(sum(amount_minor),0)::text,'receivedMinor',coalesce(sum(paid),0)::text,'waivedMinor',coalesce(sum(waived),0)::text,'refundedMinor',coalesce(sum(refunded),0)::text,'outstandingMinor',coalesce(sum(outstanding),0)::text,'unpaid',count(*) filter(where outstanding>0 and paid+corrected-refunded=0),'partial',count(*) filter(where outstanding>0 and paid+corrected-refunded>0),'paid',count(*) filter(where outstanding=0),'overdue',count(*) filter(where outstanding>0 and due_on<(now() at time zone 'Asia/Dhaka')::date)) into charges,summary from totals;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'dueId',due_id,'amountMinor',amount_minor::text,'method',method,'reference',reference,'recordedAt',created_at,'receipt','EC-'||upper(replace(id::text,'-',''))) order by created_at desc),'[]'::jsonb) into payments from public.payments where student_id=s;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'dueId',due_id,'amountMinor',amount_minor::text,'method',method,'reference',reference,'paidOn',paid_on,'status',status,'paymentId',payment_id,'reviewReason',review_reason) order by created_at desc),'[]'::jsonb) into claims from public.student_payment_claims where student_id=s;
 select coalesce(jsonb_agg(jsonb_build_object('batchId',b.id,'batchName',b.name,'requireReview',coalesce(p.require_review,false),'requireSettled',coalesce(p.require_settled,false),'minimumPaidMinor',coalesce(p.minimum_paid_minor,0)::text) order by b.name),'[]'::jsonb) into policies from public.batches b left join public.batch_admission_policies p on p.batch_id=b.id where exists(select 1 from public.enrollments e where e.batch_id=b.id and e.student_id=s) or exists(select 1 from public.monthly_dues d where d.batch_id=b.id and d.student_id=s);
 return jsonb_build_object('id',s,'revision',coalesce(w.revision,0),'details',details,'summary',summary,'charges',charges,'payments',payments,'claims',claims,'policies',policies);
end;$$;
revoke all on function public.coaching_student_workflow_read(uuid) from public,anon,authenticated;
grant execute on function public.coaching_student_workflow_read(uuid) to authenticated;

create function public.coaching_student_workflow_command(p_student_id uuid,p_action text,p_data jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(select auth.uid());t boolean:=public.current_user_is_teacher();prior record;payload jsonb;w record;d record;c record;f record;b uuid;sid uuid;amount bigint;admission bigint;tuition bigint;other bigint;result jsonb;payment jsonb;k text;v jsonb;fields text[];document uuid;
begin
 if a is null or (not t and (p_action<>'payment.submit' or p_student_id<>a or not exists(select 1 from public.profiles where id=a and role='student' and account_status='active'))) then raise exception 'FORBIDDEN';end if;
 if p_operation_id is null or p_student_id is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>12000 then raise exception 'INVALID_INPUT';end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student') then raise exception 'STUDENT_NOT_FOUND';end if;
 payload:=jsonb_build_object('studentId',p_student_id,'action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtext(a::text),hashtext(p_operation_id::text));
 select * into prior from public.coaching_mutation_receipts where actor_id=a and operation_id=p_operation_id for update;
 if found then if prior.operation_type<>'student.workflow' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 if p_action='details.save' then
  fields:=array['gender','guardianEmail','previousSchool','previousClass','previousResult','privateNotes','applicationStatus','reviewReason','documents','expectedRevision'];
  if (select count(*) from jsonb_object_keys(p_data))<>10 or exists(select 1 from jsonb_object_keys(p_data) key where not(key=any(fields))) then raise exception 'INVALID_INPUT';end if;
  for k,v in select * from jsonb_each(p_data) loop
   if k not in ('documents','expectedRevision') and (jsonb_typeof(v)<>'string' or length(p_data->>k)>case when k='privateNotes' then 2000 when k='reviewReason' then 500 when k='guardianEmail' then 254 when k='previousClass' then 80 else 200 end or (p_data->>k) ~ case when k='privateNotes' then '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' else '[[:cntrl:]]' end) then raise exception 'INVALID_INPUT';end if;
  end loop;
  if p_data->>'gender' not in ('','female','male','other','prefer_not_to_say') or p_data->>'applicationStatus' not in ('draft','submitted','approved','rejected') or (p_data->>'guardianEmail'<>'' and p_data->>'guardianEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or jsonb_typeof(p_data->'documents')<>'array' or jsonb_array_length(p_data->'documents')>20 or jsonb_typeof(p_data->'expectedRevision')<>'number' then raise exception 'INVALID_INPUT';end if;
  if p_data->>'applicationStatus'='rejected' and length(btrim(p_data->>'reviewReason'))<5 then raise exception 'INVALID_INPUT';end if;
  perform 1 from public.profiles where id=p_student_id for update;
  select * into w from public.student_application_workflows where student_id=p_student_id for update;
  if coalesce(w.revision,0)<>(p_data->>'expectedRevision')::bigint then raise exception 'REVISION_CONFLICT';end if;
  for v in select * from jsonb_array_elements(p_data->'documents') loop
   if jsonb_typeof(v)<>'string' then raise exception 'INVALID_MEDIA';end if;document:=(v#>>'{}')::uuid;
   if not exists(select 1 from public.media_assets where id=document and status='ready' and (created_by=a or coalesce(w.documents,'[]') ? document::text)) then raise exception 'INVALID_MEDIA';end if;
  end loop;
  if p_data->>'applicationStatus'='approved' and not exists(select 1 from public.student_admission_details n join public.student_guardians g using(student_id) join public.student_details de using(student_id) where n.student_id=p_student_id and length(btrim(g.full_name))>=2 and length(btrim(g.mobile))>=7 and de.class_name<>'') then raise exception 'ADMISSION_INCOMPLETE';end if;
  insert into public.student_application_workflows(student_id,gender,guardian_email,previous_school,previous_class,previous_result,private_notes,review_status,review_reason,documents,revision)
   values(p_student_id,p_data->>'gender',lower(btrim(p_data->>'guardianEmail')),p_data->>'previousSchool',p_data->>'previousClass',p_data->>'previousResult',p_data->>'privateNotes',p_data->>'applicationStatus',p_data->>'reviewReason',p_data->'documents',coalesce(w.revision,0)+1)
   on conflict(student_id) do update set gender=excluded.gender,guardian_email=excluded.guardian_email,previous_school=excluded.previous_school,previous_class=excluded.previous_class,previous_result=excluded.previous_result,private_notes=excluded.private_notes,review_status=excluded.review_status,review_reason=excluded.review_reason,documents=excluded.documents,revision=excluded.revision,updated_at=clock_timestamp();
 elsif p_action='charge.assign' then
  if (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['admissionMinor','feePlanId','otherMinor','tuitionMinor'] then raise exception 'INVALID_INPUT';end if;
  admission:=(p_data->>'admissionMinor')::bigint;tuition:=(p_data->>'tuitionMinor')::bigint;other:=(p_data->>'otherMinor')::bigint;
  if admission is null or tuition is null or other is null or least(admission,tuition,other)<0 then raise exception 'INVALID_INPUT';end if;
  select * into f from public.fee_plans where id=(p_data->>'feePlanId')::uuid;if not found then raise exception 'PLAN_NOT_FOUND';end if;
  perform 1 from public.batches where id=f.batch_id and not is_archived for update;if not found then raise exception 'BATCH_UNAVAILABLE';end if;
  if admission+tuition+other<>f.amount_minor then raise exception 'FEE_BREAKDOWN_MISMATCH';end if;
  select * into d from public.monthly_dues where student_id=p_student_id and batch_id=f.batch_id and bill_period=f.bill_period for update;
  if found then raise exception 'CHARGE_ALREADY_ASSIGNED';end if;
  sid:=gen_random_uuid();insert into public.monthly_dues(id,fee_plan_id,student_id,batch_id,bill_period,amount_minor) values(sid,f.id,p_student_id,f.batch_id,f.bill_period,f.amount_minor);
  insert into public.student_due_breakdowns(due_id,admission_minor,tuition_minor,other_minor,created_by) values(sid,admission,tuition,other,a);
 elsif p_action='payment.submit' then
  if (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['amountMinor','dueId','method','paidOn','reference'] then raise exception 'INVALID_INPUT';end if;
  amount:=(p_data->>'amountMinor')::bigint;
  if amount is null or amount not between 1 and 100000000000 or p_data->>'method' not in ('cash','bank','mobile_banking') or length(p_data->>'reference')>120 or (p_data->>'reference') ~ '[[:cntrl:]]' or (p_data->>'method'<>'cash' and length(btrim(p_data->>'reference'))<3) or (p_data->>'paidOn')::date not between date '2000-01-01' and (now() at time zone 'Asia/Dhaka')::date then raise exception 'INVALID_PAYMENT';end if;
  select * into d from public.monthly_dues where id=(p_data->>'dueId')::uuid and student_id=p_student_id;if not found then raise exception 'DUE_NOT_FOUND';end if;
  perform 1 from public.batches where id=d.batch_id and not is_archived for update;if not found then raise exception 'BATCH_UNAVAILABLE';end if;
  select * into d from public.monthly_dues where id=d.id for update;
  if amount>d.amount_minor-coalesce((select sum(amount_minor) from public.payments where due_id=d.id),0)-coalesce((select sum(case when kind='refund' then -amount_minor else amount_minor end) from public.payment_adjustments where due_id=d.id),0)-coalesce((select sum(amount_minor) from public.student_payment_claims where due_id=d.id and status='pending'),0) then raise exception 'PAYMENT_EXCEEDS_BALANCE';end if;
  insert into public.student_payment_claims(student_id,due_id,amount_minor,method,reference,paid_on) values(p_student_id,d.id,amount,p_data->>'method',btrim(p_data->>'reference'),(p_data->>'paidOn')::date);
 elsif p_action='payment.review' then
  if (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['claimId','decision','reason'] or p_data->>'decision' not in ('verify','reject') or jsonb_typeof(p_data->'reason')<>'string' or length(p_data->>'reason')>500 or (p_data->>'reason') ~ '[[:cntrl:]]' then raise exception 'INVALID_INPUT';end if;
  select * into c from public.student_payment_claims where id=(p_data->>'claimId')::uuid and student_id=p_student_id;if not found then raise exception 'PAYMENT_REPORT_NOT_FOUND';end if;
  select batch_id into b from public.monthly_dues where id=c.due_id;perform 1 from public.batches where id=b for update;
  select * into c from public.student_payment_claims where id=c.id for update;if c.status<>'pending' then raise exception 'PAYMENT_REPORT_REVIEWED';end if;
  if p_data->>'decision'='reject' then if length(btrim(p_data->>'reason'))<5 then raise exception 'INVALID_INPUT';end if;
   update public.student_payment_claims set status='rejected',review_reason=p_data->>'reason',reviewed_by=a,reviewed_at=clock_timestamp() where id=c.id;
  else
   payment:=public.coaching_post_payment(c.due_id,p_student_id,c.amount_minor,c.method,c.reference,md5(p_operation_id::text||':verified-ledger')::uuid);
   update public.student_payment_claims set status='verified',payment_id=(payment->>'id')::uuid,review_reason=p_data->>'reason',reviewed_by=a,reviewed_at=clock_timestamp() where id=c.id;
  end if;
 elsif p_action='policy.save' then
  if (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['batchId','minimumPaidMinor','requireReview','requireSettled'] or jsonb_typeof(p_data->'requireReview')<>'boolean' or jsonb_typeof(p_data->'requireSettled')<>'boolean' then raise exception 'INVALID_INPUT';end if;
  amount:=(p_data->>'minimumPaidMinor')::bigint;if amount is null or amount not between 0 and 100000000000 then raise exception 'INVALID_INPUT';end if;
  b:=(p_data->>'batchId')::uuid;perform 1 from public.batches where id=b and not is_archived for update;if not found then raise exception 'BATCH_UNAVAILABLE';end if;
  insert into public.batch_admission_policies(batch_id,require_review,require_settled,minimum_paid_minor,updated_by) values(b,(p_data->>'requireReview')::boolean,(p_data->>'requireSettled')::boolean,amount,a) on conflict(batch_id) do update set require_review=excluded.require_review,require_settled=excluded.require_settled,minimum_paid_minor=excluded.minimum_paid_minor,updated_by=a,updated_at=clock_timestamp();
 else raise exception 'INVALID_COMMAND';end if;
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'student.workflow.'||p_action,p_student_id,jsonb_build_object('operationId',p_operation_id,'fields',(select jsonb_agg(key) from jsonb_object_keys(p_data) key)));
 result:=public.coaching_student_workflow_read(p_student_id);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'student.workflow',payload,result);
 return result;
end;$$;
revoke all on function public.coaching_student_workflow_command(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.coaching_student_workflow_command(uuid,text,jsonb,uuid) to authenticated;

create function public.coaching_guard_payment_reference() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if btrim(new.reference)<>'' then
  perform pg_advisory_xact_lock(hashtext('verified.payment.reference'),hashtext(new.method||lower(btrim(new.reference))));
  if exists(select 1 from public.payments where method=new.method and lower(btrim(reference))=lower(btrim(new.reference))) then raise exception 'PAYMENT_REFERENCE_EXISTS';end if;
 end if;return new;
end;$$;
revoke all on function public.coaching_guard_payment_reference() from public,anon,authenticated;
create trigger guard_verified_payment_reference before insert on public.payments for each row execute function public.coaching_guard_payment_reference();

create function public.coaching_guard_enrollment_admission() returns trigger language plpgsql security definer set search_path='' as $$
declare p record;paid bigint;outstanding bigint;due_count bigint;
begin
 if new.status<>'active' or (tg_op='UPDATE' and old.status='active') then return new;end if;
 select * into p from public.batch_admission_policies where batch_id=new.batch_id;if not found then return new;end if;
 if p.require_review and not exists(select 1 from public.student_application_workflows where student_id=new.student_id and review_status='approved') then raise exception 'ADMISSION_REVIEW_REQUIRED';end if;
 select count(*),coalesce(sum(d.amount_minor),0)-coalesce(sum((select coalesce(sum(amount_minor),0) from public.payments where due_id=d.id)),0)-coalesce(sum((select coalesce(sum(case when kind='refund' then -amount_minor else amount_minor end),0) from public.payment_adjustments where due_id=d.id)),0),
 coalesce(sum((select coalesce(sum(amount_minor),0) from public.payments where due_id=d.id)),0)+coalesce(sum((select coalesce(sum(case when kind='refund' then -amount_minor else amount_minor end),0) from public.payment_adjustments where due_id=d.id and kind<>'waiver')),0) into due_count,outstanding,paid from public.monthly_dues d where d.student_id=new.student_id and d.batch_id=new.batch_id;
 if paid<p.minimum_paid_minor then raise exception 'VERIFIED_PAYMENT_REQUIRED';end if;
 if p.require_settled and (due_count=0 or outstanding>0) then raise exception 'OUTSTANDING_DUES';end if;
 return new;
end;$$;
revoke all on function public.coaching_guard_enrollment_admission() from public,anon,authenticated;
create trigger guard_enrollment_admission before insert or update of status on public.enrollments for each row execute function public.coaching_guard_enrollment_admission();

create function public.coaching_student_document_readable(p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_application_workflows w join public.profiles p on p.id=w.student_id join public.media_assets m on w.documents ? m.id::text where w.student_id=(select auth.uid()) and p.role='student' and p.account_status='active' and m.status='ready' and m.storage_key=p_key);
$$;
revoke all on function public.coaching_student_document_readable(text) from public,anon,authenticated;
grant execute on function public.coaching_student_document_readable(text) to authenticated;
create policy musa_student_document_read on storage.objects for select to authenticated using(bucket_id='musa-site-media' and public.coaching_student_document_readable(name));
create function public.coaching_student_document(p_student_id uuid,p_media_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 perform public.coaching_student_admission_read(p_student_id);
 select jsonb_build_object('id',m.id,'key',m.storage_key,'contentType',m.content_type,'sizeBytes',m.size_bytes,'sha256',m.sha256) into r from public.student_application_workflows w join public.media_assets m on w.documents ? m.id::text where w.student_id=p_student_id and m.id=p_media_id and m.status='ready';
 if r is null then raise exception 'MEDIA_NOT_FOUND';end if;return r;
end;$$;
revoke all on function public.coaching_student_document(uuid,uuid) from public,anon,authenticated;
grant execute on function public.coaching_student_document(uuid,uuid) to authenticated;

create function public.coaching_management_summary(p_period text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;batch_rows jsonb;active_students bigint;pending_admissions bigint;approved_admissions bigint;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_period is not null and p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_PERIOD';end if;
 select count(distinct student_id) into active_students from public.enrollments where status='active';
 select count(*) filter(where p.account_status='pending' or n.student_id is not null and coalesce(w.review_status,'draft') in ('draft','submitted')),count(*) filter(where w.review_status='approved') into pending_admissions,approved_admissions from public.profiles p left join public.student_admission_details n on n.student_id=p.id left join public.student_application_workflows w on w.student_id=p.id where p.role='student';
 with ledger as (
  select d.id,d.student_id,d.batch_id,d.amount_minor,
   coalesce((select sum(amount_minor) from public.payments where due_id=d.id),0) paid,
   coalesce((select sum(amount_minor) from public.payment_adjustments where due_id=d.id and kind='waiver'),0) waived,
   coalesce((select sum(amount_minor) from public.payment_adjustments where due_id=d.id and kind='refund'),0) refunded,
   coalesce((select sum(amount_minor) from public.payment_adjustments where due_id=d.id and kind='correction'),0) corrected
  from public.monthly_dues d where p_period is null or d.bill_period=p_period
 ), student_totals as (select student_id,sum(amount_minor) billed,sum(paid) paid,sum(refunded) refunded,sum(corrected) corrected,sum(amount_minor-paid-waived+refunded-corrected) outstanding from ledger group by student_id)
 select jsonb_build_object('enrolledStudents',active_students,'pendingAdmissions',pending_admissions,'approvedAdmissions',approved_admissions,'payableMinor',(select coalesce(sum(amount_minor),0)::text from ledger),'collectedMinor',(select coalesce(sum(paid),0)::text from ledger),'refundedMinor',(select coalesce(sum(refunded),0)::text from ledger),'outstandingMinor',coalesce(sum(outstanding),0)::text,'partiallyPaidStudents',count(*) filter(where outstanding>0 and paid+corrected-refunded>0),'settledStudents',count(*) filter(where outstanding=0 and billed>0)) into result from student_totals;
 with ledger as (
  select d.batch_id,d.amount_minor,
   coalesce((select sum(amount_minor) from public.payments where due_id=d.id),0) paid,
   coalesce((select sum(case when kind='refund' then -amount_minor else amount_minor end) from public.payment_adjustments where due_id=d.id),0) adjusted,
   coalesce((select sum(amount_minor) from public.payment_adjustments where due_id=d.id and kind='refund'),0) refunded
  from public.monthly_dues d where p_period is null or d.bill_period=p_period
 ), grouped as (select l.batch_id,b.name batch_name,sum(l.amount_minor) billed,sum(l.paid) paid,sum(l.refunded) refunded,sum(l.amount_minor-l.paid-l.adjusted) outstanding from ledger l join public.batches b on b.id=l.batch_id group by l.batch_id,b.name)
 select coalesce(jsonb_agg(jsonb_build_object('batchId',batch_id,'batchName',batch_name,'payableMinor',billed::text,'collectedMinor',paid::text,'refundedMinor',refunded::text,'outstandingMinor',outstanding::text) order by batch_name),'[]'::jsonb) into batch_rows from grouped;
 return jsonb_build_object('period',p_period,'summary',result,'batches',batch_rows);
end;$$;
revoke all on function public.coaching_management_summary(text) from public,anon,authenticated;
grant execute on function public.coaching_management_summary(text) to authenticated;

create function public.coaching_teacher_student_identity(p_email text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r record;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_INPUT';end if;
 select p.id,p.role,p.account_status,u.email_confirmed_at into r from auth.users u join public.profiles p on p.id=u.id where lower(u.email)=lower(btrim(p_email));
 if not found then return jsonb_build_object('state','available','studentId',null,'confirmed',false,'accountStatus',null);end if;
 if r.role<>'student' then return jsonb_build_object('state','role_conflict','studentId',null,'confirmed',false,'accountStatus',null);end if;
 return jsonb_build_object('state','existing','studentId',r.id,'confirmed',r.email_confirmed_at is not null,'accountStatus',r.account_status);
end;$$;
revoke all on function public.coaching_teacher_student_identity(text) from public,anon,authenticated;
grant execute on function public.coaching_teacher_student_identity(text) to authenticated;
