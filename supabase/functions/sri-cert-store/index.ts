import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import forge from "npm:node-forge@1.3.1";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";

type StoreBody = {
  fileBase64?: string;
  fileName?: string;
  password?: string;
};

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseP12Expiry(p12Bytes: Uint8Array, password: string): string | null {
  try {
    const buffer = forge.util.createBuffer(
      String.fromCharCode(...p12Bytes),
      "raw"
    );
    const asn1 = forge.asn1.fromDer(buffer);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = bags[forge.pki.oids.certBag]?.[0];
    const notAfter = certBag?.cert?.validity?.notAfter;
    return notAfter ? notAfter.toISOString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Método no permitido" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ success: false, error: "No autorizado" }, 401);
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ success: false, error: "Sesión inválida" }, 401);
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.active !== true) {
    return jsonResponse({ success: false, error: "Solo administradores" }, 403);
  }

  let body: StoreBody;
  try {
    body = (await req.json()) as StoreBody;
  } catch {
    return jsonResponse({ success: false, error: "JSON inválido" }, 400);
  }

  const fileBase64 = body.fileBase64?.trim();
  const password = body.password ?? "";
  const fileName = (body.fileName?.trim() || "certificado.p12").replace(/[^\w.\-]/g, "_");

  if (!fileBase64 || !password) {
    return jsonResponse(
      { success: false, error: "Archivo .p12 y contraseña son obligatorios" },
      422
    );
  }

  const { data: restaurant, error: restError } = await supabaseAdmin
    .from("restaurants")
    .select("id, sri_cert_storage_path")
    .limit(1)
    .maybeSingle();

  if (restError || !restaurant) {
    return jsonResponse({ success: false, error: "Restaurante no configurado" }, 500);
  }

  const p12Bytes = decodeBase64(fileBase64);
  const expiresAt = parseP12Expiry(p12Bytes, password);
  const storagePath = `${restaurant.id}/${Date.now()}-${fileName}`;

  if (restaurant.sri_cert_storage_path) {
    await supabaseAdmin.storage
      .from("sri-certificates")
      .remove([restaurant.sri_cert_storage_path]);
  }

  const { error: uploadError } = await supabaseAdmin.storage
    .from("sri-certificates")
    .upload(storagePath, p12Bytes, {
      contentType: "application/x-pkcs12",
      upsert: true,
    });

  if (uploadError) {
    return jsonResponse(
      { success: false, error: `No se pudo subir el certificado: ${uploadError.message}` },
      500
    );
  }

  const { error: secretError } = await supabaseAdmin.from("restaurant_secrets").upsert(
    {
      restaurant_id: restaurant.id,
      cert_password: password,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "restaurant_id" }
  );

  if (secretError) {
    await supabaseAdmin.storage.from("sri-certificates").remove([storagePath]);
    return jsonResponse(
      { success: false, error: "No se pudo guardar la contraseña de forma segura" },
      500
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("restaurants")
    .update({
      sri_cert_storage_path: storagePath,
      sri_cert_filename: fileName,
      sri_cert_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", restaurant.id);

  if (updateError) {
    return jsonResponse({ success: false, error: updateError.message }, 500);
  }

  return jsonResponse({
    success: true,
    storagePath,
    fileName,
    expiresAt,
  });
});
