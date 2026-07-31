import { getSriUrls } from "./invoice-helpers.ts";

const PING_TIMEOUT_MS = 10_000;

/** Verifica conectividad al webservice SRI (autorización). */
export async function pingSri(environment: "test" | "production"): Promise<boolean> {
  const urls = getSriUrls(environment);
  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>` +
    `<autorizacionComprobante xmlns="http://ec.gob.sri.ws.autorizacion">` +
    `<claveAccesoComprobante>0000000000000000000000000000000000000000000000000</claveAccesoComprobante>` +
    `</autorizacionComprobante>` +
    `</soap:Body></soap:Envelope>`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    const response = await fetch(urls.autorizacion, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        Accept: "text/xml",
        SOAPAction: "",
      },
      body: envelope,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await response.text();
    return response.ok && text.length > 0;
  } catch {
    return false;
  }
}

export async function assertSriAvailable(environment: "test" | "production"): Promise<void> {
  const ok = await pingSri(environment);
  if (!ok) {
    throw new Error("SRI no disponible, intente más tarde");
  }
}
