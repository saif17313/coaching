-- Local only: missing announcement lifecycle mutations. Student visibility remains RLS-published-only.
CREATE FUNCTION public.coaching_edit_announcement_draft(
 p_announcement_id uuid,p_title text,p_body text,p_visible_from timestamptz,p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=(select auth.uid());v_prior record;v_payload jsonb;v_result jsonb;v_batch uuid;v_status text;v_archived boolean;
BEGIN
 IF v_actor IS NULL OR NOT public.current_user_is_teacher() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_announcement_id IS NULL OR p_operation_id IS NULL OR p_title IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_title)) NOT BETWEEN 2 AND 160 OR p_title ~ '[[:cntrl:]]'
  OR p_body IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_body)) NOT BETWEEN 2 AND 10000 OR pg_catalog.translate(p_body,pg_catalog.chr(10)||pg_catalog.chr(13),'') ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'INVALID_ANNOUNCEMENT'; END IF;
 v_payload:=pg_catalog.jsonb_build_object('id',p_announcement_id,'title',pg_catalog.btrim(p_title),'body',pg_catalog.btrim(p_body),'visibleFrom',p_visible_from);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 SELECT operation_type,payload,result INTO v_prior FROM public.coaching_mutation_receipts WHERE actor_id=v_actor AND operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
   IF v_prior.operation_type<>'resources.announcement.draft.edited' OR v_prior.payload<>v_payload THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN v_prior.result;
 END IF;
 SELECT batch_id,status INTO v_batch,v_status FROM public.announcements WHERE id=p_announcement_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ANNOUNCEMENT_NOT_FOUND'; END IF;
 SELECT is_archived INTO v_archived FROM public.batches WHERE id=v_batch FOR UPDATE;
 IF NOT FOUND OR v_archived THEN RAISE EXCEPTION 'BATCH_UNAVAILABLE'; END IF;
 SELECT status INTO v_status FROM public.announcements WHERE id=p_announcement_id FOR UPDATE;
 IF v_status<>'draft' THEN RAISE EXCEPTION 'EDIT_REQUIRES_DRAFT'; END IF;
 UPDATE public.announcements SET title=pg_catalog.btrim(p_title),body=pg_catalog.btrim(p_body),visible_from=p_visible_from,updated_at=now() WHERE id=p_announcement_id;
 v_result:=pg_catalog.jsonb_build_object('id',p_announcement_id,'batchId',v_batch,'status','draft','title',pg_catalog.btrim(p_title));
 INSERT INTO public.audit_logs(actor_id,action,entity_id,details) VALUES(v_actor,'resources.announcement.draft.edited',p_announcement_id,v_payload);
 INSERT INTO public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) VALUES(v_actor,p_operation_id,'resources.announcement.draft.edited',v_payload,v_result);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.coaching_edit_announcement_draft(uuid,text,text,timestamptz,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coaching_edit_announcement_draft(uuid,text,text,timestamptz,uuid) TO authenticated;

CREATE FUNCTION public.coaching_archive_announcement(p_announcement_id uuid,p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=(select auth.uid());v_prior record;v_payload jsonb;v_result jsonb;v_batch uuid;v_status text;
BEGIN
 IF v_actor IS NULL OR NOT public.current_user_is_teacher() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_announcement_id IS NULL OR p_operation_id IS NULL THEN RAISE EXCEPTION 'INVALID_ANNOUNCEMENT'; END IF;
 v_payload:=pg_catalog.jsonb_build_object('id',p_announcement_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 SELECT operation_type,payload,result INTO v_prior FROM public.coaching_mutation_receipts WHERE actor_id=v_actor AND operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
   IF v_prior.operation_type<>'resources.announcement.archived' OR v_prior.payload<>v_payload THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN v_prior.result;
 END IF;
 SELECT batch_id,status INTO v_batch,v_status FROM public.announcements WHERE id=p_announcement_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ANNOUNCEMENT_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.batches WHERE id=v_batch FOR UPDATE;
 SELECT status INTO v_status FROM public.announcements WHERE id=p_announcement_id FOR UPDATE;
 IF v_status NOT IN ('draft','published') THEN RAISE EXCEPTION 'ALREADY_ARCHIVED'; END IF;
 UPDATE public.announcements SET status='archived',updated_at=now() WHERE id=p_announcement_id;
 v_result:=pg_catalog.jsonb_build_object('id',p_announcement_id,'status','archived');
 INSERT INTO public.audit_logs(actor_id,action,entity_id,details) VALUES(v_actor,'resources.announcement.archived',p_announcement_id,v_payload);
 INSERT INTO public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) VALUES(v_actor,p_operation_id,'resources.announcement.archived',v_payload,v_result);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.coaching_archive_announcement(uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coaching_archive_announcement(uuid,uuid) TO authenticated;
