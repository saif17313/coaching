-- Phase 1 Part A: core relational foundation. Apply to a new Supabase project only.
-- Teacher privileges must be provisioned through an independently authenticated
-- administrative process (not through client-writable profile fields).
create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'teacher');
create type public.enrollment_status as enum ('pending', 'active', 'rejected', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) <= 160)
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  starts_on date,
  ends_on date,
  capacity integer not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint batch_code_format check (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$'),
  constraint batch_name_length check (char_length(trim(name)) between 1 and 160),
  constraint batch_dates_valid check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint batch_capacity_valid check (capacity > 0)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  batch_id uuid not null references public.batches(id) on delete restrict,
  status public.enrollment_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint enrollments_student_batch_unique unique (student_id, batch_id),
  constraint enrollments_decision_consistent check (
    (status = 'pending' and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  )
);

create index enrollments_batch_status_idx on public.enrollments(batch_id, status);
create index enrollments_student_status_idx on public.enrollments(student_id, status);
create index batches_active_idx on public.batches(is_archived) where is_archived = false;

-- Trigger executes with elevated permissions; never trusts signup metadata for role.
create function public.create_student_profile()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, 'student'::public.app_role, '');
  return new;
end;
$$;
revoke all on function public.create_student_profile() from public, anon, authenticated;
create trigger auth_user_student_profile
  after insert on auth.users
  for each row execute function public.create_student_profile();

create function public.current_user_is_teacher()
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'teacher'::public.app_role
  );
$$;
revoke all on function public.current_user_is_teacher() from public, anon;
grant execute on function public.current_user_is_teacher() to authenticated;

alter table public.profiles enable row level security;
alter table public.batches enable row level security;
alter table public.enrollments enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_teacher_read on public.profiles for select to authenticated
  using ((select public.current_user_is_teacher()));
-- No client insert/update/delete policy on profiles; prevents self promotion.

create policy batches_authenticated_read on public.batches for select to authenticated
  using (true);
create policy batches_teacher_insert on public.batches for insert to authenticated
  with check ((select public.current_user_is_teacher()));
create policy batches_teacher_update on public.batches for update to authenticated
  using ((select public.current_user_is_teacher()))
  with check ((select public.current_user_is_teacher()));
-- Delete intentionally denied in foundational schema.

create policy enrollments_student_read on public.enrollments for select to authenticated
  using (student_id = (select auth.uid()));
create policy enrollments_teacher_read on public.enrollments for select to authenticated
  using ((select public.current_user_is_teacher()));
-- Enrollment writes intentionally withheld until Phase 2 transactional service/RPC.

revoke all on public.profiles, public.batches, public.enrollments from anon;
grant select on public.profiles, public.batches, public.enrollments to authenticated;
grant insert, update on public.batches to authenticated;
-- Neither enrollment writes nor profile role updates are exposed to clients.
