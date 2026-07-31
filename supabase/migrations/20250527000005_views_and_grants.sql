-- Fase 0: vistas activas (excluyen soft-deleted) y permisos RPC

-- Vistas de solo lectura para consultas operativas por defecto
CREATE OR REPLACE VIEW public.menu_items_active
WITH (security_invoker = true) AS
SELECT *
FROM public.menu_items
WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.orders_active
WITH (security_invoker = true) AS
SELECT *
FROM public.orders
WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.bills_active
WITH (security_invoker = true) AS
SELECT *
FROM public.bills
WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.invoices_active
WITH (security_invoker = true) AS
SELECT *
FROM public.invoices
WHERE deleted_at IS NULL;

GRANT SELECT ON public.menu_items_active TO authenticated;
GRANT SELECT ON public.orders_active TO authenticated;
GRANT SELECT ON public.bills_active TO authenticated;
GRANT SELECT ON public.invoices_active TO authenticated;

-- Grants para RPC públicas (authenticated)
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_waiter() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_kitchen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_waiter_assigned_to_table(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_order_owner(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.soft_delete_menu_item(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_bill(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_invoice(UUID, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.restore_menu_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_bill(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_invoice(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.advance_order_status(UUID, public.order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_bill_status(UUID, public.bill_status) TO authenticated;

-- Realtime: publicar tablas operativas clave
ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
