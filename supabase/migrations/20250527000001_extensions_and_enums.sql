-- Fase 0: extensiones y tipos enumerados
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Roles de usuario
CREATE TYPE public.user_role AS ENUM ('admin', 'waiter', 'kitchen');

-- Ambiente SRI
CREATE TYPE public.sri_environment AS ENUM ('test', 'production');

-- Estados operativos
CREATE TYPE public.table_status AS ENUM (
  'available',
  'occupied',
  'reserved'
);

CREATE TYPE public.menu_item_status AS ENUM (
  'active',
  'inactive',
  'out_of_stock'
);

CREATE TYPE public.order_status AS ENUM (
  'draft',
  'open',
  'in_progress',
  'ready',
  'served',
  'closed',
  'cancelled'
);

CREATE TYPE public.order_item_status AS ENUM (
  'pending',
  'preparing',
  'ready',
  'served',
  'cancelled'
);

CREATE TYPE public.bill_status AS ENUM (
  'draft',
  'pending_payment',
  'partially_paid',
  'paid',
  'voided',
  'refunded'
);

CREATE TYPE public.payment_method AS ENUM (
  'cash',
  'card',
  'transfer'
);

CREATE TYPE public.sri_status AS ENUM (
  'draft',
  'xml_generated',
  'signed',
  'submitted',
  'received',
  'authorized',
  'rejected',
  'error',
  'void_requested',
  'voided'
);

CREATE TYPE public.invoice_type AS ENUM (
  'invoice',
  'sales_note'
);

CREATE TYPE public.audit_action AS ENUM (
  'create',
  'update',
  'delete',
  'soft_delete',
  'restore',
  'status_change',
  'payment',
  'invoice_emit',
  'invoice_void',
  'login',
  'config_change'
);
