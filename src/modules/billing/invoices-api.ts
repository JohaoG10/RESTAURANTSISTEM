import { supabase } from "../../lib/supabase";

export type InvoiceListItem = {
  id: string;
  bill_id: string;
  invoice_type: "invoice" | "sales_note";
  customer_name: string;
  customer_ruc: string | null;
  customer_address: string | null;
  customer_email: string | null;
  access_key: string | null;
  authorization_number: string | null;
  authorized_at: string | null;
  created_at: string;
  sri_status: string;
  ride_url: string | null;
  xml_url: string | null;
  sri_response: {
    ivaRate?: number;
    subtotalSinImpuestos?: number;
    ivaAmount?: number;
    importeTotal?: number;
    propina?: number;
  } | null;
};

export type InvoiceListFilters = {
  fromDate?: string;
  toDate?: string;
};

export async function fetchInvoices(filters: InvoiceListFilters = {}): Promise<InvoiceListItem[]> {
  let query = supabase
    .from("invoices")
    .select(
      "id, bill_id, invoice_type, customer_name, customer_ruc, customer_address, customer_email, access_key, authorization_number, authorized_at, created_at, sri_status, ride_url, xml_url, sri_response"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.fromDate) {
    query = query.gte("created_at", `${filters.fromDate}T00:00:00`);
  }
  if (filters.toDate) {
    query = query.lte("created_at", `${filters.toDate}T23:59:59`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InvoiceListItem[];
}

export async function fetchInvoiceByBillId(billId: string): Promise<InvoiceListItem | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, bill_id, invoice_type, customer_name, customer_ruc, customer_address, customer_email, access_key, authorization_number, authorized_at, created_at, sri_status, ride_url, xml_url, sri_response"
    )
    .eq("bill_id", billId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as InvoiceListItem | null) ?? null;
}

export async function getXmlSignedUrl(xmlPath: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from("invoice-xml")
    .createSignedUrl(xmlPath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "No se pudo obtener el XML.");
  }
  return data.signedUrl;
}

export function invoiceStatusLabel(status: string): string {
  switch (status) {
    case "authorized":
      return "Autorizada";
    case "rejected":
      return "Rechazada";
    case "submitted":
    case "received":
      return "En proceso";
    case "error":
      return "Error";
    default:
      return status;
  }
}

export function invoiceStatusClass(status: string): string {
  switch (status) {
    case "authorized":
      return "bl-inv-status--ok";
    case "rejected":
      return "bl-inv-status--err";
    case "submitted":
    case "received":
      return "bl-inv-status--pending";
    default:
      return "bl-inv-status--neutral";
  }
}

export function formatDocNumberFromAccessKey(accessKey: string | null): string {
  if (!accessKey || accessKey.length < 39) return "—";
  const estab = accessKey.slice(24, 27);
  const pto = accessKey.slice(27, 30);
  const sec = accessKey.slice(30, 39);
  return `${estab}-${pto}-${sec}`;
}
