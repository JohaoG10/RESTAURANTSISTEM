import type { Order, OrderItemWithServed, RestaurantTable } from "../api";
import { takeawayLabel } from "../api";

type Props = {
  tables: RestaurantTable[];
  orders: Order[];
  orderItems: OrderItemWithServed[];
  selectedTableId: string | null;
  selectedOrderId: string | null;
  onSelectTable: (tableId: string) => void;
  onSelectTakeawayOrder: (orderId: string) => void;
  onNewOrder: () => void;
  onNewTakeaway: () => void;
};

export function OrdersTablesList({
  tables,
  orders,
  orderItems,
  selectedTableId,
  selectedOrderId,
  onSelectTable,
  onSelectTakeawayOrder,
  onNewOrder,
  onNewTakeaway,
}: Props) {
  const occupied = tables.filter((t) => t.status === "occupied");
  const available = tables.filter((t) => t.status !== "occupied");
  const takeawayOrders = orders.filter((o) => o.order_type === "takeaway");

  function getTableSummary(tableId: string) {
    const tableOrders = orders.filter((o) => o.table_id === tableId);
    const tableOrderIds = new Set(tableOrders.map((o) => o.id));
    const tableItems = orderItems.filter(
      (it) => tableOrderIds.has(it.order_id) && it.status !== "cancelled"
    );
    const count = tableItems.length;
    const total = tableItems.reduce((s, it) => s + it.price_at_order * it.quantity, 0);
    const pendingPayment = tableOrders.some((o) => o.status === "served");
    return { count, total, pendingPayment };
  }

  function getTakeawayOrderSummary(orderId: string) {
    const items = orderItems.filter(
      (it) => it.order_id === orderId && it.status !== "cancelled"
    );
    const count = items.length;
    const total = items.reduce((s, it) => s + it.price_at_order * it.quantity, 0);
    const pendingPayment =
      orders.find((o) => o.id === orderId)?.status === "served";
    return { count, total, pendingPayment };
  }

  return (
    <aside className="orders-col orders-col--left">
      <div className="orders-col__mobile-top">
        <button type="button" className="orders-btn-new" onClick={onNewOrder}>
          + Nueva comanda
        </button>
        <button type="button" className="orders-btn-takeaway" onClick={onNewTakeaway}>
          🛍 Para llevar
        </button>
      </div>

      <div className="orders-col__scroll">
        <header className="orders-col__header">
          <h2 className="orders-col__title">Mesas</h2>
        </header>

        {occupied.length > 0 && (
          <div className="orders-section">
            <div className="orders-section__label">
              <span>Ocupadas</span>
            </div>
            {occupied.map((table) => {
              const selected = table.id === selectedTableId;
              const { count, total, pendingPayment } = getTableSummary(table.id);
              return (
                <button
                  key={table.id}
                  type="button"
                  className={`orders-table-card orders-table-card--busy${pendingPayment ? " orders-table-card--pending" : ""}${selected ? " orders-table-card--selected" : ""}`}
                  onClick={() => onSelectTable(table.id)}
                >
                  <div className="orders-table-card__row">
                    <span
                      className={`orders-table-card__dot${pendingPayment ? " orders-table-card__dot--pending" : " orders-table-card__dot--busy"}`}
                      aria-hidden
                    >
                      {pendingPayment ? "💳" : "●"}
                    </span>
                    <span className="orders-table-card__name">Mesa {table.number}</span>
                    <span className="orders-table-card__amount">${total.toFixed(2)}</span>
                  </div>
                  <span className="orders-table-card__meta">
                    {pendingPayment
                      ? "Pendiente de cobro"
                      : `${count} ítem${count !== 1 ? "s" : ""}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Sección PARA LLEVAR ── */}
        {takeawayOrders.length > 0 && (
          <div className="orders-section">
            <div className="orders-section__label orders-section__label--takeaway">
              <span>🛍 Para llevar</span>
            </div>
            {takeawayOrders.map((order) => {
              const selected = order.id === selectedOrderId && !selectedTableId;
              const { count, total, pendingPayment } = getTakeawayOrderSummary(order.id);
              const num = (order.takeaway_number ?? 0).toString().padStart(3, "0");
              return (
                <button
                  key={order.id}
                  type="button"
                  className={`orders-table-card orders-table-card--takeaway${pendingPayment ? " orders-table-card--pending" : ""}${selected ? " orders-table-card--selected" : ""}`}
                  onClick={() => onSelectTakeawayOrder(order.id)}
                >
                  <div className="orders-table-card__row">
                    <span className="orders-table-card__dot orders-table-card__dot--takeaway" aria-hidden>
                      🛍
                    </span>
                    <span className="orders-table-card__name">
                      {order.customer_name || "Cliente"}
                    </span>
                    <span className="orders-table-card__amount">${total.toFixed(2)}</span>
                  </div>
                  <div className="orders-table-card__row orders-table-card__row--sub">
                    <span className="orders-table-card__takeaway-num">#{num}</span>
                    <span className="orders-table-card__meta">
                      {pendingPayment
                        ? "💳 Pendiente de cobro"
                        : `${count} ítem${count !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {available.length > 0 && (
          <div className="orders-section">
            <div className="orders-section__label">
              <span>Disponibles</span>
            </div>
            {available.map((table) => {
              const selected = table.id === selectedTableId;
              return (
                <button
                  key={table.id}
                  type="button"
                  className={`orders-table-card orders-table-card--free${selected ? " orders-table-card--selected" : ""}`}
                  onClick={() => onSelectTable(table.id)}
                >
                  <div className="orders-table-card__row">
                    <span className="orders-table-card__dot orders-table-card__dot--free" aria-hidden>
                      ○
                    </span>
                    <span className="orders-table-card__name">Mesa {table.number}</span>
                    <span className="orders-table-card__status">Libre</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
