-- Datos iniciales de referencia (ejecutar tras migraciones con supabase db reset)
--
-- Usuario admin de desarrollo (recreado automáticamente):
--   Email:    admin@restaurante.com
--   Password: admin123

-- ---------------------------------------------------------------------------
-- Usuario admin (auth + perfil)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  admin_id UUID := 'a0000000-0000-4000-8000-000000000001';
  admin_email TEXT := 'admin@restaurante.com';
BEGIN
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    admin_id,
    'authenticated',
    'authenticated',
    admin_email,
    crypt('admin123', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', 'Administrador', 'role', 'admin'),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = now();

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    admin_id,
    admin_id,
    admin_id::text,
    jsonb_build_object('sub', admin_id::text, 'email', admin_email, 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE
  SET
    identity_data = EXCLUDED.identity_data,
    updated_at = now();

  INSERT INTO public.profiles (id, email, name, role, active)
  VALUES (admin_id, admin_email, 'Administrador', 'admin', true)
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = 'admin',
    active = true;
END $$;

-- ---------------------------------------------------------------------------
-- Restaurante y catálogo base
-- ---------------------------------------------------------------------------
INSERT INTO public.restaurants (name, ruc, address, phone, sri_environment, default_tip_percent)
SELECT
  'Mi Restaurante',
  '0000000000001',
  'Dirección pendiente de configurar',
  NULL,
  'test',
  0.00
WHERE NOT EXISTS (SELECT 1 FROM public.restaurants LIMIT 1);

INSERT INTO public.kitchen_stations (name, slug) VALUES
  ('Cocina caliente', 'hot'),
  ('Cocina fría', 'cold'),
  ('Bar / Bebidas', 'bar')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (name, sort_order)
SELECT v.name, v.sort_order
FROM (VALUES
  ('Entradas', 1),
  ('Platos fuertes', 2),
  ('Bebidas', 3),
  ('Postres', 4)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.name = v.name
);

INSERT INTO public.restaurant_tables (number, capacity, position_x, position_y)
SELECT n, 4, (n - 1) % 4 * 120, ((n - 1) / 4) * 120
FROM generate_series(1, 8) AS n
ON CONFLICT (number) DO NOTHING;
