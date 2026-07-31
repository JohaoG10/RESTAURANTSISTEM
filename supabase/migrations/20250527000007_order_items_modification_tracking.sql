-- Seguimiento de modificaciones/cancelaciones de items para señalizacion en KDS
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS modified_seen_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS order_items_modified_at_idx
ON public.order_items (modified_at)
WHERE modified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_items_cancelled_at_idx
ON public.order_items (cancelled_at)
WHERE cancelled_at IS NOT NULL;
