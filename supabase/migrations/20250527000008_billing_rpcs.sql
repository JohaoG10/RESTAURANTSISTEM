-- RPCs de cobro: pre-cuenta, propina y pagos

CREATE OR REPLACE FUNCTION public.create_bill_from_order(
  p_order_id UUID,
  p_tip_percent NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_subtotal NUMERIC(12, 2);
  v_tip_percent NUMERIC(5, 2);
  v_tip_amount NUMERIC(12, 2);
  v_total NUMERIC(12, 2);
  v_bill_id UUID;
BEGIN
  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized to create bills';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status IN ('cancelled', 'closed') THEN
    RAISE EXCEPTION 'Cannot bill cancelled or closed order';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bills b
    WHERE b.order_id = p_order_id
      AND b.deleted_at IS NULL
      AND b.status NOT IN ('voided', 'refunded')
  ) THEN
    RAISE EXCEPTION 'Order already has an active bill';
  END IF;

  SELECT COALESCE(SUM(oi.quantity * oi.price_at_order), 0)
  INTO v_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Order has no billable items';
  END IF;

  IF p_tip_percent IS NULL THEN
    SELECT r.default_tip_percent
    INTO v_tip_percent
    FROM public.restaurants r
    ORDER BY r.created_at
    LIMIT 1;
  ELSE
    v_tip_percent := p_tip_percent;
  END IF;

  IF v_tip_percent IS NULL THEN
    v_tip_percent := 0;
  END IF;

  IF v_tip_percent < 0 OR v_tip_percent > 100 THEN
    RAISE EXCEPTION 'Tip percent must be between 0 and 100';
  END IF;

  v_tip_amount := ROUND(v_subtotal * v_tip_percent / 100, 2);
  v_total := v_subtotal + v_tip_amount;

  INSERT INTO public.bills (
    order_id,
    status,
    subtotal,
    tip_amount,
    tip_percent,
    total
  )
  VALUES (
    p_order_id,
    'draft',
    v_subtotal,
    v_tip_amount,
    v_tip_percent,
    v_total
  )
  RETURNING id INTO v_bill_id;

  INSERT INTO public.bill_items (bill_id, order_item_id)
  SELECT v_bill_id, oi.id
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  PERFORM public.write_audit_log(
    'create', 'bills', v_bill_id,
    jsonb_build_object('order_id', p_order_id, 'subtotal', v_subtotal, 'total', v_total)
  );

  RETURN v_bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bill_tip(
  p_bill_id UUID,
  p_tip_percent NUMERIC
)
RETURNS public.bills
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill public.bills%ROWTYPE;
  v_tip_amount NUMERIC(12, 2);
BEGIN
  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized to update bill tip';
  END IF;

  IF p_tip_percent < 0 OR p_tip_percent > 100 THEN
    RAISE EXCEPTION 'Tip percent must be between 0 and 100';
  END IF;

  SELECT * INTO v_bill
  FROM public.bills
  WHERE id = p_bill_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  IF v_bill.status <> 'draft' THEN
    RAISE EXCEPTION 'Tip can only be updated while bill is draft';
  END IF;

  v_tip_amount := ROUND(v_bill.subtotal * p_tip_percent / 100, 2);

  UPDATE public.bills
  SET
    tip_percent = p_tip_percent,
    tip_amount = v_tip_amount,
    total = subtotal + v_tip_amount
  WHERE id = p_bill_id
  RETURNING * INTO v_bill;

  RETURN v_bill;
END;
$$;

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
  v_order public.orders%ROWTYPE;
  v_paid_total NUMERIC(12, 2);
  v_new_status public.bill_status;
  v_has_active_orders BOOLEAN;
BEGIN
  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized to register payments';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT * INTO v_bill
  FROM public.bills
  WHERE id = p_bill_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  IF v_bill.status NOT IN ('pending_payment', 'partially_paid') THEN
    RAISE EXCEPTION 'Payments can only be added to bills awaiting payment';
  END IF;

  INSERT INTO public.payments (bill_id, method, amount, reference, created_by)
  VALUES (p_bill_id, p_method, p_amount, NULLIF(TRIM(p_reference), ''), auth.uid());

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_total
  FROM public.payments
  WHERE bill_id = p_bill_id;

  v_new_status := v_bill.status;

  IF v_paid_total >= v_bill.total THEN
    v_new_status := public.advance_bill_status(p_bill_id, 'paid');

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_bill.order_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF FOUND AND v_order.status <> 'cancelled' THEN
      UPDATE public.orders
      SET status = 'closed', closed_at = now()
      WHERE id = v_order.id
        AND status <> 'closed';

      SELECT EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.table_id = v_order.table_id
          AND o.deleted_at IS NULL
          AND o.status IN ('draft', 'open', 'in_progress', 'ready', 'served')
      )
      INTO v_has_active_orders;

      UPDATE public.restaurant_tables
      SET status = CASE WHEN v_has_active_orders THEN 'occupied' ELSE 'available' END
      WHERE id = v_order.table_id;
    END IF;
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
      'status', v_new_status
    )
  );

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bill_from_order(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_bill_tip(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_payment(UUID, public.payment_method, NUMERIC, TEXT) TO authenticated;
