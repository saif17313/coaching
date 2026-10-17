-- OFFLINE MIGRATION DRAFT: DO NOT APPLY until a Supabase project is created,
-- the previous migration is verified, and RLS / transaction review completes.
-- Retains Shifat's Tales-compatible resource table name: batch_contents.
-- Deliberately NO direct client write grants/policies. Production changes
-- must be implemented by reviewed role-checked transactional functions.

create table public.batch_contents (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete restrict,
  upload_id uuid not null unique,
  title text not null,
  description text not null default '',
  status text not null default 'draft',
  release_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint batch_contents_title_length check (char_length(trim(title)) between 2 and 160),
  constraint batch_contents_description_length check (char_length(description) <= 2000),
  constraint batch_contents_status_valid check (status in ('draft','published','archived'))
);
create index batch_contents_batch_visibility_idx on public.batch_contents(batch_id,status,release_at);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete restrict,
  title text not null,
  body text not null,
  status text not null default 'draft',
  visible_from timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_title_length check (char_length(trim(title)) between 2 and 160),
  constraint announcements_body_length check (char_length(trim(body)) between 2 and 10000),
  constraint announcements_status_valid check (status in ('draft','published','archived'))
);
create index announcements_batch_visibility_idx on public.announcements(batch_id,status,visible_from);

-- Dispatch row is an idempotency anchor, even when zero students receive a message.
create table public.notification_dispatches (
  event_id uuid primary key,
  batch_id uuid not null references public.batches(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_dispatches(event_id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_unique_delivery unique (event_id,recipient_id),
  constraint notifications_title_length check (char_length(trim(title)) between 2 and 160),
  constraint notifications_body_length check (char_length(trim(body)) between 2 and 2000)
);
create index notifications_recipient_unread_idx on public.notifications(recipient_id,read_at,created_at desc);

-- Prototype audit schema. A production adapter must write audit rows atomically.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_action_length check (char_length(action) between 3 and 120)
);
create index audit_logs_actor_time_idx on public.audit_logs(actor_id,occurred_at desc);

alter table public.batch_contents enable row level security;
alter table public.announcements enable row level security;
alter table public.notification_dispatches enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy batch_contents_teacher_read on public.batch_contents for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy batch_contents_student_published_read on public.batch_contents for select to authenticated
  using (status='published' and (release_at is null or release_at<=now())
    and exists (select 1 from public.enrollments e
      where e.batch_id=batch_contents.batch_id and e.student_id=(select auth.uid()) and e.status='active'));
create policy announcements_teacher_read on public.announcements for select to authenticated
  using ((select public.current_user_is_teacher()));
create policy announcements_student_published_read on public.announcements for select to authenticated
  using (status='published' and (visible_from is null or visible_from<=now())
    and exists (select 1 from public.enrollments e
      where e.batch_id=announcements.batch_id and e.student_id=(select auth.uid()) and e.status='active'));
create policy notifications_owner_read on public.notifications for select to authenticated
  using (recipient_id=(select auth.uid()));
create policy audit_logs_teacher_read on public.audit_logs for select to authenticated
  using ((select public.current_user_is_teacher()));
-- notification_dispatches deliberately has no end-user read or write policy.
-- All resource and notification writes deliberately have no end-user policy.

revoke all on public.batch_contents, public.announcements, public.notification_dispatches,
  public.notifications, public.audit_logs from anon, authenticated;
grant select on public.batch_contents, public.announcements, public.notifications,
  public.audit_logs to authenticated;
-- No storage bucket or signed URL policy is installed by this migration.
