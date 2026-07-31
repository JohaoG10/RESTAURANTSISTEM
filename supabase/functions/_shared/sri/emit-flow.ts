import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { normalizeIdentification } from "../ecuador-id.ts";
import { generateAccessKey } from "./access-key.ts";
import {
  COD_DOC_FACTURA,
  COD_DOC_NOTA_VENTA,
  FORMA_PAGO,
  TIPO_ID_COMPRADOR,
} from "./constants.ts";
import {
  buildBillLines,
  generateRideForInvoice,
  getSriUrls,
  parseSequentialFromAccessKey,
  type InvoiceRow,
  type RestaurantRow,
} from "./invoice-helpers.ts";
import {
  partialStack,
  recordMetricEvent,
  writeSriAuditLog,
} from "./invoice-metrics.ts";
import { formatDocNumber } from "./ride-generator.ts";
import { downloadRideHtml, sendRideEmail } from "./send-ride-email.ts";
import { assertSriAvailable } from "./sri-ping.ts";
import { autorizarWithRetries } from "./sri-retry.ts";
import {
  formatSriMessages,
  recepcionarComprobante,
  sleep,
} from "./soap-client.ts";
import { signXmlXadesBes } from "./sign-xades.ts";
import { ValidationError, validatePreEmit } from "./validate-emit.ts";
import { validateFacturaXml } from "./validate-xml.ts";
import { buildFacturaXml } from "./xml-factura.ts";

export type EmitCustomer = {
  identification: string;
  name: string;
  address?: string;
  email?: string;
  consumidorFinal?: boolean;
};

export type EmitResult = {
  success: boolean;
  invoiceId?: string;
  accessKey?: string;
  authorizationNumber?: string;
  rideUrl?: string;
  sriStatus: string;
  messages?: string[];
  error?: string;
};

type BillRow = {
  id: string;
  order_id: string;
  status: string;
  subtotal: number;
  tip_amount: number;
  total: number;
};

type PaymentRow = { method: "cash" | "card" | "transfer"; amount: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveBuyerIdType(identification: string, consumidorFinal: boolean): string {
  if (consumidorFinal || identification === "9999999999999") {
    return TIPO_ID_COMPRADOR.CONSUMIDOR_FINAL;
  }
  if (identification.length === 13) return TIPO_ID_COMPRADOR.RUC;
  if (identification.length === 10) return TIPO_ID_COMPRADOR.CEDULA;
  return TIPO_ID_COMPRADOR.PASAPORTE;
}

function resolveFormaPago(payments: PaymentRow[]): string {
  if (payments.length === 0) return FORMA_PAGO.cash;
  const primary = payments.reduce((a, b) => (b.amount > a.amount ? b : a));
  return FORMA_PAGO[primary.method] ?? FORMA_PAGO.cash;
}

async function updateInvoiceStatus(
  admin: SupabaseClient,
  invoiceId: string,
  patch: Record<string, unknown>,
  fromStatus: string | null,
  toStatus: string,
  payload: Record<string, unknown>
) {
  await admin.from("invoices").update(patch).eq("id", invoiceId);
  await admin.from("invoice_events").insert({
    invoice_id: invoiceId,
    from_status: fromStatus,
    to_status: toStatus,
    payload,
  });
}

export async function processInvoiceEmit(
  admin: SupabaseClient,
  userId: string,
  billId: string,
  customer: EmitCustomer,
  invoiceType: "invoice" | "sales_note",
  reissueOfInvoiceId?: string
): Promise<EmitResult> {
  let invoiceId: string | null = null;
  let currentStatus = "draft";

  try {
    const { data: bill, error: billError } = await admin
      .from("bills")
      .select("id, order_id, status, subtotal, tip_amount, total")
      .eq("id", billId)
      .is("deleted_at", null)
      .maybeSingle();

    if (billError || !bill) {
      return { success: false, sriStatus: "error", error: "Cuenta no encontrada" };
    }
    const billRow = bill as BillRow;

    const { data: existingAuthorized } = await admin
      .from("invoices")
      .select("id")
      .eq("bill_id", billId)
      .eq("sri_status", "authorized")
      .is("deleted_at", null)
      .maybeSingle();

    const { data: restaurant } = await admin.from("restaurants").select("*").limit(1).maybeSingle();
    if (!restaurant) {
      return { success: false, sriStatus: "error", error: "Restaurante no configurado" };
    }
    const rest = restaurant as RestaurantRow;

    const { data: secretRow } = await admin
      .from("restaurant_secrets")
      .select("cert_password")
      .eq("restaurant_id", rest.id)
      .maybeSingle();
    const certPassword = secretRow?.cert_password ?? Deno.env.get("SRI_CERT_PASSWORD") ?? "";

    const { data: ivaRateRaw, error: ivaError } = await admin.rpc("get_current_iva");
    if (ivaError || ivaRateRaw == null) {
      return { success: false, sriStatus: "error", error: "No se pudo obtener el IVA vigente desde tax_config" };
    }
    const ivaRate = Number(ivaRateRaw);
    const docType = invoiceType === "sales_note" ? COD_DOC_NOTA_VENTA : COD_DOC_FACTURA;

    const lines = await buildBillLines(admin, billId, billRow.subtotal);

    const { data: sequentialRaw, error: seqError } = await admin.rpc("get_next_sri_sequential", {
      p_establishment: rest.sri_establishment_code,
      p_emission_point: rest.sri_emission_point_code,
      p_doc_type: docType,
    });
    if (seqError || sequentialRaw == null) {
      throw seqError ?? new Error("No se pudo obtener secuencial SRI");
    }
    const sequential = Number(sequentialRaw);

    const identification = normalizeIdentification(customer.identification);
    const consumidorFinal = customer.consumidorFinal === true;

    const totals = validatePreEmit({
      rest,
      bill: billRow,
      lines,
      hasAuthorizedInvoice: !!existingAuthorized,
      customerIdentification: identification,
      consumidorFinal,
      sequential,
      ivaRate,
      certPassword,
    });

    await assertSriAvailable(rest.sri_environment);

    const { data: draftInsert, error: draftError } = await admin
      .from("invoices")
      .insert({
        bill_id: billId,
        invoice_type: invoiceType,
        customer_ruc: consumidorFinal ? null : identification,
        customer_name: customer.name.trim(),
        customer_address: customer.address?.trim() || null,
        customer_email: customer.email?.trim() || null,
        sri_status: "draft",
        sri_response: { ivaRate, ...totals },
      })
      .select("id")
      .single();

    if (draftError || !draftInsert) throw draftError ?? new Error("No se pudo crear borrador de factura");
    invoiceId = draftInsert.id as string;
    currentStatus = "draft";

    await recordMetricEvent(admin, invoiceId, "draft", "validation_passed", {
      billId,
      itemCount: lines.length,
      sequential,
      docType,
    });

    if (reissueOfInvoiceId) {
      await recordMetricEvent(admin, invoiceId, "draft", "reissue_of", {
        previousInvoiceId: reissueOfInvoiceId,
      });
    }

    const emissionDate = new Date();
    const environment = rest.sri_environment;

    const accessKey = generateAccessKey({
      emissionDate,
      docType,
      ruc: rest.ruc,
      environment,
      establishment: rest.sri_establishment_code,
      emissionPoint: rest.sri_emission_point_code,
      sequential,
    });

    const { data: payments } = await admin.from("payments").select("method, amount").eq("bill_id", billId);
    const paymentRows = (payments ?? []) as PaymentRow[];

    const xmlUnsigned = buildFacturaXml({
      accessKey,
      environment,
      codDoc: docType,
      ruc: rest.ruc,
      razonSocial: rest.name,
      nombreComercial: rest.commercial_name ?? rest.name,
      dirMatriz: rest.address ?? "S/N",
      establishment: rest.sri_establishment_code,
      emissionPoint: rest.sri_emission_point_code,
      sequential,
      emissionDate,
      obligadoContabilidad: rest.sri_obligado_contabilidad,
      tipoIdentificacionComprador: resolveBuyerIdType(identification, consumidorFinal),
      identificacionComprador: consumidorFinal ? "9999999999999" : identification,
      razonSocialComprador: customer.name.trim(),
      direccionComprador: customer.address?.trim(),
      emailComprador: customer.email?.trim(),
      lines,
      subtotalSinImpuestos: totals.subtotalSinImpuestos,
      ivaRate,
      ivaAmount: totals.ivaAmount,
      propina: totals.propina,
      importeTotal: totals.importeTotal,
      formaPago: resolveFormaPago(paymentRows),
    });

    validateFacturaXml({
      xml: xmlUnsigned,
      accessKey,
      emissionDate,
      lines,
      subtotalSinImpuestos: totals.subtotalSinImpuestos,
      ivaRate,
      ivaAmount: totals.ivaAmount,
      propina: totals.propina,
      importeTotal: totals.importeTotal,
    });

    await recordMetricEvent(admin, invoiceId, "draft", "xml_generated", {
      xmlSizeBytes: new TextEncoder().encode(xmlUnsigned).length,
      itemCount: lines.length,
      subtotalSinImpuestos: totals.subtotalSinImpuestos,
      ivaAmount: totals.ivaAmount,
      importeTotal: totals.importeTotal,
    });

    const { data: certBlob, error: certError } = await admin.storage
      .from("sri-certificates")
      .download(rest.sri_cert_storage_path!);

    if (certError || !certBlob) {
      throw new Error(`No se pudo leer el certificado .p12: ${certError?.message ?? "archivo no encontrado"}`);
    }

    const signStart = Date.now();
    const certBytes = new Uint8Array(await certBlob.arrayBuffer());
    const signedXml = signXmlXadesBes(xmlUnsigned, certBytes, certPassword);
    const signMs = Date.now() - signStart;

    await admin.from("invoices").update({
      access_key: accessKey,
      sri_status: "xml_generated",
      sri_response: { ivaRate, ...totals },
    }).eq("id", invoiceId);
    currentStatus = "xml_generated";

    await recordMetricEvent(admin, invoiceId, "xml_generated", "signed", { signDurationMs: signMs });

    const xmlPath = `${rest.id}/${invoiceId}.xml`;
    await admin.storage.from("invoice-xml").upload(
      xmlPath,
      new Blob([signedXml], { type: "application/xml" }),
      { upsert: true, contentType: "application/xml" }
    );

    await updateInvoiceStatus(admin, invoiceId, { xml_url: xmlPath, sri_status: "signed" }, "xml_generated", "signed", { xmlPath });
    currentStatus = "signed";

    const sriUrls = getSriUrls(environment);
    const sentAt = new Date().toISOString();
    await recordMetricEvent(admin, invoiceId, "signed", "sent_to_sri", {
      sentAt,
      environment,
      phase: "recepcion",
    });

    let recepcion;
    const recepStart = Date.now();
    try {
      recepcion = await recepcionarComprobante(sriUrls.recepcion, signedXml);
    } catch (recepErr) {
      await recordMetricEvent(admin, invoiceId, "signed", "error", {
        phase: "recepcion",
        message: recepErr instanceof Error ? recepErr.message : String(recepErr),
        stack: partialStack(recepErr),
      });
      await updateInvoiceStatus(
        admin,
        invoiceId,
        { sri_status: "submitted", sri_response: { timeout: true, phase: "recepcion" } },
        "signed",
        "submitted",
        { timeout: true }
      );
      await writeSriAuditLog(admin, userId, billId, invoiceId, "submitted", { accessKey, timeout: true });
      return {
        success: false,
        invoiceId,
        accessKey,
        sriStatus: "submitted",
        messages: ["SRI no respondió a tiempo — use Consultar estado SRI"],
      };
    }

    await recordMetricEvent(admin, invoiceId, "signed", "sri_response_received", {
      phase: "recepcion",
      elapsedMs: Date.now() - recepStart,
      estado: recepcion.estado,
      messages: recepcion.messages,
    });

    const recepStatus = recepcion.estado.toUpperCase();
    const afterRecepStatus = recepStatus === "RECIBIDA" ? "received" : "submitted";
    currentStatus = afterRecepStatus;

    await updateInvoiceStatus(
      admin,
      invoiceId,
      { sri_status: afterRecepStatus, sri_response: { recepcion } },
      "signed",
      afterRecepStatus,
      { recepcion: { estado: recepcion.estado, messages: recepcion.messages } }
    );

    if (recepStatus === "DEVUELTA") {
      const messages = formatSriMessages(recepcion.messages);
      await recordMetricEvent(admin, invoiceId, afterRecepStatus, "rejected", {
        phase: "recepcion",
        messages,
        sriCodes: recepcion.messages.map((m) => m.tipo),
      });
      await updateInvoiceStatus(
        admin,
        invoiceId,
        { sri_status: "rejected", sri_response: { recepcion } },
        afterRecepStatus,
        "rejected",
        { recepcion }
      );
      await writeSriAuditLog(admin, userId, billId, invoiceId, "rejected", { accessKey, messages });
      return {
        success: false,
        invoiceId,
        accessKey,
        sriStatus: "rejected",
        messages,
        error: messages.join("; ") || "Comprobante devuelto por el SRI",
      };
    }

    await sleep(1500);

    const { autorizacion, attempts, timedOut } = await autorizarWithRetries(
      admin,
      invoiceId,
      afterRecepStatus,
      sriUrls.autorizacion,
      accessKey
    );

    const authMessages = formatSriMessages(autorizacion.messages);
    const normalizedEstado = autorizacion.estado.toUpperCase();

    if (normalizedEstado === "AUTORIZADO") {
      const authorizedAt = autorizacion.fechaAutorizacion
        ? new Date(autorizacion.fechaAutorizacion)
        : new Date();
      const authNumber = autorizacion.numeroAutorizacion ?? accessKey;

      const invoiceRecord: InvoiceRow = {
        id: invoiceId,
        bill_id: billId,
        invoice_type: invoiceType,
        customer_ruc: consumidorFinal ? null : identification,
        customer_name: customer.name.trim(),
        customer_address: customer.address?.trim() || null,
        customer_email: customer.email?.trim() || null,
        access_key: accessKey,
        sri_status: "authorized",
        sri_response: { ivaRate, ...totals },
        authorization_number: authNumber,
        authorized_at: authorizedAt.toISOString(),
        ride_url: null,
      };

      const ridePath = await generateRideForInvoice(
        admin,
        invoiceRecord,
        rest,
        billRow,
        authNumber,
        authorizedAt
      );

      if (ridePath) {
        await recordMetricEvent(admin, invoiceId, afterRecepStatus, "ride_generated", {
          ridePath,
          timestamp: new Date().toISOString(),
        });
      }

      const customerEmail = customer.email?.trim();
      if (customerEmail) {
        const rideHtml = await downloadRideHtml(admin, ridePath);
        const emailOk = await sendRideEmail({
          to: customerEmail,
          customerName: customer.name.trim(),
          authorizationNumber: authNumber,
          accessKey,
          docNumber: formatDocNumber(rest.sri_establishment_code, rest.sri_emission_point_code, sequential),
          sequential,
          importeTotal: totals.importeTotal,
          restaurantName: rest.commercial_name ?? rest.name,
          restaurantEmail: rest.email,
          rideHtml,
        });
        if (emailOk) {
          await recordMetricEvent(admin, invoiceId, afterRecepStatus, "email_sent", {
            to: customerEmail.replace(/(.{2}).+(@.+)/, "$1***$2"),
            timestamp: new Date().toISOString(),
          });
        }
      }

      await recordMetricEvent(admin, invoiceId, afterRecepStatus, "authorized", {
        authorizationNumber: authNumber,
        authorizedAt: authorizedAt.toISOString(),
        sriTimestamp: autorizacion.fechaAutorizacion,
        authAttempts: attempts,
      });

      await updateInvoiceStatus(
        admin,
        invoiceId,
        {
          sri_status: "authorized",
          authorization_number: authNumber,
          authorized_at: authorizedAt.toISOString(),
          ride_url: ridePath,
          sri_response: { recepcion, autorizacion, ...totals, ivaRate },
        },
        afterRecepStatus,
        "authorized",
        { autorizacion, ridePath }
      );

      await admin.rpc("dismiss_bill_invoice_request", { p_bill_id: billId });
      await writeSriAuditLog(admin, userId, billId, invoiceId, "success", { accessKey, authNumber });

      return {
        success: true,
        invoiceId,
        accessKey,
        authorizationNumber: authNumber,
        rideUrl: ridePath ?? undefined,
        sriStatus: "authorized",
        messages: authMessages,
      };
    }

    if (normalizedEstado.includes("NO AUTORIZADO") || normalizedEstado === "RECHAZADA") {
      await recordMetricEvent(admin, invoiceId, afterRecepStatus, "rejected", {
        phase: "autorizacion",
        messages: authMessages,
        sriCodes: autorizacion.messages.map((m) => m.tipo),
        authAttempts: attempts,
      });
      await updateInvoiceStatus(
        admin,
        invoiceId,
        { sri_status: "rejected", sri_response: { recepcion, autorizacion } },
        afterRecepStatus,
        "rejected",
        { autorizacion }
      );
      await writeSriAuditLog(admin, userId, billId, invoiceId, "rejected", { accessKey, messages: authMessages });
      return {
        success: false,
        invoiceId,
        accessKey,
        sriStatus: "rejected",
        messages: authMessages,
        error: authMessages.join("; ") || "Factura no autorizada por el SRI",
      };
    }

    await recordMetricEvent(admin, invoiceId, afterRecepStatus, "retry_attempted", {
      finalState: "submitted",
      authAttempts: attempts,
      timedOut,
      estado: autorizacion.estado,
    });

    await updateInvoiceStatus(
      admin,
      invoiceId,
      { sri_status: "submitted", sri_response: { recepcion, autorizacion, timedOut } },
      afterRecepStatus,
      "submitted",
      { autorizacion, attempts, timedOut }
    );
    await writeSriAuditLog(admin, userId, billId, invoiceId, "submitted", { accessKey, attempts, timedOut });

    return {
      success: false,
      invoiceId,
      accessKey,
      sriStatus: "submitted",
      messages: authMessages.length
        ? authMessages
        : ["Comprobante en procesamiento — consulte más tarde con la clave de acceso"],
    };
  } catch (err) {
    const message = err instanceof ValidationError
      ? err.message
      : err instanceof Error
      ? err.message
      : "Error al emitir factura";

    if (invoiceId) {
      await recordMetricEvent(admin, invoiceId, currentStatus, "error", {
        message,
        stack: partialStack(err),
        type: err instanceof ValidationError ? "validation" : "system",
      }).catch(() => undefined);
      await admin.from("invoices").update({ sri_status: "error" }).eq("id", invoiceId).catch(() => undefined);
    }

    await writeSriAuditLog(admin, userId, billId, invoiceId, "error", {
      error: message,
      stack: partialStack(err),
    }).catch(() => undefined);

    console.error("[sri-invoice emit]", err);
    return { success: false, invoiceId: invoiceId ?? undefined, sriStatus: "error", error: message };
  }
}

export async function finalizeAuthorizedInvoice(
  admin: SupabaseClient,
  invoice: InvoiceRow,
  rest: RestaurantRow,
  bill: BillRow,
  autorizacion: { numeroAutorizacion?: string; fechaAutorizacion?: string; messages: unknown[] },
  prevStatus: string,
  prevResponse: Record<string, unknown>
): Promise<{ authNumber: string; ridePath: string | null }> {
  const authorizedAt = autorizacion.fechaAutorizacion
    ? new Date(autorizacion.fechaAutorizacion)
    : new Date();
  const authNumber = autorizacion.numeroAutorizacion ?? invoice.access_key!;

  const ridePath = await generateRideForInvoice(
    admin,
    { ...invoice, sri_response: prevResponse },
    rest,
    bill,
    authNumber,
    authorizedAt
  );

  if (ridePath) {
    await recordMetricEvent(admin, invoice.id, prevStatus, "ride_generated", {
      ridePath,
      timestamp: new Date().toISOString(),
    });
  }

  await recordMetricEvent(admin, invoice.id, prevStatus, "authorized", {
    authorizationNumber: authNumber,
    authorizedAt: authorizedAt.toISOString(),
  });

  await admin.from("invoices").update({
    sri_status: "authorized",
    authorization_number: authNumber,
    authorized_at: authorizedAt.toISOString(),
    ride_url: ridePath,
    sri_response: { ...prevResponse, autorizacion },
  }).eq("id", invoice.id);

  await admin.from("invoice_events").insert({
    invoice_id: invoice.id,
    from_status: prevStatus,
    to_status: "authorized",
    payload: { autorizacion, ridePath },
  });

  return { authNumber, ridePath };
}

export { parseSequentialFromAccessKey };
