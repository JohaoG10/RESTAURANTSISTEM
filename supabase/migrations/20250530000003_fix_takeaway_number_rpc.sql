-- Fix: la comparación de fechas en get_next_takeaway_number era incorrecta.
-- CURRENT_DATE AT TIME ZONE devuelve timestamptz, no date → comparación fallaba
-- y siempre retornaba 1. Ahora ambos lados son ::date del mismo timezone.

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
    AND (created_at AT TIME ZONE 'America/Guayaquil')::date
        = (now() AT TIME ZONE 'America/Guayaquil')::date;
  RETURN next_num;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_takeaway_number() TO authenticated;
