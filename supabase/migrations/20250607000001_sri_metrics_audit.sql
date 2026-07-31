-- SRI: métricas, auditoría desde Edge Functions, RPC dashboard

-- Auditoría con user_id explícito (Edge Functions con service role)
CREATE OR REPLACE FUNCTION public.write_audit_log_for_user(
  p_user_id UUID,
  p_action public.audit_action,
  p_entity TEXT,
  p_entity_id UUID,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, metadata)
  VALUES (p_user_id, p_action, p_entity, p_entity_id, COALESCE(p_metadata, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_audit_log_for_user(UUID, public.audit_action, TEXT, UUID, JSONB) TO service_role;

-- Métricas agregadas para dashboard SRI
CREATE OR REPLACE FUNCTION public.get_sri_invoice_metrics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start TIMESTAMPTZ := date_trunc('day', now());
  v_month_start TIMESTAMPTZ := date_trunc('month', now());
  v_today_count BIGINT;
  v_month_count BIGINT;
  v_month_authorized BIGINT;
  v_month_rejected BIGINT;
  v_pending_count BIGINT;
  v_rejected_unreissued BIGINT;
  v_avg_auth_seconds NUMERIC;
  v_last_invoice JSONB;
  v_cert_expires TIMESTAMPTZ;
  v_cert_days_left INT;
BEGIN
  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_today_count
  FROM public.invoices
  WHERE deleted_at IS NULL
    AND created_at >= v_today_start
    AND sri_status NOT IN ('draft', 'error');

  SELECT COUNT(*) INTO v_month_count
  FROM public.invoices
  WHERE deleted_at IS NULL
    AND created_at >= v_month_start
    AND sri_status NOT IN ('draft', 'error');

  SELECT COUNT(*) INTO v_month_authorized
  FROM public.invoices
  WHERE deleted_at IS NULL
    AND created_at >= v_month_start
    AND sri_status = 'authorized';

  SELECT COUNT(*) INTO v_month_rejected
  FROM public.invoices
  WHERE deleted_at IS NULL
    AND created_at >= v_month_start
    AND sri_status = 'rejected';

  SELECT COUNT(*) INTO v_pending_count
  FROM public.invoices
  WHERE deleted_at IS NULL
    AND sri_status IN ('submitted', 'received');

  -- Rechazadas cuyo bill no tiene factura autorizada posterior
  SELECT COUNT(*) INTO v_rejected_unreissued
  FROM public.invoices i
  WHERE i.deleted_at IS NULL
    AND i.sri_status = 'rejected'
    AND NOT EXISTS (
      SELECT 1 FROM public.invoices a
      WHERE a.bill_id = i.bill_id
        AND a.deleted_at IS NULL
        AND a.sri_status = 'authorized'
        AND a.created_at > i.created_at
    );

  SELECT AVG(EXTRACT(EPOCH FROM (authorized_at - created_at)))
  INTO v_avg_auth_seconds
  FROM public.invoices
  WHERE deleted_at IS NULL
    AND sri_status = 'authorized'
    AND authorized_at IS NOT NULL
    AND created_at >= v_month_start;

  SELECT jsonb_build_object(
    'id', i.id,
    'customer_name', i.customer_name,
    'access_key', i.access_key,
    'authorized_at', i.authorized_at,
    'created_at', i.created_at,
    'sri_response', i.sri_response,
    'sri_status', i.sri_status
  )
  INTO v_last_invoice
  FROM public.invoices i
  WHERE i.deleted_at IS NULL
    AND i.sri_status NOT IN ('draft')
  ORDER BY i.created_at DESC
  LIMIT 1;

  SELECT sri_cert_expires_at INTO v_cert_expires
  FROM public.restaurants
  LIMIT 1;

  IF v_cert_expires IS NOT NULL THEN
    v_cert_days_left := (v_cert_expires::date - CURRENT_DATE);
  END IF;

  RETURN jsonb_build_object(
    'todayCount', COALESCE(v_today_count, 0),
    'monthCount', COALESCE(v_month_count, 0),
    'monthAuthorized', COALESCE(v_month_authorized, 0),
    'monthRejected', COALESCE(v_month_rejected, 0),
    'successRate',
      CASE
        WHEN COALESCE(v_month_authorized, 0) + COALESCE(v_month_rejected, 0) = 0 THEN NULL
        ELSE ROUND(
          100.0 * v_month_authorized
          / (v_month_authorized + v_month_rejected),
          1
        )
      END,
    'pendingCount', COALESCE(v_pending_count, 0),
    'rejectedUnreissued', COALESCE(v_rejected_unreissued, 0),
    'avgAuthSeconds', ROUND(COALESCE(v_avg_auth_seconds, 0)::numeric, 1),
    'lastInvoice', v_last_invoice,
    'certExpiresAt', v_cert_expires,
    'certDaysLeft', v_cert_days_left
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sri_invoice_metrics() TO authenticated;

-- Eventos de factura con filtro por tipo métrico (payload->>'eventType')
CREATE OR REPLACE FUNCTION public.fetch_invoice_audit_events(
  p_status_filter TEXT DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS SETOF public.invoice_events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ie.*
  FROM public.invoice_events ie
  JOIN public.invoices i ON i.id = ie.invoice_id
  WHERE i.deleted_at IS NULL
    AND public.is_admin()
    AND (
      p_status_filter IS NULL
      OR ie.to_status::text = p_status_filter
      OR ie.payload->>'eventType' = p_status_filter
    )
  ORDER BY ie.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;

GRANT EXECUTE ON FUNCTION public.fetch_invoice_audit_events(TEXT, INT) TO authenticated;
