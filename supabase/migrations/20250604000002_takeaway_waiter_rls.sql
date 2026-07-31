-- Meseros pueden ver y gestionar pedidos para llevar creados por admin u otros usuarios.
-- Antes: orders_select exigía waiter_id = auth.uid() o mesa asignada; takeaway tiene table_id NULL
-- y waiter_id del creador (p. ej. admin), por lo que otros meseros no veían esos pedidos.

DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select
  ON public.orders FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_admin()
      OR public.is_kitchen()
      OR waiter_id = auth.uid()
      OR public.is_waiter_assigned_to_table(table_id)
      OR (order_type = 'takeaway' AND public.is_waiter())
    )
  );

DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_update
  ON public.orders FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_admin()
      OR (public.is_waiter() AND waiter_id = auth.uid())
      OR (public.is_waiter() AND order_type = 'takeaway')
      OR public.is_kitchen()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_waiter() AND waiter_id = auth.uid())
    OR (public.is_waiter() AND order_type = 'takeaway')
    OR public.is_kitchen()
  );

DROP POLICY IF EXISTS order_items_select ON public.order_items;
CREATE POLICY order_items_select
  ON public.order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.deleted_at IS NULL
        AND (
          public.is_admin()
          OR public.is_kitchen()
          OR o.waiter_id = auth.uid()
          OR public.is_waiter_assigned_to_table(o.table_id)
          OR (o.order_type = 'takeaway' AND public.is_waiter())
        )
    )
  );

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
          OR (public.is_waiter() AND o.order_type = 'takeaway')
        )
    )
  );

DROP POLICY IF EXISTS order_items_update ON public.order_items;
CREATE POLICY order_items_update
  ON public.order_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.deleted_at IS NULL
        AND (
          public.is_admin()
          OR (public.is_waiter() AND o.waiter_id = auth.uid())
          OR (public.is_waiter() AND o.order_type = 'takeaway')
          OR public.is_kitchen()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (
          public.is_admin()
          OR (public.is_waiter() AND o.waiter_id = auth.uid())
          OR (public.is_waiter() AND o.order_type = 'takeaway')
          OR public.is_kitchen()
        )
    )
  );
