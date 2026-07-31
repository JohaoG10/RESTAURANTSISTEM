import { generateId } from "../../lib/generateId";
import { supabase } from "../../lib/supabase";
import type { TablesInsert, TablesUpdate } from "../../types/database.types";
import type { Category, MenuItem } from "./types";

const MENU_IMAGES_BUCKET = "menu-images";

function logSupabaseError(
  context: string,
  error: { message: string; code?: string; details?: string; hint?: string }
) {
  console.error(`[menu/api] ${context}`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    error,
  });
}

export async function fetchCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    logSupabaseError("fetchCategories", error);
    throw error;
  }
  return data;
}

export async function createCategory(
  payload: TablesInsert<"categories">
): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    logSupabaseError("createCategory", error);
    throw new Error(error.message);
  }
  return data;
}

export async function updateCategory(id: string, payload: TablesUpdate<"categories">) {
  const { error } = await supabase.from("categories").update(payload).eq("id", id);
  if (error) {
    logSupabaseError("updateCategory", error);
    throw error;
  }
}

export async function fetchMenuItems() {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    logSupabaseError("fetchMenuItems", error);
    throw error;
  }
  return data;
}

export async function createMenuItem(
  payload: TablesInsert<"menu_items">
): Promise<MenuItem> {
  const { data, error } = await supabase
    .from("menu_items")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    logSupabaseError("createMenuItem", error);
    throw new Error(error.message);
  }
  return data;
}

export async function updateMenuItem(id: string, payload: TablesUpdate<"menu_items">) {
  const { data, error } = await supabase
    .from("menu_items")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    logSupabaseError("updateMenuItem", error);
    throw error;
  }
  return data;
}

export async function softDeleteMenuItem(id: string, reason?: string) {
  const { error } = await supabase.rpc("soft_delete_menu_item", {
    p_id: id,
    p_reason: reason,
  });
  if (error) {
    logSupabaseError("softDeleteMenuItem", error);
    throw error;
  }
}

export function categoryNameById(categories: Category[], categoryId: string) {
  return categories.find((c) => c.id === categoryId)?.name ?? "Sin categoría";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

/** Sube imagen a Storage; si el bucket no existe, guarda data URL en image_url. */
export async function uploadMenuItemImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${generateId()}.${ext}`;

  const { error } = await supabase.storage
    .from(MENU_IMAGES_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (!error) {
    const { data } = supabase.storage.from(MENU_IMAGES_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  console.warn("[menu/api] uploadMenuItemImage fallback to data URL:", error.message);
  if (file.size > 512_000) {
    throw new Error(
      "La imagen es muy grande. Configura el bucket «menu-images» en Supabase o usa un archivo menor a 500 KB."
    );
  }
  return readFileAsDataUrl(file);
}
