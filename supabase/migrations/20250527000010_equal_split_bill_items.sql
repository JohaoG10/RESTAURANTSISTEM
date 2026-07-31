-- Detalle proporcional en división por partes iguales (bill_items con allocated_amount)

ALTER TABLE public.bill_items
ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC(12, 2);

ALTER TABLE public.bill_items
DROP CONSTRAINT IF EXISTS bill_items_allocated_amount_positive;

ALTER TABLE public.bill_items
ADD CONSTRAINT bill_items_allocated_amount_positive
CHECK (allocated_amount IS NULL OR allocated_amount > 0);

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
  v_bill_id UUID;
  v_item RECORD;
  v_line_subtotal NUMERIC(12, 2);
  v_line_share NUMERIC(12, 2);
  v_line_allocated NUMERIC(12, 2);
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
    )
    RETURNING id INTO v_bill_id;

    v_line_allocated := 0;

    FOR v_item IN
      SELECT
        oi.id AS order_item_id,
        oi.quantity,
        oi.price_at_order,
        (oi.quantity * oi.price_at_order) AS line_subtotal
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.status <> 'cancelled'
      ORDER BY oi.created_at, oi.id
    LOOP
      v_line_subtotal := v_item.line_subtotal;

      IF v_i < p_parts THEN
        v_line_share := ROUND(v_line_subtotal / p_parts, 2);
      ELSE
        v_line_share := v_line_subtotal - v_line_allocated;
      END IF;

      v_line_allocated := v_line_allocated + v_line_share;

      INSERT INTO public.bill_items (
        bill_id,
        order_item_id,
        quantity,
        allocated_amount
      )
      VALUES (
        v_bill_id,
        v_item.order_item_id,
        v_item.quantity,
        v_line_share
      );
    END LOOP;
  END LOOP;

  PERFORM public.write_audit_log(
    'create', 'bills', v_split_group_id,
    jsonb_build_object('order_id', p_order_id, 'split_mode', 'equal', 'parts', p_parts)
  );

  RETURN v_split_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_equal_split_bills(UUID, INT, NUMERIC) TO authenticated;
