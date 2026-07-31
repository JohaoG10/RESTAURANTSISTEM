import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";

import {

  detectIdType,

  isValidIdentification,

  normalizeIdentification,

  validateCedulaModulo10,

  validateRucFormat,

} from "../_shared/ecuador-id.ts";

import { lookupEcuadorApiCedula } from "../_shared/ecuador-api.ts";

import { jsonResponse, optionsResponse } from "../_shared/cors.ts";

import { lookupRegistroCivil } from "../_shared/registro-civil.ts";



const SRI_BASE = "https://srienlinea.sri.gob.ec";

const SRI_HEADERS = {

  Accept: "application/json",

  "Content-Type": "application/json; charset=UTF-8",

  "User-Agent": "SistemaRestaurantePOS/1.0",

};



export type ContribuyenteResult = {

  found: boolean;

  valid: boolean;

  idType: "ruc" | "cedula";

  identification: string;

  razonSocial?: string;

  nombreComercial?: string;

  direccion?: string;

  email?: string;

  estado?: string;

  message?: string;

  error?: string;

  source?: string;

};



function lookupErrorResult(

  idType: "ruc" | "cedula",

  identification: string,

  error: string,

  valid = true

): ContribuyenteResult {

  return {

    found: false,

    valid,

    idType,

    identification,

    error,

    message: error,

  };

}



type SriContribuyente = {

  numeroRuc?: string;

  razonSocial?: string;

  nombreComercial?: string;

  nombreFantasiaComercial?: string;

  direccionMatriz?: string;

  direccion?: string;

  estadoContribuyenteRuc?: string;

  establecimientos?: SriEstablecimiento[];

};



type SriEstablecimiento = {

  direccionCompleta?: string;

  nombreFantasiaComercial?: string;

  matriz?: string;

  estado?: string;

};



const CEDULA_MANUAL_MESSAGE = "Ingresa los datos manualmente";



function pickName(

  razonSocial?: string,

  nombreComercial?: string,

  fallback = ""

): { razonSocial: string; nombreComercial: string } | null {

  const razon = razonSocial?.trim() || nombreComercial?.trim() || fallback.trim();

  if (!razon) return null;

  return {

    razonSocial: razonSocial?.trim() || razon,

    nombreComercial: nombreComercial?.trim() || razonSocial?.trim() || razon,

  };

}



function extractContribuyenteRecord(raw: unknown): SriContribuyente | null {

  if (!raw) return null;

  if (Array.isArray(raw)) {

    if (raw.length === 0) return null;

    const first = raw[0];

    return first && typeof first === "object" ? (first as SriContribuyente) : null;

  }

  if (typeof raw === "object") return raw as SriContribuyente;

  return null;

}



function pickEstablecimientoMatriz(

  establecimientos?: SriEstablecimiento[]

): SriEstablecimiento | null {

  if (!establecimientos?.length) return null;

  return establecimientos.find((e) => e.matriz === "SI") ?? establecimientos[0];

}



function resolveInlineAddress(contrib: SriContribuyente): string {

  const matriz = pickEstablecimientoMatriz(contrib.establecimientos);

  return (

    contrib.direccionMatriz?.trim() ||

    contrib.direccion?.trim() ||

    matriz?.direccionCompleta?.trim() ||

    ""

  );

}



function resolveContribuyenteNames(

  contrib: SriContribuyente

): { razonSocial: string; nombreComercial: string } | null {

  const matriz = pickEstablecimientoMatriz(contrib.establecimientos);

  const nombreComercial =

    contrib.nombreComercial?.trim() ||

    contrib.nombreFantasiaComercial?.trim() ||

    matriz?.nombreFantasiaComercial?.trim();

  return pickName(contrib.razonSocial, nombreComercial);

}



async function fetchContribuyenteAddress(ruc: string): Promise<string> {

  const estabUrl =

    `${SRI_BASE}/sri-catastro-sujeto-servicio-internet/rest/Establecimiento/consultarPorNumeroRuc?numeroRuc=${ruc}`;

  const estabRaw = await fetchSriJson<SriEstablecimiento | SriEstablecimiento[]>(estabUrl);

  const establecimientos = Array.isArray(estabRaw)

    ? estabRaw

    : estabRaw

      ? [estabRaw]

      : [];

  return pickEstablecimientoMatriz(establecimientos)?.direccionCompleta?.trim() ?? "";

}



const SRI_FETCH_TIMEOUT_MS = 8_000;



async function fetchWithTimeout(

  url: string,

  headers: Record<string, string>,

  timeoutMs = SRI_FETCH_TIMEOUT_MS

): Promise<Response | null> {

  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {

    return await fetch(url, { headers, signal: controller.signal });

  } catch (err) {

    if (err instanceof DOMException && err.name === "AbortError") {

      console.error(`[sri-contribuyente] timeout (${timeoutMs}ms): ${url}`);

    } else {

      console.error(`[sri-contribuyente] fetch error (${url}):`, err);

    }

    return null;

  } finally {

    clearTimeout(timer);

  }

}



async function fetchSriJson<T>(url: string): Promise<T | null> {

  try {

    const response = await fetchWithTimeout(url, SRI_HEADERS);

    if (!response) return null;



    if (response.status === 204) {

      console.info(`[sri-contribuyente] SRI sin contenido (204): ${url}`);

      return null;

    }



    if (!response.ok) {

      console.error(`[sri-contribuyente] SRI HTTP ${response.status}: ${url}`);

      return null;

    }



    const text = await response.text();

    if (!text || text === "null" || text.trim() === "") return null;



    try {

      return JSON.parse(text) as T;

    } catch (parseErr) {

      console.error(`[sri-contribuyente] JSON inválido (${url}):`, parseErr);

      return null;

    }

  } catch (err) {

    console.error(`[sri-contribuyente] fetchSriJson error (${url}):`, err);

    return null;

  }

}



const SRI_CONTRIBUYENTE_URL = (ruc: string) =>

  `${SRI_BASE}/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?ruc=${ruc}`;



async function resolveDireccion(contrib: SriContribuyente, addressRuc: string): Promise<string> {

  const inline = resolveInlineAddress(contrib);

  if (inline) return inline;

  return fetchContribuyenteAddress(addressRuc);

}



function mapContribuyenteToResult(

  contrib: SriContribuyente,

  identification: string,

  idType: "ruc" | "cedula",

  direccion: string,

  source: string

): ContribuyenteResult | null {

  const names = resolveContribuyenteNames(contrib);

  if (!names) return null;



  return {

    found: true,

    valid: true,

    idType,

    identification,

    razonSocial: names.razonSocial,

    nombreComercial: names.nombreComercial,

    direccion,

    estado: contrib.estadoContribuyenteRuc,

    source,

  };

}



async function lookupSriContribuyente(

  rucQuery: string,

  identification: string,

  idType: "ruc" | "cedula",

  addressRuc: string,

  source: string

): Promise<ContribuyenteResult | null> {

  const raw = await fetchSriJson<SriContribuyente | SriContribuyente[]>(

    SRI_CONTRIBUYENTE_URL(rucQuery)

  );

  const contrib = extractContribuyenteRecord(raw);

  if (!contrib) return null;



  const direccion = await resolveDireccion(contrib, addressRuc);

  const identificationOut =

    idType === "ruc" ? (contrib.numeroRuc?.trim() || identification) : identification;



  return mapContribuyenteToResult(contrib, identificationOut, idType, direccion, source);

}



/** Pasos 2–3: SRI con cédula exacta y luego RUC natural ({cedula}001). */

async function lookupCedulaViaSri(cedula: string): Promise<ContribuyenteResult | null> {

  const exact = await lookupSriContribuyente(

    cedula,

    cedula,

    "cedula",

    cedula,

    "sri-cedula-exacta"

  );

  if (exact) return exact;



  const rucNatural = `${cedula}001`;

  return lookupSriContribuyente(

    rucNatural,

    cedula,

    "cedula",

    rucNatural,

    "sri-ruc-natural"

  );

}



async function lookupRuc(ruc: string): Promise<ContribuyenteResult> {

  try {

    if (!validateRucFormat(ruc)) {

      return {

        found: false,

        valid: false,

        idType: "ruc",

        identification: ruc,

        message: "Formato de RUC inválido (13 dígitos, tercer dígito 6 o 9, termina en 001).",

      };

    }



    const result = await lookupSriContribuyente(ruc, ruc, "ruc", ruc, "sri-ruc");

    if (result) return result;



    return {

      found: false,

      valid: true,

      idType: "ruc",

      identification: ruc,

      message: "RUC no encontrado en el SRI. Puede ingresar los datos manualmente.",

    };

  } catch (err) {

    console.error("[sri-contribuyente] lookupRuc error:", err);

    return lookupErrorResult(

      "ruc",

      ruc,

      "Error al consultar el SRI. Intente de nuevo o ingrese los datos manualmente."

    );

  }

}



async function lookupCedula(cedula: string): Promise<ContribuyenteResult> {

  try {

    if (!validateCedulaModulo10(cedula)) {

      return {

        found: false,

        valid: false,

        idType: "cedula",

        identification: cedula,

        message: "Cédula inválida (verifique el número o el dígito verificador).",

      };

    }



    // 1. Registro Civil SRI

    const civil = await lookupRegistroCivil(cedula);

    if (civil.found && civil.person) {

      const { person, source } = civil;

      return {

        found: true,

        valid: true,

        idType: "cedula",

        identification: person.cedula,

        razonSocial: person.nombreCompleto,

        nombreComercial: person.nombreComercial ?? person.nombreCompleto,

        direccion: person.domicilio ?? "",

        email: person.email ?? "",

        source: source ?? "registro-civil",

      };

    }



    // 2–3. SRI: cédula exacta → RUC natural (cedula+001)

    const fromSri = await lookupCedulaViaSri(cedula);

    if (fromSri) return fromSri;



    // 4. EcuadorAPI — último recurso (ahorra consultas pagas)

    const ecuadorApi = await lookupEcuadorApiCedula(cedula);

    if (ecuadorApi.found && ecuadorApi.nombreCompleto) {

      return {

        found: true,

        valid: true,

        idType: "cedula",

        identification: ecuadorApi.cedula ?? cedula,

        razonSocial: ecuadorApi.nombreCompleto,

        nombreComercial: ecuadorApi.nombreCompleto,

        direccion: ecuadorApi.domicilio ?? "",

        email: ecuadorApi.email ?? "",

        source: ecuadorApi.source ?? "ecuador-api",

      };

    }



    // 5. Sin datos — ingreso manual

    return {

      found: false,

      valid: true,

      idType: "cedula",

      identification: cedula,

      message: CEDULA_MANUAL_MESSAGE,

    };

  } catch (err) {

    console.error("[sri-contribuyente] lookupCedula error:", err);

    return lookupErrorResult(

      "cedula",

      cedula,

      "Error al consultar. Ingresa los datos manualmente."

    );

  }

}



Deno.serve(async (req: Request) => {

  if (req.method === "OPTIONS") return optionsResponse();



  if (req.method !== "POST") {

    return jsonResponse({ error: "Método no permitido" }, 405);

  }



  let idType: "ruc" | "cedula" = "cedula";

  let identification = "";



  try {

    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {

      console.error("[sri-contribuyente] Falta header Authorization Bearer");

      return jsonResponse({ error: "No autorizado" }, 401);

    }



    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {

      console.error("[sri-contribuyente] SUPABASE_URL o SUPABASE_ANON_KEY no configurados");

      return jsonResponse(

        lookupErrorResult("cedula", "", "Servicio no configurado correctamente.")

      );

    }



    const supabase = createClient(supabaseUrl, supabaseAnonKey, {

      global: { headers: { Authorization: authHeader } },

    });



    const { data: userData, error: authError } = await supabase.auth.getUser();

    if (authError || !userData.user) {

      console.error("[sri-contribuyente] auth.getUser failed:", authError);

      return jsonResponse({ error: "Sesión inválida" }, 401);

    }



    let body: { identification?: string };

    try {

      body = await req.json();

    } catch (parseErr) {

      console.error("[sri-contribuyente] JSON inválido:", parseErr);

      return jsonResponse(

        lookupErrorResult("cedula", "", "Solicitud inválida.", false)

      );

    }



    identification = normalizeIdentification(body.identification ?? "");

    if (!identification) {

      return jsonResponse(

        lookupErrorResult("cedula", "", "Ingrese un RUC o cédula.", false)

      );

    }



    const detected = detectIdType(identification);

    if (detected === "invalid") {

      return jsonResponse(

        lookupErrorResult(

          identification.length > 10 ? "ruc" : "cedula",

          identification,

          "Ingrese un RUC de 13 dígitos o una cédula de 10 dígitos.",

          false

        )

      );

    }



    idType = detected;



    if (!isValidIdentification(identification)) {

      return jsonResponse(

        lookupErrorResult(

          idType,

          identification,

          idType === "cedula"

            ? "Cédula inválida (verifique provincia, tercer dígito 0–6 y dígito verificador)."

            : "RUC inválido (verifique formato y dígito verificador).",

          false

        )

      );

    }



    const result =

      idType === "ruc"

        ? await lookupRuc(identification)

        : await lookupCedula(identification);

    return jsonResponse(result);

  } catch (err) {

    console.error("[sri-contribuyente] unhandled error:", err);

    const isCedula = idType === "cedula";

    const errorMessage = isCedula

      ? "Error al consultar. Ingresa los datos manualmente."

      : "Error al consultar el SRI. Intente de nuevo o ingrese los datos manualmente.";

    return jsonResponse(

      lookupErrorResult(idType, identification, errorMessage, isCedula)

    );

  }

});

