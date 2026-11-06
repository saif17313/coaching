-- Student IDs reuse the existing admission_roll projection, so directories,
-- attendance, exams, reports and new receipts all read the same database value.
-- Keep former admission numbers for historical reference; receipt snapshots stay intact.
create sequence public.student_number_seq as bigint
 start with 1000000000 minvalue 1000000000 maxvalue 9999999999 no cycle;
revoke all on sequence public.student_number_seq from public,anon,authenticated;

alter table public.student_admission_details add column legacy_admission_roll text;
alter table public.student_admission_details alter column admission_roll
 set default (pg_catalog.nextval('public.student_number_seq')::text);

do $migration$
declare student record;
begin
 for student in select student_id from public.student_admission_details order by created_at,student_id loop
  update public.student_admission_details
   set legacy_admission_roll=admission_roll,
       admission_roll=pg_catalog.nextval('public.student_number_seq')::text
   where student_id=student.student_id;
 end loop;
end;$migration$;

insert into public.student_admission_details(student_id,created_by,admitted_on)
 select p.id,p.id,(p.created_at at time zone 'Asia/Dhaka')::date
 from public.profiles p where p.role='student'
 and not exists(select 1 from public.student_admission_details a where a.student_id=p.id)
 order by p.created_at,p.id;

alter table public.student_admission_details add constraint student_number_ten_digits
 check(admission_roll ~ '^[1-9][0-9]{9}$');

-- Trigger-only elevated access is necessary: Auth signup and offline admission
-- create profiles without granting browser users writes to admission records.
create function public.assign_student_number() returns trigger
 language plpgsql security definer set search_path='' as $function$
begin
 if new.role='student' then
  insert into public.student_admission_details(student_id,created_by)
   values(new.id,new.id) on conflict(student_id) do nothing;
 end if;
 return new;
end;$function$;
revoke all on function public.assign_student_number() from public,anon,authenticated;
create trigger assign_student_number after insert or update of role on public.profiles
 for each row execute function public.assign_student_number();

create function public.keep_student_number() returns trigger
 language plpgsql set search_path='' as $function$
begin
 if new.student_id is distinct from old.student_id or new.admission_roll is distinct from old.admission_roll then
  raise exception 'STUDENT_NUMBER_IMMUTABLE';
 end if;
 return new;
end;$function$;
revoke all on function public.keep_student_number() from public,anon,authenticated;
create trigger keep_student_number before update on public.student_admission_details
 for each row execute function public.keep_student_number();

-- Server-only lookup. Never expose student email addresses through an anonymous
-- or authenticated browser RPC. Password verification still happens in Auth.
create function public.coaching_resolve_student_login(p_student_number text)
 returns text language plpgsql stable security definer set search_path='' as $function$
declare result text;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if p_student_number is null or p_student_number !~ '^[1-9][0-9]{9}$' then return null;end if;
 select u.email into result from public.student_admission_details a
 join public.profiles p on p.id=a.student_id and p.role='student' and p.account_status='active'
 join auth.users u on u.id=p.id
 where a.admission_roll=p_student_number;
 return result;
end;$function$;
revoke all on function public.coaching_resolve_student_login(text) from public,anon,authenticated;
grant execute on function public.coaching_resolve_student_login(text) to service_role;
