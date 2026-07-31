import { computeModulo11CheckDigit, formatEmissionDateSlash } from "./access-key.ts";
import type { InvoiceLineInput } from "./xml-factura.ts";
import { ValidationError } from "./validate-emit.ts";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  return match?.[1]?.trim() ?? null;
}

export function validateAccessKey(accessKey: string): void {
  if (!/^\d{49}$/.test(accessKey)) {
    throw new ValidationError(`La clave de acceso debe tener exactamente 49 dígitos (tiene ${accessKey.length})`);
  }
  const clave48 = accessKey.slice(0, 48);
  const expectedCheck = computeModulo11CheckDigit(clave48);
  const actualCheck = accessKey[48];
  if (expectedCheck !== actualCheck) {
    throw new ValidationError("Dígito verificador de la clave de acceso incorrecto");
  }
}

export type XmlValidationContext = {
  xml: string;
  accessKey: string;
  emissionDate: Date;
  lines: InvoiceLineInput[];
  subtotalSinImpuestos: number;
  ivaRate: number;
  ivaAmount: number;
  propina: number;
  importeTotal: number;
};

export function validateFacturaXml(ctx: XmlValidationContext): void {
  const { xml, accessKey, emissionDate, lines, subtotalSinImpuestos, ivaRate, ivaAmount, propina, importeTotal } = ctx;

  validateAccessKey(accessKey);

  const requiredTags = [
    "ambiente",
    "tipoEmision",
    "razonSocial",
    "nombreComercial",
    "ruc",
    "claveAcceso",
    "codDoc",
    "estab",
    "ptoEmi",
    "secuencial",
    "dirMatriz",
    "fechaEmision",
    "tipoIdentificacionComprador",
    "razonSocialComprador",
    "identificacionComprador",
    "totalSinImpuestos",
    "importeTotal",
    "moneda",
  ];

  for (const tag of requiredTags) {
    const value = extractTag(xml, tag);
    if (!value) {
      throw new ValidationError(`XML incompleto: falta campo obligatorio <${tag}>`);
    }
  }

  const xmlAccessKey = extractTag(xml, "claveAcceso");
  if (xmlAccessKey !== accessKey) {
    throw new ValidationError("La clave de acceso en el XML no coincide");
  }

  const fechaEmision = extractTag(xml, "fechaEmision");
  const expectedDate = formatEmissionDateSlash(emissionDate);
  if (fechaEmision !== expectedDate) {
    throw new ValidationError(
      `fechaEmision debe ser la fecha actual (${expectedDate}), encontrado: ${fechaEmision}`
    );
  }

  const xmlSubtotal = Number(extractTag(xml, "totalSinImpuestos"));
  if (Math.abs(xmlSubtotal - subtotalSinImpuestos) > 0.01) {
    throw new ValidationError("totalSinImpuestos en XML no coincide con el subtotal calculado");
  }

  const xmlImporte = Number(extractTag(xml, "importeTotal"));
  const expectedImporte = round2(subtotalSinImpuestos + ivaAmount + propina);
  if (Math.abs(xmlImporte - expectedImporte) > 0.01) {
    throw new ValidationError(
      `importeTotal debe ser subtotal + IVA + propina (${expectedImporte}), XML tiene ${xmlImporte}`
    );
  }

  let linesSubtotal = 0;
  let linesIva = 0;
  const detalleBlocks = xml.match(/<detalle>[\s\S]*?<\/detalle>/gi) ?? [];
  if (detalleBlocks.length !== lines.length) {
    throw new ValidationError("Número de detalles en XML no coincide con ítems");
  }

  for (const line of lines) {
    const descuento = line.descuento ?? 0;
    const lineSubtotal = round2(line.cantidad * line.precioUnitario - descuento);
    linesSubtotal += lineSubtotal;
    linesIva += round2(lineSubtotal * (ivaRate / 100));
  }
  linesSubtotal = round2(linesSubtotal);
  linesIva = round2(linesIva);

  if (Math.abs(linesSubtotal - subtotalSinImpuestos) > 0.02) {
    throw new ValidationError(
      `Suma de ítems (${linesSubtotal}) no cuadra con totalSinImpuestos (${subtotalSinImpuestos})`
    );
  }

  if (Math.abs(linesIva - ivaAmount) > 0.02) {
    throw new ValidationError(
      `IVA calculado de ítems (${linesIva}) no cuadra con totalImpuesto (${ivaAmount})`
    );
  }

  const xmlIvaValor = extractTag(xml, "valor");
  if (xmlIvaValor && Math.abs(Number(xmlIvaValor) - ivaAmount) > 0.02) {
    throw new ValidationError("totalConImpuestos/valor IVA no cuadra");
  }

  if (!xml.includes('id="comprobante"') || !xml.includes('version="1.1.0"')) {
    throw new ValidationError("XML debe ser factura versión 1.1.0 con id comprobante");
  }
}
