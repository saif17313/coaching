-- OFFLINE SQL DRAFT, UNAPPLIED. Deployment requires SQL review, migration replay,
-- real role/RLS tests and transactional RPCs. Never apply automatically.
-- Adds the still-missing schema for subjects/syllabus, routine and assignments.
create extension if not exists btree_gist;

create table public.academic_subjects (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete restrict,
  code text not null,
  title text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint subject_batch_code_unique unique (batch_id,code),
  constraint subject_id_batch_unique unique (id,batch_id),
  constraint subject_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,23}$'),
  constraint subject_title_length check (char_length(trim(title)) between 2 and 120)
);
create index academic_subjects_batch_idx on public.academic_subjects(batch_id);

create table public.syllabus_units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.academic_subjects(id) on delete restrict,
  title text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  constraint syllabus_subject_position_unique unique (subject_id,position),
  constraint syllabus_position_range check (position between 1 and 10000),
  constraint syllabus_title_length check (char_length(trim(title)) between 2 and 160)
);

create table public.routine_slots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete restrict,
  subject_id uuid not null,
  day_of_week smallint not null,
  start_minute smallint not null,
  end_minute smallint not null,
  room text not null default '',
  status text not null default 'active',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id,batch_id) references public.academic_subjects(id,batch_id) on delete restrict,
  constraint routine_day_valid check (day_of_week between 0 and 6),
  constraint routine_time_valid check (start_minute between 0 and 1439 and end_minute between 1 and 1440 and end_minute > start_minute),
  constraint routine_room_length check (char_length(room) <= 100),
  constraint routine_status_valid check (status in ('active','archived')),
  constraint routine_batch_overlap_exclusion exclude using gist (
    batch_id with =, day_of_week with =,
    (int4range(start_minute::integer,end_minute::integer,'[)')) with &&
  ) where (status='active')
);
create index routine_batch_day_idx on public.routine_slots(batch_id,day_of_week,start_minute) where status='active';

create table public.academic_assignments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete restrict,
  subject_id uuid not null,
  title text not null,
  instructions text not null,
  release_at timestamptz not null,
  due_at timestamptz not null,
  max_points integer not null,
  allow_resubmit boolean not null default false,
  status text not null default 'draft',
  grades_published boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id,batch_id) references public.academic_subjects(id,batch_id) on delete restrict,
  constraint assignment_schedule_valid check (due_at > release_at),
  constraint assignment_max_points_valid check (max_points between 1 and 1000),
  constraint assignment_title_length check (char_length(trim(title)) between 2 and 160),
  constraint assignment_instructions_length check (char_length(trim(instructions)) between 2 and 20000),
  constraint assignment_status_valid check (status in ('draft','published','closed')),
  constraint assignment_grade_publish_valid check (not grades_published or status in ('published','closed'))
);
create index assignments_batch_release_idx on public.academic_assignments(batch_id,status,release_at,due_at);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.academic_assignments(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  answer_text text not null,
  attachment_id uuid,
  submitted_at timestamptz not null default now(),
  grade_status text not null default 'ungraded',
  points integer,
  feedback text not null default '',
  graded_by uuid references public.profiles(id) on delete restrict,
  graded_at timestamptz,
  constraint assignment_submission_unique unique (assignment_id,student_id),
  constraint submission_text_length check (char_length(trim(answer_text)) between 1 and 20000),
  constraint submission_grade_status_valid check (grade_status in ('ungraded','draft','published')),
  constraint submission_points_valid check (points is null or points between 0 and 1000),
  constraint submission_feedback_length check (char_length(feedback) <= 2000),
  constraint submission_grade_consistency check (
    (grade_status='ungraded' and points is null and graded_by is null and graded_at is null)
    or (grade_status in ('draft','published') and points is not null and graded_by is not null and graded_at is not null)
  )
);
create index submissions_student_time_idx on public.assignment_submissions(student_id,submitted_at desc);
create index submissions_assignment_idx on public.assignment_submissions(assignment_id,grade_status);

alter table public.academic_subjects enable row level security;
alter table public.syllabus_units enable row level security;
alter table public.routine_slots enable row level security;
alter table public.academic_assignments enable row level security;
alter table public.assignment_submissions enable row level security;

-- Read policies ONLY. Teachers require verified profiles.role. Student visibility
-- requires active enrollment, and release checks for assignments. Note that
-- account-disable status is not modeled yet; real RPC must check it independently.
create policy subjects_teacher_read on public.academic_subjects for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy subjects_student_enrolled_read on public.academic_subjects for select to authenticated
  using (exists (select 1 from public.enrollments e where e.student_id=(select auth.uid())
                and e.batch_id=academic_subjects.batch_id and e.status='active'));
create policy syllabus_teacher_read on public.syllabus_units for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy syllabus_student_read on public.syllabus_units for select to authenticated
  using (exists (select 1 from public.academic_subjects s join public.enrollments e on e.batch_id=s.batch_id
                where s.id=syllabus_units.subject_id and e.student_id=(select auth.uid()) and e.status='active'));
create policy routine_teacher_read on public.routine_slots for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy routine_enrolled_active_read on public.routine_slots for select to authenticated
  using (status='active' and exists (select 1 from public.enrollments e where e.batch_id=routine_slots.batch_id
         and e.student_id=(select auth.uid()) and e.status='active'));
create policy assignments_teacher_read on public.academic_assignments for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy assignments_active_released_read on public.academic_assignments for select to authenticated
  using (status in ('published','closed') and release_at<=now() and exists
    (select 1 from public.enrollments e where e.batch_id=academic_assignments.batch_id
         and e.student_id=(select auth.uid()) and e.status='active'));
-- CRITICAL: submission rows contain *unpublished grades*. Do not grant student
-- direct SELECT on this base table. Use a reviewed SECURITY INVOKER RPC or a
-- reviewed function with strict verified ownership that projects only released
-- grades. A row policy alone cannot hide confidential points/feedback columns.
create policy submissions_teacher_read on public.assignment_submissions for select to authenticated
  using ((select public.current_user_is_teacher()));

revoke all on public.academic_subjects, public.syllabus_units, public.routine_slots,
  public.academic_assignments, public.assignment_submissions from anon,authenticated;
grant select on public.academic_subjects, public.syllabus_units, public.routine_slots,
  public.academic_assignments to authenticated;
-- No direct client submission SELECT/INSERT/UPDATE/DELETE or grade read grants.
-- Transactional server-side RPC MUST lock relevant batch, assignment, enrollment,
-- submission rows, enforce due date using DB clock, grade <= assignment.max_points,
-- and append audit within the same transaction; submitted files require signer checks.
