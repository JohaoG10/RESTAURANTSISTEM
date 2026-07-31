-- Forma de mesa: square | rectangle | round (TEXT)
-- Convierte columna enum previa si existe; si no, la crea.

DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND c.relname = 'restaurant_tables'
      AND a.attname = 'shape'
      AND t.typname = 'table_shape'
  ) THEN
    ALTER TABLE public.restaurant_tables
      ALTER COLUMN shape DROP DEFAULT;

    ALTER TABLE public.restaurant_tables
      ALTER COLUMN shape TYPE TEXT USING (
        CASE shape::text
          WHEN 'rectangular' THEN 'rectangle'
          WHEN 'rectangle' THEN 'rectangle'
          WHEN 'round' THEN 'round'
          ELSE 'square'
        END
      );

    DROP TYPE public.table_shape;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'restaurant_tables'
      AND column_name = 'shape'
  ) THEN
    ALTER TABLE public.restaurant_tables
      ADD COLUMN shape TEXT NOT NULL DEFAULT 'square';
  END IF;
END
$migrate$;

ALTER TABLE public.restaurant_tables
  ALTER COLUMN shape SET DEFAULT 'square';

UPDATE public.restaurant_tables
SET shape = 'square'
WHERE shape IS NULL OR shape NOT IN ('square', 'rectangle', 'round');

ALTER TABLE public.restaurant_tables DROP CONSTRAINT IF EXISTS restaurant_tables_shape_check;

ALTER TABLE public.restaurant_tables
  ADD CONSTRAINT restaurant_tables_shape_check
  CHECK (shape IN ('square', 'rectangle', 'round'));
