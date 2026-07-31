import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/context/AuthProvider";
import { supabase } from "../../../lib/supabase";
import {
  addItemToOrder,
  cancelOrder,
  cancelOrderItem,
  fetchAvailableMenuItems,
  fetchOrderItems,
  fetchTablesForOrders,
  syncTableStatusByActiveOrders,
  updateOrderItem,
  type MenuItem,
  type Order,
  type OrderItemWithServed,
  type RestaurantTable,
} from "../../orders/api";
import {
  advanceBillStatus,
  confirmOrderBills,
  createBillFromOrder,
  createEqualSplitBills,
  createItemSplitBills,
  dismissBillInvoiceRequest,
  fetchBillingOrders,
  fetchBillItems,
  fetchBillsByOrderIds,
  fetchPaymentsByBillIds,
  getBillBalance,
  getOrderBillSummary,
  orderHasActiveBills,
  orderHasInvoicePending,
  orderHasPayments,
  registerPayment,
  voidOrderDraftBills,
  sumPayments,
  updateBillTip,
  type Bill,
  type BillLine,
  type Payment,
} from "../api";
import { BillSplitModal, type ItemSplitGroup } from "../components/BillSplitModal";
import {
  BillItemRemoveModal,
  type BillItemRemoveContext,
} from "../components/BillItemRemoveModal";
import { BillOrderCancelModal } from "../components/BillOrderCancelModal";
import {
  PostPaymentInvoiceModal,
  type PostPaymentInvoiceContext,
} from "../components/PostPaymentInvoiceModal";
import {
  formatMoney,
  paymentMethodLabel,
  roundMoney,
} from "../utils";
import { fetchActiveCashShift, isCashShiftOpen } from "../../reports/api";
import { fetchSriInvoiceMetrics } from "../sri-invoice-api";

export function BillingPage() {
  const { restaurant, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  // Cache de ítems: preserva los últimos ítems conocidos por orden y cuenta
  // para que la card nunca colapse visualmente durante re-renders de pago.
  const lastDisplayLinesRef = useRef<BillLine[]>([]);
  const lastDisplayLinesBillRef = useRef<string | null>(null);
  const lastDisplayLinesOrderRef = useRef<string | null>(null);
  // Cache STICKY de bill_lines por billId. Una vez cargadas las líneas
  // de un bill, no permitimos que se reduzcan por race conditions del
  // realtime listener. Solo se invalida al cambiar de bill.
  const billLinesCacheRef = useRef<Map<string, BillLine[]>>(new Map());
  // Request ID para cancelar resultados de loadAll/loadBillLines obsoletos
  // cuando el realtime dispara llamadas en paralelo.
  const loadAllReqIdRef = useRef(0);
  const loadBillLinesReqIdRef = useRef(0);

  const [orders, setOrders] = useState<Order[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemWithServed[]>([]);
  const [billLines, setBillLines] = useState<BillLine[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [tipPercentInput, setTipPercentInput] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<Payment["method"]>("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [extraMenuId, setExtraMenuId] = useState("");
  const [extraQty, setExtraQty] = useState("1");
  const [extraNote, setExtraNote] = useState("");
  const [extraItemFormOpen, setExtraItemFormOpen] = useState(false);
  const [removeItemContext, setRemoveItemContext] = useState<BillItemRemoveContext | null>(null);
  const [cancelOrderModalOpen, setCancelOrderModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postPaymentInvoice, setPostPaymentInvoice] =
    useState<PostPaymentInvoiceContext | null>(null);
  const [cashShiftOpen, setCashShiftOpen] = useState<boolean | null>(null);
  const [sriAlertCount, setSriAlertCount] = useState(0);

  const isAdmin = profile?.role === "admin";

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  const orderBills = useMemo(
    () =>
      bills
        .filter((bill) => bill.order_id === selectedOrderId)
        .sort((a, b) => (a.split_label ?? "").localeCompare(b.split_label ?? "")),
    [bills, selectedOrderId]
  );

  const selectedBill = useMemo(
    () => orderBills.find((bill) => bill.id === selectedBillId) ?? orderBills[0] ?? null,
    [orderBills, selectedBillId]
  );

  const selectedPayments = useMemo(
    () => (selectedBill ? payments.filter((p) => p.bill_id === selectedBill.id) : []),
    [payments, selectedBill]
  );

  const tableLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const table of tables) map.set(table.id, `Mesa ${table.number}`);
    return map;
  }, [tables]);

  function getOrderLabel(order: Order): string {
    if ((order as Order & { order_type?: string }).order_type === "takeaway") {
      const num = ((order as Order & { takeaway_number?: number | null }).takeaway_number ?? 0)
        .toString()
        .padStart(3, "0");
      const name = (order as Order & { customer_name?: string | null }).customer_name;
      return name ? `#${num} — ${name}` : `#${num} — Para llevar`;
    }
    return tableLabelById.get(order.table_id ?? "") ?? "Mesa ?";
  }

  const menuMap = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of menuItems) map.set(item.id, item);
    return map;
  }, [menuItems]);

  const billableItemsForOrder = useMemo(() => {
    if (!selectedOrderId) return [];
    return orderItems.filter(
      (item) => item.order_id === selectedOrderId && item.status !== "cancelled"
    );
  }, [orderItems, selectedOrderId]);

  const estimatedSubtotal = useMemo(() => {
    return billableItemsForOrder.reduce(
      (acc, item) => acc + item.quantity * item.price_at_order,
      0
    );
  }, [billableItemsForOrder]);

  const paidTotal = useMemo(() => sumPayments(selectedPayments), [selectedPayments]);
  const balance = selectedBill ? getBillBalance(selectedBill, selectedPayments) : 0;

  const allOrderBillsPaid =
    orderBills.length > 0 && orderBills.every((bill) => bill.status === "paid");

  const selectedBillInvoicePending =
    selectedBill?.status === "paid" && selectedBill.invoice_requested === true;

  const orderInvoicePending = selectedOrder
    ? orderHasInvoicePending(bills, selectedOrder.id)
    : false;

  const allOrderBillsDraft =
    orderBills.length > 0 && orderBills.every((bill) => bill.status === "draft");

  const allOrderBillsPendingNoPayments =
    orderBills.length > 0 &&
    orderBills.every((bill) => bill.status === "pending_payment") &&
    selectedOrder &&
    !orderHasPayments(bills, payments, selectedOrder.id);

  async function loadBillLines(billId: string, items = orderItems) {
    const reqId = ++loadBillLinesReqIdRef.current;
    const billItemRows = await fetchBillItems(billId);

    // Si llegó un nuevo loadBillLines mientras esperábamos, descartar este
    // resultado para evitar que un fetch antiguo sobrescriba el más reciente.
    if (reqId !== loadBillLinesReqIdRef.current) return;

    let computedLines: BillLine[];

    // Si no hay bill_items (división igual sin ítems explícitos en DB),
    // construir líneas directamente desde los ítems de la orden.
    if (billItemRows.length === 0) {
      const sourceItems = items.length > 0 ? items : orderItems;
      const ordItems = sourceItems.filter(
        (i) => i.order_id === selectedOrderId && i.status !== "cancelled"
      );
      computedLines = ordItems.map((orderItem) => ({
        billItem: {
          id: "",
          bill_id: billId,
          order_item_id: orderItem.id,
          quantity: orderItem.quantity,
          allocated_amount: null,
        },
        orderItem,
        lineTotal: orderItem.quantity * orderItem.price_at_order,
      }));
    } else {
      computedLines = billItemRows.flatMap((billItem) => {
        const orderItem =
          items.find((row) => row.id === billItem.order_item_id) ??
          orderItems.find((row) => row.id === billItem.order_item_id);
        if (!orderItem) return [];
        const fullLineTotal = orderItem.quantity * orderItem.price_at_order;
        const allocated =
          billItem.allocated_amount != null ? Number(billItem.allocated_amount) : null;
        return [
          {
            billItem,
            orderItem,
            lineTotal: allocated ?? billItem.quantity * orderItem.price_at_order,
            fullLineTotal: allocated != null ? fullLineTotal : undefined,
          },
        ];
      });
    }

    // Cache STICKY: si ya tenemos líneas guardadas para este bill y el
    // resultado actual tiene MENOS líneas, mantener la caché. Esto protege
    // contra race conditions donde un fetch parcial sobreescribe datos
    // completos. Las líneas de un bill no deberían reducirse en runtime.
    const cached = billLinesCacheRef.current.get(billId);
    if (cached && cached.length > computedLines.length && computedLines.length > 0) {
      // El nuevo resultado tiene menos líneas que la caché → posible race
      // condition. Mantener la caché.
      setBillLines(cached);
      return;
    }

    if (computedLines.length > 0) {
      billLinesCacheRef.current.set(billId, computedLines);
    }
    setBillLines(computedLines);
  }

  async function loadAll(
    preferredOrderId?: string | null,
    preferredBillId?: string | null,
    options?: { silent?: boolean }
  ) {
    // Request ID: solo el loadAll más reciente puede commitear estado.
    // Esto evita que el realtime listener (que llama loadAll en paralelo
    // con handleRegisterPayment) sobreescriba el resultado más reciente
    // con datos parciales/obsoletos.
    const reqId = ++loadAllReqIdRef.current;
    const isStale = () => reqId !== loadAllReqIdRef.current;

    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const [orderRows, tableRows, menuRows] = await Promise.all([
        fetchBillingOrders(),
        fetchTablesForOrders(),
        fetchAvailableMenuItems(),
      ]);
      if (isStale()) return;

      const currentlyViewedId = preferredOrderId ?? selectedOrderId;
      const baseIds = orderRows.map((o) => o.id);
      const orderIds =
        currentlyViewedId && !baseIds.includes(currentlyViewedId)
          ? [...baseIds, currentlyViewedId]
          : baseIds;

      const [itemRows, billRows] = await Promise.all([
        fetchOrderItems(orderIds),
        fetchBillsByOrderIds(orderIds),
      ]);
      if (isStale()) return;

      const billIds = billRows.map((bill) => bill.id);
      const paymentRows = await fetchPaymentsByBillIds(billIds);
      if (isStale()) return;

      setOrders(orderRows);
      setTables(tableRows);
      setMenuItems(menuRows);
      if (menuRows[0]) {
        setExtraMenuId((current) => current || menuRows[0].id);
      }
      setOrderItems(itemRows);
      setBills(billRows);
      setPayments(paymentRows);

      const hasUnpaidBills = (ordId: string) =>
        billRows.some(
          (b) =>
            b.order_id === ordId &&
            (b.status === "pending_payment" || b.status === "partially_paid")
        );

      const keepOrderVisible = (ordId: string) =>
        baseIds.includes(ordId) ||
        hasUnpaidBills(ordId) ||
        orderHasInvoicePending(billRows, ordId);

      const nextOrderId =
        preferredOrderId && keepOrderVisible(preferredOrderId)
          ? preferredOrderId
          : selectedOrderId && keepOrderVisible(selectedOrderId)
            ? selectedOrderId
            : orderRows[0]?.id ?? null;

      setSelectedOrderId(nextOrderId);

      const billsForOrder = billRows.filter((bill) => bill.order_id === nextOrderId);
      const nextBillId =
        preferredBillId && billsForOrder.some((bill) => bill.id === preferredBillId)
          ? preferredBillId
          : billsForOrder.find((bill) => bill.status !== "paid")?.id ??
            billsForOrder[0]?.id ??
            null;

      setSelectedBillId(nextBillId);

      if (nextBillId) {
        await loadBillLines(nextBillId, itemRows);
        if (isStale()) return;
        const bill = billsForOrder.find((row) => row.id === nextBillId);
        setTipPercentInput(String(bill?.tip_percent ?? 0));
      } else {
        setBillLines([]);
        setTipPercentInput("0");
      }
    } catch (err) {
      if (isStale()) return;
      setError(err instanceof Error ? err.message : "No se pudo cargar cobros");
    } finally {
      if (!options?.silent && !isStale()) setLoading(false);
    }
  }

  const refreshCashShiftStatus = useCallback(async () => {
    try {
      const shift = await fetchActiveCashShift();
      setCashShiftOpen(isCashShiftOpen(shift));
    } catch {
      // Mantener último estado conocido ante errores transitorios
    }
  }, []);

  useEffect(() => {
    void loadAll(searchParams.get("order"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    void refreshCashShiftStatus();
  }, [profile?.id, refreshCashShiftStatus]);

  useEffect(() => {
    void fetchSriInvoiceMetrics()
      .then((m) => {
        let alerts = m.rejectedUnreissued;
        if (m.certDaysLeft != null && m.certDaysLeft < 30) alerts += 1;
        setSriAlertCount(alerts);
      })
      .catch(() => setSriAlertCount(0));
  }, []);

  useEffect(() => {
    if (!profile?.id) return undefined;

    const channel = supabase
      .channel("billing-cash-shift")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_shifts" },
        () => void refreshCashShiftStatus()
      )
      .subscribe();

    const onFocus = () => void refreshCashShiftStatus();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCashShiftStatus();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    const interval = window.setInterval(() => void refreshCashShiftStatus(), 30000);

    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [profile?.id, refreshCashShiftStatus]);


  // Mecanismo defensivo: si selectedOrderId cambia y orderItems no tiene
  // ítems para esa orden, hacer una carga directa de emergencia.
  useEffect(() => {
    if (!selectedOrderId) return;
    const hasItems = orderItems.some((item) => item.order_id === selectedOrderId);
    if (hasItems) return;
    void fetchOrderItems([selectedOrderId]).then((items) => {
      if (items.length > 0) {
        setOrderItems((prev) => {
          const others = prev.filter((item) => item.order_id !== selectedOrderId);
          return [...others, ...items];
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderId]);

  useEffect(() => {
    const channel = supabase
      .channel("billing-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bills" }, () =>
        void loadAll(selectedOrderId, selectedBillId, { silent: true })
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () =>
        void loadAll(selectedOrderId, selectedBillId, { silent: true })
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        void loadAll(selectedOrderId, selectedBillId, { silent: true })
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderId, selectedBillId]);

  useEffect(() => {
    if (!selectedBill) return;
    setPaymentAmount(String(roundMoney(getBillBalance(selectedBill, selectedPayments))));
  }, [selectedBill, selectedPayments]);

  async function handleSelectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setError(null);
    const billsForOrder = bills.filter((bill) => bill.order_id === orderId);
    const nextBill =
      billsForOrder.find((bill) => bill.status !== "paid") ?? billsForOrder[0] ?? null;
    setSelectedBillId(nextBill?.id ?? null);
    if (nextBill) {
      setTipPercentInput(String(nextBill.tip_percent ?? 0));
      await loadBillLines(nextBill.id);
    } else {
      setBillLines([]);
      setTipPercentInput("0");
    }
  }

  async function handleSelectBill(billId: string) {
    setSelectedBillId(billId);
    const bill = orderBills.find((row) => row.id === billId);
    if (bill) setTipPercentInput(String(bill.tip_percent ?? 0));
    await loadBillLines(billId);
  }

  const tipPercent = Number(tipPercentInput) || 0;

  async function handleCreateBill() {
    if (!selectedOrder) return;
    setBusy(true);
    setError(null);
    try {
      const billId = await createBillFromOrder(selectedOrder.id, tipPercent);
      await loadAll(selectedOrder.id, billId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la pre-cuenta");
    } finally {
      setBusy(false);
    }
  }

  async function handleEqualSplit(parts: number) {
    if (!selectedOrder) return;
    await createEqualSplitBills(selectedOrder.id, parts, tipPercent);
    await loadAll(selectedOrder.id);
  }

  async function handleItemSplit(groups: ItemSplitGroup[]) {
    if (!selectedOrder) return;
    await createItemSplitBills(selectedOrder.id, groups, tipPercent);
    await loadAll(selectedOrder.id);
  }

  async function handleSaveTip() {
    if (!selectedBill || orderBills.length > 1) return;
    setBusy(true);
    setError(null);
    try {
      await updateBillTip(selectedBill.id, tipPercent);
      await loadAll(selectedOrderId, selectedBill.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la propina");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmBills() {
    if (!selectedOrder) return;
    setBusy(true);
    setError(null);
    try {
      if (orderBills.length === 1 && selectedBill?.status === "draft") {
        await updateBillTip(selectedBill.id, tipPercent);
      }
      await confirmOrderBills(selectedOrder.id);
      await loadAll(selectedOrderId, selectedBillId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar la cuenta");
    } finally {
      setBusy(false);
    }
  }

  async function handleEditDivision() {
    if (!selectedOrder) return;
    const pendingOnly = allOrderBillsPendingNoPayments;
    if (
      !window.confirm(
        pendingOnly
          ? "Volver a dividir anulara las cuentas confirmadas (sin pagos). Continuar?"
          : "Volver a dividir anulara las cuentas en borrador actuales. Continuar?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await voidOrderDraftBills(selectedOrder.id, bills);
      // Invalidar caché de bill_lines: las cuentas se anularon, los bill_items
      // ya no son válidos.
      billLinesCacheRef.current.clear();
      await loadAll(selectedOrder.id, null, { silent: true });
      setSplitModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo editar la division");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddExtraItem(event: FormEvent) {
    event.preventDefault();
    if (!selectedOrder || !extraMenuId) return;
    const menu = menuMap.get(extraMenuId);
    if (!menu) return;

    setBusy(true);
    setError(null);
    try {
      if (orderHasActiveBills(bills, selectedOrder.id)) {
        await voidOrderDraftBills(selectedOrder.id, bills);
      }
      await addItemToOrder({
        order_id: selectedOrder.id,
        menu_item_id: extraMenuId,
        quantity: Number(extraQty),
        notes: extraNote.trim() || null,
        status: "pending",
        price_at_order: menu.price,
      });
      setExtraQty("1");
      setExtraNote("");
      setExtraItemFormOpen(false);
      await loadAll(selectedOrder.id, null, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar el item");
    } finally {
      setBusy(false);
    }
  }

  async function handleVoidBills() {
    if (!selectedOrder || orderBills.length === 0) return;
    if (!window.confirm("Anular todas las cuentas de esta comanda?")) return;
    if (payments.some((p) => orderBills.some((bill) => bill.id === p.bill_id))) {
      setError("No se puede anular: hay pagos registrados.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const bill of orderBills) {
        if (bill.status === "draft" || bill.status === "pending_payment") {
          await advanceBillStatus(bill.id, "voided");
        }
      }
      // Invalidar caché de bill_lines tras anular cuentas
      billLinesCacheRef.current.clear();
      await loadAll(selectedOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterPayment(event: FormEvent) {
    event.preventDefault();
    if (!selectedBill) return;
    if (!cashShiftOpen) {
      setError(
        isAdmin
          ? "No hay caja abierta. Ve a Reportes y caja para abrir el turno antes de cobrar."
          : "La caja está cerrada. Pide al administrador que abra el turno en Reportes y caja."
      );
      return;
    }
    const amount = roundMoney(Number(paymentAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Ingresa un monto de pago valido.");
      return;
    }
    if (amount > balance + 0.01) {
      setError(`El pago no puede superar el saldo (${formatMoney(balance)}).`);
      return;
    }

    setBusy(true);
    setError(null);
    const payingFullBalance = amount >= balance - 0.01;
    const paymentContext =
      payingFullBalance && selectedOrder
        ? {
            billId: selectedBill.id,
            orderLabel: selectedBill.split_label
              ? `${getOrderLabel(selectedOrder)} — ${selectedBill.split_label}`
              : getOrderLabel(selectedOrder),
            amountPaid: selectedBill.total,
          }
        : null;

    try {
      await registerPayment({
        billId: selectedBill.id,
        method: paymentMethod,
        amount,
        reference: paymentReference.trim() || undefined,
      });
      setPaymentReference("");
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      await loadAll(selectedOrderId, selectedBillId);
      if (paymentContext) {
        setPostPaymentInvoice(paymentContext);
      }
      setTimeout(() => {
        if (detailScrollRef.current) {
          detailScrollRef.current.scrollTop = 0;
        }
      }, 80);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: string }).message)
            : "No se pudo registrar el pago";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDismissWithoutInvoice(billId: string) {
    setBusy(true);
    setError(null);
    try {
      await dismissBillInvoiceRequest(billId);
      await loadAll(selectedOrderId, selectedBillId, { silent: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo finalizar sin factura"
      );
    } finally {
      setBusy(false);
    }
  }

  const canCreateBill =
    selectedOrder &&
    !orderHasActiveBills(bills, selectedOrder.id) &&
    billableItemsForOrder.length > 0 &&
    estimatedSubtotal > 0;

  const canSplit =
    selectedOrder &&
    !orderHasActiveBills(bills, selectedOrder.id) &&
    billableItemsForOrder.length > 0;

  const canEditDivision =
    selectedOrder &&
    orderBills.length > 0 &&
    !orderHasPayments(bills, payments, selectedOrder.id) &&
    (allOrderBillsDraft || allOrderBillsPendingNoPayments);

  const canAddExtraItem =
    selectedOrder &&
    !allOrderBillsPaid &&
    billableItemsForOrder.length >= 0 &&
    (!orderHasActiveBills(bills, selectedOrder.id) || allOrderBillsDraft);

  const canRemoveItems =
    !!selectedOrder &&
    !allOrderBillsPaid &&
    !orderHasPayments(bills, payments, selectedOrder.id) &&
    !orderBills.some(
      (bill) => bill.status === "partially_paid" || bill.status === "paid"
    );

  function getItemRemovalBounds(orderItem: OrderItemWithServed) {
    const servedQty =
      orderItem.served_quantity ?? (orderItem.status === "served" ? orderItem.quantity : 0);
    const maxRemovable = Math.max(0, orderItem.quantity - servedQty);
    return { servedQty, maxRemovable };
  }

  function getRemoveButtonState(orderItem: OrderItemWithServed) {
    if (!canRemoveItems || orderItem.status === "cancelled") {
      return { visible: false, enabled: false, reason: "" };
    }
    const { maxRemovable, servedQty } = getItemRemovalBounds(orderItem);
    if (maxRemovable > 0) {
      return { visible: true, enabled: true, reason: "Quitar de la cuenta" };
    }
    if (servedQty >= orderItem.quantity) {
      return { visible: true, enabled: false, reason: "Ítem ya entregado — no se puede quitar" };
    }
    return { visible: true, enabled: false, reason: "No se puede quitar este ítem" };
  }

  function willEmptyOrderAfterRemoval(orderItem: OrderItemWithServed, removeQty: number) {
    const thisRemaining = orderItem.quantity - removeQty;
    if (thisRemaining > 0) return false;
    const otherLines = billableItemsForOrder.filter((item) => item.id !== orderItem.id);
    return otherLines.length === 0;
  }

  const canCancelEntireOrder =
    !!selectedOrder &&
    canRemoveItems &&
    billableItemsForOrder.length > 0 &&
    billableItemsForOrder.every((item) => getItemRemovalBounds(item).servedQty === 0);

  async function finalizeOrderCancellation() {
    if (!selectedOrder) return;

    if (orderHasPayments(bills, payments, selectedOrder.id)) {
      throw new Error("No se puede anular: ya hay pagos registrados.");
    }

    if (orderHasActiveBills(bills, selectedOrder.id)) {
      await voidOrderDraftBills(selectedOrder.id, bills);
    }

    billLinesCacheRef.current.clear();
    lastDisplayLinesRef.current = [];

    await cancelOrder(selectedOrder.id);

    if (selectedOrder.table_id) {
      await syncTableStatusByActiveOrders(selectedOrder.table_id);
    }

    setRemoveItemContext(null);
    setCancelOrderModalOpen(false);
    setSelectedOrderId(null);
    setSelectedBillId(null);
    await loadAll(null, null, { silent: true });
  }

  async function handleCancelEntireOrder() {
    if (!selectedOrder || !canCancelEntireOrder) return;
    setBusy(true);
    setError(null);
    try {
      await finalizeOrderCancellation();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular la comanda");
    } finally {
      setBusy(false);
    }
  }

  function openRemoveItemModal(orderItem: OrderItemWithServed) {
    if (!selectedOrder) return;

    const { servedQty, maxRemovable } = getItemRemovalBounds(orderItem);
    if (maxRemovable < 1) {
      setError("No hay unidades disponibles para quitar en este ítem.");
      return;
    }
    if (orderHasPayments(bills, payments, selectedOrder.id)) {
      setError("No se puede modificar: ya hay pagos registrados.");
      return;
    }

    const activeBills = orderBills.filter(
      (bill) => !["voided", "refunded"].includes(bill.status)
    );
    const singleFullBill =
      activeBills.length === 1 && activeBills[0].split_mode === "full";
    const otherBillableItemCount = billableItemsForOrder.filter(
      (item) => item.id !== orderItem.id
    ).length;

    setRemoveItemContext({
      orderItem,
      menuName: menuMap.get(orderItem.menu_item_id)?.name ?? "Ítem",
      orderLabel: getOrderLabel(selectedOrder),
      hasTable: selectedOrder.table_id != null,
      servedQty,
      maxRemovable,
      otherBillableItemCount,
      willRegenerateBill: activeBills.length > 0,
      willVoidSplitBills: activeBills.length > 0 && !singleFullBill,
    });
  }

  async function applyItemQuantityReduction(orderItem: OrderItemWithServed, removeQty: number) {
    if (!selectedOrder) return;

    const { servedQty, maxRemovable } = getItemRemovalBounds(orderItem);
    if (removeQty < 1 || removeQty > maxRemovable) {
      throw new Error(`Solo puedes quitar entre 1 y ${maxRemovable} unidad(es).`);
    }

    const newQty = orderItem.quantity - removeQty;
    if (newQty < servedQty) {
      throw new Error(`Deben quedar al menos ${servedQty} unidad(es) (ya entregadas).`);
    }

    if (willEmptyOrderAfterRemoval(orderItem, removeQty)) {
      const hasDeliveredItems = billableItemsForOrder.some(
        (item) => getItemRemovalBounds(item).servedQty > 0
      );
      if (hasDeliveredItems) {
        throw new Error(
          "No se puede anular la comanda: hay ítems ya entregados al cliente."
        );
      }
      await finalizeOrderCancellation();
      return;
    }

    const activeBills = orderBills.filter(
      (bill) => !["voided", "refunded"].includes(bill.status)
    );
    const singleFullBill =
      activeBills.length === 1 && activeBills[0].split_mode === "full";
    const wasConfirmed = activeBills.some((bill) => bill.status === "pending_payment");
    const savedTip = activeBills[0]?.tip_percent ?? tipPercent;

    if (orderHasActiveBills(bills, selectedOrder.id)) {
      await voidOrderDraftBills(selectedOrder.id, bills);
    }

    billLinesCacheRef.current.clear();
    lastDisplayLinesRef.current = [];

    if (newQty <= 0) {
      await cancelOrderItem(orderItem.id);
    } else {
      await updateOrderItem(orderItem.id, {
        quantity: newQty,
        notes: orderItem.notes ?? null,
      });
    }

    const remainingSubtotal = billableItemsForOrder.reduce((sum, item) => {
      if (item.id === orderItem.id) {
        return newQty > 0 ? sum + newQty * item.price_at_order : sum;
      }
      return sum + item.quantity * item.price_at_order;
    }, 0);

    let newBillId: string | null = null;
    if (singleFullBill && remainingSubtotal > 0) {
      newBillId = await createBillFromOrder(selectedOrder.id, savedTip);
      if (wasConfirmed) {
        await confirmOrderBills(selectedOrder.id);
      }
    }

    await loadAll(selectedOrder.id, newBillId, { silent: true });
    setRemoveItemContext(null);
  }

  async function handleConfirmRemoveItem(removeQty: number) {
    if (!removeItemContext) return;
    setBusy(true);
    setError(null);
    try {
      await applyItemQuantityReduction(removeItemContext.orderItem, removeQty);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el ítem");
    } finally {
      setBusy(false);
    }
  }

  // Líneas candidatas: billLines si existen, si no billableItemsForOrder como fallback
  const freshDisplayLines: BillLine[] =
    billLines.length > 0
      ? billLines
      : billableItemsForOrder.map((orderItem) => ({
          billItem: {
            id: "",
            bill_id: "",
            order_item_id: orderItem.id,
            quantity: orderItem.quantity,
            allocated_amount: null,
          },
          orderItem,
          lineTotal: orderItem.quantity * orderItem.price_at_order,
        }));

  // Actualizar la caché solo cuando tenemos líneas reales Y son de la misma
  // orden/cuenta. Esto evita que un cambio de cuenta/orden sobrescriba con datos incorrectos.
  if (freshDisplayLines.length > 0) {
    lastDisplayLinesRef.current = freshDisplayLines;
    lastDisplayLinesBillRef.current = selectedBillId;
    lastDisplayLinesOrderRef.current = selectedOrderId;
  }

  // Si las líneas frescas están vacías (re-render transitorio durante reload),
  // usar la caché SOLO si pertenece a la misma orden Y cuenta seleccionada.
  // Esto garantiza que la card de ítems NUNCA colapse visualmente al pagar.
  const cachedMatchesCurrent =
    lastDisplayLinesOrderRef.current === selectedOrderId &&
    lastDisplayLinesBillRef.current === selectedBillId;

  const displayLines: BillLine[] =
    freshDisplayLines.length > 0
      ? freshDisplayLines
      : cachedMatchesCurrent
        ? lastDisplayLinesRef.current
        : [];

  const displaySubtotal = selectedBill?.subtotal ?? estimatedSubtotal;
  const displayTipPercent = selectedBill?.tip_percent ?? tipPercent;
  const displayTipAmount = selectedBill
    ? selectedBill.tip_amount
    : roundMoney((displaySubtotal * displayTipPercent) / 100);
  const displayTotal = selectedBill?.total ?? roundMoney(displaySubtotal + displayTipAmount);
  const displayPaid = selectedBill ? paidTotal : 0;
  const displayBalance = selectedBill ? balance : displayTotal;
  const isEqualSplitBill = selectedBill?.split_mode === "equal";
  const equalSplitParts = isEqualSplitBill ? orderBills.length : 0;

  const canRegisterPayment =
    !!selectedBill &&
    cashShiftOpen === true &&
    (selectedBill.status === "pending_payment" ||
      selectedBill.status === "partially_paid");

  const paymentBlockedByCash =
    !!selectedBill &&
    cashShiftOpen === false &&
    (selectedBill.status === "pending_payment" ||
      selectedBill.status === "partially_paid");

  /* Step derivado del estado */
  const stepNum =
    !selectedOrder || orderBills.length === 0
      ? 1
      : allOrderBillsDraft
        ? 1
        : allOrderBillsPaid
          ? 3
          : orderBills.some(
                (b) => b.status === "pending_payment" || b.status === "partially_paid"
              )
            ? 3
            : 2;

  /* Badge de estado por comanda */
  function getOrderBadge(orderId: string) {
    const ob = bills.filter((b) => b.order_id === orderId);
    if (ob.length === 0) return { label: "Sin cuenta", cls: "bl-badge--neutral" };
    if (orderHasInvoicePending(ob, orderId)) {
      return { label: "Sin factura", cls: "bl-badge--invoice" };
    }
    if (ob.every((b) => b.status === "paid")) return { label: "Pagado", cls: "bl-badge--paid" };
    if (ob.some((b) => b.status === "partially_paid"))
      return { label: "Parcialmente pagado", cls: "bl-badge--partial" };
    if (ob.some((b) => b.status === "pending_payment"))
      return { label: "Pendiente pago", cls: "bl-badge--pending" };
    return { label: "Pre-cuenta", cls: "bl-badge--draft" };
  }

  /* Total estimado de una comanda */
  function getOrderTotal(orderId: string) {
    return orderItems
      .filter((it) => it.order_id === orderId && it.status !== "cancelled")
      .reduce((s, it) => s + it.quantity * it.price_at_order, 0);
  }

  const STEPS = ["Pre-cuenta", "División", "Pago"] as const;
  const METHODS: { value: Payment["method"]; icon: string; label: string }[] = [
    { value: "cash", icon: "💵", label: "Efectivo" },
    { value: "card", icon: "💳", label: "Tarjeta" },
    { value: "transfer", icon: "📱", label: "Transferencia" },
  ];

  return (
    <main className="bl-page">
      {cashShiftOpen === false ? (
        <div className="bl-cash-banner bl-cash-banner--closed" role="status">
          <span className="bl-cash-banner__icon" aria-hidden>
            🔒
          </span>
          <div className="bl-cash-banner__text">
            <strong>Caja cerrada</strong>
            <span>
              {isAdmin ? (
                <>
                  Abre el turno en{" "}
                  <Link to="/reports" className="bl-cash-banner__link">
                    Reportes y caja
                  </Link>{" "}
                  para registrar pagos.
                </>
              ) : (
                "Pide al administrador que abra la caja en Reportes y caja."
              )}
            </span>
          </div>
        </div>
      ) : cashShiftOpen === true ? (
        <div className="bl-cash-banner bl-cash-banner--open" role="status">
          <span className="bl-cash-banner__icon" aria-hidden>
            ✓
          </span>
          <span>
            <strong>Caja abierta</strong> — los cobros se reflejan en reportes
          </span>
        </div>
      ) : null}
      <div className="bl-page__workspace">
      {/* ══ SIDEBAR IZQUIERDO ══ */}
      <aside className="bl-sidebar">
        <div className="bl-sidebar__head">
          <div className="bl-sidebar__head-left">
            <span className="bl-sidebar__title">POR COBRAR</span>
            {orders.length > 0 && (
              <span className="bl-sidebar__count">{orders.length}</span>
            )}
          </div>
          <Link to="/billing/invoices" className="bl-sidebar__history-link">
            Facturas
            {sriAlertCount > 0 && (
              <span className="bl-sidebar__alert-badge">{sriAlertCount}</span>
            )}
          </Link>
        </div>

        <div className="bl-sidebar__list">
          {loading && (
            <div className="bl-sidebar__loading">
              <span className="bl-spinner" />
              Cargando…
            </div>
          )}
          {!loading && orders.length === 0 && (
            <div className="bl-sidebar__empty">
              <span aria-hidden>✅</span>
              <p>Sin comandas pendientes</p>
            </div>
          )}
          {orders.map((order) => {
            const badge = getOrderBadge(order.id);
            const total = getOrderTotal(order.id);
            const isSelected = selectedOrderId === order.id;
            const summary = getOrderBillSummary(bills, order.id);
            return (
              <button
                key={order.id}
                type="button"
                className={`bl-order-card${isSelected ? " bl-order-card--active" : ""}`}
                onClick={() => void handleSelectOrder(order.id)}
              >
                <div className="bl-order-card__top">
                  <span className="bl-order-card__label">{getOrderLabel(order)}</span>
                  <span className={`bl-badge ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="bl-order-card__bottom">
                  <span className="bl-order-card__total">{formatMoney(total)}</span>
                  <span className="bl-order-card__meta">
                    {summary.total > 0
                      ? `${summary.paid}/${summary.total} pagadas`
                      : new Date(order.created_at).toLocaleTimeString("es-EC", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ══ PANEL DERECHO ══ */}
      <div className="bl-detail">
        {error && (
          <div className="bl-error" role="alert">
            ⚠️ {error}
          </div>
        )}

        {!selectedOrder ? (
          <div className="bl-empty-state">
            <span className="bl-empty-state__icon" aria-hidden>🧾</span>
            <p className="bl-empty-state__text">Selecciona una comanda para cobrar</p>
          </div>
        ) : (
          <div className="bl-detail__scroll" ref={detailScrollRef}>
            {/* ── Header Card ── */}
            <div className="bl-detail-header">
              <div className="bl-detail-header__info">
                <h2 className="bl-detail-header__title">{getOrderLabel(selectedOrder)}</h2>
                <div className="bl-detail-header__meta">
                  <span className={`bl-status-badge bl-status-badge--${selectedOrder.status}`}>
                    {selectedOrder.status}
                  </span>
                  <span className="bl-detail-header__time">
                    {new Date(selectedOrder.created_at).toLocaleTimeString("es-EC", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
              {selectedBill && (
                <button
                  type="button"
                  className="bl-btn-icon"
                  title="Imprimir pre-cuenta"
                  onClick={() => window.print()}
                >
                  🖨️
                </button>
              )}
            </div>

            {/* ── Step Indicator ── */}
            <div className="bl-steps" aria-label="Pasos de cobro">
              {STEPS.map((label, i) => {
                const num = i + 1;
                const done = stepNum > num;
                const active = stepNum === num;
                return (
                  <div key={num} className="bl-step-wrap">
                    <div className={`bl-step${active ? " bl-step--active" : ""}${done ? " bl-step--done" : ""}`}>
                      <span className="bl-step__circle">
                        {done ? "✓" : num}
                      </span>
                      <span className="bl-step__label">{label}</span>
                    </div>
                    {i < 2 && <div className={`bl-step__line${done ? " bl-step__line--done" : ""}`} />}
                  </div>
                );
              })}
            </div>

            {/* ── Financial Summary — 3 cards ── */}
            <div className="bl-summary-row">
              <div className="bl-sum-card bl-sum-card--sub">
                <span className="bl-sum-card__label">Subtotal</span>
                <strong className="bl-sum-card__value">{formatMoney(displaySubtotal)}</strong>
              </div>
              <div className="bl-sum-card bl-sum-card--tip">
                <span className="bl-sum-card__label">Propina</span>
                <strong className="bl-sum-card__value">
                  {displayTipPercent > 0 ? `${displayTipPercent}%` : formatMoney(displayTipAmount)}
                </strong>
                {displayTipPercent > 0 && (
                  <span className="bl-sum-card__sub">{formatMoney(displayTipAmount)}</span>
                )}
              </div>
              <div className="bl-sum-card bl-sum-card--total">
                <span className="bl-sum-card__label">Total</span>
                <strong className="bl-sum-card__value">{formatMoney(displayTotal)}</strong>
              </div>
            </div>

            {/* ── Bill Tabs (cuando hay división) ── */}
            {orderBills.length > 1 && (
              <div className="bl-bill-tabs">
                {orderBills.map((bill) => (
                  <button
                    key={bill.id}
                    type="button"
                    className={`bl-bill-tab${selectedBillId === bill.id ? " bl-bill-tab--active" : ""}${bill.status === "paid" ? " bl-bill-tab--paid" : ""}`}
                    onClick={() => void handleSelectBill(bill.id)}
                  >
                    <span>{bill.split_label ?? "Cuenta"}</span>
                    <span className="bl-bill-tab__amount">{formatMoney(bill.total)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* ── Items Card ── */}
            <div className="bl-items-card" id="detalle-items">
              <div className="bl-items-card__header">
                <span>Detalle de ítems</span>
                {selectedBill?.split_label && (
                  <span className="bl-items-card__split-label">{selectedBill.split_label}</span>
                )}
              </div>
              {isEqualSplitBill && (
                <div className="bl-equal-notice">
                  División igual entre <strong>{equalSplitParts}</strong>{" "}
                  {equalSplitParts === 1 ? "persona" : "personas"} — tu parte:{" "}
                  <strong>{formatMoney(displayTotal)}</strong>
                </div>
              )}
              <div className="bl-items-list">
                {displayLines.map((line) => {
                  const menu = menuMap.get(line.orderItem.menu_item_id);
                  const showShare =
                    line.fullLineTotal != null &&
                    line.fullLineTotal > line.lineTotal + 0.001;
                  const removeState = getRemoveButtonState(line.orderItem);
                  const lineQty = line.billItem.quantity || line.orderItem.quantity;
                  return (
                    <div
                      key={`${line.orderItem.id}-${line.billItem.id}`}
                      className={`bl-item-row${removeState.enabled ? " bl-item-row--removable" : ""}`}
                    >
                      <span className="bl-item-row__name">{menu?.name ?? "Ítem"}</span>
                      <span className="bl-item-row__qty">×{lineQty}</span>
                      <span className="bl-item-row__price">
                        {showShare ? (
                          <>
                            <span className="bl-item-row__price--full">
                              {formatMoney(line.fullLineTotal!)}
                            </span>
                            {formatMoney(line.lineTotal)}
                          </>
                        ) : (
                          formatMoney(line.lineTotal)
                        )}
                      </span>
                      {removeState.visible ? (
                        <button
                          type="button"
                          className="bl-item-row__remove"
                          disabled={busy || !removeState.enabled}
                          title={removeState.reason}
                          aria-label={
                            removeState.enabled
                              ? `Quitar ${menu?.name ?? "ítem"}`
                              : removeState.reason
                          }
                          onClick={() => openRemoveItemModal(line.orderItem)}
                        >
                          🗑
                        </button>
                      ) : (
                        <span className="bl-item-row__remove-spacer" aria-hidden />
                      )}
                      {line.orderItem.notes && (
                        <span className="bl-item-row__note">📝 {line.orderItem.notes}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Propina + Acciones ── */}
            {(orderBills.length === 0 || allOrderBillsDraft) && (
              <div className="bl-actions-card">
                {/* Propina inline */}
                <div className="bl-tip-row">
                  <span className="bl-tip-row__label">Propina</span>
                  <div className="bl-tip-row__input-wrap">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="bl-tip-input"
                      value={tipPercentInput}
                      disabled={busy || orderBills.length > 1}
                      onChange={(e) => setTipPercentInput(e.target.value)}
                    />
                    <span className="bl-tip-row__pct">%</span>
                  </div>
                  {orderBills.length === 1 && allOrderBillsDraft && (
                    <button
                      type="button"
                      className="bl-btn-ghost"
                      disabled={busy}
                      onClick={() => void handleSaveTip()}
                    >
                      Guardar
                    </button>
                  )}
                </div>

                {/* Botones de acción */}
                <div className="bl-action-btns">
                  {canCreateBill && (
                    <button
                      type="button"
                      className="bl-btn-primary"
                      disabled={busy}
                      onClick={() => void handleCreateBill()}
                    >
                      Generar pre-cuenta
                    </button>
                  )}
                  {canSplit && (
                    <button
                      type="button"
                      className="bl-btn-secondary"
                      disabled={busy}
                      onClick={() => setSplitModalOpen(true)}
                    >
                      Dividir cuenta
                    </button>
                  )}
                  {canEditDivision && (
                    <button
                      type="button"
                      className="bl-btn-ghost"
                      disabled={busy}
                      onClick={() => void handleEditDivision()}
                    >
                      Editar división
                    </button>
                  )}
                  {allOrderBillsDraft && (
                    <button
                      type="button"
                      className="bl-btn-confirm"
                      disabled={busy}
                      onClick={() => void handleConfirmBills()}
                    >
                      ✓ Confirmar cuenta
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Ítem olvidado ── */}
            {canAddExtraItem && (
              <div className="bl-extra-item">
                {!extraItemFormOpen ? (
                  <button
                    type="button"
                    className="bl-btn-dashed"
                    disabled={busy}
                    onClick={() => setExtraItemFormOpen(true)}
                  >
                    + Agregar ítem olvidado
                  </button>
                ) : (
                  <div className="bl-extra-item__form">
                    <p className="bl-extra-item__title">Agregar ítem olvidado</p>
                    <form className="bl-extra-item__row" onSubmit={handleAddExtraItem}>
                      <select
                        className="bl-select"
                        value={extraMenuId}
                        onChange={(e) => setExtraMenuId(e.target.value)}
                        required
                      >
                        {menuItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} — {formatMoney(item.price)}
                          </option>
                        ))}
                      </select>
                      <input
                        className="bl-input bl-input--sm"
                        type="number"
                        min={1}
                        value={extraQty}
                        onChange={(e) => setExtraQty(e.target.value)}
                        required
                      />
                      <input
                        className="bl-input"
                        placeholder="Nota (opcional)"
                        value={extraNote}
                        onChange={(e) => setExtraNote(e.target.value)}
                      />
                      <button className="bl-btn-primary" type="submit" disabled={busy}>
                        Agregar
                      </button>
                      <button
                        type="button"
                        className="bl-btn-ghost"
                        disabled={busy}
                        onClick={() => {
                          setExtraItemFormOpen(false);
                          setExtraQty("1");
                          setExtraNote("");
                        }}
                      >
                        Cancelar
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* ── Paso 3: Registro de pago ── */}
            {paymentBlockedByCash && selectedBill ? (
              <div className="bl-payment-blocked">
                <p>
                  No se puede cobrar con la caja cerrada.
                  {isAdmin ? (
                    <>
                      {" "}
                      <Link to="/reports">Abrir caja en Reportes</Link>
                    </>
                  ) : (
                    " Contacta al administrador."
                  )}
                </p>
              </div>
            ) : null}

            {canRegisterPayment && selectedBill && (
                <div className="bl-payment-card">
                  {/* Balance notice */}
                  <div className="bl-balance-notice">
                    <div className="bl-balance-notice__row">
                      <span className="bl-balance-notice__label">Pagado</span>
                      <span className="bl-balance-notice__paid">{formatMoney(displayPaid)}</span>
                    </div>
                    <div className="bl-balance-notice__divider" />
                    <div className="bl-balance-notice__row">
                      <span className="bl-balance-notice__label">Saldo pendiente</span>
                      <span className="bl-balance-notice__balance">{formatMoney(displayBalance)}</span>
                    </div>
                  </div>

                  <h4 className="bl-payment-card__title">
                    Registrar pago
                    {selectedBill.split_label && (
                      <span className="bl-payment-card__subtitle">
                        — {selectedBill.split_label}
                      </span>
                    )}
                  </h4>

                  {/* Método de pago — botones visuales */}
                  <div className="bl-method-tabs">
                    {METHODS.map(({ value, icon, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`bl-method-tab${paymentMethod === value ? " bl-method-tab--active" : ""}`}
                        onClick={() => setPaymentMethod(value)}
                      >
                        <span className="bl-method-tab__icon">{icon}</span>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Formulario de pago */}
                  <form onSubmit={handleRegisterPayment}>
                    <div className="bl-amount-row">
                      <span className="bl-amount-row__symbol">$</span>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        className="bl-amount-input"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        required
                      />
                    </div>
                    <input
                      className="bl-input bl-ref-input"
                      placeholder="Referencia (opcional)"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="bl-btn-primary bl-btn-primary--full"
                      disabled={busy || balance <= 0}
                    >
                      {busy ? "Registrando…" : "Registrar pago"}
                    </button>
                  </form>

                  {/* Historial de pagos */}
                  {selectedPayments.length > 0 && (
                    <div className="bl-payment-history" id="historial-pagos">
                      <span className="bl-payment-history__title">Pagos registrados</span>
                      {selectedPayments.map((payment) => (
                        <div key={payment.id} className="bl-payment-row">
                          <span className="bl-payment-row__method">
                            {paymentMethodLabel(payment.method)}
                          </span>
                          <span className="bl-payment-row__amount">
                            {formatMoney(payment.amount)}
                          </span>
                          <span className="bl-payment-row__time">
                            {new Date(payment.paid_at).toLocaleTimeString("es-EC", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            )}

            {/* ── Cuenta pagada: resumen + factura pendiente ── */}
            {selectedBill?.status === "paid" && (
              <div className="bl-payment-card bl-payment-card--completed">
                <div className="bl-balance-notice bl-balance-notice--paid">
                  <div className="bl-balance-notice__row">
                    <span className="bl-balance-notice__label">Total pagado</span>
                    <span className="bl-balance-notice__paid">{formatMoney(displayTotal)}</span>
                  </div>
                </div>

                {selectedPayments.length > 0 && (
                  <div className="bl-payment-history" id="historial-pagos">
                    <span className="bl-payment-history__title">Pagos registrados</span>
                    {selectedPayments.map((payment) => (
                      <div key={payment.id} className="bl-payment-row">
                        <span className="bl-payment-row__method">
                          {paymentMethodLabel(payment.method)}
                        </span>
                        <span className="bl-payment-row__amount">
                          {formatMoney(payment.amount)}
                        </span>
                        <span className="bl-payment-row__time">
                          {new Date(payment.paid_at).toLocaleTimeString("es-EC", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {selectedBillInvoicePending && (
                  <div className="bl-invoice-pending">
                    <div className="bl-invoice-pending__head">
                      <span className="bl-badge bl-badge--invoice">Sin factura</span>
                      <p className="bl-invoice-pending__text">
                        El pago está completo. Puede emitir la factura cuando lo necesite o
                        finalizar sin comprobante.
                      </p>
                    </div>
                    <div className="bl-invoice-pending__actions">
                      <button
                        type="button"
                        className="bl-btn-invoice bl-invoice-pending__btn"
                        disabled={busy}
                        onClick={() => navigate(`/billing/invoice/${selectedBill.id}`)}
                      >
                        Emitir factura
                      </button>
                      <button
                        type="button"
                        className="bl-btn-consumer bl-invoice-pending__btn"
                        disabled={busy}
                        onClick={() => void handleDismissWithoutInvoice(selectedBill.id)}
                      >
                        Finalizar sin factura
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Banners de estado ── */}
            {selectedBill?.status === "paid" && !allOrderBillsPaid && (
              <div className="bl-paid-banner">✅ Esta cuenta está pagada.</div>
            )}
            {allOrderBillsPaid && (
              <div className="bl-paid-banner bl-paid-banner--full">
                {orderInvoicePending
                  ? "🎉 Todas las cuentas pagadas. Puede emitir factura antes de salir."
                  : "🎉 Todas las cuentas pagadas. La comanda se cerró y la mesa quedó libre."}
              </div>
            )}

            {/* ── Zona de peligro: anular ── */}
            {(canCancelEntireOrder ||
              (orderBills.length > 0 && !allOrderBillsPaid)) && (
              <div className="bl-danger-zone">
                <p className="bl-danger-zone__hint">
                  {canCancelEntireOrder
                    ? "Anular la comanda cancela todos los ítems y libera la mesa. Anular solo cuentas mantiene la comanda abierta para meseros."
                    : "Anular las cuentas permite volver a generar la pre-cuenta sin cerrar la comanda."}
                </p>
                <div className="bl-danger-zone__actions">
                  {canCancelEntireOrder && (
                    <button
                      type="button"
                      className="bl-btn-void-order"
                      disabled={busy}
                      onClick={() => setCancelOrderModalOpen(true)}
                    >
                      Anular comanda completa
                    </button>
                  )}
                  {orderBills.length > 0 && !allOrderBillsPaid && (
                    <button
                      type="button"
                      className="bl-btn-void"
                      disabled={busy}
                      onClick={() => void handleVoidBills()}
                    >
                      Anular solo cuentas
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* ══ Modal división ══ */}
      <BillSplitModal
        open={splitModalOpen}
        items={billableItemsForOrder}
        menuMap={menuMap}
        onClose={() => setSplitModalOpen(false)}
        onEqualSplit={handleEqualSplit}
        onItemSplit={handleItemSplit}
      />

      <PostPaymentInvoiceModal
        context={postPaymentInvoice}
        onClose={() => setPostPaymentInvoice(null)}
        onDismissWithoutInvoice={handleDismissWithoutInvoice}
      />

      <BillItemRemoveModal
        context={removeItemContext}
        busy={busy}
        onClose={() => {
          if (!busy) setRemoveItemContext(null);
        }}
        onConfirm={handleConfirmRemoveItem}
      />

      <BillOrderCancelModal
        open={cancelOrderModalOpen}
        orderLabel={selectedOrder ? getOrderLabel(selectedOrder) : ""}
        hasTable={selectedOrder?.table_id != null}
        itemCount={billableItemsForOrder.length}
        busy={busy}
        onClose={() => {
          if (!busy) setCancelOrderModalOpen(false);
        }}
        onConfirm={handleCancelEntireOrder}
      />

      {/* ══ Área de impresión ══ */}
      {selectedOrder && selectedBill ? (
        <div ref={printRef} className="billing-print-area">
          <h2>{restaurant?.name ?? "Restaurante"}</h2>
          <p>Pre-cuenta</p>
          <p>
            {getOrderLabel(selectedOrder)} | {selectedBill.split_label ?? "Cuenta"}
          </p>
          <p>{new Date().toLocaleString()}</p>
          <hr />
          {displayLines.map((line) => {
            const menu = menuMap.get(line.orderItem.menu_item_id);
            return (
              <div key={line.orderItem.id} className="billing-print-line">
                <span>
                  {menu?.name ?? "Ítem"} x{line.orderItem.quantity}
                </span>
                <span>{formatMoney(line.lineTotal)}</span>
              </div>
            );
          })}
          <hr />
          <div className="billing-print-line">
            <span>Total</span>
            <span>{formatMoney(selectedBill.total)}</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
