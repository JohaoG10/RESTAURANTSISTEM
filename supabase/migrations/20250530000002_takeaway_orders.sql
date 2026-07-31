-- ============================================================
-- Takeaway / Para llevar
-- ============================================================

-- 1. Hacer table_id nullable (pedidos para llevar no tienen mesa)
ALTER TABLE public.orders
  ALTER COLUMN table_id DROP NOT NULL;

-- 2. Tipo de pedido: dine_in (en mesa) o takeaway (para llevar)
ALTER TABLE public.orders
  ADD COLUMN order_type TEXT NOT NULL DEFAULT 'dine_in'
  CONSTRAINT orders_order_type_check CHECK (order_type IN ('dine_in', 'takeaway'));

-- 3. Nombre del cliente (opcional, solo para takeaway)
ALTER TABLE public.orders
  ADD COLUMN customer_name TEXT;

-- 4. Número secuencial diario del pedido para llevar (001, 002…)
ALTER TABLE public.orders
  ADD COLUMN takeaway_number INT;

-- Índice para lookups diarios de takeaway
CREATE INDEX orders_takeaway_daily_idx
  ON public.orders (order_type, created_at)
  WHERE order_type = 'takeaway' AND deleted_at IS NULL;

-- 5. RPC: retorna el siguiente número para hoy
CREATE OR REPLACE FUNCTION public.get_next_takeaway_number()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(takeaway_number), 0) + 1
  INTO next_num
  FROM public.orders
  WHERE order_type = 'takeaway'
    AND deleted_at IS NULL
    AND DATE(created_at AT TIME ZONE 'America/Guayaquil') =
        CURRENT_DATE AT TIME ZONE 'America/Guayaquil';
  RETURN next_num;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_takeaway_number() TO authenticated;
