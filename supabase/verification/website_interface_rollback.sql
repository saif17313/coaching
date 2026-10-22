-- Run after the additive schema definition inside BEGIN/ROLLBACK.
do $$declare schema json:=public.coaching_cms_field_schema('GLOBAL_FOOTER',false)::json;begin
 if not extensions.jsonb_matches_schema(schema,'{"appearance":{"visualStyle":"premium","enableMotion":false},"interfaceLabels":{"dashboardButton":"My learning space"}}'::jsonb) then raise exception 'VALID_INTERFACE_DENIED';end if;
 if extensions.jsonb_matches_schema(schema,'{"appearance":{"css":"position:fixed"}}'::jsonb) or extensions.jsonb_matches_schema(schema,'{"interfaceLabels":{"dashboardButton":123}}'::jsonb) then raise exception 'UNSAFE_INTERFACE_ALLOWED';end if;
 if not extensions.jsonb_matches_schema(schema,'{}'::jsonb) then raise exception 'EXISTING_CONTENT_BROKEN';end if;
 raise notice 'PASS editable labels, bounded appearance and backward-compatible existing snapshots';
end;$$;
