/**
 * Consulta de cédulas — endpoints no oficiales usados por sistemas internos.
 * Pueden dejar de funcionar sin aviso; si fallan → ingreso manual.
 */

export type RegistroCivilPerson = {
  cedula: string;
  nombreCompleto: string;
  nombres?: string;
  apellidos?: string;
  domicilio?: string;
  email?: string;
};

export type RegistroCivilLookupResult = {
  found: boolean;
  person?: RegistroCivilPerson;
  source?: string;
  message?: string;
};

type RawRegistroCivilRecord = {
  cedula?: string;
  identificacion?: string;
  numeroIdentificacion?: string;
  nui?: string;
  nombres?: string;
  apellidos?: string;
  primerApellido?: string;
  segundoApellido?: string;
  nombreCompleto?: string;
  nombre?: string;
  domicilio?: string;
  calle?: string;
  direccion?: string;
  email?: string;
  correoElectronico?: string;
};

const FETCH_HEADERS = {
  Accept: "application/json",
  "User-Agent": "SistemaRestaurantePOS/1.0",
  "Cache-Control": "no-cache",
};

const FETCH_TIMEOUT_MS = 8_000;

/** Paso 1: proxy Registro Civil vía catastro SRI. */
const REGISTRO_CIVIL_URL = (cedula: string) =>
  `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/DatosRegistroCivil/obtenerPorNumeroIdentificacion?numeroIdentificacion=${cedula}`;

function buildNombreCompleto(raw: RawRegistroCivilRecord): string {
  const direct = raw.nombreCompleto?.trim() || raw.nombre?.trim() || "";
  if (direct) return direct;

  const apellidos = [
    raw.apellidos?.trim(),
    [raw.primerApellido?.trim(), raw.segundoApellido?.trim()].filter(Boolean).join(" "),
  ].find((value) => value && value.length > 0);

  const parts = [raw.nombres?.trim(), apellidos?.trim()].filter(Boolean);
  return parts.join(" ").trim();
}

function mapRawRecord(
  raw: RawRegistroCivilRecord,
  cedula: string
): RegistroCivilPerson | null {
  const nombreCompleto = buildNombreCompleto(raw);
  if (!nombreCompleto) return null;

  const id =
    raw.cedula?.trim() ||
    raw.identificacion?.trim() ||
    raw.numeroIdentificacion?.trim() ||
    raw.nui?.trim() ||
    cedula;

  return {
    cedula: id,
    nombreCompleto,
    nombres: raw.nombres?.trim(),
    apellidos: raw.apellidos?.trim(),
    domicilio: raw.domicilio?.trim() || raw.calle?.trim() || raw.direccion?.trim(),
    email: raw.email?.trim() || raw.correoElectronico?.trim(),
  };
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: FETCH_HEADERS, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[registro-civil] timeout (${timeoutMs}ms): ${url}`);
    } else {
      console.warn(`[registro-civil] fetch error ${url}:`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetchWithTimeout(url);
    if (!response) return null;

    if (!response.ok) {
      // 404 es esperado — el endpoint del Registro Civil suele estar caído
      if (response.status === 404) {
        console.info(`[registro-civil] endpoint no disponible (404) — ingreso manual`);
      } else {
        console.warn(`[registro-civil] ${url} → HTTP ${response.status}`);
      }
      return null;
    }

    const text = await response.text();
    if (!text || text === "null" || text.startsWith("<!")) return null;

    try {
      return JSON.parse(text) as unknown;
    } catch (parseErr) {
      console.warn(`[registro-civil] JSON inválido en ${url}:`, parseErr);
      return null;
    }
  } catch (err) {
    console.warn(`[registro-civil] fetch error ${url}:`, err);
    return null;
  }
}

function extractRecords(payload: unknown): RawRegistroCivilRecord[] {
  if (!payload || typeof payload !== "object") return [];

  const obj = payload as Record<string, unknown>;

  for (const key of ["data", "result", "persona", "registroCivil", "registro"]) {
    const nested = obj[key];
    if (nested && typeof nested === "object") {
      return extractRecords(nested);
    }
  }

  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === "object") as RawRegistroCivilRecord[];
  }

  return [payload as RawRegistroCivilRecord];
}

async function queryProvider(
  providerId: string,
  cedula: string,
  url: string
): Promise<RegistroCivilLookupResult | null> {
  try {
    const payload = await fetchJson(url);
    if (!payload) return null;

    for (const record of extractRecords(payload)) {
      const person = mapRawRecord(record, cedula);
      if (person) {
        console.info(`[registro-civil] hit via ${providerId} for ${cedula}`);
        return { found: true, person, source: providerId };
      }
    }
    return null;
  } catch (err) {
    console.error(`[registro-civil] queryProvider error (${providerId}):`, err);
    return null;
  }
}

/**
 * Paso 1 de la cascada de cédulas: Registro Civil vía DatosRegistroCivil.
 * Nunca lanza excepción — si falla retorna { found: false }.
 */
export async function lookupRegistroCivil(cedula: string): Promise<RegistroCivilLookupResult> {
  try {
    const result = await queryProvider(
      "sri-datos-registro-civil",
      cedula,
      REGISTRO_CIVIL_URL(cedula)
    );
    if (result?.found) return result;

    return {
      found: false,
      message: "Ingresa los datos manualmente",
    };
  } catch (err) {
    console.error("[registro-civil] lookupRegistroCivil unhandled:", err);
    return {
      found: false,
      message: "Ingresa los datos manualmente",
    };
  }
}
