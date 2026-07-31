import {
  isValidIdentification,
  normalizeIdentification,
  validateRucFormat,
} from "../ecuador-id.ts";
import type { InvoiceLineInput } from "./xml-factura.ts";
import type { RestaurantRow } from "./invoice-helpers.ts";

export type EmitValidationInput = {
  rest: RestaurantRow;
  bill: {
    id: string;
    status: string;
    subtotal: number;
    tip_amount: number;
    total: number;
  };
  lines: InvoiceLineInput[];
  hasAuthorizedInvoice: boolean;
  customerIdentification: string;
  consumidorFinal: boolean;
  sequential: number;
  ivaRate: number;
  certPassword: string;
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function validateThreeDigitCode(code: string, label: string): void {
  const normalized = code.trim().padStart(3, "0").slice(-3);
  if (!/^\d{3}$/.test(normalized)) {
    throw new ValidationError(`${label} debe ser exactamente 3 dígitos numéricos`);
  }
}

export function assertCertificateValidStrict(rest: RestaurantRow): void {
  if (!rest.sri_cert_storage_path) {
    throw new ValidationError(
      "Configure el certificado digital en Configuración → Certificado SRI"
    );
  }
  if (!rest.sri_cert_expires_at) {
    throw new ValidationError(
      "Certificado sin fecha de vencimiento registrada. Vuelva a subir el certificado en Configuración"
    );
  }
  const expires = new Date(rest.sri_cert_expires_at);
  if (expires < new Date()) {
    throw new ValidationError(
      "Certificado vencido, renuévalo en Configuración"
    );
  }
}

export function validatePreEmit(input: EmitValidationInput): {
  subtotalSinImpuestos: number;
  ivaAmount: number;
  propina: number;
  importeTotal: number;
} {
  const { rest, bill, lines, hasAuthorizedInvoice, customerIdentification, consumidorFinal, sequential, ivaRate, certPassword } = input;

  assertCertificateValidStrict(rest);

  if (!certPassword) {
    throw new ValidationError("Suba el certificado digital en Configuración → Certificado SRI");
  }

  const emitterRuc = normalizeIdentification(rest.ruc);
  if (emitterRuc.length !== 13 || !validateRucFormat(emitterRuc)) {
    throw new ValidationError("RUC del emisor inválido (formato o dígito verificador incorrecto)");
  }

  validateThreeDigitCode(rest.sri_establishment_code, "Código de establecimiento");
  validateThreeDigitCode(rest.sri_emission_point_code, "Punto de emisión");

  if (bill.status !== "paid") {
    throw new ValidationError("La cuenta debe estar pagada para emitir factura");
  }

  if (hasAuthorizedInvoice) {
    throw new ValidationError("Esta cuenta ya tiene una factura autorizada");
  }

  if (lines.length === 0) {
    throw new ValidationError("La factura debe tener al menos un ítem");
  }

  const activeLines = lines.filter((l) => l.cantidad > 0 && l.precioUnitario >= 0);
  if (activeLines.length === 0) {
    throw new ValidationError("No hay ítems válidos para facturar (todos cancelados o en cero)");
  }

  const subtotalSinImpuestos = round2(bill.subtotal);
  if (subtotalSinImpuestos <= 0) {
    throw new ValidationError("El subtotal debe ser mayor a cero");
  }

  const ivaAmount = round2(subtotalSinImpuestos * (ivaRate / 100));
  const propina = round2(bill.tip_amount);
  const importeTotal = round2(subtotalSinImpuestos + ivaAmount + propina);
  const expectedTotal = round2(bill.total);

  if (Math.abs(importeTotal - expectedTotal) > 0.01) {
    throw new ValidationError(
      `Los totales no cuadran: subtotal (${subtotalSinImpuestos}) + IVA (${ivaAmount}) + propina (${propina}) = ${importeTotal}, total cuenta = ${expectedTotal}`
    );
  }

  if (sequential < 1 || sequential > 999_999_999) {
    throw new ValidationError("Secuencial fuera de rango permitido por el SRI (máximo 999999999)");
  }

  if (!consumidorFinal) {
    const buyerId = normalizeIdentification(customerIdentification);
    if (buyerId === "9999999999999") {
      throw new ValidationError("Use la opción Consumidor final para este comprador");
    }
    if (!isValidIdentification(buyerId)) {
      throw new ValidationError("RUC o cédula del comprador inválido");
    }
  }

  return { subtotalSinImpuestos, ivaAmount, propina, importeTotal };
}
