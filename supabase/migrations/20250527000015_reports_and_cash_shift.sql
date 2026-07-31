-- Reportes diarios y apertura/cierre de caja

ALTER TABLE public.cash_shifts
ADD COLUMN IF NOT EXISTS expected_cash_amount NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS cash_sales NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS card_sales NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS transfer_sales NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS total_sales NUMERIC(12, 2);

CREATE OR REPLACE FUNCTION public._payments_in_shift(p_shift_id UUID)
RETURNS SETOF public.payments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM public.payments p
  JOIN public.bills b ON b.id = p.bill_id AND b.deleted_at IS NULL
  JOIN public.orders o ON o.id = b.order_id AND o.deleted_at IS NULL
  JOIN public.cash_shifts cs ON cs.id = p_shift_id
  WHERE (
    o.cash_shift_id = p_shift_id
    OR (
      o.cash_shift_id IS NULL
      AND p.paid_at >= cs.opened_at
      AND (cs.closed_at IS NULL OR p.paid_at <= cs.closed_at)
    )
  );
$$;

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
  IF NOT public.is_admin() THEN
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

CREATE OR REPLACE FUNCTION public.open_cash_shift(p_opening_amount NUMERIC)
RETURNS public.cash_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_opening_amount IS NULL OR p_opening_amount < 0 THEN
    RAISE EXCEPTION 'Opening amount must be zero or greater';
  END IF;

  IF EXISTS (SELECT 1 FROM public.cash_shifts WHERE closed_at IS NULL) THEN
    RAISE EXCEPTION 'There is already an open cash shift';
  END IF;

  INSERT INTO public.cash_shifts (opened_by, opening_amount)
  VALUES (auth.uid(), ROUND(p_opening_amount, 2))
  RETURNING * INTO v_shift;

  PERFORM public.write_audit_log(
    'create', 'cash_shifts', v_shift.id,
    jsonb_build_object('opening_amount', v_shift.opening_amount)
  );

  RETURN v_shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_shift(
  p_declared_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.cash_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
  v_cash_sales NUMERIC(12, 2) := 0;
  v_card_sales NUMERIC(12, 2) := 0;
  v_transfer_sales NUMERIC(12, 2) := 0;
  v_total_sales NUMERIC(12, 2) := 0;
  v_expected_cash NUMERIC(12, 2);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_declared_amount IS NULL OR p_declared_amount < 0 THEN
    RAISE EXCEPTION 'Declared amount must be zero or greater';
  END IF;

  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE closed_at IS NULL
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open cash shift to close';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.method = 'card' THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.method = 'transfer' THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(p.amount), 0)
  INTO v_cash_sales, v_card_sales, v_transfer_sales, v_total_sales
  FROM public._payments_in_shift(v_shift.id) p;

  v_expected_cash := ROUND(v_shift.opening_amount + v_cash_sales, 2);

  UPDATE public.cash_shifts
  SET
    closed_at = now(),
    closed_by = auth.uid(),
    closing_amount = ROUND(p_declared_amount, 2),
    expected_cash_amount = v_expected_cash,
    cash_sales = ROUND(v_cash_sales, 2),
    card_sales = ROUND(v_card_sales, 2),
    transfer_sales = ROUND(v_transfer_sales, 2),
    total_sales = ROUND(v_total_sales, 2),
    notes = NULLIF(TRIM(COALESCE(p_notes, '')), '')
  WHERE id = v_shift.id
  RETURNING * INTO v_shift;

  PERFORM public.write_audit_log(
    'update', 'cash_shifts', v_shift.id,
    jsonb_build_object(
      'declared', v_shift.closing_amount,
      'expected_cash', v_shift.expected_cash_amount,
      'cash_sales', v_shift.cash_sales,
      'total_sales', v_shift.total_sales
    )
  );

  RETURN v_shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_cash_shifts(p_limit INT DEFAULT 30)
RETURNS SETOF public.cash_shifts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.cash_shifts
  ORDER BY opened_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shift_live_summary(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
  v_cash_sales NUMERIC(12, 2);
  v_card_sales NUMERIC(12, 2);
  v_transfer_sales NUMERIC(12, 2);
  v_total_sales NUMERIC(12, 2);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_shift FROM public.cash_shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash shift not found';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.method = 'card' THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.method = 'transfer' THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(p.amount), 0)
  INTO v_cash_sales, v_card_sales, v_transfer_sales, v_total_sales
  FROM public._payments_in_shift(p_shift_id) p;

  RETURN jsonb_build_object(
    'opening_amount', v_shift.opening_amount,
    'cash_sales', ROUND(v_cash_sales, 2),
    'card_sales', ROUND(v_card_sales, 2),
    'transfer_sales', ROUND(v_transfer_sales, 2),
    'total_sales', ROUND(v_total_sales, 2),
    'expected_cash', ROUND(v_shift.opening_amount + v_cash_sales, 2),
    'is_open', v_shift.closed_at IS NULL
  );
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
  v_tables_served INT;
  v_top_method TEXT;
  v_revenue JSONB;
  v_top_dishes JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_report_date IS NULL THEN
    p_report_date := CURRENT_DATE;
  END IF;

  v_start := p_report_date::TIMESTAMPTZ;
  v_end := (p_report_date + 1)::TIMESTAMPTZ;

  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_total_billed
  FROM public.payments p
  WHERE p.paid_at >= v_start AND p.paid_at < v_end;

  SELECT COUNT(DISTINCT o.table_id)::INT
  INTO v_tables_served
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
    'tables_served', COALESCE(v_tables_served, 0),
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

GRANT EXECUTE ON FUNCTION public.get_active_cash_shift() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_shift(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_shift(NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_cash_shifts(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shift_live_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_sales_report(DATE) TO authenticated;
