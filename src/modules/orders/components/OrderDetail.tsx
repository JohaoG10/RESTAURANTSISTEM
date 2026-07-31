import { useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Link } from "react-router-dom";
import type { UserRole } from "../../auth/types";
import type { MenuItem, Order, OrderItemWithServed } from "../api";
import { takeawayLabel } from "../api";
import { ItemNotesEditorModal } from "./ItemNotesEditorModal";
import { orderItemVariants } from "../../../lib/animations/motion";

type Props = {
  orders: Order[];
  selectedOrder: Order | null;
  orderItems: OrderItemWithServed[];
  menuMap: Map<string, MenuItem>;
  tableNumber: number | null;
  selectedTableStatus: string | null;
  onStartOrder: () => void;
  onSelectOrder: (orderId: string) => void;
  onMarkServed: (item: OrderItemWithServed) => void;
  onMarkAllServed: (item: OrderItemWithServed) => void;
  onSaveItem: (item: OrderItemWithServed, qty: number, note: string) => Promise<void>;
  onSaveItemNotes: (item: OrderItemWithServed, unitNotes: string[]) => Promise<void>;
  onDeleteItem: (item: OrderItemWithServed) => void;
  onDeleteOrder: (order: Order) => void;
  userRole: UserRole;
  onCloseOrder: (order: Order) => void;
  onBackToTables: () => void;
  onSwitchToMenu: () => void;
  closingOrder?: boolean;
};

function timeLabel(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  open: "Abierta",
  in_progress: "En preparación",
  ready: "Lista",
  served: "Servida",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

function isMobileSwipeEnabled() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function SwipeOrderItem({
  children,
  onSwipeDelete,
  canSwipe,
}: {
  children: React.ReactNode;
  onSwipeDelete: () => void;
  canSwipe: boolean;
}) {
  if (!canSwipe) return <>{children}</>;

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -80) onSwipeDelete();
  }

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: -100, right: 0 }}
      dragElastic={0.15}
      onDragEnd={handleDragEnd}
      style={{ touchAction: "pan-y" }}
    >
      {children}
    </motion.div>
  );
}

export function OrderDetail({
  orders,
  selectedOrder,
  orderItems,
  menuMap,
  tableNumber,
  selectedTableStatus,
  onStartOrder,
  onSelectOrder,
  onMarkServed,
  onMarkAllServed,
  onSaveItem,
  onSaveItemNotes,
  onDeleteItem,
  onDeleteOrder,
  userRole,
  onCloseOrder,
  onBackToTables,
  onSwitchToMenu,
  closingOrder = false,
}: Props) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [editNote, setEditNote] = useState("");
  const [notesEditItem, setNotesEditItem] = useState<OrderItemWithServed | null>(null);
  const [saving, setSaving] = useState(false);

  function openEdit(item: OrderItemWithServed) {
    if (item.quantity > 1) {
      setNotesEditItem(item);
      return;
    }
    setEditId(item.id);
    setEditQty(item.quantity);
    setEditNote(item.notes ?? "");
  }

  async function saveEdit(item: OrderItemWithServed) {
    if (editQty < 1) return;
    setSaving(true);
    try {
      await onSaveItem(item, editQty, editNote.trim());
      setEditId(null);
    } finally {
      setSaving(false);
    }
  }

  if (!selectedOrder) {
    if (tableNumber != null && selectedTableStatus === "available") {
      return (
        <section className="orders-col orders-col--center">
          <div className="orders-center__available">
            <h2 className="orders-center__available-title">Mesa {tableNumber}</h2>
            <span className="orders-center__available-badge">Disponible</span>
            <button type="button" className="orders-center__start-btn" onClick={onStartOrder}>
              + Iniciar comanda
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="orders-col orders-col--center">
        <div className="orders-center__empty">
          <span className="orders-center__empty-icon" aria-hidden>
            🍽️
          </span>
          <p>Selecciona una mesa</p>
        </div>
      </section>
    );
  }

  const order = selectedOrder;
  const items = orderItems.filter(
    (it) => it.order_id === order.id && it.status !== "cancelled"
  );
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const delivered = items.reduce((s, i) => s + i.served_quantity, 0);
  const progressPct = totalQty > 0 ? (delivered / totalQty) * 100 : 0;
  const total = items.reduce((s, i) => s + i.price_at_order * i.quantity, 0);
  const hasMultipleOrders = orders.length > 1;
  const mobileSwipe = isMobileSwipeEnabled();

  function renderOrderFooter() {
    if (userRole === "admin") {
      return (
        <footer className="orders-center__footer orders-center__footer--in-scroll">
          {order.status === "served" && (
            <p className="orders-center__pending-notice">⏳ Pendiente de cobro</p>
          )}
          <div className="orders-center__total-row">
            <span>Total comanda:</span>
            <strong>${total.toFixed(2)}</strong>
          </div>
          <div className="orders-center__footer-actions">
            {order.status !== "served" && items.length > 0 && (
              <button
                type="button"
                className="orders-center__close-btn"
                disabled={closingOrder}
                onClick={() => onCloseOrder(order)}
              >
                {closingOrder ? "Cerrando…" : "Cerrar comanda ✓"}
              </button>
            )}
            <Link
              to={`/billing?order=${order.id}`}
              className="orders-center__checkout orders-center__checkout--secondary"
            >
              Ir a cobro →
            </Link>
          </div>
        </footer>
      );
    }

    if (userRole === "waiter") {
      if (items.length === 0) {
        return (
          <div className="orders-center__scroll-actions orders-center__scroll-actions--compact orders-center__scroll-actions--waiter-wide">
            <button
              type="button"
              className="orders-center__cancel-btn"
              onClick={() => onDeleteOrder(order)}
            >
              🗑 Cancelar comanda
            </button>
          </div>
        );
      }

      if (order.status === "served") {
        return (
          <div className="orders-center__scroll-actions orders-center__scroll-actions--compact orders-center__scroll-actions--waiter-wide">
            <p className="orders-center__pending-notice">⏳ Pendiente de cobro</p>
            <Link
              to={`/billing?order=${order.id}`}
              className="orders-center__close-btn orders-center__close-btn--solo orders-center__close-btn--billing"
            >
              Ir a cobro →
            </Link>
          </div>
        );
      }

      return (
        <div className="orders-center__scroll-actions orders-center__scroll-actions--compact orders-center__scroll-actions--waiter-wide">
          <p className="orders-center__total-ref orders-center__total-ref--desktop-only">
            Total referencia: <span>${total.toFixed(2)}</span>
          </p>
          <button
            type="button"
            className="orders-center__close-btn orders-center__close-btn--solo"
            disabled={closingOrder}
            onClick={() => onCloseOrder(order)}
          >
            {closingOrder ? "Cerrando…" : "Cerrar comanda ✓"}
          </button>
        </div>
      );
    }

    return (
      <footer className="orders-center__footer-waiter orders-center__footer--in-scroll">
        <p className="orders-center__total-ref">
          Total referencia: <span>${total.toFixed(2)}</span>
        </p>
      </footer>
    );
  }

  return (
    <section
      className={`orders-col orders-col--center${hasMultipleOrders ? " orders-col--center--multi" : ""}`}
    >
      <div className="orders-center__sticky-head">
        <header className="orders-center__header">
          <button
            type="button"
            className="orders-center__back"
            onClick={onBackToTables}
            aria-label="Volver a mesas"
          >
            ←
          </button>
          <div className="orders-center__header-main">
            {order.order_type === "takeaway" ? (
              <>
                <span className="orders-center__takeaway-badge" aria-hidden>
                  🛍
                </span>
                <h2 className="orders-center__title">{takeawayLabel(order)}</h2>
              </>
            ) : (
              <h2 className="orders-center__title">Mesa {tableNumber ?? "—"}</h2>
            )}
            <span className={`orders-center__badge orders-center__badge--${order.status}`}>
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
            <time className="orders-center__time">{timeLabel(order.created_at)}</time>
          </div>
          <button
            type="button"
            className="orders-center__anular"
            onClick={() => onDeleteOrder(order)}
          >
            Anular
          </button>
        </header>

        <div className="orders-center__progress-wrap">
          <div className="orders-center__progress-track">
            <div className="orders-center__progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="orders-center__progress-label">
            {delivered}/{totalQty} entregados
          </span>
        </div>

        {orders.length > 1 && (
          <div className="orders-center__tabs">
            {orders.map((ord) => (
              <button
                key={ord.id}
                type="button"
                className={`orders-center__tab${ord.id === order.id ? " orders-center__tab--active" : ""}`}
                onClick={() => onSelectOrder(ord.id)}
              >
                {ord.notes || "Comanda"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="orders-center__scroll-pane">
        {items.length === 0 ? (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                gap: "16px",
                padding: "32px",
                minHeight: "200px",
              }}
            >
              <span style={{ fontSize: "48px" }} aria-hidden>
                🍽️
              </span>
              <p style={{ color: "#9CA3AF", fontSize: "16px", margin: 0 }}>Sin platos aún</p>
              <button
                type="button"
                onClick={onSwitchToMenu}
                style={{
                  background: "#E8622A",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  padding: "14px 28px",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Agregar platos
              </button>
            </div>
            {renderOrderFooter()}
          </>
        ) : (
          <>
            <motion.div className="orders-center__items" layout>
              <AnimatePresence initial={false} mode="popLayout">
                {items.map((item) => {
                  const menu = menuMap.get(item.menu_item_id);
                  const servedQty =
                    item.served_quantity ?? (item.status === "served" ? item.quantity : 0);
                  const done = servedQty >= item.quantity;
                  const remaining = item.quantity - servedQty;
                  const partial = servedQty > 0 && !done;
                  const showDeliveryProgress = item.quantity > 1 || servedQty > 0;
                  const itemProgressPct =
                    item.quantity > 0 ? (servedQty / item.quantity) * 100 : 0;
                  const isEdit = editId === item.id;
                  const lineTotal = item.price_at_order * item.quantity;

                  if (isEdit) {
                    return (
                      <motion.article
                        key={item.id}
                        layout
                        variants={orderItemVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.25 }}
                        className="orders-item-card orders-item-card--editing"
                      >
                        <p className="orders-item-card__edit-title">{menu?.name ?? "Ítem"}</p>
                        <div className="orders-item-card__edit-qty">
                          <button
                            type="button"
                            className="orders-item-card__qty-btn"
                            disabled={saving || editQty <= Math.max(1, item.served_quantity)}
                            onClick={() =>
                              setEditQty((q) => Math.max(Math.max(1, item.served_quantity), q - 1))
                            }
                          >
                            −
                          </button>
                          <span className="orders-item-card__qty-val">{editQty}</span>
                          <button
                            type="button"
                            className="orders-item-card__qty-btn"
                            disabled={saving}
                            onClick={() => setEditQty((q) => q + 1)}
                          >
                            +
                          </button>
                        </div>
                        <label className="orders-item-card__note-label">
                          Nota:
                          <input
                            type="text"
                            className="orders-item-card__note-input"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            disabled={saving}
                          />
                        </label>
                        <div className="orders-item-card__edit-actions">
                          <button
                            type="button"
                            className="orders-item-card__save"
                            disabled={saving}
                            onClick={() => void saveEdit(item)}
                          >
                            {saving ? "Guardando…" : "Guardar"}
                          </button>
                          <button
                            type="button"
                            className="orders-item-card__cancel"
                            disabled={saving}
                            onClick={() => setEditId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </motion.article>
                    );
                  }

                  const card = (
                    <motion.article
                      layout
                      variants={orderItemVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={{ duration: 0.25 }}
                      className={`orders-item-card${done ? " orders-item-card--done" : partial ? " orders-item-card--partial" : ""}`}
                    >
                      <div className="orders-item-card__line1">
                        <span
                          className={`orders-item-card__qty${showDeliveryProgress ? " orders-item-card__qty--progress" : ""}`}
                          title={
                            showDeliveryProgress
                              ? `${servedQty} de ${item.quantity} entregados`
                              : undefined
                          }
                        >
                          {showDeliveryProgress ? `${servedQty}/${item.quantity}` : item.quantity}
                        </span>
                        <span className="orders-item-card__name">{menu?.name ?? "Ítem"}</span>
                        <span className="orders-item-card__price">${lineTotal.toFixed(2)}</span>
                      </div>

                      {item.notes ? (
                        <p className="orders-item-card__note">{item.notes}</p>
                      ) : null}

                      {showDeliveryProgress && !done ? (
                        <div className="orders-item-card__delivery">
                          <div className="orders-item-card__delivery-track" aria-hidden>
                            <div
                              className="orders-item-card__delivery-fill"
                              style={{ width: `${itemProgressPct}%` }}
                            />
                          </div>
                          <div className="orders-item-card__delivery-meta">
                            <span className="orders-item-card__delivery-count">
                              {servedQty} de {item.quantity} entregados
                            </span>
                            <span className="orders-item-card__delivery-remaining">
                              Faltan {remaining}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {done ? (
                        <span className="orders-item-card__done-badge">
                          ✓{" "}
                          {item.quantity > 1
                            ? `${item.quantity}/${item.quantity} entregados`
                            : "Entregado"}
                        </span>
                      ) : (
                        <div className="orders-item-card__actions">
                          <button
                            type="button"
                            className="orders-item-card__deliver"
                            onClick={() => onMarkServed(item)}
                          >
                            +1 Entregar
                          </button>
                          {remaining > 1 ? (
                            <button
                              type="button"
                              className="orders-item-card__deliver-all"
                              onClick={() => onMarkAllServed(item)}
                            >
                              Todo ({remaining})
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="orders-item-card__icon"
                            onClick={() => openEdit(item)}
                            aria-label="Editar"
                          >
                            ✏
                          </button>
                          <button
                            type="button"
                            className="orders-item-card__icon orders-item-card__icon--danger"
                            disabled={servedQty > 0}
                            onClick={() => onDeleteItem(item)}
                            aria-label="Eliminar"
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </motion.article>
                  );

                  return (
                    <motion.div key={item.id} layout>
                      <SwipeOrderItem
                        canSwipe={mobileSwipe && !done && servedQty === 0}
                        onSwipeDelete={() => onDeleteItem(item)}
                      >
                        {card}
                      </SwipeOrderItem>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
            {renderOrderFooter()}
          </>
        )}
      </div>

      <ItemNotesEditorModal
        open={notesEditItem !== null}
        item={notesEditItem}
        menuItem={
          notesEditItem ? menuMap.get(notesEditItem.menu_item_id) ?? null : null
        }
        busy={saving}
        onClose={() => setNotesEditItem(null)}
        onSave={async (item, unitNotes) => {
          setSaving(true);
          try {
            await onSaveItemNotes(item, unitNotes);
            setNotesEditItem(null);
          } finally {
            setSaving(false);
          }
        }}
      />
    </section>
  );
}
