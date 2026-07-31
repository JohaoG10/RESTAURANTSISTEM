-- RIDE: representación impresa de comprobantes autorizados

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-ride',
  'invoice-ride',
  false,
  5242880,
  ARRAY['text/html', 'application/pdf', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY invoice_ride_select_staff
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-ride'
    AND (public.is_admin() OR public.is_waiter())
  );
