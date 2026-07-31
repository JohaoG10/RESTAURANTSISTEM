-- Configuración fiscal (IVA) y emisión SRI Fase 2

-- ---------------------------------------------------------------------------
-- IVA vigente por período (no hardcodear en código)
-- ---------------------------------------------------------------------------
CREATE TABLE public.tax_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_name TEXT NOT NULL,
  rate NUMERIC(5, 2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tax_config_rate_positive CHECK (rate >= 0)
);

CREATE INDEX tax_config_name_dates_idx
  ON public.tax_config (tax_name, effective_from DESC);

INSERT INTO public.tax_config (tax_name, rate, effective_from)
VALUES ('IVA', 15.00, '2024-04-01');

CREATE OR REPLACE FUNCTION public.get_current_iva()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rate
  FROM public.tax_config
  WHERE tax_name = 'IVA'
    AND effective_from <= CURRENT_DATE
    AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_iva() TO authenticated;

-- ---------------------------------------------------------------------------
-- Configuración emisor SRI en restaurante
-- ---------------------------------------------------------------------------
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS commercial_name TEXT,
  ADD COLUMN IF NOT EXISTS sri_establishment_code TEXT NOT NULL DEFAULT '001',
  ADD COLUMN IF NOT EXISTS sri_emission_point_code TEXT NOT NULL DEFAULT '001',
  ADD COLUMN IF NOT EXISTS sri_obligado_contabilidad TEXT NOT NULL DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS sri_cert_storage_path TEXT;

UPDATE public.restaurants
SET commercial_name = name
WHERE commercial_name IS NULL;

-- ---------------------------------------------------------------------------
-- Facturas: número de autorización SRI
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS authorization_number TEXT;

CREATE INDEX IF NOT EXISTS invoices_authorization_number_idx
  ON public.invoices (authorization_number)
  WHERE authorization_number IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Secuencial por establecimiento / punto de emisión / tipo comprobante
-- ---------------------------------------------------------------------------
CREATE TABLE public.sri_invoice_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_code TEXT NOT NULL,
  emission_point_code TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT '01',
  last_sequential BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sri_invoice_sequences_unique
    UNIQUE (establishment_code, emission_point_code, doc_type)
);

CREATE OR REPLACE FUNCTION public.get_next_sri_sequential(
  p_establishment TEXT,
  p_emission_point TEXT,
  p_doc_type TEXT DEFAULT '01'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  INSERT INTO public.sri_invoice_sequences (
    establishment_code,
    emission_point_code,
    doc_type,
    last_sequential
  )
  VALUES (p_establishment, p_emission_point, p_doc_type, 1)
  ON CONFLICT ON CONSTRAINT sri_invoice_sequences_unique
  DO UPDATE SET
    last_sequential = sri_invoice_sequences.last_sequential + 1,
    updated_at = now()
  RETURNING last_sequential INTO v_next;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_sri_sequential(TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS tax_config (solo lectura autenticados; escritura admin vía Studio)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tax_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_config_select_authenticated
  ON public.tax_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY tax_config_admin_write
  ON public.tax_config FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: certificados .p12 y XML firmados (privados)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'sri-certificates',
    'sri-certificates',
    false,
    5242880,
    ARRAY['application/x-pkcs12', 'application/octet-stream', 'application/pkcs12']
  ),
  (
    'invoice-xml',
    'invoice-xml',
    false,
    10485760,
    ARRAY['application/xml', 'text/xml', 'application/octet-stream']
  )
ON CONFLICT (id) DO NOTHING;

-- Solo service role / admin sube certificados
CREATE POLICY sri_certificates_admin_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sri-certificates'
    AND public.is_admin()
  );

CREATE POLICY sri_certificates_admin_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sri-certificates'
    AND public.is_admin()
  );

CREATE POLICY invoice_xml_service_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-xml'
    AND (public.is_admin() OR public.is_waiter())
  );
