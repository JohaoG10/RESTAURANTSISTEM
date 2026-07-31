-- División de cuenta, propina 0% por defecto y cierre de comanda solo al pagar todo

ALTER TABLE public.bills
ADD COLUMN IF NOT EXISTS split_group_id UUID,
ADD COLUMN IF NOT EXISTS split_label TEXT,
ADD COLUMN IF NOT EXISTS split_mode TEXT;

ALTER TABLE public.bill_items
ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;

ALTER TABLE public.bill_items
DROP CONSTRAINT IF EXISTS bill_items_quantity_positive;

ALTER TABLE public.bill_items
ADD CONSTRAINT bill_items_quantity_positive CHECK (quantity > 0);

ALTER TABLE public.bills
DROP CONSTRAINT IF EXISTS bills_split_mode_check;

ALTER TABLE public.bills
ADD CONSTRAINT bills_split_mode_check
CHECK (split_mode IS NULL OR split_mode IN ('full', 'equal', 'items'));

CREATE INDEX IF NOT EXISTS bills_split_group_idx
ON public.bills (split_group_id)
WHERE split_group_id IS NOT NULL;

UPDATE public.bill_items bi
SET quantity = oi.quantity
FROM public.order_items oi
WHERE oi.id = bi.order_item_id
  AND bi.quantity = 1;

-- Cierra comanda y sincroniza mesa solo cuando todas las cuentas activas están pagadas
CREATE OR REPLACE FUNCTION public.try_close_order_if_fully_paid(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_unpaid_count INT;
  v_has_active_orders BOOLEAN;
BEGIN
  SELECT COUNT(*)::INT
  INTO v_unpaid_count
  FROM public.bills b
  WHERE b.order_id = p_order_id
    AND b.deleted_at IS NULL
    AND b.status NOT IN ('paid', 'voided', 'refunded');

  IF v_unpaid_count > 0 THEN
    RETURN false;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND OR v_order.status IN ('cancelled', 'closed') THEN
    RETURN false;
  END IF;

  UPDATE public.orders
  SET status = 'closed', closed_at = now()
  WHERE id = p_order_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.table_id = v_order.table_id
      AND o.deleted_at IS NULL
      AND o.status IN ('draft', 'open', 'in_progress', 'ready', 'served')
  )
  INTO v_has_active_orders;

  UPDATE public.restaurant_tables
  SET status = (CASE WHEN v_has_active_orders THEN 'occupied' ELSE 'available' END)::public.table_status
  WHERE id = v_order.table_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.order_has_active_bills(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bills b
    WHERE b.order_id = p_order_id
      AND b.deleted_at IS NULL
      AND b.status NOT IN ('voided', 'refunded')
  );
$$;

CREATE OR REPLACE FUNCTION public.update_table_status(
  p_table_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.restaurant_tables
  SET status = p_status::public.table_status
  WHERE id = p_table_id;
END;
$$;

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

  IF public.order_has_active_bills(p_order_id) THEN
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

  v_tip_percent := COALESCE(p_tip_percent, 0);

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
    total,
    split_mode
  )
  VALUES (
    p_order_id,
    'draft',
    v_subtotal,
    v_tip_amount,
    v_tip_percent,
    v_total,
    'full'
  )
  RETURNING id INTO v_bill_id;

  INSERT INTO public.bill_items (bill_id, order_item_id, quantity)
  SELECT v_bill_id, oi.id, oi.quantity
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  PERFORM public.write_audit_log(
    'create', 'bills', v_bill_id,
    jsonb_build_object('order_id', p_order_id, 'split_mode', 'full', 'total', v_total)
  );

  RETURN v_bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_equal_split_bills(
  p_order_id UUID,
  p_parts INT,
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
  v_tip_total NUMERIC(12, 2);
  v_split_group_id UUID := gen_random_uuid();
  v_part_subtotal NUMERIC(12, 2);
  v_part_tip NUMERIC(12, 2);
  v_part_total NUMERIC(12, 2);
  v_allocated_subtotal NUMERIC(12, 2) := 0;
  v_allocated_tip NUMERIC(12, 2) := 0;
  v_i INT;
BEGIN
  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized to create split bills';
  END IF;

  IF p_parts IS NULL OR p_parts < 2 OR p_parts > 20 THEN
    RAISE EXCEPTION 'Split parts must be between 2 and 20';
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

  IF public.order_has_active_bills(p_order_id) THEN
    RAISE EXCEPTION 'Order already has active bills';
  END IF;

  SELECT COALESCE(SUM(oi.quantity * oi.price_at_order), 0)
  INTO v_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Order has no billable items';
  END IF;

  v_tip_percent := COALESCE(p_tip_percent, 0);
  v_tip_total := ROUND(v_subtotal * v_tip_percent / 100, 2);

  FOR v_i IN 1..p_parts LOOP
    IF v_i < p_parts THEN
      v_part_subtotal := ROUND(v_subtotal / p_parts, 2);
      v_part_tip := ROUND(v_tip_total / p_parts, 2);
    ELSE
      v_part_subtotal := v_subtotal - v_allocated_subtotal;
      v_part_tip := v_tip_total - v_allocated_tip;
    END IF;

    v_part_total := v_part_subtotal + v_part_tip;
    v_allocated_subtotal := v_allocated_subtotal + v_part_subtotal;
    v_allocated_tip := v_allocated_tip + v_part_tip;

    INSERT INTO public.bills (
      order_id,
      status,
      subtotal,
      tip_amount,
      tip_percent,
      total,
      split_group_id,
      split_label,
      split_mode
    )
    VALUES (
      p_order_id,
      'draft',
      v_part_subtotal,
      v_part_tip,
      v_tip_percent,
      v_part_total,
      v_split_group_id,
      format('Persona %s', v_i),
      'equal'
    );
  END LOOP;

  PERFORM public.write_audit_log(
    'create', 'bills', v_split_group_id,
    jsonb_build_object('order_id', p_order_id, 'split_mode', 'equal', 'parts', p_parts)
  );

  RETURN v_split_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_item_split_bills(
  p_order_id UUID,
  p_groups JSONB,
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
  v_tip_total NUMERIC(12, 2);
  v_split_group_id UUID := gen_random_uuid();
  v_group JSONB;
  v_label TEXT;
  v_item_id UUID;
  v_unit_key TEXT;
  v_unit_no INT;
  v_group_subtotal NUMERIC(12, 2);
  v_group_tip NUMERIC(12, 2);
  v_group_total NUMERIC(12, 2);
  v_line_amount NUMERIC(12, 2);
  v_bill_id UUID;
  v_assigned_units INT;
  v_expected_units INT;
  v_quantity INT;
BEGIN
  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized to create split bills';
  END IF;

  IF p_groups IS NULL OR jsonb_typeof(p_groups) <> 'array' OR jsonb_array_length(p_groups) < 2 THEN
    RAISE EXCEPTION 'At least two groups are required for item split';
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

  IF public.order_has_active_bills(p_order_id) THEN
    RAISE EXCEPTION 'Order already has active bills';
  END IF;

  SELECT COALESCE(SUM(oi.quantity), 0)::INT
  INTO v_expected_units
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  IF v_expected_units = 0 THEN
    RAISE EXCEPTION 'Order has no billable items';
  END IF;

  SELECT COALESCE(SUM(oi.quantity * oi.price_at_order), 0)
  INTO v_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_tip_percent := COALESCE(p_tip_percent, 0);
  v_tip_total := ROUND(v_subtotal * v_tip_percent / 100, 2);

  CREATE TEMP TABLE tmp_assigned_units (
    unit_key TEXT PRIMARY KEY,
    order_item_id UUID NOT NULL
  ) ON COMMIT DROP;

  FOR v_group IN SELECT value FROM jsonb_array_elements(p_groups) LOOP
    v_label := COALESCE(NULLIF(TRIM(v_group ->> 'label'), ''), 'Grupo');
    v_group_subtotal := 0;

    IF jsonb_typeof(v_group -> 'unit_keys') <> 'array' THEN
      RAISE EXCEPTION 'Each group must include unit_keys array';
    END IF;

    IF jsonb_array_length(v_group -> 'unit_keys') = 0 THEN
      RAISE EXCEPTION 'Group % has no items assigned', v_label;
    END IF;

    FOR v_unit_key IN
      SELECT jsonb_array_elements_text(v_group -> 'unit_keys')
    LOOP
      v_item_id := split_part(v_unit_key, '#', 1)::UUID;
      v_unit_no := split_part(v_unit_key, '#', 2)::INT;

      IF EXISTS (SELECT 1 FROM tmp_assigned_units WHERE unit_key = v_unit_key) THEN
        RAISE EXCEPTION 'Unit % assigned to more than one group', v_unit_key;
      END IF;

      SELECT oi.price_at_order, oi.quantity
      INTO v_line_amount, v_quantity
      FROM public.order_items oi
      WHERE oi.id = v_item_id
        AND oi.order_id = p_order_id
        AND oi.status <> 'cancelled';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid order item % for this order', v_item_id;
      END IF;

      IF v_unit_no < 1 OR v_unit_no > v_quantity THEN
        RAISE EXCEPTION 'Invalid unit number % for item %', v_unit_no, v_item_id;
      END IF;

      v_group_subtotal := v_group_subtotal + v_line_amount;
      INSERT INTO tmp_assigned_units (unit_key, order_item_id)
      VALUES (v_unit_key, v_item_id);
    END LOOP;

    IF v_subtotal > 0 THEN
      v_group_tip := ROUND(v_tip_total * (v_group_subtotal / v_subtotal), 2);
    ELSE
      v_group_tip := 0;
    END IF;

    v_group_total := v_group_subtotal + v_group_tip;

    INSERT INTO public.bills (
      order_id,
      status,
      subtotal,
      tip_amount,
      tip_percent,
      total,
      split_group_id,
      split_label,
      split_mode
    )
    VALUES (
      p_order_id,
      'draft',
      v_group_subtotal,
      v_group_tip,
      v_tip_percent,
      v_group_total,
      v_split_group_id,
      v_label,
      'items'
    )
    RETURNING id INTO v_bill_id;

    INSERT INTO public.bill_items (bill_id, order_item_id, quantity)
    SELECT
      v_bill_id,
      t.order_item_id,
      COUNT(*)::INT
    FROM tmp_assigned_units t
    WHERE t.unit_key IN (
      SELECT jsonb_array_elements_text(v_group -> 'unit_keys')
    )
    GROUP BY t.order_item_id;
  END LOOP;

  SELECT COUNT(*)::INT INTO v_assigned_units FROM tmp_assigned_units;

  IF v_assigned_units <> v_expected_units THEN
    RAISE EXCEPTION 'All item units must be assigned exactly once';
  END IF;

  PERFORM public.write_audit_log(
    'create', 'bills', v_split_group_id,
    jsonb_build_object('order_id', p_order_id, 'split_mode', 'items')
  );

  RETURN v_split_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_order_bills(p_order_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill RECORD;
  v_count INT := 0;
BEGIN
  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR v_bill IN
    SELECT id
    FROM public.bills
    WHERE order_id = p_order_id
      AND deleted_at IS NULL
      AND status = 'draft'
  LOOP
    PERFORM public.advance_bill_status(v_bill.id, 'pending_payment');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
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
      'status', v_new_status
    )
  );

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_close_order_if_fully_paid(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_has_active_bills(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_table_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_equal_split_bills(UUID, INT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_item_split_bills(UUID, JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_bills(UUID) TO authenticated;

-- Propina por defecto 0% en restaurante seed
UPDATE public.restaurants SET default_tip_percent = 0 WHERE default_tip_percent = 10;
