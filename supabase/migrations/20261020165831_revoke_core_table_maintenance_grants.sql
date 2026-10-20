-- Browser roles read through RLS and mutate only through reviewed RPCs.
-- RLS does not govern TRUNCATE. These maintenance grants are never needed by the application.
revoke truncate,references,trigger on public.profiles,public.batches,public.enrollments from public,anon,authenticated;
