import { supabase } from "../../lib/supabase";
import { todayIsoDate } from "../../lib/dates";
import { fetchActiveOrders } from "../../modules/orders/api";
import { fetchActiveCashShift, fetchDailyReport, isCashShiftOpen } from "../../modules/reports/api";
import type { Tables } from "../../types/database.types";

export type TableStatus = Tables<"restaurant_tables">["status"];

export type FloorTableTile = {
  id: string;
  number: number;
  status: TableStatus;
  activeOrdersCount: number;
};

export type DashboardSnapshot = {
  date: string;
  totalSoldToday: number | null;
  occupiedTables: number;
  activeOrders: number;
  cashShiftOpen: boolean;
};

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  const date = todayIsoDate();

  const [occupiedRes, orders, cashShift] = await Promise.all([
    supabase
      .from("restaurant_tables")
      .select("id", { count: "exact", head: true })
      .eq("status", "occupied"),
    fetchActiveOrders(),
    fetchActiveCashShift().catch(() => null),
  ]);

  if (occupiedRes.error) throw occupiedRes.error;

  let totalSoldToday: number | null = null;
  try {
    const report = await fetchDailyReport(date);
    totalSoldToday = report.total_billed;
  } catch {
    totalSoldToday = null;
  }

  return {
    date,
    totalSoldToday,
    occupiedTables: occupiedRes.count ?? 0,
    activeOrders: orders.length,
    cashShiftOpen: isCashShiftOpen(cashShift),
  };
}

export async function fetchFloorTableOverview(): Promise<FloorTableTile[]> {
  const [tablesRes, orders] = await Promise.all([
    supabase
      .from("restaurant_tables")
      .select("id, number, status")
      .order("number", { ascending: true }),
    fetchActiveOrders(),
  ]);

  if (tablesRes.error) throw tablesRes.error;

  const ordersByTable = new Map<string, number>();
  for (const order of orders) {
    if (!order.table_id) continue;
    ordersByTable.set(order.table_id, (ordersByTable.get(order.table_id) ?? 0) + 1);
  }

  return (tablesRes.data ?? []).map((table) => ({
    id: table.id,
    number: table.number,
    status: table.status,
    activeOrdersCount: ordersByTable.get(table.id) ?? 0,
  }));
}

const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: "Disponible",
  occupied: "Ocupada",
  reserved: "Reservada",
};

export function tableStatusLabel(status: TableStatus) {
  return TABLE_STATUS_LABELS[status];
}
