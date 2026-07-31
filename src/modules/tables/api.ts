import { supabase } from "../../lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "../../types/database.types";
import { normalizeTableShape, type TableShape } from "./utils";

type DbTable = Tables<"restaurant_tables">;

export type RestaurantTable = DbTable & {
  shape: TableShape;
};

export type CreateTableInput = {
  number: number;
  capacity: number;
  shape: TableShape;
  status?: DbTable["status"];
  position_x: number;
  position_y: number;
};

function toRestaurantTable(row: DbTable): RestaurantTable {
  return { ...row, shape: normalizeTableShape(row.shape) };
}

function logSupabaseError(
  context: string,
  error: { message: string; code?: string; details?: string; hint?: string }
) {
  console.error(`[tables/api] ${context}`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    error,
  });
}

export async function fetchTables(): Promise<RestaurantTable[]> {
  const { data, error } = await supabase
    .from("restaurant_tables")
    .select("*")
    .order("number", { ascending: true });
  if (error) {
    logSupabaseError("fetchTables", error);
    throw error;
  }
  return (data ?? []).map(toRestaurantTable);
}

export async function createTable(payload: CreateTableInput): Promise<RestaurantTable> {
  const insertPayload: TablesInsert<"restaurant_tables"> = {
    number: payload.number,
    capacity: payload.capacity,
    shape: payload.shape,
    status: payload.status ?? "available",
    position_x: payload.position_x,
    position_y: payload.position_y,
  };

  const { data, error } = await supabase
    .from("restaurant_tables")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    logSupabaseError("createTable", error);
    throw new Error(error.message);
  }

  return toRestaurantTable(data);
}

export async function updateTable(id: string, payload: TablesUpdate<"restaurant_tables">) {
  const { error } = await supabase.from("restaurant_tables").update(payload).eq("id", id);
  if (error) {
    logSupabaseError("updateTable", error);
    throw error;
  }
}

export async function deleteTable(id: string) {
  const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
  if (error) {
    logSupabaseError("deleteTable", error);
    throw error;
  }
}
