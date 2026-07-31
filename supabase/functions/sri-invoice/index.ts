import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import {
  finalizeAuthorizedInvoice,
  processInvoiceEmit,
  parseSequentialFromAccessKey,
} from "../_shared/sri/emit-flow.ts";
import {
  getSriUrls,
  type InvoiceRow,
  type RestaurantRow,
} from "../_shared/sri/invoice-helpers.ts";
import { recordMetricEvent, writeSriAuditLog } from "../_shared/sri/invoice-metrics.ts";
import { formatDocNumber } from "../_shared/sri/ride-generator.ts";
import { downloadRideHtml, sendRideEmail } from "../_shared/sri/send-ride-email.ts";
import { pingSri } from "../_shared/sri/sri-ping.ts";
import { autorizarWithRetries } from "../_shared/sri/sri-retry.ts";
import { formatSriMessages } from "../_shared/sri/soap-client.ts";

export type EmitInvoiceRequest = {
  action?: "emit" | "check_status" | "ping" | "reissue" | "check_all_pending";
  billId?: string;
  invoiceId?: string;
  accessKey?: string;
  previousInvoiceId?: string;
  invoiceType?: "invoice" | "sales_note";
  customer?: {
    identification: string;
    name: string;
    address?: string;
    email?: string;
    consumidorFinal?: boolean;
  };
};

export type EmitInvoiceResponse = {
  success: boolean;
  invoiceId?: string;
  accessKey?: string;
  authorizationNumber?: string;
  rideUrl?: string;
  sriStatus: string;
  messages?: string[];
  error?: string;
  sriAvailable?: boolean;
  checked?: number;
  authorized?: number;
};

type BillRow = { id: string; subtotal: number; tip_amount: number; total: number };

/** Respuesta de negocio — siempre 200 para que el frontend reciba el JSON sin excepción. */
function okResponse(body: EmitInvoiceResponse): Response {
  return jsonResponse(body, 200);
}

async function handleCheckStatus(
  body: EmitInvoiceRequest,
  admin: SupabaseClient,
  userId: string
): Promise<Response> {
  if (!body.invoiceId && !body.accessKey) {
    return okResponse({ success: false, sriStatus: "error", error: "invoiceId o accessKey son requeridos" });
  }

  try {
    let query = admin.from("invoices").select("*").is("deleted_at", null);
    if (body.invoiceId) query = query.eq("id", body.invoiceId);
    else query = query.eq("access_key", body.accessKey!);

    const { data: invoiceRaw, error: invError } = await query.maybeSingle();
    if (invError || !invoiceRaw) {
      return okResponse({ success: false, sriStatus: "error", error: "Factura no encontrada" });
    }
    const invoice = invoiceRaw as InvoiceRow;

    if (invoice.sri_status === "authorized") {
      return okResponse({
        success: true,
        invoiceId: invoice.id,
        accessKey: invoice.access_key ?? undefined,
        authorizationNumber: invoice.authorization_number ?? undefined,
        rideUrl: invoice.ride_url ?? undefined,
        sriStatus: "authorized",
        messages: ["La factura ya está autorizada"],
      } satisfies EmitInvoiceResponse);
    }

    if (!["submitted", "received"].includes(invoice.sri_status)) {
      return okResponse({
        success: false,
        sriStatus: invoice.sri_status,
        error: `No se puede consultar una factura en estado '${invoice.sri_status}'`,
      });
    }

    if (!invoice.access_key) {
      return okResponse({ success: false, sriStatus: "error", error: "Factura sin clave de acceso" });
    }

    const { data: restaurant } = await admin.from("restaurants").select("*").limit(1).maybeSingle();
    if (!restaurant) {
      return okResponse({ success: false, sriStatus: "error", error: "Restaurante no configurado" });
    }
    const rest = restaurant as RestaurantRow;

    const { data: bill } = await admin
      .from("bills")
      .select("id, subtotal, tip_amount, total")
      .eq("id", invoice.bill_id)
      .maybeSingle();
    if (!bill) {
      return okResponse({ success: false, sriStatus: "error", error: "Cuenta asociada no encontrada" });
    }

    const sriUrls = getSriUrls(rest.sri_environment);
    const prevStatus = invoice.sri_status;
    const prevResponse = (invoice.sri_response ?? {}) as Record<string, unknown>;

    const { autorizacion, attempts } = await autorizarWithRetries(
      admin,
      invoice.id,
      prevStatus,
      sriUrls.autorizacion,
      invoice.access_key
    );

    const authMessages = formatSriMessages(autorizacion.messages);
    const normalizedEstado = autorizacion.estado.toUpperCase();

    if (normalizedEstado === "AUTORIZADO") {
      const { authNumber, ridePath } = await finalizeAuthorizedInvoice(
        admin,
        invoice,
        rest,
        bill as BillRow,
        autorizacion,
        prevStatus,
        prevResponse
      );

      await admin.rpc("dismiss_bill_invoice_request", { p_bill_id: invoice.bill_id });

      if (invoice.customer_email) {
        const sequential = parseSequentialFromAccessKey(invoice.access_key);
        const rideHtml = await downloadRideHtml(admin, ridePath);
        void sendRideEmail({
          to: invoice.customer_email,
          customerName: invoice.customer_name,
          authorizationNumber: authNumber,
          accessKey: invoice.access_key,
          docNumber: formatDocNumber(
            rest.sri_establishment_code,
            rest.sri_emission_point_code,
            sequential
          ),
          sequential,
          importeTotal: Number(prevResponse.importeTotal ?? bill.total),
          restaurantName: rest.commercial_name ?? rest.name,
          restaurantEmail: rest.email,
          rideHtml,
        });
      }

      await writeSriAuditLog(admin, userId, invoice.bill_id, invoice.id, "success", {
        accessKey: invoice.access_key,
        authNumber,
        authAttempts: attempts,
        source: "check_status",
      });

      return okResponse({
        success: true,
        invoiceId: invoice.id,
        accessKey: invoice.access_key,
        authorizationNumber: authNumber,
        rideUrl: ridePath ?? undefined,
        sriStatus: "authorized",
        messages: authMessages,
      } satisfies EmitInvoiceResponse);
    }

    if (normalizedEstado.includes("NO AUTORIZADO") || normalizedEstado === "RECHAZADA") {
      await recordMetricEvent(admin, invoice.id, prevStatus, "rejected", {
        phase: "check_status",
        messages: authMessages,
        authAttempts: attempts,
      });
      await admin.from("invoices").update({
        sri_status: "rejected",
        sri_response: { ...prevResponse, autorizacion },
      }).eq("id", invoice.id);
      await admin.from("invoice_events").insert({
        invoice_id: invoice.id,
        from_status: prevStatus,
        to_status: "rejected",
        payload: { autorizacion },
      });
      return okResponse({
        success: false,
        invoiceId: invoice.id,
        accessKey: invoice.access_key,
        sriStatus: "rejected",
        messages: authMessages,
        error: authMessages.join("; ") || "Factura no autorizada por el SRI",
      } satisfies EmitInvoiceResponse);
    }

    await recordMetricEvent(admin, invoice.id, prevStatus, "retry_attempted", {
      source: "check_status",
      authAttempts: attempts,
      estado: autorizacion.estado,
    });

    return okResponse({
      success: false,
      invoiceId: invoice.id,
      accessKey: invoice.access_key,
      sriStatus: "submitted",
      messages: authMessages.length
        ? authMessages
        : ["Comprobante aún en procesamiento — intente más tarde"],
    } satisfies EmitInvoiceResponse);
  } catch (err) {
    console.error("[sri-invoice check_status]", err);
    return okResponse({
      success: false,
      sriStatus: "error",
      error: err instanceof Error ? err.message : "Error al consultar estado SRI",
    } satisfies EmitInvoiceResponse);
  }
}

async function handleCheckAllPending(admin: SupabaseClient, userId: string): Promise<Response> {
  const { data: pending } = await admin
    .from("invoices")
    .select("id")
    .in("sri_status", ["submitted", "received"])
    .is("deleted_at", null)
    .limit(50);

  let authorized = 0;
  for (const row of pending ?? []) {
    const res = await handleCheckStatus({ action: "check_status", invoiceId: row.id }, admin, userId);
    const body = await res.json() as EmitInvoiceResponse;
    if (body.success && body.sriStatus === "authorized") authorized += 1;
  }

  return okResponse({
    success: true,
    sriStatus: "submitted",
    checked: pending?.length ?? 0,
    authorized,
    messages: [`Consultadas ${pending?.length ?? 0} facturas, ${authorized} autorizadas`],
  } satisfies EmitInvoiceResponse);
}

async function handlePing(admin: SupabaseClient): Promise<Response> {
  const { data: restaurant } = await admin.from("restaurants").select("sri_environment").limit(1).maybeSingle();
  const env = (restaurant?.sri_environment ?? "test") as "test" | "production";
  const available = await pingSri(env);
  return okResponse({
    success: available,
    sriStatus: available ? "authorized" : "error",
    sriAvailable: available,
    messages: available ? ["SRI disponible"] : ["SRI no disponible, intente más tarde"],
    error: available ? undefined : "SRI no disponible, intente más tarde",
  } satisfies EmitInvoiceResponse);
}

async function handleReissue(
  body: EmitInvoiceRequest,
  admin: SupabaseClient,
  userId: string
): Promise<Response> {
  if (!body.previousInvoiceId || !body.customer?.name?.trim()) {
    return okResponse({
      success: false,
      sriStatus: "error",
      error: "previousInvoiceId y customer son requeridos",
    });
  }

  const { data: prev } = await admin
    .from("invoices")
    .select("id, bill_id, sri_status, invoice_type")
    .eq("id", body.previousInvoiceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!prev || prev.sri_status !== "rejected") {
    return okResponse({
      success: false,
      sriStatus: "error",
      error: "Solo se pueden re-emitir facturas rechazadas",
    });
  }

  const result = await processInvoiceEmit(
    admin,
    userId,
    prev.bill_id,
    body.customer,
    (body.invoiceType ?? prev.invoice_type) as "invoice" | "sales_note",
    prev.id
  );

  return okResponse(result satisfies EmitInvoiceResponse);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "No autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !userData.user) {
      console.error("[sri-invoice] auth.getUser failed:", authError);
      return jsonResponse({ error: "Sesión inválida" }, 401);
    }
    const userId = userData.user.id;

    let body: EmitInvoiceRequest;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error("[sri-invoice] JSON inválido:", parseErr);
      return okResponse({ success: false, sriStatus: "error", error: "JSON inválido" });
    }

    const action = body.action ?? "emit";

    if (action === "ping") return handlePing(supabaseAdmin);
    if (action === "check_status") return handleCheckStatus(body, supabaseAdmin, userId);
    if (action === "check_all_pending") return handleCheckAllPending(supabaseAdmin, userId);
    if (action === "reissue") return handleReissue(body, supabaseAdmin, userId);

    const billId = body.billId;
    if (!billId || !body.customer?.name?.trim()) {
      return okResponse({
        success: false,
        sriStatus: "error",
        error: "billId y nombre del cliente son requeridos",
      });
    }

    const result = await processInvoiceEmit(
      supabaseAdmin,
      userId,
      billId,
      body.customer,
      body.invoiceType ?? "invoice"
    );

    return okResponse(result satisfies EmitInvoiceResponse);
  } catch (err) {
    console.error("[sri-invoice] unhandled error:", err);
    return okResponse({
      success: false,
      sriStatus: "error",
      error: err instanceof Error ? err.message : "Error interno al procesar la solicitud",
    });
  }
});
