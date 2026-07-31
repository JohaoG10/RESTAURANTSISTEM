import { formatEmissionDateSlash } from "./access-key.ts";
import {
  COD_DOC_FACTURA,
  CODIGO_IVA,
  MONEDA_DOLAR,
  TIPO_EMISION_NORMAL,
} from "./constants.ts";
import { mapIvaCodigoPorcentaje } from "./iva-codes.ts";

export type InvoiceLineInput = {
  codigoPrincipal: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento?: number;
};

export type BuildFacturaXmlInput = {
  accessKey: string;
  environment: "test" | "production";
  codDoc?: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  dirMatriz: string;
  establishment: string;
  emissionPoint: string;
  sequential: number;
  emissionDate: Date;
  obligadoContabilidad: string;
  tipoIdentificacionComprador: string;
  identificacionComprador: string;
  razonSocialComprador: string;
  direccionComprador?: string;
  emailComprador?: string;
  lines: InvoiceLineInput[];
  subtotalSinImpuestos: number;
  ivaRate: number;
  ivaAmount: number;
  propina: number;
  importeTotal: number;
  formaPago: string;
};

function round2(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildFacturaXml(input: BuildFacturaXmlInput): string {
  const ambiente = input.environment === "production" ? "2" : "1";
  const secuencial = input.sequential.toString().padStart(9, "0");
  const estab = input.establishment.padStart(3, "0");
  const ptoEmi = input.emissionPoint.padStart(3, "0");
  const codDoc = input.codDoc ?? COD_DOC_FACTURA;

  const codigoPorcentaje = mapIvaCodigoPorcentaje(input.ivaRate);

  const detalles = input.lines
    .map((line) => {
      const descuento = line.descuento ?? 0;
      const precioTotalSinImpuesto = line.cantidad * line.precioUnitario - descuento;
      const ivaLine = precioTotalSinImpuesto * (input.ivaRate / 100);
      return `
    <detalle>
      <codigoPrincipal>${escapeXml(line.codigoPrincipal)}</codigoPrincipal>
      <descripcion>${escapeXml(line.descripcion)}</descripcion>
      <cantidad>${round2(line.cantidad)}</cantidad>
      <precioUnitario>${round2(line.precioUnitario)}</precioUnitario>
      <descuento>${round2(descuento)}</descuento>
      <precioTotalSinImpuesto>${round2(precioTotalSinImpuesto)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>${CODIGO_IVA}</codigo>
          <codigoPorcentaje>${codigoPorcentaje}</codigoPorcentaje>
          <tarifa>${round2(input.ivaRate)}</tarifa>
          <baseImponible>${round2(precioTotalSinImpuesto)}</baseImponible>
          <valor>${round2(ivaLine)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`;
    })
    .join("");

  const infoAdicional =
    input.emailComprador || input.direccionComprador
      ? `
  <infoAdicional>${input.emailComprador ? `
    <campoAdicional nombre="Email">${escapeXml(input.emailComprador)}</campoAdicional>` : ""}${input.direccionComprador ? `
    <campoAdicional nombre="Direccion">${escapeXml(input.direccionComprador)}</campoAdicional>` : ""}
  </infoAdicional>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${ambiente}</ambiente>
    <tipoEmision>${TIPO_EMISION_NORMAL}</tipoEmision>
    <razonSocial>${escapeXml(input.razonSocial)}</razonSocial>
    <nombreComercial>${escapeXml(input.nombreComercial)}</nombreComercial>
    <ruc>${escapeXml(input.ruc)}</ruc>
    <claveAcceso>${input.accessKey}</claveAcceso>
    <codDoc>${codDoc}</codDoc>
    <estab>${estab}</estab>
    <ptoEmi>${ptoEmi}</ptoEmi>
    <secuencial>${secuencial}</secuencial>
    <dirMatriz>${escapeXml(input.dirMatriz)}</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${formatEmissionDateSlash(input.emissionDate)}</fechaEmision>
    <obligadoContabilidad>${escapeXml(input.obligadoContabilidad)}</obligadoContabilidad>
    <tipoIdentificacionComprador>${input.tipoIdentificacionComprador}</tipoIdentificacionComprador>
    <razonSocialComprador>${escapeXml(input.razonSocialComprador)}</razonSocialComprador>
    <identificacionComprador>${escapeXml(input.identificacionComprador)}</identificacionComprador>
    <totalSinImpuestos>${round2(input.subtotalSinImpuestos)}</totalSinImpuestos>
    <totalDescuento>0.00</totalDescuento>
    <totalConImpuestos>
      <totalImpuesto>
        <codigo>${CODIGO_IVA}</codigo>
        <codigoPorcentaje>${codigoPorcentaje}</codigoPorcentaje>
        <tarifa>${round2(input.ivaRate)}</tarifa>
        <baseImponible>${round2(input.subtotalSinImpuestos)}</baseImponible>
        <valor>${round2(input.ivaAmount)}</valor>
      </totalImpuesto>
    </totalConImpuestos>
    <propina>${round2(input.propina)}</propina>
    <importeTotal>${round2(input.importeTotal)}</importeTotal>
    <moneda>${MONEDA_DOLAR}</moneda>
    <pagos>
      <pago>
        <formaPago>${input.formaPago}</formaPago>
        <total>${round2(input.importeTotal)}</total>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>${detalles}
  </detalles>${infoAdicional}
</factura>`;
}
