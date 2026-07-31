import { supabase } from "../../lib/supabase";



export type EmitInvoiceInput = {

  billId: string;

  invoiceType: "invoice" | "sales_note";

  customer: {

    identification: string;

    name: string;

    address?: string;

    email?: string;

    consumidorFinal?: boolean;

  };

};



export type EmitInvoiceResult = {

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



const RIDE_BUCKET = "invoice-ride";



async function parseFunctionsErrorBody(

  error: { context?: Response }

): Promise<EmitInvoiceResult | null> {

  const response = error.context;

  if (!response) return null;



  try {

    const body = (await response.json()) as EmitInvoiceResult;

    if (body && typeof body === "object" && "sriStatus" in body) {

      return body;

    }

  } catch {

    // ignore parse errors

  }

  return null;

}



async function invokeSriInvoice(

  body: Record<string, unknown>

): Promise<EmitInvoiceResult> {

  const {

    data: { session },

    error: sessionError,

  } = await supabase.auth.getSession();



  if (sessionError) {

    console.error("[sri-invoice-api] getSession error:", sessionError);

  }



  if (!session?.access_token) {

    throw new Error("Debe iniciar sesión para emitir facturas electrónicas.");

  }



  const { data, error } = await supabase.functions.invoke<EmitInvoiceResult>("sri-invoice", {

    body,

    headers: {

      Authorization: `Bearer ${session.access_token}`,

    },

  });



  if (error) {

    console.error("[sri-invoice-api] invoke error:", error);

    const parsed = await parseFunctionsErrorBody(error as { context?: Response });

    if (parsed) return parsed;



    return {

      success: false,

      sriStatus: "error",

      error: error.message || "No se pudo contactar el servicio de facturación.",

    };

  }



  if (!data) {

    return {

      success: false,

      sriStatus: "error",

      error: "Respuesta vacía del servicio de facturación.",

    };

  }



  return data;

}



export function isSriConfigError(message: string | null | undefined): boolean {

  if (!message) return false;

  const lower = message.toLowerCase();

  return (

    lower.includes("certificado") ||

    lower.includes("configuración → certificado") ||

    lower.includes("configuracion → certificado")

  );

}



export async function getRideSignedUrl(

  ridePath: string,

  expiresInSeconds = 3600

): Promise<string> {

  const { data, error } = await supabase.storage

    .from(RIDE_BUCKET)

    .createSignedUrl(ridePath, expiresInSeconds);

  if (error || !data?.signedUrl) {

    throw new Error(error?.message ?? "No se pudo obtener el RIDE.");

  }

  return data.signedUrl;

}



export function openRideWindow(

  signedUrl: string,

  options?: { format?: "a4" | "thermal"; action?: "print" | "pdf" }

) {

  const url = new URL(signedUrl);

  if (options?.format) url.searchParams.set("format", options.format);

  if (options?.action) url.searchParams.set("action", options.action);

  window.open(url.toString(), "_blank", "noopener,noreferrer");

}



export async function emitSriInvoice(input: EmitInvoiceInput): Promise<EmitInvoiceResult> {

  return invokeSriInvoice({ action: "emit", ...input });

}



export async function checkSriInvoiceStatus(input: {

  invoiceId?: string;

  accessKey?: string;

}): Promise<EmitInvoiceResult> {

  return invokeSriInvoice({ action: "check_status", ...input });

}



export async function fetchCurrentIvaRate(): Promise<number> {

  const { data, error } = await supabase.rpc("get_current_iva");

  if (error) throw error;

  if (data == null) throw new Error("IVA vigente no configurado en tax_config");

  return Number(data);

}



export async function pingSriService(): Promise<boolean> {

  const result = await invokeSriInvoice({ action: "ping" });

  return result.sriAvailable === true;

}



export async function reissueSriInvoice(input: {

  previousInvoiceId: string;

  invoiceType?: "invoice" | "sales_note";

  customer: EmitInvoiceInput["customer"];

}): Promise<EmitInvoiceResult> {

  return invokeSriInvoice({ action: "reissue", ...input });

}



export async function checkAllPendingInvoices(): Promise<EmitInvoiceResult> {

  return invokeSriInvoice({ action: "check_all_pending" });

}



export type SriInvoiceMetrics = {

  todayCount: number;

  monthCount: number;

  monthAuthorized: number;

  monthRejected: number;

  successRate: number | null;

  pendingCount: number;

  rejectedUnreissued: number;

  avgAuthSeconds: number;

  lastInvoice: {

    id: string;

    customer_name: string;

    access_key: string | null;

    authorized_at: string | null;

    created_at: string;

    sri_response: { importeTotal?: number } | null;

    sri_status: string;

  } | null;

  certExpiresAt: string | null;

  certDaysLeft: number | null;

};



export async function fetchSriInvoiceMetrics(): Promise<SriInvoiceMetrics> {

  const { data, error } = await supabase.rpc("get_sri_invoice_metrics");

  if (error) throw error;

  return data as SriInvoiceMetrics;

}



export type InvoiceAuditEvent = {

  id: string;

  invoice_id: string;

  from_status: string | null;

  to_status: string;

  payload: Record<string, unknown> | null;

  created_at: string;

};



export async function fetchInvoiceAuditEvents(

  statusFilter?: string

): Promise<InvoiceAuditEvent[]> {

  const { data, error } = await supabase.rpc("fetch_invoice_audit_events", {

    p_limit: 100,

    ...(statusFilter ? { p_status_filter: statusFilter } : {}),

  });

  if (error) throw error;

  return (data ?? []) as InvoiceAuditEvent[];

}

