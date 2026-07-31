-- Reportes y caja: zona horaria, comandas cobradas, turno obligatorio para pagos

-- Meseros pueden consultar si hay turno abierto (solo lectura)
CREATE OR REPLACE FUNCTION public.get_active_cash_shift()
RETURNS public.cash_shifts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
BEGIN
  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE closed_at IS NULL
  ORDER BY opened_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_sales_report(p_report_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_total_billed NUMERIC(12, 2);
  v_orders_served INT;
  v_top_method TEXT;
  v_revenue JSONB;
  v_top_dishes JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_report_date IS NULL THEN
    p_report_date := (now() AT TIME ZONE 'America/Guayaquil')::DATE;
  END IF;

  v_start := (p_report_date::timestamp AT TIME ZONE 'America/Guayaquil');
  v_end := ((p_report_date + 1)::timestamp AT TIME ZONE 'America/Guayaquil');

  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_total_billed
  FROM public.payments p
  WHERE p.paid_at >= v_start AND p.paid_at < v_end;

  -- Comandas cobradas (mesas + para llevar)
  SELECT COUNT(DISTINCT o.id)::INT
  INTO v_orders_served
  FROM public.payments p
  JOIN public.bills b ON b.id = p.bill_id AND b.deleted_at IS NULL
  JOIN public.orders o ON o.id = b.order_id AND o.deleted_at IS NULL
  WHERE p.paid_at >= v_start AND p.paid_at < v_end;

  SELECT jsonb_build_object(
    'cash', COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount ELSE 0 END), 0),
    'card', COALESCE(SUM(CASE WHEN p.method = 'card' THEN p.amount ELSE 0 END), 0),
    'transfer', COALESCE(SUM(CASE WHEN p.method = 'transfer' THEN p.amount ELSE 0 END), 0)
  )
  INTO v_revenue
  FROM public.payments p
  WHERE p.paid_at >= v_start AND p.paid_at < v_end;

  SELECT m.method
  INTO v_top_method
  FROM (
    SELECT p.method, SUM(p.amount) AS total
    FROM public.payments p
    WHERE p.paid_at >= v_start AND p.paid_at < v_end
    GROUP BY p.method
    ORDER BY total DESC
    LIMIT 1
  ) m;

  SELECT COALESCE(jsonb_agg(row ORDER BY row ->> 'quantity' DESC), '[]'::jsonb)
  INTO v_top_dishes
  FROM (
    SELECT jsonb_build_object(
      'menu_item_id', oi.menu_item_id,
      'name', mi.name,
      'quantity', SUM(oi.quantity),
      'revenue', ROUND(SUM(oi.quantity * oi.price_at_order), 2)
    ) AS row
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id AND o.deleted_at IS NULL
    JOIN public.bills b ON b.order_id = o.id AND b.deleted_at IS NULL AND b.status = 'paid'
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.status <> 'cancelled'
      AND EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.bill_id = b.id
          AND p.paid_at >= v_start
          AND p.paid_at < v_end
      )
    GROUP BY oi.menu_item_id, mi.name
    ORDER BY SUM(oi.quantity) DESC
    LIMIT 5
  ) sub;

  RETURN jsonb_build_object(
    'report_date', p_report_date,
    'total_billed', ROUND(v_total_billed, 2),
    'tables_served', COALESCE(v_orders_served, 0),
    'top_payment_method', v_top_method,
    'revenue_by_method', v_revenue,
    'top_dishes', v_top_dishes
  );
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

  IF v_active_shift_id IS NULL THEN
    RAISE EXCEPTION 'No hay turno de caja abierto. Abre la caja en Reportes y caja antes de cobrar.';
  END IF;

  SELECT * INTO v_bill
  FROM public.bills
  WHERE id = p_bill_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  UPDATE public.orders
  SET cash_shift_id = v_active_shift_id
  WHERE id = v_bill.order_id
    AND cash_shift_id IS NULL;

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
