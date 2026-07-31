-- Meseros: crear comandas propias, agregar ítems y actualizar mesa sin asignación previa

DROP POLICY IF EXISTS orders_insert ON public.orders;
CREATE POLICY orders_insert
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_waiter()
      AND waiter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS restaurant_tables_waiter_update_status ON public.restaurant_tables;
CREATE POLICY restaurant_tables_waiter_update_status
  ON public.restaurant_tables FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_waiter())
  WITH CHECK (public.is_admin() OR public.is_waiter());

-- Refuerzo: mesero puede insertar ítems en comandas donde es waiter_id
DROP POLICY IF EXISTS order_items_insert ON public.order_items;
CREATE POLICY order_items_insert
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.deleted_at IS NULL
        AND o.status NOT IN ('closed', 'cancelled')
        AND (
          public.is_admin()
          OR (public.is_waiter() AND o.waiter_id = auth.uid())
        )
    )
  );
