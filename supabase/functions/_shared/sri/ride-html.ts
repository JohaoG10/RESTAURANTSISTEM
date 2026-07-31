import { formatEmissionDateSlash } from "./access-key.ts";

export type RideLineItem = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  precioTotal: number;
};

export type RideHtmlInput = {
  accessKey: string;
  authorizationNumber: string;
  authorizedAt: Date;
  emissionDate: Date;
  environment: "test" | "production";
  invoiceType: "invoice" | "sales_note";
  docNumber: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  dirMatriz: string;
  obligadoContabilidad: string;
  logoUrl: string | null;
  customerName: string;
  customerId: string;
  customerAddress: string | null;
  customerEmail: string | null;
  lines: RideLineItem[];
  subtotalSinImpuestos: number;
  ivaRate: number;
  ivaAmount: number;
  propina: number;
  importeTotal: number;
  formaPagoLabel: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function formatDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function chunkAccessKey(key: string): string {
  return key.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function buildRideHtml(input: RideHtmlInput): string {
  const ambienteLabel =
    input.environment === "production" ? "PRODUCCIÓN" : "PRUEBAS";
  const docTitle =
    input.invoiceType === "invoice"
      ? "FACTURA ELECTRÓNICA"
      : "NOTA DE VENTA ELECTRÓNICA";
  const accessKey = escapeHtml(input.accessKey);
  const accessKeySpaced = escapeHtml(chunkAccessKey(input.accessKey));

  const itemRows = input.lines
    .map(
      (line) => `
      <tr>
        <td class="qty">${money(line.cantidad)}</td>
        <td class="desc">${escapeHtml(line.descripcion)}</td>
        <td class="num">${money(line.precioUnitario)}</td>
        <td class="num">${money(line.precioTotal)}</td>
      </tr>`
    )
    .join("");

  const logoBlock = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="Logo" class="logo" />`
    : `<div class="logo-placeholder">${escapeHtml(input.nombreComercial.slice(0, 2).toUpperCase())}</div>`;

  const propinaRow =
    input.propina > 0
      ? `<div class="total-row"><span>Propina</span><span>$ ${money(input.propina)}</span></div>`
      : "";

  const customerExtra = [
    input.customerAddress
      ? `<div class="meta-row"><span>Dirección</span><span>${escapeHtml(input.customerAddress)}</span></div>`
      : "",
    input.customerEmail
      ? `<div class="meta-row"><span>Email</span><span>${escapeHtml(input.customerEmail)}</span></div>`
      : "",
  ].join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RIDE ${escapeHtml(input.docNumber)}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #e8e8e8;
      color: #111;
      padding: 16px;
    }
    .toolbar {
      max-width: 210mm;
      margin: 0 auto 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
    .toolbar button {
      border: none;
      border-radius: 6px;
      padding: 10px 16px;
      font-size: 14px;
      cursor: pointer;
      background: #1a1a2e;
      color: #fff;
    }
    .toolbar button.secondary { background: #444; }
    .toolbar button.active { background: #0d6efd; }
    #ride {
      background: #fff;
      margin: 0 auto;
      box-shadow: 0 2px 12px rgba(0,0,0,.12);
    }
    body.format-a4 #ride {
      width: 210mm;
      min-height: 297mm;
      padding: 12mm 14mm;
      font-size: 11px;
    }
    body.format-thermal #ride {
      width: 80mm;
      padding: 4mm 3mm;
      font-size: 9px;
    }
    .ambiente-banner {
      text-align: center;
      font-weight: 700;
      letter-spacing: .5px;
      padding: 6px;
      margin-bottom: 10px;
      border: 2px dashed #c00;
      color: #c00;
      font-size: 10px;
    }
    body.format-thermal .ambiente-banner { font-size: 8px; padding: 4px; }
    .header {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 12px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 10px;
    }
    body.format-thermal .header { flex-direction: column; align-items: center; text-align: center; }
    .logo { max-width: 90px; max-height: 70px; object-fit: contain; }
    .logo-placeholder {
      width: 70px; height: 70px; border-radius: 8px;
      background: #1a1a2e; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 700;
    }
    body.format-thermal .logo, body.format-thermal .logo-placeholder { max-width: 60px; max-height: 50px; }
    .emitter h1 { font-size: 13px; margin-bottom: 4px; }
    .emitter h2 { font-size: 11px; font-weight: 400; color: #333; margin-bottom: 6px; }
    body.format-thermal .emitter h1 { font-size: 11px; }
    body.format-thermal .emitter h2 { font-size: 9px; }
    .meta-row { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 2px; }
    body.format-thermal .meta-row { flex-direction: column; text-align: center; }
    .doc-title {
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      margin: 10px 0 6px;
      text-transform: uppercase;
    }
    body.format-thermal .doc-title { font-size: 11px; }
    .doc-number { text-align: center; font-size: 12px; font-weight: 700; margin-bottom: 10px; }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      margin: 10px 0 4px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 2px;
    }
    table.items { width: 100%; border-collapse: collapse; margin-top: 6px; }
    table.items th, table.items td { border: 1px solid #ccc; padding: 4px 5px; vertical-align: top; }
    table.items th { background: #f5f5f5; font-size: 9px; text-transform: uppercase; }
    table.items .qty { width: 12%; text-align: center; }
    table.items .desc { width: 48%; }
    table.items .num { width: 20%; text-align: right; white-space: nowrap; }
    body.format-thermal table.items th:nth-child(3),
    body.format-thermal table.items td:nth-child(3) { display: none; }
    body.format-thermal table.items .qty { width: 18%; }
    body.format-thermal table.items .desc { width: 52%; }
    body.format-thermal table.items .num { width: 30%; }
    .totals { margin-top: 10px; margin-left: auto; width: 100%; max-width: 280px; }
    body.format-thermal .totals { max-width: 100%; }
    .total-row {
      display: flex; justify-content: space-between;
      padding: 3px 0; border-bottom: 1px dotted #ddd;
    }
    .total-row.grand {
      font-weight: 700; font-size: 13px;
      border-top: 2px solid #111; border-bottom: none;
      margin-top: 4px; padding-top: 6px;
    }
    body.format-thermal .total-row.grand { font-size: 11px; }
    .auth-block {
      margin-top: 14px;
      padding: 8px;
      border: 1px solid #333;
      font-size: 10px;
    }
    body.format-thermal .auth-block { font-size: 8px; padding: 6px; }
    .auth-block .label { font-weight: 700; }
    .barcode-wrap { text-align: center; margin-top: 12px; }
    .barcode-wrap svg { max-width: 100%; height: auto; }
    .access-key-text {
      font-family: monospace;
      font-size: 9px;
      text-align: center;
      word-break: break-all;
      margin-top: 4px;
      line-height: 1.4;
    }
    body.format-thermal .access-key-text { font-size: 7px; }
    .footer-note {
      margin-top: 12px;
      font-size: 8px;
      color: #555;
      text-align: center;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .toolbar { display: none !important; }
      #ride { box-shadow: none; margin: 0; }
      body.format-a4 #ride { width: 210mm; min-height: auto; }
      body.format-thermal #ride { width: 80mm; }
      @page { margin: 0; }
      body.format-a4 { size: A4 portrait; }
      body.format-thermal { size: 80mm auto; }
    }
  </style>
</head>
<body class="format-a4">
  <div class="toolbar no-print">
    <button type="button" id="btn-a4" class="active">Formato A4</button>
    <button type="button" id="btn-thermal" class="secondary">Térmico 80mm</button>
    <button type="button" id="btn-print">Imprimir</button>
    <button type="button" id="btn-pdf">Descargar PDF</button>
  </div>

  <div id="ride">
    <div class="ambiente-banner">AMBIENTE DE ${ambienteLabel}</div>

    <div class="header">
      ${logoBlock}
      <div class="emitter">
        <h1>${escapeHtml(input.razonSocial)}</h1>
        <h2>${escapeHtml(input.nombreComercial)}</h2>
        <div class="meta-row"><span>RUC</span><span>${escapeHtml(input.ruc)}</span></div>
        <div class="meta-row"><span>Dir. matriz</span><span>${escapeHtml(input.dirMatriz)}</span></div>
        <div class="meta-row"><span>Obligado contabilidad</span><span>${escapeHtml(input.obligadoContabilidad)}</span></div>
      </div>
    </div>

    <div class="doc-title">${docTitle}</div>
    <div class="doc-number">No. ${escapeHtml(input.docNumber)}</div>

    <div class="section-title">Información del comprobante</div>
    <div class="meta-row"><span>Fecha emisión</span><span>${formatEmissionDateSlash(input.emissionDate)}</span></div>

    <div class="section-title">Información del comprador</div>
    <div class="meta-row"><span>Identificación</span><span>${escapeHtml(input.customerId)}</span></div>
    <div class="meta-row"><span>Razón social</span><span>${escapeHtml(input.customerName)}</span></div>
    ${customerExtra}

    <div class="section-title">Detalle</div>
    <table class="items">
      <thead>
        <tr>
          <th>Cant.</th>
          <th>Descripción</th>
          <th>P. unit.</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}
      </tbody>
    </table>

    <div class="totals">
      <div class="total-row"><span>Subtotal sin impuestos</span><span>$ ${money(input.subtotalSinImpuestos)}</span></div>
      <div class="total-row"><span>IVA ${money(input.ivaRate)}%</span><span>$ ${money(input.ivaAmount)}</span></div>
      ${propinaRow}
      <div class="total-row grand"><span>Importe total</span><span>$ ${money(input.importeTotal)}</span></div>
      <div class="total-row"><span>Forma de pago</span><span>${escapeHtml(input.formaPagoLabel)}</span></div>
    </div>

    <div class="auth-block">
      <div class="meta-row"><span class="label">Nº autorización</span><span>${escapeHtml(input.authorizationNumber)}</span></div>
      <div class="meta-row"><span class="label">Fecha autorización</span><span>${formatDateTime(input.authorizedAt)}</span></div>
    </div>

    <div class="barcode-wrap">
      <svg id="barcode"></svg>
      <div class="access-key-text">${accessKeySpaced}</div>
      <div class="access-key-text">Clave de acceso: ${accessKey}</div>
    </div>

    <p class="footer-note">Documento generado electrónicamente — válido sin firma autógrafa según normativa SRI.</p>
  </div>

  <script>
    const accessKey = ${JSON.stringify(input.accessKey)};
    JsBarcode("#barcode", accessKey, {
      format: "CODE128",
      width: 1.2,
      height: 48,
      displayValue: false,
      margin: 4,
    });

    const body = document.body;
    const btnA4 = document.getElementById("btn-a4");
    const btnThermal = document.getElementById("btn-thermal");

    function setFormat(fmt) {
      body.classList.remove("format-a4", "format-thermal");
      body.classList.add(fmt === "thermal" ? "format-thermal" : "format-a4");
      btnA4.classList.toggle("active", fmt !== "thermal");
      btnThermal.classList.toggle("active", fmt === "thermal");
      btnA4.classList.toggle("secondary", fmt === "thermal");
      btnThermal.classList.toggle("secondary", fmt !== "thermal");
    }

    const params = new URLSearchParams(window.location.search);
    const initialFormat = params.get("format") === "thermal" ? "thermal" : "a4";
    setFormat(initialFormat);

    btnA4.addEventListener("click", () => setFormat("a4"));
    btnThermal.addEventListener("click", () => setFormat("thermal"));
    document.getElementById("btn-print").addEventListener("click", () => window.print());
    document.getElementById("btn-pdf").addEventListener("click", () => {
      const el = document.getElementById("ride");
      const fmt = body.classList.contains("format-thermal") ? "termico" : "a4";
      html2pdf().set({
        margin: fmt === "termico" ? [2, 2, 2, 2] : [10, 10, 10, 10],
        filename: "ride-" + ${JSON.stringify(input.docNumber)} + "-" + fmt + ".pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: fmt === "termico" ? [80, 297] : "a4", orientation: "portrait" },
      }).from(el).save();
    });

    if (params.get("action") === "print") {
      window.addEventListener("load", () => setTimeout(() => window.print(), 500));
    }
    if (params.get("action") === "pdf") {
      window.addEventListener("load", () => {
        setTimeout(() => document.getElementById("btn-pdf").click(), 800);
      });
    }
  </script>
</body>
</html>`;
}
