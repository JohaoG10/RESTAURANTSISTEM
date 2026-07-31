# Modelo de datos — resumen

## Tablas principales

| Tabla | Descripción |
|-------|-------------|
| `restaurants` | Datos del restaurante (single-tenant) |
| `profiles` | Usuarios y roles (`admin`, `waiter`, `kitchen`) |
| `categories` | Categorías del menú |
| `menu_items` | Platos (+ soft delete) |
| `kitchen_stations` | Estaciones de cocina (hot, cold, bar) |
| `menu_item_stations` | Relación plato ↔ estación |
| `restaurant_tables` | Mesas del salón |
| `table_assignments` | Mesas asignadas a meseros |
| `cash_shifts` | Apertura/cierre de caja |
| `orders` | Comandas (+ soft delete) |
| `order_items` | Ítems de comanda con `price_at_order` |
| `bills` | Cuentas/cobros (+ soft delete) |
| `bill_items` | Ítems incluidos en una cuenta |
| `payments` | Pagos múltiples por cuenta |
| `invoices` | Facturas SRI (+ soft delete) |
| `invoice_events` | Historial de estados SRI |
| `audit_logs` | Auditoría de acciones críticas |

## Soft delete (columnas estándar)

En `menu_items`, `orders`, `bills`, `invoices`:

- `deleted_at`
- `deleted_by`
- `delete_reason`

## Contrato de estados

### `orders.status`

`draft` → `open` → `in_progress` → `ready` → `served` → `closed`  
Cancelación desde: `draft`, `open`, `in_progress`

### `bills.status`

`draft` → `pending_payment` → `partially_paid` → `paid`  
`voided` desde `draft` o `pending_payment`  
`refunded` desde `paid`

### `invoices.sri_status`

`draft` → `xml_generated` → `signed` → `submitted` → `received` → `authorized`  
Ramas de error: `rejected`, `error`  
Anulación: `authorized` → `void_requested` → `voided`

## RPC disponibles

- `advance_order_status(order_id, new_status)`
- `advance_bill_status(bill_id, new_status)`
- `create_bill_from_order(order_id, tip_percent?)` — pre-cuenta desde comanda
- `update_bill_tip(bill_id, tip_percent)` — solo en estado `draft`
- `register_payment(bill_id, method, amount, reference?)` — pagos mixtos; al completar cierra comanda y mesa
- `soft_delete_*` / `restore_*`

## RLS (resumen)

| Rol | Acceso |
|-----|--------|
| **admin** | Completo |
| **waiter** | Mesas asignadas, sus órdenes, cobros |
| **kitchen** | Lectura de órdenes/ítems; actualización de estado de ítems |
