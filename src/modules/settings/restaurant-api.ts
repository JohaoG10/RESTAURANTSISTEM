import { supabase } from "../../lib/supabase";
import type { Json } from "../../types/database.types";
import type { ThemeConfig } from "./theme";
import { parseThemeConfig } from "./theme";

const RESTAURANT_ASSETS_BUCKET = "restaurant-assets";

export type RestaurantSettings = {
  id: string;
  name: string;
  commercial_name: string | null;
  ruc: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  sri_environment: "test" | "production";
  sri_establishment_code: string;
  sri_emission_point_code: string;
  sri_obligado_contabilidad: string;
  sri_cert_storage_path: string | null;
  sri_cert_filename: string | null;
  sri_cert_expires_at: string | null;
  theme_config: ThemeConfig | null;
  current_sequential: number;
};

export type RestaurantFormData = {
  name: string;
  commercial_name: string;
  ruc: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string | null;
};

export type SriFormData = {
  sri_environment: "test" | "production";
  sri_establishment_code: string;
  sri_emission_point_code: string;
  sri_obligado_contabilidad: boolean;
  current_sequential: number;
};

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: string }).message);
  }
  return fallback;
}

export async function fetchRestaurantSettings(): Promise<RestaurantSettings> {
  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select(
      "id, name, commercial_name, ruc, address, phone, email, logo_url, sri_environment, sri_establishment_code, sri_emission_point_code, sri_obligado_contabilidad, sri_cert_storage_path, sri_cert_filename, sri_cert_expires_at, theme_config"
    )
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(getErrorMessage(error, "No se pudo cargar la configuración"));
  if (!restaurant) throw new Error("Restaurante no configurado");

  const { data: seqRow } = await supabase
    .from("sri_invoice_sequences")
    .select("last_sequential")
    .eq("establishment_code", restaurant.sri_establishment_code)
    .eq("emission_point_code", restaurant.sri_emission_point_code)
    .eq("doc_type", "01")
    .maybeSingle();

  return {
    ...restaurant,
    theme_config: parseThemeConfig(restaurant.theme_config),
    current_sequential: Number(seqRow?.last_sequential ?? 0),
  };
}

export async function updateRestaurantProfile(
  id: string,
  payload: RestaurantFormData
): Promise<void> {
  const { error } = await supabase
    .from("restaurants")
    .update({
      name: payload.name.trim(),
      commercial_name: payload.commercial_name.trim() || null,
      ruc: payload.ruc.trim(),
      address: payload.address.trim() || null,
      phone: payload.phone.trim() || null,
      email: payload.email.trim() || null,
      logo_url: payload.logo_url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(getErrorMessage(error, "No se pudieron guardar los datos"));
}

export async function uploadRestaurantLogo(file: File, restaurantId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${restaurantId}/logo-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(RESTAURANT_ASSETS_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: true });

  if (error) {
    throw new Error(getErrorMessage(error, "No se pudo subir el logo"));
  }

  const { data } = supabase.storage.from(RESTAURANT_ASSETS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function storeSriCertificate(file: File, password: string): Promise<{
  fileName: string;
  expiresAt: string | null;
}> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const fileBase64 = btoa(binary);

  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    fileName?: string;
    expiresAt?: string | null;
    error?: string;
  }>("sri-cert-store", {
    body: {
      fileBase64,
      fileName: file.name,
      password,
    },
  });

  if (error) throw new Error(getErrorMessage(error, "No se pudo guardar el certificado"));
  if (!data?.success) {
    throw new Error(data?.error ?? "No se pudo guardar el certificado");
  }

  return {
    fileName: data.fileName ?? file.name,
    expiresAt: data.expiresAt ?? null,
  };
}

export async function updateSriSettings(id: string, payload: SriFormData): Promise<void> {
  const establishment = payload.sri_establishment_code.trim().padStart(3, "0").slice(-3);
  const emission = payload.sri_emission_point_code.trim().padStart(3, "0").slice(-3);
  const sequential = Math.max(0, Math.floor(payload.current_sequential));

  const { error: restError } = await supabase
    .from("restaurants")
    .update({
      sri_environment: payload.sri_environment,
      sri_establishment_code: establishment,
      sri_emission_point_code: emission,
      sri_obligado_contabilidad: payload.sri_obligado_contabilidad ? "SI" : "NO",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (restError) throw new Error(getErrorMessage(restError, "No se pudo guardar la configuración SRI"));

  const { data: existing } = await supabase
    .from("sri_invoice_sequences")
    .select("id")
    .eq("establishment_code", establishment)
    .eq("emission_point_code", emission)
    .eq("doc_type", "01")
    .maybeSingle();

  if (existing?.id) {
    const { error: seqError } = await supabase
      .from("sri_invoice_sequences")
      .update({ last_sequential: sequential, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (seqError) throw new Error(getErrorMessage(seqError, "No se pudo actualizar el secuencial"));
  } else if (sequential > 0) {
    const { error: seqError } = await supabase.from("sri_invoice_sequences").insert({
      establishment_code: establishment,
      emission_point_code: emission,
      doc_type: "01",
      last_sequential: sequential,
    });
    if (seqError) throw new Error(getErrorMessage(seqError, "No se pudo crear el secuencial"));
  }
}

export async function updateRestaurantTheme(id: string, theme: ThemeConfig): Promise<void> {
  const { error } = await supabase
    .from("restaurants")
    .update({
      theme_config: theme as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(getErrorMessage(error, "No se pudo guardar el tema"));
}

export type CertStatus = "none" | "active" | "expired";

export function getCertificateStatus(settings: RestaurantSettings): CertStatus {
  if (!settings.sri_cert_storage_path) return "none";
  if (!settings.sri_cert_expires_at) return "active";
  return new Date(settings.sri_cert_expires_at) < new Date() ? "expired" : "active";
}

export function formatCertExpiry(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
