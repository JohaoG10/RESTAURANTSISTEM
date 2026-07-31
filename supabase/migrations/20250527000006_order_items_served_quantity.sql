-- Soporte de entregas parciales por ítem
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS served_quantity INT NOT NULL DEFAULT 0;

ALTER TABLE public.order_items
DROP CONSTRAINT IF EXISTS order_items_served_quantity_non_negative;

ALTER TABLE public.order_items
ADD CONSTRAINT order_items_served_quantity_non_negative
CHECK (served_quantity >= 0 AND served_quantity <= quantity);

-- Backfill para ítems ya servidos
UPDATE public.order_items
SET served_quantity = quantity
WHERE status = 'served' AND served_quantity < quantity;
