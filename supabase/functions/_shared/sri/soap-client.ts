import { encodeBase64 } from "jsr:@std/encoding/base64";

export type SriSoapMessage = {
  tipo: string;
  mensaje: string;
  informacionAdicional?: string;
};

export type RecepcionResult = {
  estado: string;
  messages: SriSoapMessage[];
  raw: string;
};

export type AutorizacionResult = {
  estado: string;
  numeroAutorizacion?: string;
  fechaAutorizacion?: string;
  ambiente?: string;
  messages: SriSoapMessage[];
  raw: string;
};

function extractTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  return match?.[1]?.trim();
}

function extractAllMessages(xml: string): SriSoapMessage[] {
  const messages: SriSoapMessage[] = [];
  const blockRe = /<mensaje>([\s\S]*?)<\/mensaje>/gi;
  let blockMatch;
  while ((blockMatch = blockRe.exec(xml)) !== null) {
    const block = blockMatch[1];
    messages.push({
      tipo: extractTag(block, "tipo") ?? extractTag(block, "identificador") ?? "INFO",
      mensaje: extractTag(block, "mensaje") ?? extractTag(block, "informacionAdicional") ?? "",
      informacionAdicional: extractTag(block, "informacionAdicional"),
    });
  }
  return messages;
}

function buildSoapEnvelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>${body}</soap:Body>` +
    `</soap:Envelope>`;
}

async function postSoap(url: string, envelope: string, timeoutMs = 30_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        Accept: "text/xml",
        SOAPAction: "",
      },
      body: envelope,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`SRI SOAP HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`SRI SOAP timeout después de ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Envía comprobante firmado (base64) a recepción offline SRI. */
export async function recepcionarComprobante(
  recepcionUrl: string,
  signedXml: string,
  timeoutMs = 30_000
): Promise<RecepcionResult> {
  const xmlBase64 = encodeBase64(new TextEncoder().encode(signedXml));
  const body =
    `<validarComprobante xmlns="http://ec.gob.sri.ws.recepcion">` +
    `<xml>${xmlBase64}</xml>` +
    `</validarComprobante>`;

  const raw = await postSoap(recepcionUrl, buildSoapEnvelope(body), timeoutMs);
  const estado = extractTag(raw, "estado") ?? "DESCONOCIDO";
  const messages = extractAllMessages(raw);

  return { estado, messages, raw };
}

/** Consulta autorización por clave de acceso. */
export async function autorizarComprobante(
  autorizacionUrl: string,
  accessKey: string,
  timeoutMs = 30_000
): Promise<AutorizacionResult> {
  const body =
    `<autorizacionComprobante xmlns="http://ec.gob.sri.ws.autorizacion">` +
    `<claveAccesoComprobante>${accessKey}</claveAccesoComprobante>` +
    `</autorizacionComprobante>`;

  const raw = await postSoap(autorizacionUrl, buildSoapEnvelope(body), timeoutMs);
  const autorizacionBlock = raw.match(/<autorizacion>([\s\S]*?)<\/autorizacion>/i)?.[1] ?? raw;

  const estado = extractTag(autorizacionBlock, "estado") ?? extractTag(raw, "estado") ?? "DESCONOCIDO";
  const numeroAutorizacion = extractTag(autorizacionBlock, "numeroAutorizacion");
  const fechaAutorizacion = extractTag(autorizacionBlock, "fechaAutorizacion");
  const ambiente = extractTag(autorizacionBlock, "ambiente");
  const messages = extractAllMessages(autorizacionBlock || raw);

  return {
    estado,
    numeroAutorizacion,
    fechaAutorizacion,
    ambiente,
    messages,
    raw,
  };
}

export function formatSriMessages(messages: SriSoapMessage[]): string[] {
  return messages
    .map((m) => [m.mensaje, m.informacionAdicional].filter(Boolean).join(" — "))
    .filter((m) => m.length > 0);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
