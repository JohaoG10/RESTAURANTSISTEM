-- Fase 0: helpers de autorización, auditoría, soft delete y bloqueo de DELETE físico

-- ---------------------------------------------------------------------------
-- Helpers de rol (SECURITY DEFINER para uso en RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
    AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_waiter()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() = 'waiter';
$$;

CREATE OR REPLACE FUNCTION public.is_kitchen()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() = 'kitchen';
$$;

CREATE OR REPLACE FUNCTION public.is_waiter_assigned_to_table(p_table_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.table_assignments ta
    WHERE ta.table_id = p_table_id
      AND ta.waiter_id = auth.uid()
      AND ta.released_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_order_owner(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.waiter_id = auth.uid()
      AND o.deleted_at IS NULL
  );
$$;

-- ---------------------------------------------------------------------------
-- Auditoría centralizada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_audit_log(
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
  VALUES (auth.uid(), p_action, p_entity, p_entity_id, COALESCE(p_metadata, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Bloquear DELETE físico en tablas críticas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_physical_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Physical DELETE is not allowed on %. Use soft delete RPC instead.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER menu_items_prevent_delete
  BEFORE DELETE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();

CREATE TRIGGER orders_prevent_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();

CREATE TRIGGER bills_prevent_delete
  BEFORE DELETE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();

CREATE TRIGGER invoices_prevent_delete
  BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();

-- ---------------------------------------------------------------------------
-- Validaciones de soft delete
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_order_soft_delete(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.order_status;
BEGIN
  SELECT status INTO v_status
  FROM public.orders
  WHERE id = p_order_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or already deleted';
  END IF;

  IF v_status NOT IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'Order can only be soft-deleted when status is closed or cancelled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bills b
    WHERE b.order_id = p_order_id
      AND b.deleted_at IS NULL
      AND b.status IN ('pending_payment', 'partially_paid', 'paid')
  ) THEN
    RAISE EXCEPTION 'Order has active bills; resolve billing before soft delete';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_bill_soft_delete(p_bill_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.bill_status;
BEGIN
  SELECT status INTO v_status
  FROM public.bills
  WHERE id = p_bill_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found or already deleted';
  END IF;

  IF v_status NOT IN ('draft', 'voided') THEN
    RAISE EXCEPTION 'Bill can only be soft-deleted when status is draft or voided';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments p WHERE p.bill_id = p_bill_id
  ) AND v_status = 'draft' THEN
    RAISE EXCEPTION 'Bill has payments registered; cannot soft delete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.bill_id = p_bill_id
      AND i.deleted_at IS NULL
      AND i.sri_status IN ('submitted', 'received', 'authorized', 'void_requested')
  ) THEN
    RAISE EXCEPTION 'Bill has active SRI invoice; cannot soft delete';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_invoice_soft_delete(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.sri_status;
BEGIN
  SELECT sri_status INTO v_status
  FROM public.invoices
  WHERE id = p_invoice_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found or already deleted';
  END IF;

  IF v_status = 'authorized' THEN
    RAISE EXCEPTION 'Authorized invoices cannot be soft-deleted; use void flow';
  END IF;

  IF v_status IN ('submitted', 'received', 'void_requested') THEN
    RAISE EXCEPTION 'Invoice in active SRI processing cannot be soft-deleted';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: soft delete
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_menu_item(
  p_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin()) THEN
    RAISE EXCEPTION 'Only admin can soft delete menu items';
  END IF;

  UPDATE public.menu_items
  SET
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = p_reason
  WHERE id = p_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item not found or already deleted';
  END IF;

  PERFORM public.write_audit_log(
    'soft_delete', 'menu_items', p_id,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_order(
  p_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_order_owner(p_id)) THEN
    RAISE EXCEPTION 'Not authorized to soft delete this order';
  END IF;

  PERFORM public.validate_order_soft_delete(p_id);

  UPDATE public.orders
  SET
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = p_reason
  WHERE id = p_id AND deleted_at IS NULL;

  PERFORM public.write_audit_log(
    'soft_delete', 'orders', p_id,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_bill(
  p_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin()) THEN
    RAISE EXCEPTION 'Only admin can soft delete bills';
  END IF;

  PERFORM public.validate_bill_soft_delete(p_id);

  UPDATE public.bills
  SET
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = p_reason
  WHERE id = p_id AND deleted_at IS NULL;

  PERFORM public.write_audit_log(
    'soft_delete', 'bills', p_id,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_invoice(
  p_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin()) THEN
    RAISE EXCEPTION 'Only admin can soft delete invoices';
  END IF;

  PERFORM public.validate_invoice_soft_delete(p_id);

  UPDATE public.invoices
  SET
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = p_reason
  WHERE id = p_id AND deleted_at IS NULL;

  PERFORM public.write_audit_log(
    'soft_delete', 'invoices', p_id,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: restore (solo admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_menu_item(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can restore records';
  END IF;

  UPDATE public.menu_items
  SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
  WHERE id = p_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item not found or not deleted';
  END IF;

  PERFORM public.write_audit_log('restore', 'menu_items', p_id, '{}');
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_order(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can restore records';
  END IF;

  UPDATE public.orders
  SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
  WHERE id = p_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not deleted';
  END IF;

  PERFORM public.write_audit_log('restore', 'orders', p_id, '{}');
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_bill(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can restore records';
  END IF;

  UPDATE public.bills
  SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
  WHERE id = p_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found or not deleted';
  END IF;

  PERFORM public.write_audit_log('restore', 'bills', p_id, '{}');
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_invoice(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can restore records';
  END IF;

  UPDATE public.invoices
  SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
  WHERE id = p_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found or not deleted';
  END IF;

  PERFORM public.write_audit_log('restore', 'invoices', p_id, '{}');
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: transiciones de estado (validación básica)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_order_status(
  p_order_id UUID,
  p_new_status public.order_status
)
RETURNS public.order_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.order_status;
  v_allowed BOOLEAN := false;
BEGIN
  SELECT status INTO v_current
  FROM public.orders
  WHERE id = p_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT (
    public.is_admin()
    OR (public.is_waiter() AND public.is_order_owner(p_order_id))
    OR (public.is_kitchen() AND p_new_status IN ('in_progress', 'ready'))
  ) THEN
    RAISE EXCEPTION 'Not authorized for this status transition';
  END IF;

  v_allowed := CASE
    WHEN v_current = 'draft' AND p_new_status IN ('open', 'cancelled') THEN true
    WHEN v_current = 'open' AND p_new_status IN ('in_progress', 'cancelled') THEN true
    WHEN v_current = 'in_progress' AND p_new_status IN ('ready', 'cancelled') THEN true
    WHEN v_current = 'ready' AND p_new_status = 'served' THEN true
    WHEN v_current = 'served' AND p_new_status = 'closed' THEN true
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid transition from % to %', v_current, p_new_status;
  END IF;

  UPDATE public.orders
  SET
    status = p_new_status,
    closed_at = CASE WHEN p_new_status = 'closed' THEN now() ELSE closed_at END
  WHERE id = p_order_id;

  PERFORM public.write_audit_log(
    'status_change', 'orders', p_order_id,
    jsonb_build_object('from', v_current, 'to', p_new_status)
  );

  RETURN p_new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_bill_status(
  p_bill_id UUID,
  p_new_status public.bill_status
)
RETURNS public.bill_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.bill_status;
  v_paid_total NUMERIC(12, 2);
  v_bill_total NUMERIC(12, 2);
  v_allowed BOOLEAN := false;
BEGIN
  SELECT status, total INTO v_current, v_bill_total
  FROM public.bills
  WHERE id = p_bill_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  IF NOT (public.is_admin() OR public.is_waiter()) THEN
    RAISE EXCEPTION 'Not authorized for bill status transition';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_total
  FROM public.payments
  WHERE bill_id = p_bill_id;

  v_allowed := CASE
    WHEN v_current = 'draft' AND p_new_status IN ('pending_payment', 'voided') THEN true
    WHEN v_current = 'pending_payment' AND p_new_status IN ('partially_paid', 'paid', 'voided') THEN true
    WHEN v_current = 'partially_paid' AND p_new_status IN ('paid', 'voided') THEN true
    WHEN v_current = 'paid' AND p_new_status = 'refunded' THEN true
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid transition from % to %', v_current, p_new_status;
  END IF;

  IF p_new_status = 'paid' AND v_paid_total < v_bill_total THEN
    RAISE EXCEPTION 'Cannot mark as paid: payments (%) < bill total (%)', v_paid_total, v_bill_total;
  END IF;

  IF p_new_status = 'voided' AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.bill_id = p_bill_id
      AND i.deleted_at IS NULL
      AND i.sri_status = 'authorized'
  ) THEN
    RAISE EXCEPTION 'Cannot void bill with authorized invoice';
  END IF;

  UPDATE public.bills
  SET
    status = p_new_status,
    paid_at = CASE WHEN p_new_status = 'paid' THEN now() ELSE paid_at END
  WHERE id = p_bill_id;

  PERFORM public.write_audit_log(
    'status_change', 'bills', p_bill_id,
    jsonb_build_object('from', v_current, 'to', p_new_status, 'paid_total', v_paid_total)
  );

  RETURN p_new_status;
END;
$$;
