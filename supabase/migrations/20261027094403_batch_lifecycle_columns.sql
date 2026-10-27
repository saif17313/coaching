-- Batch lifecycle, admission gate, profile and schedule columns (additive).
-- is_archived remains authoritative for every existing RPC and policy and is kept in sync with
-- lifecycle_status: archived and cancelled batches are closed for writes.
-- Lifecycle: draft | open (accepting admission) | running | completed | archived | cancelled.
alter table public.batches
 add column lifecycle_status text not null default 'running',
 add column admission_open boolean not null default true,
 add column cover_media_id uuid references public.media_assets(id) on delete restrict,
 add column subject text not null default '',
 add column academic_level text not null default '',
 add column academic_session text not null default '',
 add column description text not null default '',
 add column schedule_days smallint[] not null default '{}',
 add column class_start_minute integer,
 add column class_end_minute integer,
 add constraint batch_lifecycle_valid check (lifecycle_status in ('draft','open','running','completed','archived','cancelled')),
 add constraint batch_profile_lengths check (char_length(subject)<=120 and char_length(academic_level)<=80 and char_length(academic_session)<=80 and char_length(description)<=2000),
 add constraint batch_schedule_days_valid check (cardinality(schedule_days)<=7 and schedule_days <@ '{0,1,2,3,4,5,6}'::smallint[]),
 add constraint batch_class_time_valid check ((class_start_minute is null and class_end_minute is null) or (class_start_minute between 0 and 1439 and class_end_minute between 1 and 1440 and class_end_minute>class_start_minute));
create index batches_cover_media_idx on public.batches(cover_media_id) where cover_media_id is not null;

-- Existing archived batches get the matching lifecycle value (new column only) before the sync constraint.
update public.batches set lifecycle_status='archived' where is_archived;
alter table public.batches add constraint batch_lifecycle_archived_sync check ((lifecycle_status in ('archived','cancelled'))=is_archived);

-- Legacy coaching_update_batch toggles is_archived; translate that into a lifecycle change.
create function public.coaching_batch_lifecycle_sync() returns trigger language plpgsql set search_path='' as $function$
begin
 if new.is_archived is distinct from old.is_archived and new.lifecycle_status is not distinct from old.lifecycle_status then
  new.lifecycle_status:=case when new.is_archived then 'archived' else 'running' end;
 elsif new.lifecycle_status is distinct from old.lifecycle_status then
  new.is_archived:=new.lifecycle_status in ('archived','cancelled');
 end if;
 return new;
end;$function$;
revoke all on function public.coaching_batch_lifecycle_sync() from public,anon,authenticated;
create trigger batch_lifecycle_sync before update on public.batches for each row execute function public.coaching_batch_lifecycle_sync();

-- New or re-activated enrollments need a batch that is not completed/archived/cancelled, and a new
-- enrollment request additionally needs the admission gate to be open.
create function public.coaching_guard_enrollment_batch_lifecycle() returns trigger language plpgsql security definer set search_path='' as $function$
declare b record;
begin
 if new.status in ('pending','active') and (tg_op='INSERT' or old.status is distinct from new.status) then
  select lifecycle_status,admission_open into b from public.batches where id=new.batch_id;
  if b.lifecycle_status in ('completed','archived','cancelled') then raise exception 'BATCH_NOT_ACCEPTING';end if;
  if tg_op='INSERT' and not b.admission_open then raise exception 'ADMISSION_CLOSED';end if;
 end if;
 return new;
end;$function$;
revoke all on function public.coaching_guard_enrollment_batch_lifecycle() from public,anon,authenticated;
create trigger enrollment_batch_lifecycle_guard before insert or update of status on public.enrollments
 for each row execute function public.coaching_guard_enrollment_batch_lifecycle();

-- Cover images must not be archived while a batch references them (live guard + batch covers).
create or replace function public.coaching_private_media_archive_guard()
 returns trigger language plpgsql security definer set search_path to '' as $function$
begin
 if new.status='archived' and old.status<>'archived' and (
  exists(select 1 from public.student_details where photo_media_id=old.id) or
  exists(select 1 from public.teacher_profiles where avatar_media_id=old.id) or
  exists(select 1 from public.batches where cover_media_id=old.id) or
  exists(select 1 from public.student_application_workflows where documents ? old.id::text) or
  exists(select 1 from public.demo_workspaces w cross join lateral jsonb_array_elements(w.state->'students') person where person->>'photoMediaId'=old.id::text)
 ) then raise exception 'MEDIA_DRAFT_IN_USE';end if;
 return new;
end;$function$;
notify pgrst,'reload schema';
