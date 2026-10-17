-- OFFLINE DRAFT. NOT APPLIED, NO EXECUTION AGAINST SUPABASE.
-- Real deployment requires independent RLS/RPC/locking review, backup and integration tests.
-- BDT monetary amounts are expressed as integer minor units (paisa), never floats.
-- Strict direct-client read policies and NO client write grants or policies.

create table public.fee_plans (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete restrict,
  bill_period char(7) not null,
  amount_minor bigint not null,
  currency char(3) not null default 'BDT',
  due_on date not null,
  label text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint fee_plans_unique_period unique (batch_id,bill_period),
  constraint fee_plans_period_format check (bill_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint fee_plans_amount_bounds check (amount_minor between 1 and 100000000000),
  constraint fee_plans_currency check (currency='BDT'),
  constraint fee_plans_label_length check (char_length(trim(label)) between 2 and 120)
);

create table public.monthly_dues (
  id uuid primary key default gen_random_uuid(),
  fee_plan_id uuid not null references public.fee_plans(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  batch_id uuid not null references public.batches(id) on delete restrict,
  bill_period char(7) not null,
  amount_minor bigint not null,
  currency char(3) not null default 'BDT',
  created_at timestamptz not null default now(),
  constraint monthly_dues_student_plan_unique unique (fee_plan_id,student_id),
  constraint monthly_dues_student_period_unique unique (student_id,batch_id,bill_period),
  constraint monthly_dues_amount_bounds check (amount_minor between 1 and 100000000000),
  constraint monthly_dues_currency check (currency='BDT')
);
create index monthly_dues_student_created_idx on public.monthly_dues(student_id,created_at desc);
create index monthly_dues_batch_period_idx on public.monthly_dues(batch_id,bill_period);

-- Global command idempotency anchor. RPC must claim with unique operation_id INSIDE same
-- transaction as all changes and audit; mismatched replays must not silently succeed.
create table public.financial_operations (
  operation_id uuid primary key,
  action text not null,
  target_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  response_data jsonb,
  created_at timestamptz not null default now(),
  constraint financial_operations_action_length check (char_length(action) between 3 and 120)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  due_id uuid not null references public.monthly_dues(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  amount_minor bigint not null,
  currency char(3) not null default 'BDT',
  method text not null,
  reference text not null default '',
  operation_id uuid not null unique references public.financial_operations(operation_id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payments_amount_bounds check (amount_minor between 1 and 100000000000),
  constraint payments_currency check (currency='BDT'),
  constraint payments_method_valid check (method in ('cash','bank','mobile_banking')),
  constraint payments_reference_length check (char_length(reference)<=120)
);
create index payments_student_created_idx on public.payments(student_id,created_at desc);
create index payments_due_created_idx on public.payments(due_id,created_at desc);

create table public.payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  due_id uuid not null references public.monthly_dues(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  kind text not null,
  amount_minor bigint not null,
  reason text not null,
  operation_id uuid not null unique references public.financial_operations(operation_id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payment_adjustments_kind check (kind in ('waiver','refund','correction')),
  constraint payment_adjustments_amount_nonzero check (amount_minor between -100000000000 and 100000000000 and amount_minor<>0),
  constraint payment_adjustments_amount_sign check (kind='correction' or amount_minor>0),
  constraint payment_adjustments_ref check ((kind='waiver' and payment_id is null) or (kind in ('refund','correction') and payment_id is not null)),
  constraint payment_adjustments_reason_length check (char_length(trim(reason)) between 5 and 500)
);
create index payment_adjustments_due_idx on public.payment_adjustments(due_id,created_at desc);
create index payment_adjustments_payment_idx on public.payment_adjustments(payment_id,created_at desc);

alter table public.fee_plans enable row level security;
alter table public.monthly_dues enable row level security;
alter table public.financial_operations enable row level security;
alter table public.payments enable row level security;
alter table public.payment_adjustments enable row level security;

-- Read-only: teacher can review finance, students can see their own dues/payments.
-- Role helper is from the prior foundation migration; runtime RLS tests remain pending.
create policy fee_plans_teacher_select on public.fee_plans for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy dues_teacher_select on public.monthly_dues for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy dues_student_select on public.monthly_dues for select to authenticated
  using (student_id=(select auth.uid()));
create policy payments_teacher_select on public.payments for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy payments_student_select on public.payments for select to authenticated
  using (student_id=(select auth.uid()));
create policy adjustments_teacher_select on public.payment_adjustments for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy adjustments_student_select on public.payment_adjustments for select to authenticated
  using (exists (select 1 from public.monthly_dues d
                where d.id=payment_adjustments.due_id and d.student_id=(select auth.uid())));
-- No end-user policy for financial_operations; idempotency state must not leak.

revoke all on public.fee_plans, public.monthly_dues, public.financial_operations,
  public.payments, public.payment_adjustments from anon, authenticated;
grant select on public.fee_plans, public.monthly_dues,
  public.payments, public.payment_adjustments to authenticated;
-- NO INSERT, UPDATE, DELETE grants or policies to client roles.
-- A reviewed RPC must perform enrollment/payment/plan matching, invoice row locks,
-- amount checks, immutable posting, transactionally appended audits & op idempotency.
