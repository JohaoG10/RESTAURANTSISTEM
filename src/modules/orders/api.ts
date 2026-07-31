import { supabase } from "../../lib/supabase";
import type { Tables, TablesInsert } from "../../types/database.types";

export type RestaurantTable = Tables<"restaurant_tables">;
export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
export type MenuItem = Tables<"menu_items">;
export type OrderItemWithServed = OrderItem & {
  served_quantity: number;
  modified_at?: string | null;
  modified_seen_at?: string | null;
  cancelled_at?: string | null;
};
export const ACTIVE_ORDER_STATUSES: Tables<"orders">["status"][] = [
  "draft",
  "open",
  "in_progress",
  "ready",
  "served",
];

export async function fetchTablesForOrders() {
  const { data, error } = await supabase
    .from("restaurant_tables")
    .select("*")
    .order("number", { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchActiveOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .in("status", ACTIVE_ORDER_STATUSES)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchOrdersByIds(orderIds: string[]) {
  if (orderIds.length === 0) return [] as Order[];
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .in("id", orderIds)
    .is("deleted_at", null);
  if (error) throw error;
  return data as Order[];
}

export async function fetchOrderItems(orderIds: string[]) {
  if (orderIds.length === 0) return [] as OrderItemWithServed[];
  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as (OrderItem & { served_quantity?: number })[]).map((item) => ({
    ...item,
    served_quantity: item.served_quantity ?? (item.status === "served" ? item.quantity : 0),
  }));
}

export async function fetchAvailableMenuItems() {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createOrder(payload: TablesInsert<"orders">) {
  const { data, error } = await supabase
    .from("orders")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getNextTakeawayNumber(): Promise<number> {
  const { data, error } = await supabase.rpc("get_next_takeaway_number");
  if (error) throw error;
  return data as number;
}

export async function createTakeawayOrder(payload: {
  waiter_id: string;
  customer_name?: string | null;
  notes?: string | null;
}): Promise<Order> {
  const takeawayNumber = await getNextTakeawayNumber();
  const { data, error } = await supabase
    .from("orders")
    .insert({
      ...payload,
      table_id: null,
      status: "open",
      order_type: "takeaway",
      takeaway_number: takeawayNumber,
    } as TablesInsert<"orders">)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export function takeawayLabel(order: Order): string {
  const num = (order.takeaway_number ?? 0).toString().padStart(3, "0");
  return order.customer_name
    ? `#${num} — ${order.customer_name}`
    : `#${num} — Para llevar`;
}

export async function setTableStatus(
  tableId: string,
  status: Tables<"restaurant_tables">["status"]
) {
  const { error } = await supabase
    .from("restaurant_tables")
    .update({ status })
    .eq("id", tableId);
  if (error) throw error;
}

export async function syncTableStatusByActiveOrders(tableId: string | null) {
  if (!tableId) return; // pedidos takeaway no tienen mesa
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("table_id", tableId)
    .in("status", ACTIVE_ORDER_STATUSES)
    .limit(1);
  if (error) throw error;

  const hasActive = (data?.length ?? 0) > 0;
  await setTableStatus(tableId, hasActive ? "occupied" : "available");
}

export function normalizeItemNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  return trimmed || null;
}

export type NoteGroupPayload = {
  notes: string | null;
  quantity: number;
  served_quantity: number;
  status: OrderItem["status"];
};

export function buildNoteGroupsFromUnits(
  unitNotes: string[],
  totalServed: number,
  fallbackStatus: OrderItem["status"]
): NoteGroupPayload[] {
  const counts = new Map<string, number>();
  for (const raw of unitNotes) {
    const key = normalizeItemNotes(raw) ?? "__NO_NOTE__";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const keys = [...counts.keys()].sort((a, b) => {
    if (a === "__NO_NOTE__") return -1;
    if (b === "__NO_NOTE__") return 1;
    return a.localeCompare(b);
  });

  let servedLeft = totalServed;
  return keys.map((key) => {
    const quantity = counts.get(key)!;
    const served_quantity = Math.min(servedLeft, quantity);
    servedLeft -= served_quantity;
    const status: OrderItem["status"] =
      served_quantity >= quantity ? "served" : fallbackStatus;
    return {
      notes: key === "__NO_NOTE__" ? null : key,
      quantity,
      served_quantity,
      status,
    };
  });
}

export async function splitOrderItemByUnitNotes(
  item: OrderItemWithServed,
  unitNotes: string[]
) {
  if (unitNotes.length !== item.quantity) {
    throw new Error("La cantidad de unidades no coincide con el ítem.");
  }

  const served = item.served_quantity ?? 0;
  const groups = buildNoteGroupsFromUnits(unitNotes, served, item.status);

  if (groups.length === 1) {
    const group = groups[0];
    const { error } = await supabase
      .from("order_items")
      .update({
        quantity: group.quantity,
        notes: group.notes,
        served_quantity: group.served_quantity,
        status: group.status,
        modified_at: new Date().toISOString(),
        modified_seen_at: null,
      } as never)
      .eq("id", item.id);
    if (error) throw error;
    return;
  }

  const [first, ...rest] = groups;
  const { error: updateError } = await supabase
    .from("order_items")
    .update({
      quantity: first.quantity,
      notes: first.notes,
      served_quantity: first.served_quantity,
      status: first.status,
      modified_at: new Date().toISOString(),
      modified_seen_at: null,
    } as never)
    .eq("id", item.id);
  if (updateError) throw updateError;

  for (const group of rest) {
    const { error } = await supabase.from("order_items").insert({
      order_id: item.order_id,
      menu_item_id: item.menu_item_id,
      quantity: group.quantity,
      notes: group.notes,
      served_quantity: group.served_quantity,
      status: group.status,
      price_at_order: item.price_at_order,
    } as TablesInsert<"order_items">);
    if (error) throw error;
  }
}

export async function addItemToOrder(payload: TablesInsert<"order_items">) {
  const notes = normalizeItemNotes(payload.notes ?? null);

  const { data: existingItems, error: fetchError } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", payload.order_id)
    .eq("menu_item_id", payload.menu_item_id)
    .neq("status", "cancelled");

  if (fetchError) throw fetchError;

  const match = ((existingItems ?? []) as OrderItemWithServed[]).find((item) => {
    if (normalizeItemNotes(item.notes) !== notes) return false;
    const served = item.served_quantity ?? (item.status === "served" ? item.quantity : 0);
    return served < item.quantity;
  });

  if (match) {
    const addQty = payload.quantity ?? 1;
    const newQty = match.quantity + addQty;
    const served = match.served_quantity ?? 0;
    const { error } = await supabase
      .from("order_items")
      .update({
        quantity: newQty,
        status: served >= newQty ? "served" : match.status,
        modified_at: new Date().toISOString(),
        modified_seen_at: null,
      } as never)
      .eq("id", match.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("order_items").insert({
    ...payload,
    notes,
  });
  if (error) throw error;
}

export async function updateOrderItem(
  itemId: string,
  payload: Pick<OrderItemWithServed, "quantity" | "notes">
) {
  const { data, error: readError } = await supabase
    .from("order_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (readError) throw readError;

  const row = data as OrderItemWithServed;
  if (row.served_quantity > payload.quantity) {
    throw new Error("La cantidad no puede ser menor a lo ya entregado.");
  }

  const { error } = await supabase
    .from("order_items")
    .update({
      quantity: payload.quantity,
      notes: payload.notes,
      status: payload.quantity === row.served_quantity ? "served" : "pending",
      modified_at: new Date().toISOString(),
      modified_seen_at: null,
    } as never)
    .eq("id", itemId);
  if (error) throw error;
}

export async function markOrderItemModificationSeen(itemId: string) {
  const { error } = await supabase
    .from("order_items")
    .update({ modified_seen_at: new Date().toISOString() } as never)
    .eq("id", itemId);
  if (error) throw error;
}

export async function cancelOrderItem(itemId: string) {
  const { data, error: readError } = await supabase
    .from("order_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (readError) throw readError;

  const row = data as OrderItemWithServed;
  if (row.served_quantity > 0) {
    throw new Error("No se puede eliminar un item ya entregado parcialmente.");
  }

  const { error } = await supabase
    .from("order_items")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      modified_at: null,
      modified_seen_at: null,
    } as never)
    .eq("id", itemId);
  if (error) throw error;
}

export function computeNextServedState(item: OrderItemWithServed) {
  const currentServed = item.served_quantity ?? (item.status === "served" ? item.quantity : 0);
  const nextServed = Math.min(item.quantity, currentServed + 1);
  const nextStatus: OrderItem["status"] =
    nextServed >= item.quantity ? "served" : item.status;
  return { served_quantity: nextServed, status: nextStatus };
}

export function computeFullyServedState(item: OrderItemWithServed) {
  return { served_quantity: item.quantity, status: "served" as OrderItem["status"] };
}

export async function markOrderItemServed(itemId: string) {
  const { data, error: readError } = await supabase
    .from("order_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (readError) throw readError;

  const row = data as OrderItemWithServed;
  const next = computeNextServedState({
    ...row,
    served_quantity: row.served_quantity ?? (row.status === "served" ? row.quantity : 0),
  });

  const { data: updated, error } = await supabase
    .from("order_items")
    .update({ served_quantity: next.served_quantity, status: next.status } as never)
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) throw error;

  return {
    ...(updated as OrderItemWithServed),
    served_quantity: next.served_quantity,
  };
}

export async function markOrderItemFullyServed(itemId: string) {
  const { data, error: readError } = await supabase
    .from("order_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (readError) throw readError;

  const row = data as OrderItemWithServed;
  const next = computeFullyServedState({
    ...row,
    served_quantity: row.served_quantity ?? (row.status === "served" ? row.quantity : 0),
  });

  const { data: updated, error } = await supabase
    .from("order_items")
    .update({ served_quantity: next.served_quantity, status: next.status } as never)
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) throw error;

  return {
    ...(updated as OrderItemWithServed),
    served_quantity: next.served_quantity,
  };
}

export async function closeOrder(orderId: string) {
  const { error } = await supabase
    .from("orders")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw error;
}

export async function cancelOrder(orderId: string) {
  const { data, error: readError } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);
  if (readError) throw readError;

  const items = (data ?? []) as OrderItemWithServed[];
  if (items.some((item) => item.served_quantity > 0)) {
    throw new Error("No se puede eliminar la comanda: hay items ya entregados.");
  }

  if (items.length > 0) {
    const { error: cancelItemsError } = await supabase
      .from("order_items")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        modified_at: null,
        modified_seen_at: null,
      } as never)
      .eq("order_id", orderId);
    if (cancelItemsError) throw cancelItemsError;
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled", closed_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw error;
}

export async function advanceOrderStatus(
  orderId: string,
  nextStatus: Tables<"orders">["status"]
) {
  const { error } = await supabase.rpc("advance_order_status", {
    p_order_id: orderId,
    p_new_status: nextStatus,
  });
  if (error) throw error;
}

/** Avanza la comanda hasta `served` siguiendo transiciones válidas del RPC. */
export async function advanceOrderToServed(orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw error;

  const status = data.status as Tables<"orders">["status"];
  if (status === "served") return;
  if (status === "closed" || status === "cancelled") {
    throw new Error("Esta comanda no puede pasar a cobro.");
  }

  const stepsByStatus: Partial<
    Record<Tables<"orders">["status"], Tables<"orders">["status"][]>
  > = {
    draft: ["open", "in_progress", "ready", "served"],
    open: ["in_progress", "ready", "served"],
    in_progress: ["ready", "served"],
    ready: ["served"],
  };

  const steps = stepsByStatus[status];
  if (!steps?.length) {
    throw new Error("No se puede cerrar la comanda en este estado.");
  }

  for (const step of steps) {
    await advanceOrderStatus(orderId, step);
  }
}

export function nextOrderStatus(
  current: Tables<"orders">["status"]
): Tables<"orders">["status"] | null {
  const transitions: Record<Tables<"orders">["status"], Tables<"orders">["status"] | null> =
    {
      draft: "open",
      open: "in_progress",
      in_progress: "ready",
      ready: "served",
      served: "closed",
      closed: null,
      cancelled: null,
    };
  return transitions[current];
}
