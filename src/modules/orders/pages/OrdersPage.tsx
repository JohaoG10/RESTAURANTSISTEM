import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/context/AuthProvider";
import { AppToast } from "../../../app/components/AppToast";
import {
  addItemToOrder,
  advanceOrderToServed,
  cancelOrder,
  cancelOrderItem,
  computeFullyServedState,
  computeNextServedState,
  createOrder,
  createTakeawayOrder,
  fetchActiveOrders,
  fetchAvailableMenuItems,
  fetchOrderItems,
  fetchTablesForOrders,
  markOrderItemFullyServed,
  markOrderItemServed,
  splitOrderItemByUnitNotes,
  setTableStatus,
  syncTableStatusByActiveOrders,
  updateOrderItem,
  type MenuItem,
  type Order,
  type OrderItemWithServed,
  type RestaurantTable,
} from "../api";
import { supabase } from "../../../lib/supabase";
import { fetchCategories } from "../../menu/api";
import { OrdersTablesList } from "../components/OrdersTablesList";
import { OrderDetail } from "../components/OrderDetail";
import { OrdersMenu } from "../components/OrdersMenu";
import { AddItemModal } from "../components/AddItemModal";
import { ConfirmModal, type ConfirmVariant } from "../components/ConfirmModal";
import { OrdersMobileTabs } from "../components/OrdersMobileTabs";
import { NewOrderModal } from "../components/NewOrderModal";
import { TakeawayModal } from "../components/TakeawayModal";

type Category = { id: string; name: string; active: boolean };
type MobileTab = "tables" | "order" | "menu";

type PendingConfirm = {
  title: string;
  message: string;
  confirmLabel: string;
  variant: ConfirmVariant;
  action: () => Promise<void>;
};

export function OrdersPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemWithServed[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [addItemTarget, setAddItemTarget] = useState<MenuItem | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderPresetTableId, setNewOrderPresetTableId] = useState<string | null>(null);
  const [takeawayModalOpen, setTakeawayModalOpen] = useState(false);
  const [takeawayPreviewNumber, setTakeawayPreviewNumber] = useState(1);
  const [mobileTab, setMobileTab] = useState<MobileTab>("tables");
  const [closingOrder, setClosingOrder] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const skipRealtimeRef = useRef(false);
  const tablesPaneRef = useRef<HTMLDivElement>(null);
  const menuPaneRef = useRef<HTMLDivElement>(null);
  const menuSearchRef = useRef<HTMLInputElement>(null);
  const [menuPaneFocused, setMenuPaneFocused] = useState(false);

  const tableOrders = useMemo(() => {
    if (selectedTableId) {
      return orders.filter((o) => o.table_id === selectedTableId);
    }
    // Para pedido takeaway seleccionado directamente por ID
    if (selectedOrderId) {
      const order = orders.find((o) => o.id === selectedOrderId);
      return order ? [order] : [];
    }
    return [];
  }, [orders, selectedTableId, selectedOrderId]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? tableOrders[0] ?? null,
    [orders, selectedOrderId, tableOrders]
  );

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId) ?? null,
    [tables, selectedTableId]
  );

  const selectedTableNumber = selectedTable?.number ?? null;
  const selectedTableStatus = selectedTable?.status ?? null;

  const menuMap = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of menuItems) map.set(item.id, item);
    return map;
  }, [menuItems]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [tableRows, orderRows, menuRows, catRows] = await Promise.all([
        fetchTablesForOrders(),
        fetchActiveOrders(),
        fetchAvailableMenuItems(),
        fetchCategories(),
      ]);
      const orderIds = orderRows.map((o) => o.id);
      const itemRows = await fetchOrderItems(orderIds);

      setTables(tableRows);
      setOrders(orderRows);
      setOrderItems(itemRows);
      setMenuItems(menuRows);
      setCategories(catRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar comandas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        if (!skipRealtimeRef.current) void loadAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        if (!skipRealtimeRef.current) void loadAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, () => {
        if (!skipRealtimeRef.current) void loadAll();
      })
      .subscribe();

    return () => void supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (!successToast) return;
    const timer = window.setTimeout(() => setSuccessToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [successToast]);

  function handleSelectTable(tableId: string) {
    setSelectedTableId(tableId);
    const tableOrdersList = orders.filter((o) => o.table_id === tableId);
    setSelectedOrderId(tableOrdersList[0]?.id ?? null);
    setMobileTab("order");
  }

  function handleSelectTakeawayOrder(orderId: string) {
    setSelectedTableId(null);
    setSelectedOrderId(orderId);
    setMobileTab("order");
  }

  async function handleOpenTakeawayModal() {
    try {
      const { getNextTakeawayNumber } = await import("../api");
      const next = await getNextTakeawayNumber();
      setTakeawayPreviewNumber(next);
    } catch {
      setTakeawayPreviewNumber(1);
    }
    setTakeawayModalOpen(true);
  }

  async function handleNewTakeawayOrder(customerName: string) {
    if (!profile?.id) return;
    setBusy(true);
    try {
      const created = await createTakeawayOrder({
        waiter_id: profile.id,
        customer_name: customerName || null,
      });
      await loadAll();
      setSelectedTableId(null);
      setSelectedOrderId(created.id);
      setSuccessToast("Pedido para llevar creado");
      setTakeawayModalOpen(false);
      setMobileTab("order");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear pedido para llevar");
    } finally {
      setBusy(false);
    }
  }

  async function handleNewOrder(tableId: string, label: string) {
    if (!profile?.id) return;
    setBusy(true);
    try {
      const created = await createOrder({
        table_id: tableId,
        waiter_id: profile.id,
        status: "open",
        notes: label || null,
      });
      await setTableStatus(tableId, "occupied");
      await loadAll();
      setSelectedTableId(tableId);
      setSelectedOrderId(created.id);
      setSuccessToast("Comanda creada");
      setMobileTab("order");
      setNewOrderPresetTableId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear comanda");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddItem(item: MenuItem, quantity: number, note: string) {
    if (!selectedOrder) return;
    setBusy(true);
    try {
      await addItemToOrder({
        order_id: selectedOrder.id,
        menu_item_id: item.id,
        quantity,
        notes: note || null,
        status: "pending",
        price_at_order: item.price,
      });
      await loadAll();
      setSuccessToast(`${item.name} agregado`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar ítem");
    } finally {
      setBusy(false);
    }
  }

  async function applyServedUpdate(
    item: OrderItemWithServed,
    optimisticNext: { served_quantity: number; status: OrderItemWithServed["status"] },
    persist: () => Promise<OrderItemWithServed>
  ) {
    if (item.served_quantity >= item.quantity) return;

    const previousItems = orderItems;

    setOrderItems((prev) =>
      prev.map((row) =>
        row.id === item.id
          ? { ...row, served_quantity: optimisticNext.served_quantity, status: optimisticNext.status }
          : row
      )
    );

    skipRealtimeRef.current = true;
    try {
      const updated = await persist();
      setOrderItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, ...updated } : row))
      );
    } catch (err) {
      setOrderItems(previousItems);
      setError(err instanceof Error ? err.message : "No se pudo marcar como entregado");
    } finally {
      window.setTimeout(() => {
        skipRealtimeRef.current = false;
      }, 800);
    }
  }

  async function handleMarkServed(item: OrderItemWithServed) {
    await applyServedUpdate(item, computeNextServedState(item), () => markOrderItemServed(item.id));
  }

  async function handleMarkAllServed(item: OrderItemWithServed) {
    await applyServedUpdate(item, computeFullyServedState(item), () =>
      markOrderItemFullyServed(item.id)
    );
  }

  async function handleSaveItem(item: OrderItemWithServed, qty: number, note: string) {
    try {
      await updateOrderItem(item.id, { quantity: qty, notes: note || null });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo editar");
    }
  }

  async function handleSaveItemNotes(item: OrderItemWithServed, unitNotes: string[]) {
    try {
      await splitOrderItemByUnitNotes(item, unitNotes);
      await loadAll();
      setSuccessToast("Notas actualizadas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar las notas");
    }
  }

  function handleDeleteItem(item: OrderItemWithServed) {
    setPendingConfirm({
      title: "Eliminar ítem",
      message: "¿Eliminar este ítem de la comanda?",
      confirmLabel: "Eliminar",
      variant: "danger",
      action: async () => {
        await cancelOrderItem(item.id);
        await loadAll();
      },
    });
  }

  function handleDeleteOrder(order: Order) {
    setPendingConfirm({
      title: "Anular comanda",
      message: "¿Anular esta comanda? Esta acción no se puede deshacer.",
      confirmLabel: "Anular",
      variant: "danger",
      action: async () => {
        await cancelOrder(order.id);
        if (order.table_id) await syncTableStatusByActiveOrders(order.table_id);
        setSelectedOrderId(null);
        setSelectedTableId(null);
        await loadAll();
      },
    });
  }

  function handleCloseOrder(order: Order) {
    const activeItems = orderItems.filter(
      (it) => it.order_id === order.id && it.status !== "cancelled"
    );
    const pendingCount = activeItems.filter(
      (it) => it.served_quantity < it.quantity
    ).length;
    const tableNum = tables.find((t) => t.id === order.table_id)?.number;
    const mesaLabel = tableNum != null ? `Mesa ${tableNum}` : "la comanda";

    const allDelivered = pendingCount === 0;
    const title = allDelivered ? "Cerrar comanda" : "Ítems sin entregar";
    const message = allDelivered
      ? `¿Confirmar cierre de ${mesaLabel}? Pasará automáticamente a cobro.`
      : `Aún hay ${pendingCount} ítem${pendingCount !== 1 ? "s" : ""} sin entregar en ${mesaLabel}. ¿Deseas cerrarla de todas formas?`;
    const confirmLabel = allDelivered ? "Cerrar comanda" : "Cerrar de todas formas";
    const variant = allDelivered ? "success" : "danger";

    setPendingConfirm({
      title,
      message,
      confirmLabel,
      variant,
      action: async () => {
        setClosingOrder(true);
        setError(null);
        try {
          if (order.status !== "served") {
            await advanceOrderToServed(order.id);
            await loadAll();
          }
          navigate(`/billing?order=${order.id}`);
        } finally {
          setClosingOrder(false);
        }
      },
    });
  }

  async function handleConfirmAction() {
    if (!pendingConfirm) return;
    setConfirmBusy(true);
    setError(null);
    try {
      await pendingConfirm.action();
      setPendingConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción");
    } finally {
      setConfirmBusy(false);
    }
  }

  function handleStartOrderForTable() {
    if (!selectedTableId) return;
    setNewOrderPresetTableId(selectedTableId);
    setNewOrderOpen(true);
  }

  function handleOpenNewOrderModal() {
    setNewOrderPresetTableId(null);
    setNewOrderOpen(true);
  }

  function handleCloseNewOrderModal() {
    setNewOrderOpen(false);
    setNewOrderPresetTableId(null);
  }

  function isCompactOrdersLayout() {
    return window.matchMedia("(max-width: 1023px)").matches;
  }

  function handleBackToTables() {
    setMobileTab("tables");
    if (window.matchMedia("(max-width: 900px)").matches) return;
    if (isCompactOrdersLayout()) {
      tablesPaneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function handleSwitchToMenu() {
    if (window.matchMedia("(max-width: 900px)").matches) {
      setMobileTab("menu");
      return;
    }
    setMenuPaneFocused(true);
    menuPaneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.setTimeout(() => menuSearchRef.current?.focus(), 200);
  }

  function handleSelectMenuItem(item: MenuItem) {
    if (!selectedOrder) {
      setError("Selecciona una mesa con comanda activa primero.");
      return;
    }
    setAddItemTarget(item);
  }

  return (
    <main className="orders-page">
      {error ? <p className="billing-error orders-page__toast">{error}</p> : null}

      {loading ? (
        <div className="orders-page__loading">Cargando comandas…</div>
      ) : (
        <div className="orders-shell">
          <div
            ref={tablesPaneRef}
            className={`orders-shell__pane orders-shell__pane--left${mobileTab === "tables" ? " orders-shell__pane--visible" : ""}`}
          >
            <OrdersTablesList
              tables={tables}
              orders={orders}
              orderItems={orderItems}
              selectedTableId={selectedTableId}
              selectedOrderId={selectedOrderId}
              onSelectTable={handleSelectTable}
              onSelectTakeawayOrder={handleSelectTakeawayOrder}
              onNewOrder={handleOpenNewOrderModal}
              onNewTakeaway={() => void handleOpenTakeawayModal()}
            />
          </div>

          <div
            className={`orders-shell__pane orders-shell__pane--center${mobileTab === "order" ? " orders-shell__pane--visible" : ""}`}
          >
            <OrderDetail
              orders={tableOrders}
              selectedOrder={selectedOrder}
              orderItems={orderItems}
              menuMap={menuMap}
              tableNumber={selectedTableNumber}
              selectedTableStatus={selectedTableStatus}
              onStartOrder={handleStartOrderForTable}
              userRole={profile?.role ?? "waiter"}
              closingOrder={closingOrder}
              onCloseOrder={(order) => void handleCloseOrder(order)}
              onBackToTables={handleBackToTables}
              onSwitchToMenu={handleSwitchToMenu}
              onSelectOrder={setSelectedOrderId}
              onMarkServed={(item) => void handleMarkServed(item)}
              onMarkAllServed={(item) => void handleMarkAllServed(item)}
              onSaveItem={(item, qty, note) => handleSaveItem(item, qty, note)}
              onSaveItemNotes={(item, unitNotes) => handleSaveItemNotes(item, unitNotes)}
              onDeleteItem={(item) => void handleDeleteItem(item)}
              onDeleteOrder={(order) => void handleDeleteOrder(order)}
            />
          </div>

          <div
            ref={menuPaneRef}
            className={`orders-shell__pane orders-shell__pane--right${mobileTab === "menu" ? " orders-shell__pane--visible" : ""}${menuPaneFocused ? " orders-shell__pane--focus" : ""}`}
          >
            <OrdersMenu
              menuItems={menuItems}
              categories={categories}
              disabled={!selectedOrder || busy}
              searchInputRef={menuSearchRef}
              onSelectItem={(item) => {
                setMenuPaneFocused(false);
                handleSelectMenuItem(item);
              }}
            />
          </div>
        </div>
      )}

      <OrdersMobileTabs activeTab={mobileTab} onChange={setMobileTab} />

      {successToast ? <AppToast message={successToast} variant="success" /> : null}

      <TakeawayModal
        open={takeawayModalOpen}
        busy={busy}
        previewNumber={takeawayPreviewNumber}
        onClose={() => setTakeawayModalOpen(false)}
        onSubmit={(name) => void handleNewTakeawayOrder(name)}
      />

      <NewOrderModal
        open={newOrderOpen}
        tables={tables}
        initialTableId={newOrderPresetTableId}
        busy={busy}
        onClose={handleCloseNewOrderModal}
        onSubmit={handleNewOrder}
      />

      <AddItemModal
        open={addItemTarget !== null}
        item={addItemTarget}
        busy={busy}
        onClose={() => setAddItemTarget(null)}
        onAdd={handleAddItem}
      />

      <ConfirmModal
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        message={pendingConfirm?.message ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel ?? "Confirmar"}
        variant={pendingConfirm?.variant ?? "danger"}
        busy={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) setPendingConfirm(null);
        }}
        onConfirm={() => void handleConfirmAction()}
      />
    </main>
  );
}
