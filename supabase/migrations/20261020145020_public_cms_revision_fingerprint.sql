-- One bounded anonymous poll covers published pages, dependencies and settings.
-- No draft revisions, private records or identity information are returned.
create function public.coaching_cms_public_fingerprint()
returns jsonb language sql stable security definer set search_path='' as $$
 with published as (
  select coalesce(pg_catalog.jsonb_object_agg(slug,published_revision),'{}'::jsonb) as pages
  from public.site_pages where status='published' and published_revision is not null
 ), settings as (select published_revision as revision from public.app_settings where id=1)
 select pg_catalog.jsonb_build_object('fingerprint',pg_catalog.md5(p.pages::text||coalesce(s.revision::text,'')),
  'pages',p.pages,'settingsRevision',s.revision) from published p left join settings s on true;
$$;
revoke all on function public.coaching_cms_public_fingerprint() from public,anon,authenticated;
grant execute on function public.coaching_cms_public_fingerprint() to anon,authenticated;
notify pgrst,'reload schema';
