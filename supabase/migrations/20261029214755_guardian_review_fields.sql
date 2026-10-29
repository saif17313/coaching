-- Additive guardian review fields and the homepage testimonial carousel interval. Every new field is optional,
-- so all existing content stays valid. The reviewed 2026-10-22 schema function is kept intact under a new name
-- and this wrapper adds only the new properties (callers are plpgsql and resolve the name at run time).
alter function public.coaching_cms_field_schema(text,boolean) rename to coaching_cms_field_schema_20261022;
revoke all on function public.coaching_cms_field_schema_20261022(text,boolean) from public,anon,authenticated;

create function public.coaching_cms_field_schema(p_key text,p_item boolean)
returns jsonb language sql immutable set search_path='' as $$
 select case
  when p_key='REVIEWS_ITEMS' and p_item then pg_catalog.jsonb_set(base,'{properties}',(base->'properties')||$fields${
   "relationship":{"type":"string","title":"Relationship","enum":["","Father","Mother","Guardian","Parent","Student"],"maxLength":20},
   "studentContext":{"type":"string","title":"Student / class (only with consent)","maxLength":160,"pattern":"^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]*$"},
   "reviewDate":{"type":"string","title":"Review date","maxLength":10,"pattern":"^(|\\d{4}-\\d{2}-\\d{2})$"}}$fields$::jsonb)
  when p_key='HOME_TESTIMONIALS' and not p_item then pg_catalog.jsonb_set(base,'{properties}',(base->'properties')||$fields${
   "autoplaySeconds":{"type":"integer","title":"Seconds per review (carousel)","minimum":3,"maximum":20}}$fields$::jsonb)
  else base end
 from (select public.coaching_cms_field_schema_20261022(p_key,p_item) as base) s;
$$;
revoke all on function public.coaching_cms_field_schema(text,boolean) from public,anon,authenticated;
