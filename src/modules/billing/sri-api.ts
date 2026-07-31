import { supabase } from "../../lib/supabase";

export type InvoiceCustomerData = {
  identification: string;
  idType: "ruc" | "cedula";
  razonSocial: string;
  nombreComercial: string;
  direccion: string;
  email: string;
};

export type ContribuyenteLookupResult = {
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

function guessIdType(identification: string): "ruc" | "cedula" {
  return identification.length > 10 ? "ruc" : "cedula";
}

async function parseFunctionsErrorBody(
  error: { context?: Response }
): Promise<ContribuyenteLookupResult | null> {
  const response = error.context;
  if (!response) return null;

  try {
    const body = (await response.json()) as ContribuyenteLookupResult;
    if (body && typeof body === "object" && "found" in body) {
      return body;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export async function lookupContribuyente(
  identification: string
): Promise<ContribuyenteLookupResult> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error("[sri-api] getSession error:", sessionError);
  }

  if (!session?.access_token) {
    throw new Error("Debe iniciar sesión para consultar el RUC o cédula.");
  }

  const { data, error } = await supabase.functions.invoke<ContribuyenteLookupResult>(
    "sri-contribuyente",
    {
      body: { identification },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  if (error) {
    console.error("[sri-api] invoke sri-contribuyente error:", error);
    const parsed = await parseFunctionsErrorBody(
      error as { context?: Response }
    );
    if (parsed) return parsed;

    const fallbackMessage =
      error.message || "No se pudo consultar el contribuyente. Verifique la conexión.";
    return {
      found: false,
      valid: true,
      idType: guessIdType(identification.replace(/\D/g, "")),
      identification,
      error: fallbackMessage,
      message: fallbackMessage,
    };
  }

  if (!data) {
    return {
      found: false,
      valid: true,
      idType: guessIdType(identification.replace(/\D/g, "")),
      identification,
      error: "Respuesta vacía del servicio de consulta.",
      message: "Respuesta vacía del servicio de consulta.",
    };
  }

  return data;
}
