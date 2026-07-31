import { supabase } from "../../lib/supabase";
import type { Tables } from "../../types/database.types";
import {
  ACTIVE_ORDER_STATUSES,
  fetchOrdersByIds,
  type Order,
  type OrderItemWithServed,
} from "../orders/api";
import type { ItemSplitGroup } from "./components/BillSplitModal";

export type Bill = Tables<"bills"> & {
  split_group_id?: string | null;
  split_label?: string | null;
  split_mode?: string | null;
};
export type Payment = Tables<"payments">;
export type BillItem = Tables<"bill_items"> & {
  allocated_amount?: number | null;
};

export type BillLine = {
  billItem: BillItem;
  orderItem: OrderItemWithServed;
  lineTotal: number;
  /** Monto completo del ítem en la comanda (antes de dividir). */
  fullLineTotal?: number;
  /** Partes iguales: cuántas personas comparten la comanda. */
  equalParts?: number;
};

const OPEN_BILL_STATUSES: Bill["status"][] = [
  "draft",
  "pending_payment",
  "partially_paid",
  "paid",
];

/** Horas que una comanda pagada permanece visible para emitir factura. */
export const INVOICE_PENDING_WINDOW_HOURS = 24;

export function logSupabaseError(context: string, error: unknown) {
  console.error(`[billing] ${context}`, error);
  if (error && typeof error === "object") {
    console.error(`[billing] ${context} (json):`, JSON.stringify(error, null, 2));
  }
}

export async function fetchBillableOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .in("status", ACTIVE_ORDER_STATUSES)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    logSupabaseError("fetchBillableOrders", error);
    throw error;
  }
  return data as Order[];
}

export async function fetchRecentInvoicePendingBills() {
  const since = new Date(
    Date.now() - INVOICE_PENDING_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .eq("status", "paid")
    .eq("invoice_requested", true)
    .gte("paid_at", since)
    .is("deleted_at", null)
    .order("paid_at", { ascending: false });

  if (error) {
    logSupabaseError("fetchRecentInvoicePendingBills", error);
    throw error;
  }
  return data as Bill[];
}

/** Comandas activas + cerradas con factura pendiente (últimas 24 h). */
export async function fetchBillingOrders() {
  const [activeOrders, pendingInvoiceBills] = await Promise.all([
    fetchBillableOrders(),
    fetchRecentInvoicePendingBills(),
  ]);

  const activeIds = new Set(activeOrders.map((order) => order.id));
  const extraOrderIds = [
    ...new Set(
      pendingInvoiceBills
        .map((bill) => bill.order_id)
        .filter((orderId) => !activeIds.has(orderId))
    ),
  ];

  if (extraOrderIds.length === 0) return activeOrders;

  const closedOrders = await fetchOrdersByIds(extraOrderIds);
  return [...activeOrders, ...closedOrders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function orderHasInvoicePending(bills: Bill[], orderId: string) {
  return bills.some(
    (bill) =>
      bill.order_id === orderId &&
      bill.status === "paid" &&
      bill.invoice_requested === true
  );
}

export async function fetchBillsByOrderIds(orderIds: string[]) {
  if (orderIds.length === 0) return [] as Bill[];
  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .in("order_id", orderIds)
    .in("status", OPEN_BILL_STATUSES)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    logSupabaseError("fetchBillsByOrderIds", error);
    throw error;
  }
  return data as Bill[];
}

export async function fetchPaymentsByBillIds(billIds: string[]) {
  if (billIds.length === 0) return [] as Payment[];
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .in("bill_id", billIds)
    .order("paid_at", { ascending: true });
  if (error) {
    logSupabaseError("fetchPaymentsByBillIds", error);
    throw error;
  }
  return data;
}

export async function fetchBillById(billId: string) {
  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .eq("id", billId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logSupabaseError("fetchBillById", error);
    throw error;
  }
  return data as Bill | null;
}

export async function fetchBillItems(billId: string) {
  const { data, error } = await supabase
    .from("bill_items")
    .select("*")
    .eq("bill_id", billId);
  if (error) {
    logSupabaseError("fetchBillItems", error);
    throw error;
  }
  return data;
}

export async function createBillFromOrder(orderId: string, tipPercent = 0) {
  const { data, error } = await supabase.rpc("create_bill_from_order", {
    p_order_id: orderId,
    p_tip_percent: tipPercent,
  });
  if (error) {
    logSupabaseError("create_bill_from_order", error);
    throw error;
  }
  return data as string;
}

export async function createEqualSplitBills(orderId: string, parts: number, tipPercent = 0) {
  const { data, error } = await supabase.rpc("create_equal_split_bills", {
    p_order_id: orderId,
    p_parts: parts,
    p_tip_percent: tipPercent,
  });
  if (error) {
    logSupabaseError("create_equal_split_bills", error);
    throw error;
  }
  return data as string;
}

export async function createItemSplitBills(
  orderId: string,
  groups: ItemSplitGroup[],
  tipPercent = 0
) {
  const payload = groups.map((group) => ({
    label: group.label,
    unit_keys: group.unitKeys,
  }));
  const { data, error } = await supabase.rpc("create_item_split_bills", {
    p_order_id: orderId,
    p_groups: payload,
    p_tip_percent: tipPercent,
  });
  if (error) {
    logSupabaseError("create_item_split_bills", error);
    throw error;
  }
  return data as string;
}

export async function confirmOrderBills(orderId: string) {
  const { data, error } = await supabase.rpc("confirm_order_bills", {
    p_order_id: orderId,
  });
  if (error) {
    logSupabaseError("confirm_order_bills", error);
    throw error;
  }
  return data as number;
}

export async function updateBillTip(billId: string, tipPercent: number) {
  const { data, error } = await supabase.rpc("update_bill_tip", {
    p_bill_id: billId,
    p_tip_percent: tipPercent,
  });
  if (error) {
    logSupabaseError("update_bill_tip", error);
    throw error;
  }
  return data as Bill;
}

export async function advanceBillStatus(billId: string, status: Bill["status"]) {
  const { data, error } = await supabase.rpc("advance_bill_status", {
    p_bill_id: billId,
    p_new_status: status,
  });
  if (error) {
    logSupabaseError("advance_bill_status", error);
    throw error;
  }
  return data as Bill["status"];
}

export async function registerPayment(input: {
  billId: string;
  method: Payment["method"];
  amount: number;
  reference?: string;
}) {
  const { data, error } = await supabase.rpc("register_payment", {
    p_bill_id: input.billId,
    p_method: input.method,
    p_amount: input.amount,
    p_reference: input.reference || undefined,
  });
  if (error) {
    logSupabaseError("register_payment", error);
    throw error;
  }
  return data as Bill["status"];
}

export async function dismissBillInvoiceRequest(billId: string) {
  const { data, error } = await supabase.rpc("dismiss_bill_invoice_request", {
    p_bill_id: billId,
  });
  if (error) {
    logSupabaseError("dismiss_bill_invoice_request", error);
    throw error;
  }
  return data as boolean;
}

export function sumPayments(payments: Payment[]) {
  return payments.reduce((acc, payment) => acc + payment.amount, 0);
}

export function getBillBalance(bill: Bill, payments: Payment[]) {
  return Math.max(0, roundMoney(bill.total - sumPayments(payments)));
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function orderHasActiveBills(bills: Bill[], orderId: string) {
  return bills.some(
    (bill) => bill.order_id === orderId && !["voided", "refunded"].includes(bill.status)
  );
}

export function getOrderBillSummary(bills: Bill[], orderId: string) {
  const orderBills = bills.filter((bill) => bill.order_id === orderId);
  const paid = orderBills.filter((bill) => bill.status === "paid").length;
  return { total: orderBills.length, paid };
}

export function orderHasPayments(
  bills: Bill[],
  payments: Payment[],
  orderId: string
) {
  const billIds = new Set(
    bills.filter((bill) => bill.order_id === orderId).map((bill) => bill.id)
  );
  return payments.some((payment) => billIds.has(payment.bill_id));
}

export async function voidOrderDraftBills(orderId: string, bills: Bill[]) {
  const targets = bills.filter(
    (bill) =>
      bill.order_id === orderId &&
      (bill.status === "draft" || bill.status === "pending_payment")
  );
  for (const bill of targets) {
    await advanceBillStatus(bill.id, "voided");
  }
}
