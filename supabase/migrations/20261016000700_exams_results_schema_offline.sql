-- OFFLINE DRAFT. Do not deploy until reviewed and locally replay-tested.
-- Requires 00100 (profiles, batches), 00400 (subjects) and 00600 (active-account gate).
-- Draft/result-bearing tables are never directly writable by anon/authenticated.
-- Student result reading must use a separate reviewed projection/RPC that checks:
--   verified student ID, active account, active enrollment, published exam/result.
-- The production marks transaction must lock exam, verify enrollment and marks
-- against exam.max_marks, compute rankings, and append audit atomically.

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete restrict,
  subject_id uuid not null,
  title text not null,
  scheduled_at timestamptz not null,
  max_marks integer not null,
  status text not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id,batch_id)
    references public.academic_subjects(id,batch_id) on delete restrict,
  constraint exams_title_valid check (char_length(trim(title)) between 2 and 120),
  constraint exams_max_marks_valid check (max_marks between 1 and 10000),
  constraint exams_status_valid check (status in ('draft','published','archived'))
);
create index exams_batch_scheduled_idx on public.exams(batch_id,scheduled_at desc);

create table public.exam_results (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  marks numeric(10,2),
  result_status text not null default 'draft',
  rank integer,
  graded_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_result_unique_student unique (exam_id,student_id),
  constraint exam_result_marks_bounds check (marks is null or marks between 0 and 10000),
  constraint exam_result_rank_valid check (rank is null or rank between 1 and 1000000),
  constraint exam_result_status_valid check (result_status in ('draft','published')),
  constraint exam_result_publication_consistent check
    (result_status <> 'published' or (marks is not null and rank is not null))
);
create index exam_results_student_idx on public.exam_results(student_id,exam_id);

alter table public.exams enable row level security;
alter table public.exam_results enable row level security;

create policy exams_active_teacher_read on public.exams for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy exams_active_student_published_read on public.exams for select to authenticated
  using (status='published' and (select public.coaching_current_user_is_active())
    and exists (select 1 from public.enrollments e
      where e.batch_id=exams.batch_id and e.student_id=(select auth.uid())
        and e.status='active'));
create policy exam_results_active_teacher_read on public.exam_results for select to authenticated
  using ((select public.current_user_is_teacher()));

revoke all on public.exams, public.exam_results from public,anon,authenticated;
grant select on public.exams, public.exam_results to authenticated;
-- No student SELECT policy on exam_results. A published-only reader RPC is
-- required before student results become functional.
-- No INSERT/UPDATE/DELETE client privileges or policies on either relation.
