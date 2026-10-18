-- Part K / LOCAL FIRST: immutable office expense journal, reversible entries and reconciled reports.
-- Business date is informational; financial statement is based on POSTED UTC timestamps.
-- Existing migrations are not edited. No cloud SQL or direct client DML.
CREATE TABLE public.office_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
 expense_on date NOT NULL,
 category text NOT NULL CHECK (category IN ('rent','salary','utilities','supplies','maintenance','marketing','other')),
 payee text NOT NULL CHECK (char_length(btrim(payee)) BETWEEN 2 AND 120),
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes)<=500),
 amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 100000000000),
 method text NOT NULL CHECK (method IN ('cash','bank','mobile_banking')),
 reference text NOT NULL DEFAULT '' CHECK (char_length(reference)<=120),
 operation_id uuid NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX office_expenses_batch_posted_idx ON public.office_expenses(batch_id,created_at DESC,id);
CREATE TABLE public.office_expense_reversals (
 expense_id uuid PRIMARY KEY REFERENCES public.office_expenses(id) ON DELETE RESTRICT,
 reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
 operation_id uuid NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX office_expense_reversals_created_idx ON public.office_expense_reversals(created_at DESC);
ALTER TABLE public.office_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_expense_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY office_expenses_teacher_read ON public.office_expenses FOR SELECT TO authenticated USING ((select public.current_user_is_teacher()));
CREATE POLICY office_expense_reversals_teacher_read ON public.office_expense_reversals FOR SELECT TO authenticated USING ((select public.current_user_is_teacher()));
REVOKE ALL ON public.office_expenses,public.office_expense_reversals FROM anon,authenticated;
GRANT SELECT ON public.office_expenses,public.office_expense_reversals TO authenticated;

CREATE FUNCTION public.coaching_record_office_expense(
 p_batch_id uuid,p_expense_on date,p_category text,p_payee text,p_notes text,
 p_amount_minor bigint,p_method text,p_reference text,p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=(select auth.uid()); v_prior record; v_payload jsonb; v_result jsonb; v_id uuid; v_archived boolean;
BEGIN
 IF v_actor IS NULL OR NOT public.current_user_is_teacher() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_batch_id IS NULL OR p_operation_id IS NULL OR p_expense_on IS NULL OR p_expense_on NOT BETWEEN '2000-01-01'::date AND '2100-12-31'::date
    OR p_category IS NULL OR p_category NOT IN ('rent','salary','utilities','supplies','maintenance','marketing','other')
    OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 100000000000 OR p_method IS NULL OR p_method NOT IN ('cash','bank','mobile_banking')
    OR p_payee IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_payee)) NOT BETWEEN 2 AND 120 OR p_payee ~ '[[:cntrl:]]'
    OR p_notes IS NULL OR pg_catalog.char_length(p_notes)>500 OR pg_catalog.translate(p_notes,pg_catalog.chr(10)||pg_catalog.chr(13),'') ~ '[[:cntrl:]]'
    OR p_reference IS NULL OR pg_catalog.char_length(p_reference)>120 OR p_reference ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'INVALID_EXPENSE'; END IF;
 v_payload:=pg_catalog.jsonb_build_object('batchId',p_batch_id,'expenseOn',p_expense_on,'category',p_category,'payee',pg_catalog.btrim(p_payee),
  'notes',pg_catalog.btrim(p_notes),'amountMinor',p_amount_minor,'method',p_method,'reference',pg_catalog.btrim(p_reference));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 SELECT operation_type,payload,result INTO v_prior FROM public.coaching_mutation_receipts WHERE actor_id=v_actor AND operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  IF v_prior.operation_type<>'office.expense.recorded' OR v_prior.payload<>v_payload THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN v_prior.result;
 END IF;
 SELECT is_archived INTO v_archived FROM public.batches WHERE id=p_batch_id FOR UPDATE;
 IF NOT FOUND OR v_archived THEN RAISE EXCEPTION 'BATCH_UNAVAILABLE'; END IF;
 INSERT INTO public.office_expenses(batch_id,expense_on,category,payee,notes,amount_minor,method,reference,operation_id,created_by)
 VALUES(p_batch_id,p_expense_on,p_category,pg_catalog.btrim(p_payee),pg_catalog.btrim(p_notes),p_amount_minor,p_method,pg_catalog.btrim(p_reference),p_operation_id,v_actor)
 RETURNING id INTO v_id;
 v_result:=pg_catalog.jsonb_build_object('id',v_id,'batchId',p_batch_id,'amountMinor',p_amount_minor,'category',p_category,'expenseOn',p_expense_on,'reversed',false);
 INSERT INTO public.audit_logs(actor_id,action,entity_id,details) VALUES(v_actor,'office.expense.recorded',v_id,v_payload);
 INSERT INTO public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) VALUES(v_actor,p_operation_id,'office.expense.recorded',v_payload,v_result);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.coaching_record_office_expense(uuid,date,text,text,text,bigint,text,text,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coaching_record_office_expense(uuid,date,text,text,text,bigint,text,text,uuid) TO authenticated;

CREATE FUNCTION public.coaching_reverse_office_expense(p_expense_id uuid,p_reason text,p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=(select auth.uid()); v_prior record; v_payload jsonb; v_result jsonb; v_exp public.office_expenses%rowtype;
BEGIN
 IF v_actor IS NULL OR NOT public.current_user_is_teacher() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_expense_id IS NULL OR p_operation_id IS NULL OR p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 5 AND 500 OR p_reason ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'INVALID_REVERSAL'; END IF;
 v_payload:=pg_catalog.jsonb_build_object('expenseId',p_expense_id,'reason',pg_catalog.btrim(p_reason));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text),pg_catalog.hashtext(p_operation_id::text));
 SELECT operation_type,payload,result INTO v_prior FROM public.coaching_mutation_receipts WHERE actor_id=v_actor AND operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  IF v_prior.operation_type<>'office.expense.reversed' OR v_prior.payload<>v_payload THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN v_prior.result;
 END IF;
 SELECT * INTO v_exp FROM public.office_expenses WHERE id=p_expense_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXPENSE_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.batches WHERE id=v_exp.batch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_UNAVAILABLE'; END IF;
 SELECT * INTO v_exp FROM public.office_expenses WHERE id=p_expense_id FOR UPDATE;
 IF EXISTS (SELECT 1 FROM public.office_expense_reversals WHERE expense_id=p_expense_id) THEN RAISE EXCEPTION 'ALREADY_REVERSED'; END IF;
 INSERT INTO public.office_expense_reversals(expense_id,reason,operation_id,created_by) VALUES(p_expense_id,pg_catalog.btrim(p_reason),p_operation_id,v_actor);
 v_result:=pg_catalog.jsonb_build_object('id',p_expense_id,'batchId',v_exp.batch_id,'amountMinor',v_exp.amount_minor,'reversed',true);
 INSERT INTO public.audit_logs(actor_id,action,entity_id,details) VALUES(v_actor,'office.expense.reversed',p_expense_id,v_payload);
 INSERT INTO public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) VALUES(v_actor,p_operation_id,'office.expense.reversed',v_payload,v_result);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.coaching_reverse_office_expense(uuid,text,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coaching_reverse_office_expense(uuid,text,uuid) TO authenticated;

CREATE FUNCTION public.coaching_list_office_expenses(p_batch_id uuid,p_period text,p_limit integer,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_start timestamptz; v_end timestamptz; v_total integer; v_items jsonb;
BEGIN
 IF (select auth.uid()) IS NULL OR NOT public.current_user_is_teacher() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_batch_id IS NULL OR p_period IS NULL OR p_period !~ '^(20[0-9]{2})-(0[1-9]|1[0-2])$'
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.batches WHERE id=p_batch_id) THEN RAISE EXCEPTION 'BATCH_NOT_FOUND'; END IF;
 v_start:=((p_period||'-01')::date::timestamp AT TIME ZONE 'UTC');
 v_end:=(((p_period||'-01')::date + interval '1 month')::timestamp AT TIME ZONE 'UTC');
 SELECT count(*) INTO v_total FROM public.office_expenses x WHERE x.batch_id=p_batch_id AND x.created_at>=v_start AND x.created_at<v_end;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',x.id,'batchId',x.batch_id,'expenseOn',x.expense_on,
    'amountMinor',x.amount_minor,'category',x.category,'payee',x.payee,'notes',x.notes,'method',x.method,'reference',x.reference,
    'createdAt',x.created_at,'reversed',r.expense_id IS NOT NULL) ORDER BY x.created_at DESC,x.id),'[]'::jsonb)
 INTO v_items FROM (SELECT * FROM public.office_expenses
  WHERE batch_id=p_batch_id AND created_at>=v_start AND created_at<v_end ORDER BY created_at DESC,id LIMIT p_limit OFFSET p_offset) x
 LEFT JOIN public.office_expense_reversals r ON r.expense_id=x.id;
 RETURN pg_catalog.jsonb_build_object('period',p_period,'batchId',p_batch_id,'total',v_total,'items',v_items);
END $$;
REVOKE ALL ON FUNCTION public.coaching_list_office_expenses(uuid,text,integer,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coaching_list_office_expenses(uuid,text,integer,integer) TO authenticated;

CREATE FUNCTION public.coaching_get_office_expense(p_expense_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb;
BEGIN
 IF (select auth.uid()) IS NULL OR NOT public.current_user_is_teacher() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT pg_catalog.jsonb_build_object('id',x.id,'batchId',x.batch_id,'expenseOn',x.expense_on,'amountMinor',x.amount_minor,
  'category',x.category,'payee',x.payee,'notes',x.notes,'method',x.method,'reference',x.reference,'createdAt',x.created_at,
  'reversed',r.expense_id IS NOT NULL,'reversalReason',r.reason)
 INTO v FROM public.office_expenses x LEFT JOIN public.office_expense_reversals r ON r.expense_id=x.id WHERE x.id=p_expense_id;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.coaching_get_office_expense(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coaching_get_office_expense(uuid) TO authenticated;

-- One stable PostgreSQL snapshot for complete month export; more than 1000 must be explicitly rejected by HTTP.
CREATE FUNCTION public.coaching_export_office_expenses(p_batch_id uuid,p_period text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_start timestamptz;v_end timestamptz;v_total integer;v_items jsonb;
BEGIN
 IF (select auth.uid()) IS NULL OR NOT public.current_user_is_teacher() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_batch_id IS NULL OR p_period IS NULL OR p_period !~ '^(20[0-9]{2})-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.batches WHERE id=p_batch_id) THEN RAISE EXCEPTION 'BATCH_NOT_FOUND'; END IF;
 v_start:=((p_period||'-01')::date::timestamp AT TIME ZONE 'UTC');
 v_end:=(((p_period||'-01')::date + interval '1 month')::timestamp AT TIME ZONE 'UTC');
 SELECT count(*) INTO v_total FROM public.office_expenses x WHERE x.batch_id=p_batch_id AND x.created_at>=v_start AND x.created_at<v_end;
 IF v_total>1000 THEN RETURN pg_catalog.jsonb_build_object('period',p_period,'batchId',p_batch_id,'total',v_total,'items','[]'::jsonb); END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',x.id,'batchId',x.batch_id,'expenseOn',x.expense_on,
    'amountMinor',x.amount_minor,'category',x.category,'payee',x.payee,'notes',x.notes,'method',x.method,'reference',x.reference,
    'createdAt',x.created_at,'reversed',r.expense_id IS NOT NULL) ORDER BY x.created_at DESC,x.id),'[]'::jsonb)
 INTO v_items FROM public.office_expenses x LEFT JOIN public.office_expense_reversals r ON r.expense_id=x.id
 WHERE x.batch_id=p_batch_id AND x.created_at>=v_start AND x.created_at<v_end;
 RETURN pg_catalog.jsonb_build_object('period',p_period,'batchId',p_batch_id,'total',v_total,'items',v_items);
END $$;
REVOKE ALL ON FUNCTION public.coaching_export_office_expenses(uuid,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coaching_export_office_expenses(uuid,text) TO authenticated;

-- Posted-period cashflow, not accrual profit. Billed and waivers are memo-only.
-- Numeric aggregates encoded as strings to prevent JavaScript integer truncation.
CREATE FUNCTION public.coaching_office_cashflow_statement(p_batch_id uuid,p_period text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_start timestamptz;v_end timestamptz;v_paid numeric;v_ref numeric;v_waiv numeric;v_billed numeric;v_exp numeric;v_rev numeric;v_count bigint;
BEGIN
 IF (select auth.uid()) IS NULL OR NOT public.current_user_is_teacher() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_batch_id IS NULL OR p_period IS NULL OR p_period !~ '^(20[0-9]{2})-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.batches WHERE id=p_batch_id) THEN RAISE EXCEPTION 'BATCH_NOT_FOUND'; END IF;
 v_start:=((p_period||'-01')::date::timestamp AT TIME ZONE 'UTC');v_end:=(((p_period||'-01')::date + interval '1 month')::timestamp AT TIME ZONE 'UTC');
 SELECT coalesce(sum(p.amount_minor),0),count(*) INTO v_paid,v_count FROM public.payments p JOIN public.monthly_dues d ON d.id=p.due_id
 WHERE d.batch_id=p_batch_id AND p.created_at>=v_start AND p.created_at<v_end;
 SELECT coalesce(sum(a.amount_minor),0) INTO v_ref FROM public.payment_adjustments a JOIN public.monthly_dues d ON d.id=a.due_id
 WHERE d.batch_id=p_batch_id AND a.kind='refund' AND a.created_at>=v_start AND a.created_at<v_end;
 SELECT coalesce(sum(a.amount_minor),0) INTO v_waiv FROM public.payment_adjustments a JOIN public.monthly_dues d ON d.id=a.due_id
 WHERE d.batch_id=p_batch_id AND a.kind='waiver' AND a.created_at>=v_start AND a.created_at<v_end;
 SELECT coalesce(sum(d.amount_minor),0) INTO v_billed FROM public.monthly_dues d WHERE d.batch_id=p_batch_id AND d.bill_period=p_period;
 SELECT coalesce(sum(x.amount_minor),0) INTO v_exp FROM public.office_expenses x WHERE x.batch_id=p_batch_id AND x.created_at>=v_start AND x.created_at<v_end;
 SELECT coalesce(sum(x.amount_minor),0) INTO v_rev FROM public.office_expense_reversals r JOIN public.office_expenses x ON x.id=r.expense_id
 WHERE x.batch_id=p_batch_id AND r.created_at>=v_start AND r.created_at<v_end;
 RETURN pg_catalog.jsonb_build_object('batchId',p_batch_id,'period',p_period,'currency','BDT','unit','paisa','basis','posted_utc',
 'grossCollectionsMinor',v_paid::text,'refundsMinor',v_ref::text,'netCollectionsMinor',(v_paid-v_ref)::text,
 'grossExpensesMinor',v_exp::text,'reversedExpensesMinor',v_rev::text,'netExpensesMinor',(v_exp-v_rev)::text,
 'netCashFlowMinor',(v_paid-v_ref-v_exp+v_rev)::text,'waiversMemoMinor',v_waiv::text,
 'billedMemoMinor',v_billed::text,'paymentCount',v_count);
END $$;
REVOKE ALL ON FUNCTION public.coaching_office_cashflow_statement(uuid,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coaching_office_cashflow_statement(uuid,text) TO authenticated;
