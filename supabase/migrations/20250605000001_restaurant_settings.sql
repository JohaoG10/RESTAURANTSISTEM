-- Configuración del restaurante: tema, email, certificado, assets

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS theme_config JSONB,
  ADD COLUMN IF NOT EXISTS sri_cert_filename TEXT,
  ADD COLUMN IF NOT EXISTS sri_cert_expires_at TIMESTAMPTZ;

-- Contraseña del certificado: solo service role (Edge Functions)
CREATE TABLE IF NOT EXISTS public.restaurant_secrets (
  restaurant_id UUID PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  cert_password TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.restaurant_secrets FROM authenticated, anon;
GRANT ALL ON public.restaurant_secrets TO service_role;

-- Secuenciales SRI: admin puede leer/ajustar desde configuración
ALTER TABLE public.sri_invoice_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sri_sequences_admin ON public.sri_invoice_sequences;
CREATE POLICY sri_sequences_admin
  ON public.sri_invoice_sequences
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Bucket logos y assets del restaurante
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'restaurant-assets',
  'restaurant-assets',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS restaurant_assets_admin_insert ON storage.objects;
CREATE POLICY restaurant_assets_admin_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'restaurant-assets' AND public.is_admin());

DROP POLICY IF EXISTS restaurant_assets_admin_update ON storage.objects;
CREATE POLICY restaurant_assets_admin_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'restaurant-assets' AND public.is_admin())
  WITH CHECK (bucket_id = 'restaurant-assets' AND public.is_admin());

DROP POLICY IF EXISTS restaurant_assets_admin_delete ON storage.objects;
CREATE POLICY restaurant_assets_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'restaurant-assets' AND public.is_admin());

DROP POLICY IF EXISTS restaurant_assets_public_select ON storage.objects;
CREATE POLICY restaurant_assets_public_select
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'restaurant-assets');

DROP POLICY IF EXISTS sri_certificates_admin_update ON storage.objects;
CREATE POLICY sri_certificates_admin_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'sri-certificates' AND public.is_admin())
  WITH CHECK (bucket_id = 'sri-certificates' AND public.is_admin());

DROP POLICY IF EXISTS sri_certificates_admin_delete ON storage.objects;
CREATE POLICY sri_certificates_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sri-certificates' AND public.is_admin());
