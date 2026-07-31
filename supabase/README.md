# Base de datos — Sistema POS Restaurante

## Requisitos

- [Supabase CLI](https://supabase.com/docs/guides/cli) instalado
- Docker Desktop (para `supabase start` local)

## Comandos

```bash
# Iniciar stack local (Docker debe estar corriendo)
supabase start

# Ver URL y claves (copiar a .env.local)
supabase status

# Aplicar migraciones nuevas sin borrar datos
supabase migration up

# Aplicar migraciones (recrea BD + seed; solo desarrollo)
supabase db reset

# Generar tipos TypeScript (desde la raíz del repo)
npm run db:types
```

## Variables de entorno (desarrollo local)

Copia `.env.example` a `.env.local` y usa los valores de `supabase status`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<Publishable key de supabase status>
```

Reinicia `npm run dev` después de cambiar `.env.local`.

## Migraciones (orden)

| Archivo | Contenido |
|---------|-----------|
| `20250527000001_extensions_and_enums.sql` | Extensiones y ENUMs de estados |
| `20250527000002_core_tables.sql` | Tablas, índices, triggers `updated_at` |
| `20250527000003_soft_delete_and_helpers.sql` | RPC soft delete/restore, validaciones, estados |
| `20250527000004_rls_policies.sql` | RLS por rol (admin, waiter, kitchen) |
| `20250527000005_views_and_grants.sql` | Vistas `*_active`, grants, Realtime |
| `20250527000006_order_items_served_quantity.sql` | Entregas parciales (`served_quantity`) |
| `20250527000007_order_items_modification_tracking.sql` | Modificado/cancelado en KDS |
| `20250527000008_billing_rpcs.sql` | Pre-cuenta, propina y pagos (RPC) |

## Usuario administrador (desarrollo local)

Cada `supabase db reset` recrea el admin desde `seed.sql`:

| Campo    | Valor                    |
|----------|--------------------------|
| Email    | `admin@restaurante.com`  |
| Password | `admin123`               |

Para otro usuario admin en producción, regístrate en Auth y actualiza el rol:

```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'tu@email.com';
```

## Soft delete

Nunca usar `DELETE` en `menu_items`, `orders`, `bills`, `invoices`.

Usar RPC:

- `soft_delete_menu_item(id, reason)`
- `soft_delete_order(id, reason)`
- `soft_delete_bill(id, reason)`
- `soft_delete_invoice(id, reason)`
- `restore_*` (solo admin)

## Vistas operativas

Consultar por defecto:

- `menu_items_active`
- `orders_active`
- `bills_active`
- `invoices_active`

## Tipos TypeScript

Tras levantar Supabase local:

```bash
npm run db:types
```

Genera `src/types/database.types.ts` para el cliente tipado.
