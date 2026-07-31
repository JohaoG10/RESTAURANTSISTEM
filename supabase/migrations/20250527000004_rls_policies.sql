-- Fase 0: Row Level Security base por rol

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- restaurants
-- ---------------------------------------------------------------------------
CREATE POLICY restaurants_select_authenticated
  ON public.restaurants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY restaurants_admin_write
  ON public.restaurants FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE POLICY profiles_select_own_or_admin
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_own_or_admin
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_admin_insert
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR id = auth.uid());

-- ---------------------------------------------------------------------------
-- categories, kitchen_stations (lectura todos; escritura admin)
-- ---------------------------------------------------------------------------
CREATE POLICY categories_select
  ON public.categories FOR SELECT TO authenticated USING (true);

CREATE POLICY categories_admin_write
  ON public.categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY kitchen_stations_select
  ON public.kitchen_stations FOR SELECT TO authenticated USING (true);

CREATE POLICY kitchen_stations_admin_write
  ON public.kitchen_stations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- menu_items (activos por defecto; admin ve eliminados)
-- ---------------------------------------------------------------------------
CREATE POLICY menu_items_select_active
  ON public.menu_items FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    OR public.is_admin()
  );

CREATE POLICY menu_items_admin_insert
  ON public.menu_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY menu_items_admin_update
  ON public.menu_items FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY menu_item_stations_select
  ON public.menu_item_stations FOR SELECT TO authenticated USING (true);

CREATE POLICY menu_item_stations_admin_write
  ON public.menu_item_stations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- restaurant_tables
-- ---------------------------------------------------------------------------
CREATE POLICY restaurant_tables_select
  ON public.restaurant_tables FOR SELECT TO authenticated USING (true);

CREATE POLICY restaurant_tables_admin_write
  ON public.restaurant_tables FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY restaurant_tables_waiter_update_status
  ON public.restaurant_tables FOR UPDATE
  TO authenticated
  USING (
    public.is_waiter()
    AND (
      public.is_waiter_assigned_to_table(id)
      OR public.is_admin()
    )
  )
  WITH CHECK (
    public.is_waiter() OR public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- table_assignments
-- ---------------------------------------------------------------------------
CREATE POLICY table_assignments_select
  ON public.table_assignments FOR SELECT TO authenticated
  USING (
    waiter_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY table_assignments_admin_write
  ON public.table_assignments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- cash_shifts
-- ---------------------------------------------------------------------------
CREATE POLICY cash_shifts_select
  ON public.cash_shifts FOR SELECT TO authenticated
  USING (public.is_admin() OR opened_by = auth.uid());

CREATE POLICY cash_shifts_insert
  ON public.cash_shifts FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR opened_by = auth.uid());

CREATE POLICY cash_shifts_update
  ON public.cash_shifts FOR UPDATE TO authenticated
  USING (public.is_admin() OR opened_by = auth.uid())
  WITH CHECK (public.is_admin() OR opened_by = auth.uid());

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
CREATE POLICY orders_select
  ON public.orders FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_admin()
      OR public.is_kitchen()
      OR waiter_id = auth.uid()
      OR public.is_waiter_assigned_to_table(table_id)
    )
  );

CREATE POLICY orders_admin_select_deleted
  ON public.orders FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY orders_insert
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_waiter()
      AND waiter_id = auth.uid()
      AND public.is_waiter_assigned_to_table(table_id)
    )
  );

CREATE POLICY orders_update
  ON public.orders FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_admin()
      OR (
        public.is_waiter()
        AND waiter_id = auth.uid()
      )
      OR public.is_kitchen()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_waiter()
      AND waiter_id = auth.uid()
    )
    OR public.is_kitchen()
  );

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
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
        )
    )
  );

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
          OR public.is_kitchen()
        )
    )
  );

-- Cocina solo puede cambiar status (enforced via column-level en app; RLS permite update)
-- Restricción fina de columnas se hará en RPC futuro si hace falta.

-- ---------------------------------------------------------------------------
-- bills
-- ---------------------------------------------------------------------------
CREATE POLICY bills_select
  ON public.bills FOR SELECT TO authenticated
  USING (
    (deleted_at IS NULL OR public.is_admin())
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (
          public.is_admin()
          OR o.waiter_id = auth.uid()
          OR public.is_waiter_assigned_to_table(o.table_id)
        )
    )
  );

CREATE POLICY bills_insert
  ON public.bills FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_waiter()
  );

CREATE POLICY bills_update
  ON public.bills FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (public.is_admin() OR public.is_waiter())
  )
  WITH CHECK (public.is_admin() OR public.is_waiter());

-- ---------------------------------------------------------------------------
-- bill_items, payments
-- ---------------------------------------------------------------------------
CREATE POLICY bill_items_select
  ON public.bill_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bills b
      JOIN public.orders o ON o.id = b.order_id
      WHERE b.id = bill_id
        AND b.deleted_at IS NULL
        AND (public.is_admin() OR o.waiter_id = auth.uid() OR public.is_waiter_assigned_to_table(o.table_id))
    )
  );

CREATE POLICY bill_items_write
  ON public.bill_items FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_waiter())
  WITH CHECK (public.is_admin() OR public.is_waiter());

CREATE POLICY payments_select
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bills b
      JOIN public.orders o ON o.id = b.order_id
      WHERE b.id = bill_id
        AND (public.is_admin() OR o.waiter_id = auth.uid())
    )
  );

CREATE POLICY payments_insert
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_waiter());

-- ---------------------------------------------------------------------------
-- invoices (lectura operativa; escritura sensible vía Edge Functions en fases posteriores)
-- ---------------------------------------------------------------------------
CREATE POLICY invoices_select
  ON public.invoices FOR SELECT TO authenticated
  USING (
    (deleted_at IS NULL OR public.is_admin())
    AND (public.is_admin() OR public.is_waiter())
  );

CREATE POLICY invoices_admin_insert
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_waiter());

CREATE POLICY invoices_admin_update
  ON public.invoices FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY invoice_events_select
  ON public.invoice_events FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_waiter());

CREATE POLICY invoice_events_admin_insert
  ON public.invoice_events FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- audit_logs (solo lectura admin; inserción vía SECURITY DEFINER functions)
-- ---------------------------------------------------------------------------
CREATE POLICY audit_logs_admin_select
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin());

-- Sin política INSERT para usuarios: solo write_audit_log (SECURITY DEFINER)
