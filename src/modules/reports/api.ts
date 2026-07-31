import { supabase } from "../../lib/supabase";
import type { Tables } from "../../types/database.types";

export type CashShift = Tables<"cash_shifts"> & {
  expected_cash_amount?: number | null;
  cash_sales?: number | null;
  card_sales?: number | null;
  transfer_sales?: number | null;
  total_sales?: number | null;
};

export type DailyReport = {
  report_date: string;
  total_billed: number;
  tables_served: number;
  top_payment_method: string | null;
  revenue_by_method: {
    cash: number;
    card: number;
    transfer: number;
  };
  top_dishes: Array<{
    menu_item_id: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
};

export type ShiftLiveSummary = {
  opening_amount: number;
  cash_sales: number;
  card_sales: number;
  transfer_sales: number;
  total_sales: number;
  expected_cash: number;
  is_open: boolean;
};

function logError(context: string, error: unknown) {
  console.error(`[reports] ${context}`, error);
}

export async function fetchDailyReport(reportDate: string) {
  const { data, error } = await supabase.rpc("get_daily_sales_report", {
    p_report_date: reportDate,
  });
  if (error) {
    logError("fetchDailyReport", error);
    throw error;
  }
  const raw = data as DailyReport & {
    top_dishes?: Array<{
      menu_item_id: string;
      name: string;
      quantity: number | string;
      revenue: number | string;
    }>;
  };
  return {
    ...raw,
    total_billed: Number(raw.total_billed),
    tables_served: Number(raw.tables_served),
    revenue_by_method: {
      cash: Number(raw.revenue_by_method?.cash ?? 0),
      card: Number(raw.revenue_by_method?.card ?? 0),
      transfer: Number(raw.revenue_by_method?.transfer ?? 0),
    },
    top_dishes: (raw.top_dishes ?? []).map((dish) => ({
      ...dish,
      quantity: Number(dish.quantity),
      revenue: Number(dish.revenue),
    })),
  };
}

export function isCashShiftOpen(shift: CashShift | null | undefined) {
  return Boolean(shift?.id && !shift.closed_at);
}

export async function fetchActiveCashShift() {
  const { data, error } = await supabase.rpc("get_active_cash_shift");
  if (error) {
    logError("fetchActiveCashShift", error);
    throw error;
  }
  const shift = (data as CashShift | null) ?? null;
  return isCashShiftOpen(shift) ? shift : null;
}

export async function fetchShiftLiveSummary(shiftId: string) {
  const { data, error } = await supabase.rpc("get_shift_live_summary", {
    p_shift_id: shiftId,
  });
  if (error) {
    logError("fetchShiftLiveSummary", error);
    throw error;
  }
  return data as ShiftLiveSummary;
}

export async function openCashShift(openingAmount: number) {
  const { data, error } = await supabase.rpc("open_cash_shift", {
    p_opening_amount: openingAmount,
  });
  if (error) {
    logError("openCashShift", error);
    throw error;
  }
  return data as CashShift;
}

export async function closeCashShift(declaredAmount: number, notes?: string) {
  const { data, error } = await supabase.rpc("close_cash_shift", {
    p_declared_amount: declaredAmount,
    p_notes: notes?.trim() || undefined,
  });
  if (error) {
    logError("closeCashShift", error);
    throw error;
  }
  return data as CashShift;
}

export async function fetchCashShiftHistory(limit = 30) {
  const { data, error } = await supabase.rpc("list_cash_shifts", {
    p_limit: limit,
  });
  if (error) {
    logError("fetchCashShiftHistory", error);
    throw error;
  }
  return (data ?? []) as CashShift[];
}
