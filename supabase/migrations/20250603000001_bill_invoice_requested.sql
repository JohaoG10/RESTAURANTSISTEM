-- Facturación post-pago: marcar cuentas pagadas pendientes de factura

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS invoice_requested BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS bills_invoice_requested_idx
  ON public.bills (invoice_requested, paid_at DESC)
  WHERE deleted_at IS NULL
    AND status = 'paid'
    AND invoice_requested = true;

-- Al saldar una cuenta, queda pendiente de factura hasta que el cajero decida
CREATE OR REPLACE FUNCTION public.register_payment(
  p_bill_id UUID,
  p_method public.payment_method,
  p_amount NUMERIC,
  p_reference TEXT DEFAULT NULL
)
RETURNS public.bill_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill public.bills%ROWTYPE;
  v_paid_total NUMERIC(12, 2);
  v_new_status public.bill_status;
  v_active_shift_id UUID;
BEGIN
  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized to register payments';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT id INTO v_active_shift_id
  FROM public.cash_shifts
  WHERE closed_at IS NULL
  ORDER BY opened_at DESC
  LIMIT 1;

  SELECT * INTO v_bill
  FROM public.bills
  WHERE id = p_bill_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  IF v_active_shift_id IS NOT NULL THEN
    UPDATE public.orders
    SET cash_shift_id = v_active_shift_id
    WHERE id = v_bill.order_id
      AND cash_shift_id IS NULL;
  END IF;

  IF v_bill.status = 'draft' THEN
    v_new_status := public.advance_bill_status(p_bill_id, 'pending_payment');
    SELECT * INTO v_bill FROM public.bills WHERE id = p_bill_id;
  END IF;

  IF v_bill.status NOT IN ('pending_payment', 'partially_paid') THEN
    RAISE EXCEPTION 'Payments can only be added to bills awaiting payment';
  END IF;

  INSERT INTO public.payments (bill_id, method, amount, reference, created_by)
  VALUES (
    p_bill_id,
    p_method,
    ROUND(p_amount, 2),
    NULLIF(TRIM(COALESCE(p_reference, '')), ''),
    auth.uid()
  );

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_total
  FROM public.payments
  WHERE bill_id = p_bill_id;

  v_new_status := v_bill.status;

  IF ROUND(v_paid_total, 2) >= ROUND(v_bill.total, 2) THEN
    v_new_status := public.advance_bill_status(p_bill_id, 'paid');
    UPDATE public.bills
    SET invoice_requested = true
    WHERE id = p_bill_id;
    PERFORM public.try_close_order_if_fully_paid(v_bill.order_id);
  ELSIF v_paid_total > 0 AND v_bill.status = 'pending_payment' THEN
    v_new_status := public.advance_bill_status(p_bill_id, 'partially_paid');
  END IF;

  PERFORM public.write_audit_log(
    'payment', 'bills', p_bill_id,
    jsonb_build_object(
      'method', p_method,
      'amount', p_amount,
      'paid_total', v_paid_total,
      'bill_total', v_bill.total,
      'status', v_new_status,
      'cash_shift_id', v_active_shift_id
    )
  );

  RETURN v_new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_bill_invoice_request(p_bill_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.bills
  SET invoice_requested = false
  WHERE id = p_bill_id
    AND deleted_at IS NULL
    AND status = 'paid';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_bill_invoice_request(UUID) TO authenticated;
