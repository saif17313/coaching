-- Execute using Supabase SQL editor AFTER the Part A migration has been applied.
-- Read-only catalog assertions, no production data modifications.
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.batches') is null
     or to_regclass('public.enrollments') is null then
    raise exception 'Phase 1 base tables missing';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('profiles','batches','enrollments')
        and c.relrowsecurity) <> 3 then
    raise exception 'RLS missing on one or more core tables';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'SELECT') or
     has_table_privilege('anon', 'public.batches', 'SELECT') or
     has_table_privilege('anon', 'public.enrollments', 'SELECT') then
    raise exception 'Anonymous table read must be denied';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') or
     has_table_privilege('authenticated', 'public.enrollments', 'INSERT') or
     has_table_privilege('authenticated', 'public.enrollments', 'UPDATE') then
    raise exception 'Unsafe client mutation permission';
  end if;
  if not exists (select 1 from pg_trigger where tgname='auth_user_student_profile' and not tgisinternal) then
    raise exception 'Signup profile trigger missing';
  end if;
end $$;
