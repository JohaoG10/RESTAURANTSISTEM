import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const RIDE_BUCKET = "invoice-ride";

export type RideEmailInput = {
  to: string;
  customerName: string;
  authorizationNumber: string;
  accessKey: string;
  docNumber: string;
  sequential: number;
  importeTotal: number;
  restaurantName: string;
  restaurantEmail?: string | null;
  rideHtml?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSequential(sequential: number): string {
  return sequential.toString().padStart(9, "0");
}

function buildFromAddress(restaurantName: string, email: string): string {
  const safeName = restaurantName.replace(/[<>"\\]/g, "").trim() || "Restaurante";
  return `${safeName} <${email.trim()}>`;
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function buildEmailHtml(input: RideEmailInput): string {
  const total = input.importeTotal.toFixed(2);
  const secuencial = formatSequential(input.sequential);
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /></head>
<body style="font-family:Arial,sans-serif;color:#222;line-height:1.5;max-width:560px">
  <h2 style="margin:0 0 12px">${escapeHtml(input.restaurantName)}</h2>
  <p>Estimado/a ${escapeHtml(input.customerName)},</p>
  <p>Su comprobante electrónico ha sido <strong>autorizado</strong> por el SRI.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 0;color:#666">Comprobante</td><td><strong>${escapeHtml(input.docNumber)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#666">Nº autorización</td><td>${escapeHtml(input.authorizationNumber)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Clave de acceso</td><td style="font-family:monospace;font-size:12px">${escapeHtml(input.accessKey)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Total</td><td><strong>$ ${total}</strong></td></tr>
  </table>
  <p style="font-size:13px;color:#555">${
    input.rideHtml
      ? "Adjuntamos la representación impresa (RIDE) en formato HTML para su descarga."
      : "Conserve este correo como respaldo de su comprobante. Para la representación impresa (RIDE), solicítela en el restaurante."
  }</p>
  <p style="font-size:12px;color:#888">${escapeHtml(input.restaurantName)}${input.restaurantEmail ? ` · ${escapeHtml(input.restaurantEmail)}` : ""}</p>
</body>
</html>`;
}

/** Descarga el HTML del RIDE desde Storage para adjuntarlo al correo. */
export async function downloadRideHtml(
  admin: SupabaseClient,
  ridePath: string | null | undefined
): Promise<string | undefined> {
  if (!ridePath) return undefined;

  try {
    const { data, error } = await admin.storage.from(RIDE_BUCKET).download(ridePath);
    if (error || !data) {
      console.error("[sri-email] Error al descargar RIDE:", error);
      return undefined;
    }
    return await data.text();
  } catch (err) {
    console.error("[sri-email] Excepción al descargar RIDE:", err);
    return undefined;
  }
}

/** Envía RIDE/resumen por email vía Resend (opcional si RESEND_API_KEY está configurado). */
export async function sendRideEmail(input: RideEmailInput): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fallbackFrom = Deno.env.get("RESEND_FROM_EMAIL")?.trim();
  const fromEmail = input.restaurantEmail?.trim() || fallbackFrom;

  if (!apiKey) {
    console.warn("[sri-email] RESEND_API_KEY no configurado — email omitido");
    return false;
  }

  if (!fromEmail) {
    console.warn(
      "[sri-email] Sin email del restaurante ni RESEND_FROM_EMAIL — email omitido"
    );
    return false;
  }

  const from = buildFromAddress(input.restaurantName, fromEmail);
  const secuencial = formatSequential(input.sequential);
  const subject = `Factura electrónica #${secuencial} — ${input.restaurantName}`;

  const payload: Record<string, unknown> = {
    from,
    to: [input.to],
    subject,
    html: buildEmailHtml(input),
  };

  if (input.rideHtml) {
    payload.attachments = [
      {
        filename: `RIDE-factura-${secuencial}.html`,
        content: encodeBase64Utf8(input.rideHtml),
      },
    ];
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[sri-email] Resend error:", response.status, text);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[sri-email] Error al enviar correo:", err);
    return false;
  }
}
