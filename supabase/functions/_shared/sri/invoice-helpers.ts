import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { FORMA_PAGO, SRI_TEST } from "./constants.ts";
import {
  generateAndStoreRide,
  mapFormaPagoLabel,
  type RideLineItem,
} from "./ride-generator.ts";
import type { InvoiceLineInput } from "./xml-factura.ts";

export type InvoiceRow = {
  id: string;
  bill_id: string;
  invoice_type: "invoice" | "sales_note";
  customer_ruc: string | null;
  customer_name: string;
  customer_address: string | null;
  customer_email: string | null;
  access_key: string | null;
  sri_status: string;
  sri_response: Record<string, unknown> | null;
  authorization_number: string | null;
  authorized_at: string | null;
  ride_url: string | null;
};

export type RestaurantRow = {
  id: string;
  name: string;
  commercial_name: string | null;
  ruc: string;
  address: string | null;
  logo_url: string | null;
  email: string | null;
  sri_environment: "test" | "production";
  sri_establishment_code: string;
  sri_emission_point_code: string;
  sri_obligado_contabilidad: string;
  sri_cert_expires_at: string | null;
};

type BillRow = {
  id: string;
  subtotal: number;
  tip_amount: number;
  total: number;
};

type PaymentRow = {
  method: "cash" | "card" | "transfer";
  amount: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveFormaPago(payments: PaymentRow[]): string {
  if (payments.length === 0) return FORMA_PAGO.cash;
  const primary = payments.reduce((a, b) => (b.amount > a.amount ? b : a));
  return FORMA_PAGO[primary.method] ?? FORMA_PAGO.cash;
}

export function parseSequentialFromAccessKey(accessKey: string): number {
  if (accessKey.length < 39) return 0;
  return Number(accessKey.slice(30, 39)) || 0;
}

function parseEmissionDateFromAccessKey(accessKey: string): Date {
  if (accessKey.length < 8) return new Date();
  const day = Number(accessKey.slice(0, 2));
  const month = Number(accessKey.slice(2, 4)) - 1;
  const year = Number(accessKey.slice(4, 8));
  return new Date(year, month, day);
}

export async function buildBillLines(
  admin: SupabaseClient,
  billId: string,
  billSubtotal: number
): Promise<InvoiceLineInput[]> {
  const { data: billItems } = await admin
    .from("bill_items")
    .select("quantity, allocated_amount, order_item_id")
    .eq("bill_id", billId);

  const orderItemIds = (billItems ?? []).map((bi) => bi.order_item_id);
  const { data: orderItems } = orderItemIds.length
    ? await admin.from("order_items").select("id, menu_item_id, quantity, price_at_order, status").in("id", orderItemIds)
    : { data: [] as Array<{ id: string; menu_item_id: string; quantity: number; price_at_order: number; status: string }> };

  const menuIds = [...new Set((orderItems ?? []).map((oi) => oi.menu_item_id))];
  const { data: menuItems } = menuIds.length
    ? await admin.from("menu_items").select("id, name").in("id", menuIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const menuMap = new Map((menuItems ?? []).map((m) => [m.id, m.name]));

  const lines: InvoiceLineInput[] = (billItems ?? []).flatMap((bi) => {
    const orderItem = (orderItems ?? []).find((oi) => oi.id === bi.order_item_id);
    if (!orderItem || orderItem.status === "cancelled") return [];
    const lineTotal =
      bi.allocated_amount != null
        ? Number(bi.allocated_amount)
        : orderItem.quantity * orderItem.price_at_order;
    const qty = Number(bi.quantity) || orderItem.quantity;
    const unitPrice = qty > 0 ? round2(lineTotal / qty) : lineTotal;
    const code = orderItem.menu_item_id.replace(/-/g, "").slice(0, 8).toUpperCase();
    return [{
      codigoPrincipal: code || "ITEM",
      descripcion: menuMap.get(orderItem.menu_item_id) ?? "Ítem",
      cantidad: qty,
      precioUnitario: unitPrice,
      descuento: 0,
    }];
  });

  if (lines.length === 0) {
    lines.push({
      codigoPrincipal: "SERV",
      descripcion: "Consumo restaurante",
      cantidad: 1,
      precioUnitario: round2(billSubtotal),
      descuento: 0,
    });
  }

  return lines;
}

export function toRideLines(lines: InvoiceLineInput[]): RideLineItem[] {
  return lines.map((line) => {
    const descuento = line.descuento ?? 0;
    const precioTotal = round2(line.cantidad * line.precioUnitario - descuento);
    return {
      codigo: line.codigoPrincipal,
      descripcion: line.descripcion,
      cantidad: line.cantidad,
      precioUnitario: line.precioUnitario,
      precioTotal,
    };
  });
}

export async function generateRideForInvoice(
  admin: SupabaseClient,
  invoice: InvoiceRow,
  rest: RestaurantRow,
  bill: BillRow,
  authNumber: string,
  authorizedAt: Date
): Promise<string | null> {
  if (!invoice.access_key) return null;

  const sriResponse = invoice.sri_response ?? {};
  const ivaRate = Number(sriResponse.ivaRate ?? 15);
  const subtotalSinImpuestos = Number(sriResponse.subtotalSinImpuestos ?? bill.subtotal);
  const ivaAmount = Number(sriResponse.ivaAmount ?? round2(subtotalSinImpuestos * (ivaRate / 100)));
  const propina = Number(sriResponse.propina ?? bill.tip_amount);
  const importeTotal = Number(sriResponse.importeTotal ?? bill.total);

  const lines = await buildBillLines(admin, bill.id, bill.subtotal);
  const { data: payments } = await admin.from("payments").select("method, amount").eq("bill_id", bill.id);
  const formaPago = resolveFormaPago((payments ?? []) as PaymentRow[]);

  const sequential = parseSequentialFromAccessKey(invoice.access_key);
  const emissionDate = parseEmissionDateFromAccessKey(invoice.access_key);
  const customerId = invoice.customer_ruc ?? "9999999999999";

  try {
    return await generateAndStoreRide(admin, {
      restaurantId: rest.id,
      invoiceId: invoice.id,
      establishment: rest.sri_establishment_code,
      emissionPoint: rest.sri_emission_point_code,
      sequential,
      accessKey: invoice.access_key,
      authorizationNumber: authNumber,
      authorizedAt,
      emissionDate,
      environment: rest.sri_environment,
      invoiceType: invoice.invoice_type,
      ruc: rest.ruc,
      razonSocial: rest.name,
      nombreComercial: rest.commercial_name ?? rest.name,
      dirMatriz: rest.address ?? "S/N",
      obligadoContabilidad: rest.sri_obligado_contabilidad,
      logoUrl: rest.logo_url,
      customerName: invoice.customer_name,
      customerId,
      customerAddress: invoice.customer_address,
      customerEmail: invoice.customer_email,
      lines: toRideLines(lines),
      subtotalSinImpuestos,
      ivaRate,
      ivaAmount,
      propina,
      importeTotal,
      formaPagoLabel: mapFormaPagoLabel(formaPago),
    });
  } catch (err) {
    console.error("[sri] RIDE generation failed:", err);
    return null;
  }
}

export function getSriUrls(environment: "test" | "production") {
  return environment === "production"
    ? {
      recepcion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
      autorizacion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
    }
    : SRI_TEST;
}

export function assertCertificateValid(rest: RestaurantRow): void {
  if (!rest.sri_cert_expires_at) {
    throw new Error(
      "Certificado sin fecha de vencimiento registrada. Vuelva a subir el certificado en Configuración"
    );
  }
  const expires = new Date(rest.sri_cert_expires_at);
  if (expires < new Date()) {
    throw new Error("Certificado vencido, renuévalo en Configuración");
  }
}
