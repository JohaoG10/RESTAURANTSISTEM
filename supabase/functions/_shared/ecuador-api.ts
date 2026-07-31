/**
 * EcuadorAPI — consulta de cédulas (último recurso en la cascada).
 * https://www.ecuadorapi.com/api
 */

const ECUADORAPI_BASE = "https://api.ecuadorapi.com/api/v1";
const FETCH_TIMEOUT_MS = 8_000;

export type EcuadorApiCedulaResult = {
  found: boolean;
  cedula?: string;
  nombreCompleto?: string;
  email?: string;
  domicilio?: string;
  source?: string;
};

type EcuadorApiEnvelope = {
  data?: Record<string, unknown> | null;
  error?: string | null;
  message?: string | null;
};

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[ecuador-api] timeout (${FETCH_TIMEOUT_MS}ms): ${url}`);
    } else {
      console.warn(`[ecuador-api] fetch error:`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function mapCedulaPayload(payload: unknown, fallbackCedula: string): EcuadorApiCedulaResult | null {
  if (!payload || typeof payload !== "object") return null;

  const obj = payload as Record<string, unknown>;
  const nested = obj.data && typeof obj.data === "object"
    ? (obj.data as Record<string, unknown>)
    : obj;

  const nombreCompleto = pickString(
    nested,
    "full_name",
    "fullName",
    "nombreCompleto",
    "nombre_completo",
    "name"
  );

  if (!nombreCompleto) return null;

  const cedula = pickString(nested, "id", "cedula", "identificacion") ?? fallbackCedula;

  return {
    found: true,
    cedula,
    nombreCompleto,
    email: pickString(nested, "email", "correo"),
    domicilio: pickString(nested, "address", "domicilio", "birth_place", "birthPlace"),
    source: "ecuador-api",
  };
}

/**
 * Paso 4 de la cascada de cédulas — solo si Registro Civil y SRI no retornaron datos.
 */
export async function lookupEcuadorApiCedula(cedula: string): Promise<EcuadorApiCedulaResult> {
  const apiKey = Deno.env.get("ECUADORAPI_KEY")?.trim();
  if (!apiKey) {
    console.warn("[ecuador-api] ECUADORAPI_KEY no configurado — consulta omitida");
    return { found: false };
  }

  const url = `${ECUADORAPI_BASE}/cedulas/${cedula}`;

  try {
    const response = await fetchWithTimeout(url, {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "SistemaRestaurantePOS/1.0",
    });

    if (!response) return { found: false };

    if (response.status === 404) {
      console.info(`[ecuador-api] cédula ${cedula} no encontrada (404)`);
      return { found: false };
    }

    if (!response.ok) {
      console.warn(`[ecuador-api] HTTP ${response.status} para cédula ${cedula}`);
      return { found: false };
    }

    const text = await response.text();
    if (!text || text === "null") return { found: false };

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch (parseErr) {
      console.warn("[ecuador-api] JSON inválido:", parseErr);
      return { found: false };
    }

    const envelope = payload as EcuadorApiEnvelope;
    if (envelope.error) {
      console.warn(`[ecuador-api] error API: ${envelope.error}`);
      return { found: false };
    }

    const mapped = mapCedulaPayload(payload, cedula);
    if (mapped) {
      console.info(`[ecuador-api] hit for ${cedula}`);
      return mapped;
    }

    return { found: false };
  } catch (err) {
    console.error("[ecuador-api] lookupEcuadorApiCedula error:", err);
    return { found: false };
  }
}
