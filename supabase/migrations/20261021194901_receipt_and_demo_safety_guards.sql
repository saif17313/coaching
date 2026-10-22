-- Keep bounded demo writes readable by every client; reject excess atomically.
alter table public.demo_workspaces add constraint demo_state_bounded check (
 state ?& array['students','batches','enrollments','charges','payments','claims','academic','receipts'] and
 jsonb_array_length(state->'students')<=60 and jsonb_array_length(state->'batches')<=12 and
 jsonb_array_length(state->'enrollments')<=100 and jsonb_array_length(state->'charges')<=500 and
 jsonb_array_length(state->'payments')<=500 and jsonb_array_length(state->'claims')<=500 and
 jsonb_array_length(state->'academic')<=500 and jsonb_array_length(state->'receipts')<=500
);
create index payment_receipts_issuer_idx on public.payment_receipts(issued_by);
-- Status archival must not break private references, just as CMS draft references are protected.
create function public.coaching_private_media_archive_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='archived' and old.status<>'archived' and (
  exists(select 1 from public.student_details where photo_media_id=old.id) or
  exists(select 1 from public.teacher_profiles where avatar_media_id=old.id) or
  exists(select 1 from public.student_application_workflows where documents ? old.id::text) or
  exists(select 1 from public.demo_workspaces w cross join lateral jsonb_array_elements(w.state->'students') person where person->>'photoMediaId'=old.id::text)
 ) then raise exception 'MEDIA_DRAFT_IN_USE';end if;
 return new;
end;$$;
revoke all on function public.coaching_private_media_archive_guard() from public,anon,authenticated;
create trigger private_media_archive_guard before update of status on public.media_assets for each row execute function public.coaching_private_media_archive_guard();
