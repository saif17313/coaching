-- Physically separate from operational Auth, enrollment, academic and finance tables.
-- No fake Auth identities, invitations, notifications or operational ledger writes.
create table public.demo_workspaces (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null unique references public.profiles(id) on delete restrict,
 student_user_id uuid unique references public.profiles(id) on delete restrict,
 revision bigint not null default 1,archived boolean not null default false,
 state jsonb not null check(jsonb_typeof(state)='object'),created_at timestamptz not null default now()
);
alter table public.demo_workspaces enable row level security;
revoke all on public.demo_workspaces from public,anon,authenticated;
create function public.coaching_demo_read() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());w public.demo_workspaces%rowtype;s jsonb;student text;
begin
 if public.current_user_is_teacher() then select * into w from public.demo_workspaces where owner_id=a;
 else
  perform public.coaching_student_admission_read(a);
  select * into w from public.demo_workspaces where student_user_id=a;
 end if;
 if w.id is null then return null;end if;
 s:=w.state;
 if not public.current_user_is_teacher() then
  student:=s->'students'->0->>'id';
  s:=jsonb_build_object('students',jsonb_build_array(s->'students'->0),
    'batches',(select coalesce(jsonb_agg(b),'[]') from jsonb_array_elements(s->'batches') b where exists(select 1 from jsonb_array_elements(s->'enrollments') e where e->>'studentId'=student and e->>'batchId'=b->>'id')),
    'enrollments',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(s->'enrollments') e where e->>'studentId'=student),
    'charges',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(s->'charges') e where e->>'studentId'=student),
    'payments',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(s->'payments') e where e->>'studentId'=student),
    'claims',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(s->'claims') e where e->>'studentId'=student),
    'receipts',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(s->'receipts') e where e->'snapshot'->>'studentId'=student),
    'academic',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(s->'academic') e where exists(select 1 from jsonb_array_elements(s->'enrollments') n where n->>'studentId'=student and n->>'status'='active' and n->>'batchId'=e->>'batchId')));
 end if;
 return jsonb_build_object('id',w.id,'revision',w.revision,'archived',w.archived,'isolated',true,'state',s);
end;$$;
revoke all on function public.coaching_demo_read() from public,anon,authenticated;
grant execute on function public.coaching_demo_read() to authenticated;
create function public.coaching_demo_command(p_action text,p_data jsonb,p_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(select auth.uid());teacher boolean:=public.current_user_is_teacher();w public.demo_workspaces%rowtype;prior record;payload jsonb;s jsonb;r jsonb;i int;j int;k int;sid uuid;bid uuid;eid uuid;cid uuid;pid uuid;record jsonb;charge jsonb;person jsonb;batch jsonb;amount bigint;balance bigint;paid bigint;waived bigint;refunded bigint;item_index int;students jsonb:='[]';batches jsonb:='[]';enrollments jsonb:='[]';charges jsonb:='[]';payments jsonb:='[]';claims jsonb:='[]';academic jsonb:='[]';receipt jsonb;names text[]:=array['Ayaan','Nusrat','Farhan','Lamiya','Ishtiaque','Sarah','Tanvir','Maria','Rafiul','Zara'];families text[]:=array['Rahman','Chowdhury','Ahmed','Khan','Islam'];
begin
 if p_action is null or p_action not in ('seed','archive','profile.edit','admission.decide','batch.create','enrollment.create','enrollment.decide','payment.report','payment.review','payment.post','charge.waive','payment.refund') or p_revision is null or p_revision<0 or a is null or p_operation_id is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>4000 then raise exception 'INVALID_INPUT';end if;
 if exists(select 1 from jsonb_each(p_data) where jsonb_typeof(value)<>'string' or (value#>>'{}')~'[[:cntrl:]]') then raise exception 'INVALID_INPUT';end if;
 if not teacher then perform public.coaching_student_admission_read(a);if p_action not in ('payment.report','profile.edit') then raise exception 'FORBIDDEN';end if;end if;
 payload:=jsonb_build_object('action',p_action,'data',p_data,'revision',p_revision);
 perform pg_advisory_xact_lock(hashtext(a::text),hashtext(p_operation_id::text));
 select * into prior from public.coaching_mutation_receipts where actor_id=a and operation_id=p_operation_id;
 if found then if prior.operation_type<>'demo.command' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 if teacher then select * into w from public.demo_workspaces where owner_id=a for update;else select * into w from public.demo_workspaces where student_user_id=a for update;end if;
 if p_action='seed' then
  if not teacher or (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['studentUserId']::text[] then raise exception 'INVALID_INPUT';end if;
  if w.id is not null then return public.coaching_demo_read();end if;
  sid:=nullif(p_data->>'studentUserId','')::uuid;
  if sid is not null and not exists(select 1 from public.profiles where id=sid and role='student' and account_status='active') then raise exception 'STUDENT_NOT_ACTIVE';end if;
  for i in 1..50 loop students:=students||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','DEMO '||names[1+(i-1)%10]||' '||families[1+(i-1)/10],'roll','DEMO-'||lpad(i::text,3,'0'),'school','DEMO Learning School','class','Class '||(8+(i-1)%5),'guardian',case when i%5=0 then '' else 'DEMO Guardian '||i end,'admissionStatus',case when i=1 then 'pending' else (array['pending','approved','rejected','completed'])[1+(i-1)%4] end,'requiresSettled',i=1,'phone','DEMO CONTACT '||i,'email','student'||i||'@example.invalid','address',case when i%5=0 then '' else 'DEMO Address '||i end,'status',case when i%9=0 then 'inactive' else 'active' end));end loop;
  for i in 1..10 loop
   bid:=gen_random_uuid();batches:=batches||jsonb_build_array(jsonb_build_object('id',bid,'name','DEMO '||(array['Mathematics','Physics','Chemistry','English','Biology'])[1+(i-1)%5]||' '||(8+(i-1)%5),'code','DEMO-B'||lpad(i::text,2,'0'),'capacity',12,'feeMinor',((array[250000,300000,350000,400000])[1+(i-1)%4])::text,'schedule',case when i%2=0 then 'Sun, Tue, Thu · 16:00-17:30' else 'Sat, Mon, Wed · 10:00-11:30' end,'room','DEMO Room '||i));
   academic:=academic||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'batchId',bid,'subject','DEMO Subject '||i,'syllabus',jsonb_build_array('Concept review','Guided practice','Assessment'),'assignment','DEMO Practice worksheet','exam','DEMO Chapter quiz','totalMarks',100,'routine','Next class: '||((current_date+1)::text),'notice','DEMO only: practice session announcement'));
  end loop;
  for i in 1..80 loop
   j:=1+(i-1)%50;k:=case when i<=50 then (i-1)%10 else (i-51+5)%10 end;sid:=(students->(j-1)->>'id')::uuid;bid:=(batches->k->>'id')::uuid;eid:=gen_random_uuid();cid:=gen_random_uuid();amount:=case when j=2 then 300000 else (array[250000,300000,350000,400000])[1+(i-1)%4] end;
   enrollments:=enrollments||jsonb_build_array(jsonb_build_object('id',eid,'studentId',sid,'batchId',bid,'status',case when i%11=0 then 'rejected' when i%7=0 then 'pending' when i%13=0 then 'cancelled' else 'active' end));
   paid:=case when i%8=1 then amount when i%8=2 then amount/2 when i%8=7 then amount else 0 end;if i<=2 then paid:=0;end if;waived:=case when i%8=3 then 50000 else 0 end;refunded:=case when i%8=4 then 20000 else 0 end;if refunded>0 then paid:=100000;end if;
   charge:=jsonb_build_object('id',cid,'studentId',sid,'batchId',bid,'amountMinor',amount::text,'admissionMinor','50000','tuitionMinor',(amount-50000)::text,'paidMinor',paid::text,'waivedMinor',waived::text,'refundedMinor',refunded::text,'dueOn',case when i%3=0 then current_date-15 else current_date+15 end,'period',to_char(current_date,'YYYY-MM'));charges:=charges||jsonb_build_array(charge);
   if i%8=7 then payments:=payments||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'chargeId',cid,'studentId',sid,'amountMinor','200000','method','bank','reference','DEMO installment A '||i,'recordedAt',now()),jsonb_build_object('id',gen_random_uuid(),'chargeId',cid,'studentId',sid,'amountMinor','150000','method','cash','reference','DEMO installment B '||i,'recordedAt',now()));
   elsif paid>0 then payments:=payments||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'chargeId',cid,'studentId',sid,'amountMinor',paid::text,'method','cash','reference','DEMO seeded historical payment '||i,'recordedAt',now()));end if;
   if i%8 in (5,6) then claims:=claims||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'chargeId',cid,'studentId',sid,'amountMinor',(amount/2)::text,'method','bank','reference','DEMO report '||i,'status',case when i%8=5 then 'pending' else 'rejected' end,'reason',case when i%8=6 then 'DEMO evidence mismatch' else '' end));end if;
  end loop;
  s:=jsonb_build_object('students',students,'batches',batches,'enrollments',enrollments,'charges',charges,'payments',payments,'claims',claims,'academic',academic,'receipts','[]'::jsonb);
  insert into public.demo_workspaces(owner_id,student_user_id,state) values(a,nullif(p_data->>'studentUserId','')::uuid,s) returning * into w;
 else
  if w.id is null or w.archived then raise exception 'DEMO_WORKSPACE_UNAVAILABLE';end if;
  if w.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT';end if;s:=w.state;
  if p_action='archive' then
   if not teacher or p_data<>'{}'::jsonb then raise exception 'FORBIDDEN';end if;update public.demo_workspaces set archived=true where id=w.id;
  elsif p_action='profile.edit' then
   if (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['phone','studentId']::text[] or length(p_data->>'phone')>30 or p_data->>'phone' is null then raise exception 'INVALID_INPUT';end if;
   sid:=(p_data->>'studentId')::uuid;if not teacher and sid::text<>s->'students'->0->>'id' then raise exception 'FORBIDDEN';end if;
   select ord-1 into item_index from jsonb_array_elements(s->'students') with ordinality t(v,ord) where v->>'id'=sid::text;if item_index is null then raise exception 'STUDENT_NOT_FOUND';end if;s:=jsonb_set(s,array['students',item_index::text,'phone'],to_jsonb(p_data->>'phone'));
  elsif p_action='admission.decide' then
   if not teacher or (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['status','studentId']::text[] or p_data->>'status' not in ('pending','approved','rejected','completed') then raise exception 'INVALID_INPUT';end if;
   select v,ord-1 into person,item_index from jsonb_array_elements(s->'students') with ordinality t(v,ord) where v->>'id'=p_data->>'studentId';if item_index is null then raise exception 'STUDENT_NOT_FOUND';end if;
   if not ((person->>'admissionStatus'='pending' and p_data->>'status' in ('approved','rejected')) or (person->>'admissionStatus'='approved' and p_data->>'status'='completed') or (person->>'admissionStatus'='rejected' and p_data->>'status'='pending')) then raise exception 'INVALID_STATUS_TRANSITION';end if;
   if p_data->>'status'='approved' then
    if length(person->>'guardian')=0 or length(person->>'school')=0 or length(person->>'phone')=0 then raise exception 'ADMISSION_DETAILS_REQUIRED';end if;
    if (person->>'requiresSettled')::boolean and exists(select 1 from jsonb_array_elements(s->'charges') c where c->>'studentId'=person->>'id' and (c->>'amountMinor')::bigint-(c->>'paidMinor')::bigint-(c->>'waivedMinor')::bigint+(c->>'refundedMinor')::bigint>0) then raise exception 'VERIFIED_PAYMENT_REQUIRED';end if;
   end if;
   s:=jsonb_set(s,array['students',item_index::text,'admissionStatus'],p_data->'status');
  elsif p_action='batch.create' then
   if not teacher or (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['capacity','feeMinor','name','schedule']::text[] or length(p_data->>'name') not between 3 and 100 or length(p_data->>'schedule') not between 3 and 120 or p_data->>'capacity' !~ '^[1-9][0-9]?$' or p_data->>'feeMinor' !~ '^[1-9][0-9]{0,10}$' or jsonb_array_length(s->'batches')>=12 then raise exception 'INVALID_BATCH';end if;
   bid:=gen_random_uuid();s:=jsonb_set(s,'{batches}',s->'batches'||jsonb_build_array(jsonb_build_object('id',bid,'name','DEMO '||(p_data->>'name'),'code','DEMO-B'||(jsonb_array_length(s->'batches')+1),'capacity',(p_data->>'capacity')::int,'feeMinor',p_data->>'feeMinor','schedule',p_data->>'schedule','room','DEMO New room')));
  elsif p_action='enrollment.create' then
   if not teacher or (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['batchId','studentId']::text[] then raise exception 'INVALID_INPUT';end if;
   sid:=(p_data->>'studentId')::uuid;bid:=(p_data->>'batchId')::uuid;
   select v into person from jsonb_array_elements(s->'students') v where v->>'id'=sid::text;select v into batch from jsonb_array_elements(s->'batches') v where v->>'id'=bid::text;
   if person is null or batch is null then raise exception 'INVALID_ENROLLMENT_REQUEST';end if;
   if exists(select 1 from jsonb_array_elements(s->'enrollments') e where e->>'studentId'=sid::text and e->>'batchId'=bid::text) then raise exception 'ENROLLMENT_ALREADY_EXISTS';end if;
   if (select count(*) from jsonb_array_elements(s->'enrollments') e where e->>'batchId'=bid::text and e->>'status'='active')>=(batch->>'capacity')::int then raise exception 'BATCH_FULL';end if;
   s:=jsonb_set(s,'{enrollments}',s->'enrollments'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'studentId',sid,'batchId',bid,'status','pending')));
   amount:=(batch->>'feeMinor')::bigint;s:=jsonb_set(s,'{charges}',s->'charges'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'studentId',sid,'batchId',bid,'amountMinor',amount::text,'admissionMinor','0','tuitionMinor',amount::text,'paidMinor','0','waivedMinor','0','refundedMinor','0','dueOn',current_date+15,'period',to_char(current_date,'YYYY-MM'))));
  elsif p_action='enrollment.decide' then
   if not teacher or (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['enrollmentId','status']::text[] or p_data->>'status' not in ('active','rejected','cancelled','pending') then raise exception 'INVALID_INPUT';end if;
   select v,ord-1 into record,item_index from jsonb_array_elements(s->'enrollments') with ordinality t(v,ord) where v->>'id'=p_data->>'enrollmentId';if item_index is null then raise exception 'ENROLLMENT_NOT_FOUND';end if;
   if not ((record->>'status'='pending' and p_data->>'status' in ('active','rejected','cancelled')) or (record->>'status'='active' and p_data->>'status'='cancelled') or (record->>'status'='rejected' and p_data->>'status'='pending')) then raise exception 'INVALID_ENROLLMENT_TRANSITION';end if;
   if p_data->>'status'='active' and record->>'status'<>'active' and (select count(*) from jsonb_array_elements(s->'enrollments') e where e->>'batchId'=record->>'batchId' and e->>'status'='active') >= (select (b->>'capacity')::int from jsonb_array_elements(s->'batches') b where b->>'id'=record->>'batchId') then raise exception 'BATCH_FULL';end if;
   s:=jsonb_set(s,array['enrollments',item_index::text,'status'],p_data->'status');
  elsif p_action in ('payment.post','payment.report','payment.review','charge.waive','payment.refund') then
   if not teacher and p_action<>'payment.report' then raise exception 'FORBIDDEN';end if;
   if p_action='payment.review' then
    if (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['claimId','decision','reason']::text[] or p_data->>'decision' not in ('verify','reject') or length(p_data->>'reason') not between 5 and 200 then raise exception 'INVALID_INPUT';end if;
    select v,ord-1 into record,item_index from jsonb_array_elements(s->'claims') with ordinality t(v,ord) where v->>'id'=p_data->>'claimId';if item_index is null or record->>'status'<>'pending' then raise exception 'PAYMENT_REPORT_REVIEWED';end if;
    cid:=(record->>'chargeId')::uuid;amount:=(record->>'amountMinor')::bigint;
   else
    if (select array_agg(key order by key) from jsonb_object_keys(p_data) key) is distinct from array['amountMinor','chargeId','method','reference']::text[] or p_data->>'amountMinor' !~ '^[1-9][0-9]{0,10}$' or p_data->>'method' not in ('cash','bank','mobile_banking') or length(p_data->>'reference') not between 5 and 120 then raise exception 'INVALID_INPUT';end if;
    cid:=(p_data->>'chargeId')::uuid;amount:=(p_data->>'amountMinor')::bigint;
   end if;
   select c into charge from jsonb_array_elements(s->'charges') c where c->>'id'=cid::text;if charge is null then raise exception 'DUE_NOT_FOUND';end if;sid:=(charge->>'studentId')::uuid;
   if not teacher and sid::text<>s->'students'->0->>'id' then raise exception 'FORBIDDEN';end if;
   balance:=(charge->>'amountMinor')::bigint-(charge->>'paidMinor')::bigint-(charge->>'waivedMinor')::bigint+(charge->>'refundedMinor')::bigint;
   if p_action='payment.review' then
    s:=jsonb_set(s,array['claims',item_index::text,'status'],to_jsonb(case when p_data->>'decision'='verify' then 'verified' else 'rejected' end));s:=jsonb_set(s,array['claims',item_index::text,'reason'],p_data->'reason');
   end if;
   if p_action='payment.report' then
    if amount>balance then raise exception 'PAYMENT_EXCEEDS_BALANCE';end if;
    if exists(select 1 from jsonb_array_elements(s->'claims') c where lower(c->>'reference')=lower(p_data->>'reference')) then raise exception 'PAYMENT_REFERENCE_EXISTS';end if;
    s:=jsonb_set(s,'{claims}',s->'claims'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'chargeId',cid,'studentId',sid,'amountMinor',amount::text,'method',p_data->>'method','reference',p_data->>'reference','status','pending','reason','')));
   elsif p_action<>'payment.review' or p_data->>'decision'='verify' then
    select ord-1 into j from jsonb_array_elements(s->'charges') with ordinality t(v,ord) where v->>'id'=cid::text;
    if p_action='payment.refund' then
     if amount>(charge->>'paidMinor')::bigint-(charge->>'refundedMinor')::bigint then raise exception 'REFUND_EXCEEDS_PAYMENT';end if;s:=jsonb_set(s,array['charges',j::text,'refundedMinor'],to_jsonb(((charge->>'refundedMinor')::bigint+amount)::text));
    elsif p_action='charge.waive' then
     if amount>balance then raise exception 'WAIVER_EXCEEDS_BALANCE';end if;s:=jsonb_set(s,array['charges',j::text,'waivedMinor'],to_jsonb(((charge->>'waivedMinor')::bigint+amount)::text));
    else
     if amount>balance then raise exception 'PAYMENT_EXCEEDS_BALANCE';end if;pid:=gen_random_uuid();
     if p_action<>'payment.review' and exists(select 1 from jsonb_array_elements(s->'payments') c where lower(c->>'reference')=lower(p_data->>'reference')) then raise exception 'PAYMENT_REFERENCE_EXISTS';end if;
     s:=jsonb_set(s,array['charges',j::text,'paidMinor'],to_jsonb(((charge->>'paidMinor')::bigint+amount)::text));
     s:=jsonb_set(s,'{payments}',s->'payments'||jsonb_build_array(jsonb_build_object('id',pid,'chargeId',cid,'studentId',sid,'amountMinor',amount::text,'method',coalesce(record->>'method',p_data->>'method'),'reference',coalesce(record->>'reference',p_data->>'reference'),'recordedAt',now())));
     select v into person from jsonb_array_elements(s->'students') v where v->>'id'=sid::text;select v into batch from jsonb_array_elements(s->'batches') v where v->>'id'=charge->>'batchId';
     receipt:=jsonb_build_object('version',1,'demo',true,'receiptNumber','EC-'||upper(replace(pid::text,'-','')),'paymentId',pid,'studentId',sid,'studentName',person->>'name','admissionRoll',person->>'roll','batchName',batch->>'name','billPeriod',charge->>'period','chargeLabel','DEMO admission and tuition','currency','BDT','paymentMinor',amount::text,'chargeMinor',charge->>'amountMinor','paidMinor',((charge->>'paidMinor')::bigint+amount)::text,'waivedMinor',charge->>'waivedMinor','refundedMinor',charge->>'refundedMinor','correctionMinor','0','balanceMinor',(balance-amount)::text,'method',coalesce(record->>'method',p_data->>'method'),'reference',coalesce(record->>'reference',p_data->>'reference'),'paidAt',now(),'issuedAt',now(),'issuerName','DEMO EduCentre Teacher');
     s:=jsonb_set(s,'{receipts}',s->'receipts'||jsonb_build_array(jsonb_build_object('snapshot',receipt,'chargeId',cid,'adjustments','[]'::jsonb)));
    end if;
    if p_action in ('charge.waive','payment.refund') then
     s:=jsonb_set(s,'{receipts}',(select coalesce(jsonb_agg(case when receipt_entry->>'chargeId'=cid::text then jsonb_set(receipt_entry,'{adjustments}',receipt_entry->'adjustments'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind',case when p_action='charge.waive' then 'waiver' else 'refund' end,'amountMinor',amount::text,'reason',p_data->>'reference','recordedAt',now()))) else receipt_entry end),'[]') from jsonb_array_elements(s->'receipts') receipt_entry));
    end if;
   end if;
  else raise exception 'INVALID_COMMAND';end if;
  update public.demo_workspaces set state=s,revision=revision+1 where id=w.id;
 end if;
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'demo.'||p_action,w.id,jsonb_build_object('isolated',true));
 r:=public.coaching_demo_read();insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'demo.command',payload,r);return r;
end;$$;
revoke all on function public.coaching_demo_command(text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.coaching_demo_command(text,jsonb,bigint,uuid) to authenticated;

-- Preserve issued snapshots; record class on subsequent receipts.
create or replace function public.coaching_payment_receipt(p_payment_id uuid,p_issue boolean default false)
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
  select due.*,b.name batch_name,f.label,pr.full_name student_name,coalesce(sd.class_name,'') student_class,coalesce(ad.admission_roll,'') admission_roll,
   coalesce(issuer.full_name,'EduCentre') issuer_name
   into d from public.monthly_dues due join public.batches b on b.id=due.batch_id
   join public.fee_plans f on f.id=due.fee_plan_id join public.profiles pr on pr.id=due.student_id
   left join public.student_details sd on sd.student_id=due.student_id
   left join public.student_admission_details ad on ad.student_id=due.student_id
   join public.profiles issuer on issuer.id=p.created_by where due.id=p.due_id;
  select coalesce(sum(amount_minor),0) into paid from public.payments where due_id=p.due_id and created_at<=p.created_at;
  select coalesce(sum(amount_minor) filter(where kind='waiver'),0),coalesce(sum(amount_minor) filter(where kind='refund'),0),coalesce(sum(amount_minor) filter(where kind='correction'),0)
   into waived,refunded,corrected from public.payment_adjustments where due_id=p.due_id and created_at<=p.created_at;
  s:=jsonb_build_object('version',1,'receiptNumber','EC-'||upper(replace(p.id::text,'-','')),'paymentId',p.id,'studentId',p.student_id,
   'studentName',d.student_name,'className',d.student_class,'admissionRoll',d.admission_roll,'batchName',d.batch_name,'billPeriod',btrim(d.bill_period),'chargeLabel',d.label,
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
