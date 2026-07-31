-- Fase 0: tablas principales (single-tenant)

-- ---------------------------------------------------------------------------
-- Utilidad: updated_at automático
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Restaurante (single-tenant: una fila operativa)
-- ---------------------------------------------------------------------------
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ruc TEXT NOT NULL,
  address TEXT,
  logo_url TEXT,
  phone TEXT,
  sri_environment public.sri_environment NOT NULL DEFAULT 'test',
  default_tip_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER restaurants_set_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Perfiles (vinculados a auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'waiter',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX profiles_role_idx ON public.profiles (role);
CREATE INDEX profiles_active_idx ON public.profiles (active) WHERE active = true;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-crear perfil al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(
      CASE
        WHEN (NEW.raw_user_meta_data ->> 'role') IN ('admin', 'waiter', 'kitchen')
          THEN (NEW.raw_user_meta_data ->> 'role')::public.user_role
      END,
      'waiter'
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Menú
-- ---------------------------------------------------------------------------
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX categories_sort_order_idx ON public.categories (sort_order);

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.kitchen_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  status public.menu_item_status NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  -- Soft delete estándar
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX menu_items_category_idx ON public.menu_items (category_id);
CREATE INDEX menu_items_active_idx ON public.menu_items (category_id, sort_order)
  WHERE deleted_at IS NULL;
CREATE INDEX menu_items_deleted_at_idx ON public.menu_items (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE TRIGGER menu_items_set_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.menu_item_stations (
  menu_item_id UUID NOT NULL REFERENCES public.menu_items (id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES public.kitchen_stations (id) ON DELETE CASCADE,
  PRIMARY KEY (menu_item_id, station_id)
);

-- ---------------------------------------------------------------------------
-- Mesas y asignaciones
-- ---------------------------------------------------------------------------
CREATE TABLE public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL,
  capacity INT NOT NULL CHECK (capacity > 0),
  status public.table_status NOT NULL DEFAULT 'available',
  position_x NUMERIC(10, 2) NOT NULL DEFAULT 0,
  position_y NUMERIC(10, 2) NOT NULL DEFAULT 0,
  merged_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_tables_number_unique UNIQUE (number)
);

CREATE INDEX restaurant_tables_status_idx ON public.restaurant_tables (status);
CREATE INDEX restaurant_tables_merged_group_idx ON public.restaurant_tables (merged_group_id)
  WHERE merged_group_id IS NOT NULL;

CREATE TRIGGER restaurant_tables_set_updated_at
  BEFORE UPDATE ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.table_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.restaurant_tables (id) ON DELETE CASCADE,
  waiter_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  UNIQUE (table_id, waiter_id, assigned_at)
);

CREATE INDEX table_assignments_waiter_active_idx
  ON public.table_assignments (waiter_id)
  WHERE released_at IS NULL;

-- ---------------------------------------------------------------------------
-- Turnos de caja
-- ---------------------------------------------------------------------------
CREATE TABLE public.cash_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  closed_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  opening_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
  closing_amount NUMERIC(12, 2) CHECK (closing_amount >= 0),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX cash_shifts_open_idx ON public.cash_shifts (opened_at DESC)
  WHERE closed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Comandas
-- ---------------------------------------------------------------------------
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.restaurant_tables (id) ON DELETE RESTRICT,
  waiter_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  cash_shift_id UUID REFERENCES public.cash_shifts (id) ON DELETE SET NULL,
  status public.order_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  closed_at TIMESTAMPTZ,
  -- Soft delete estándar
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_table_idx ON public.orders (table_id);
CREATE INDEX orders_waiter_idx ON public.orders (waiter_id);
CREATE INDEX orders_active_idx ON public.orders (table_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX orders_deleted_at_idx ON public.orders (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items (id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  notes TEXT,
  status public.order_item_status NOT NULL DEFAULT 'pending',
  price_at_order NUMERIC(12, 2) NOT NULL CHECK (price_at_order >= 0),
  split_account_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_idx ON public.order_items (order_id);
CREATE INDEX order_items_status_idx ON public.order_items (status)
  WHERE status IN ('pending', 'preparing');

CREATE TRIGGER order_items_set_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cobros
-- ---------------------------------------------------------------------------
CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  status public.bill_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tip_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),
  tip_percent NUMERIC(5, 2),
  total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_at TIMESTAMPTZ,
  -- Soft delete estándar
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bills_order_idx ON public.bills (order_id);
CREATE INDEX bills_active_idx ON public.bills (order_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX bills_deleted_at_idx ON public.bills (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE TRIGGER bills_set_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills (id) ON DELETE RESTRICT,
  order_item_id UUID NOT NULL REFERENCES public.order_items (id) ON DELETE RESTRICT,
  UNIQUE (bill_id, order_item_id)
);

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills (id) ON DELETE RESTRICT,
  method public.payment_method NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE INDEX payments_bill_idx ON public.payments (bill_id);

-- ---------------------------------------------------------------------------
-- Facturación SRI
-- ---------------------------------------------------------------------------
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills (id) ON DELETE RESTRICT,
  invoice_type public.invoice_type NOT NULL DEFAULT 'sales_note',
  customer_ruc TEXT,
  customer_name TEXT NOT NULL,
  customer_address TEXT,
  customer_email TEXT,
  access_key TEXT,
  xml_url TEXT,
  ride_url TEXT,
  sri_status public.sri_status NOT NULL DEFAULT 'draft',
  sri_response JSONB,
  authorized_at TIMESTAMPTZ,
  -- Soft delete estándar
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invoices_bill_idx ON public.invoices (bill_id);
CREATE INDEX invoices_sri_status_idx ON public.invoices (sri_status)
  WHERE deleted_at IS NULL;
CREATE INDEX invoices_access_key_idx ON public.invoices (access_key)
  WHERE access_key IS NOT NULL;
CREATE INDEX invoices_deleted_at_idx ON public.invoices (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invoice_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices (id) ON DELETE RESTRICT,
  from_status public.sri_status,
  to_status public.sri_status NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invoice_events_invoice_idx ON public.invoice_events (invoice_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  action public.audit_action NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity, entity_id);
CREATE INDEX audit_logs_user_idx ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
