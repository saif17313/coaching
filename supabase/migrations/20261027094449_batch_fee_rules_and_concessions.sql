-- Default fee history per batch. effective_from is a billing period; the rule in force for a
-- period is the latest effective_from <= period. Rows are append-only (no update RPC).
-- Fee rules never rewrite issued dues: they only seed future fee plans.
create table public.batch_fee_rules (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.batches(id) on delete restrict,
 effective_from char(7) not null check(effective_from ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 monthly_fee_minor bigint not null check(monthly_fee_minor between 1 and 100000000000),
 admission_fee_minor bigint not null default 0 check(admission_fee_minor between 0 and 100000000000),
 due_day smallint not null default 10 check(due_day between 1 and 28),
 reason text not null check(char_length(btrim(reason)) between 3 and 300),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(batch_id,effective_from)
);
create index batch_fee_rules_creator_idx on public.batch_fee_rules(created_by);

-- Student-specific concession on one batch, for a bounded period range. Applied only to dues
-- generated for covered periods, as a waiver with its own operation id and audit trail.
create table public.student_fee_concessions (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.profiles(id) on delete restrict,
 batch_id uuid not null references public.batches(id) on delete restrict,
 kind text not null check(kind in ('percent','amount')),
 value bigint not null,
 starts_period char(7) not null check(starts_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 ends_period char(7) check(ends_period is null or ends_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 reason text not null check(char_length(btrim(reason)) between 5 and 300),
 status text not null default 'active' check(status in ('active','revoked')),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 revoked_by uuid references public.profiles(id) on delete restrict,
 revoked_at timestamptz,
 check((kind='percent' and value between 1 and 100) or (kind='amount' and value between 1 and 100000000000)),
 check(ends_period is null or ends_period>=starts_period),
 check((status='revoked')=(revoked_at is not null and revoked_by is not null))
);
create index student_fee_concessions_lookup_idx on public.student_fee_concessions(batch_id,student_id) where status='active';
create index student_fee_concessions_student_idx on public.student_fee_concessions(student_id);
create index student_fee_concessions_creator_idx on public.student_fee_concessions(created_by);
create index student_fee_concessions_revoker_idx on public.student_fee_concessions(revoked_by) where revoked_by is not null;

-- Links a concession waiver to its due so a concession is applied at most once per due.
create table public.concession_applications (
 due_id uuid primary key references public.monthly_dues(id) on delete restrict,
 concession_id uuid not null references public.student_fee_concessions(id) on delete restrict,
 adjustment_id uuid not null unique references public.payment_adjustments(id) on delete restrict,
 created_at timestamptz not null default now()
);
create index concession_applications_concession_idx on public.concession_applications(concession_id);

alter table public.batch_fee_rules enable row level security;
alter table public.student_fee_concessions enable row level security;
alter table public.concession_applications enable row level security;
revoke all on public.batch_fee_rules,public.student_fee_concessions,public.concession_applications from public,anon,authenticated;

-- Append a default fee rule. Changing the fee never edits existing fee plans or dues.
create function public.coaching_add_batch_fee_rule(p_batch_id uuid,p_effective_from text,p_monthly_fee_minor bigint,p_admission_fee_minor bigint,p_due_day integer,p_reason text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;rid uuid;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_batch_id is null or p_operation_id is null or p_effective_from !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_monthly_fee_minor not between 1 and 100000000000
  or coalesce(p_admission_fee_minor,-1) not between 0 and 100000000000 or coalesce(p_due_day,0) not between 1 and 28 or char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'INVALID_FEE_RULE';end if;
 payload:=pg_catalog.jsonb_build_object('batchId',p_batch_id,'effectiveFrom',p_effective_from,'monthlyFeeMinor',p_monthly_fee_minor,'admissionFeeMinor',p_admission_fee_minor,'dueDay',p_due_day,'reason',btrim(p_reason));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'finance.fee_rule.added' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 perform 1 from public.batches where id=p_batch_id and not is_archived for update;
 if not found then raise exception 'BATCH_UNAVAILABLE';end if;
 if exists(select 1 from public.batch_fee_rules where batch_id=p_batch_id and effective_from=p_effective_from) then raise exception 'FEE_RULE_EXISTS_FOR_PERIOD';end if;
 insert into public.batch_fee_rules(batch_id,effective_from,monthly_fee_minor,admission_fee_minor,due_day,reason,created_by)
  values(p_batch_id,p_effective_from,p_monthly_fee_minor,p_admission_fee_minor,p_due_day,btrim(p_reason),a) returning id into rid;
 result:=pg_catalog.jsonb_build_object('id',rid,'batchId',p_batch_id,'effectiveFrom',p_effective_from,'monthlyFeeMinor',p_monthly_fee_minor::text);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'finance.fee_rule.added',rid,payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'finance.fee_rule.added',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_add_batch_fee_rule(uuid,text,bigint,bigint,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_add_batch_fee_rule(uuid,text,bigint,bigint,integer,text,uuid) to authenticated;

-- Concession commands: grant | revoke. Revoking never removes waivers already applied.
create function public.coaching_fee_concession_write(p_action text,p_concession_id uuid,p_data jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a uuid:=(select auth.uid());prior record;payload jsonb;result jsonb;cid uuid;c record;
begin
 if a is null or not public.current_user_is_teacher() or not public.coaching_current_user_is_active() then raise exception 'FORBIDDEN';end if;
 if p_operation_id is null or p_action not in ('grant','revoke') or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'INVALID_CONCESSION';end if;
 payload:=pg_catalog.jsonb_build_object('action',p_action,'concessionId',p_concession_id,'data',p_data);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select m.operation_type,m.payload,m.result into prior from public.coaching_mutation_receipts m where m.actor_id=a and m.operation_id=p_operation_id for update;
 if found then
  if prior.operation_type<>'finance.concession.write' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 if p_action='grant' then
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('studentId','batchId','kind','value','startsPeriod','endsPeriod','reason')) then raise exception 'INVALID_CONCESSION';end if;
  if not exists(select 1 from public.enrollments where student_id=(p_data->>'studentId')::uuid and batch_id=(p_data->>'batchId')::uuid and status in ('active','pending')) then raise exception 'STUDENT_NOT_ENROLLED';end if;
  if exists(select 1 from public.student_fee_concessions x where x.student_id=(p_data->>'studentId')::uuid and x.batch_id=(p_data->>'batchId')::uuid and x.status='active'
    and x.starts_period<=coalesce(p_data->>'endsPeriod','9999-12') and coalesce(x.ends_period,'9999-12')>=(p_data->>'startsPeriod')) then raise exception 'CONCESSION_OVERLAP';end if;
  insert into public.student_fee_concessions(student_id,batch_id,kind,value,starts_period,ends_period,reason,created_by)
   values((p_data->>'studentId')::uuid,(p_data->>'batchId')::uuid,p_data->>'kind',(p_data->>'value')::bigint,p_data->>'startsPeriod',nullif(p_data->>'endsPeriod',''),btrim(coalesce(p_data->>'reason','')),a)
   returning id into cid;
 else
  select * into c from public.student_fee_concessions where id=p_concession_id for update;
  if not found then raise exception 'CONCESSION_NOT_FOUND';end if;
  if c.status<>'active' then raise exception 'CONCESSION_NOT_ACTIVE';end if;
  update public.student_fee_concessions set status='revoked',revoked_by=a,revoked_at=pg_catalog.now() where id=p_concession_id;
  cid:=p_concession_id;
 end if;
 result:=pg_catalog.jsonb_build_object('id',cid,'action',p_action);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'finance.concession.'||p_action,cid,payload);
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'finance.concession.write',payload,result);
 return result;
end;$function$;
revoke all on function public.coaching_fee_concession_write(text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.coaching_fee_concession_write(text,uuid,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
