import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { buildRideHtml, type RideHtmlInput, type RideLineItem } from "./ride-html.ts";

export type GenerateRideInput = Omit<RideHtmlInput, "docNumber"> & {
  restaurantId: string;
  invoiceId: string;
  establishment: string;
  emissionPoint: string;
  sequential: number;
};

export function formatDocNumber(
  establishment: string,
  emissionPoint: string,
  sequential: number
): string {
  const estab = establishment.padStart(3, "0");
  const pto = emissionPoint.padStart(3, "0");
  const sec = sequential.toString().padStart(9, "0");
  return `${estab}-${pto}-${sec}`;
}

export function mapFormaPagoLabel(code: string): string {
  const labels: Record<string, string> = {
    "01": "Efectivo",
    "15": "Compensación de deudas",
    "16": "Tarjeta de débito",
    "17": "Dinero electrónico",
    "18": "Tarjeta prepago",
    "19": "Tarjeta de crédito",
    "20": "Otros con utilización del sistema financiero",
    "21": "Endoso de títulos",
  };
  return labels[code] ?? `Forma de pago (${code})`;
}

export async function generateAndStoreRide(
  admin: SupabaseClient,
  input: GenerateRideInput
): Promise<string> {
  const docNumber = formatDocNumber(
    input.establishment,
    input.emissionPoint,
    input.sequential
  );

  const html = buildRideHtml({
    ...input,
    docNumber,
  });

  const path = `${input.restaurantId}/${input.invoiceId}.html`;
  const { error } = await admin.storage.from("invoice-ride").upload(
    path,
    new Blob([html], { type: "text/html; charset=utf-8" }),
    { upsert: true, contentType: "text/html" }
  );

  if (error) {
    throw new Error(`No se pudo guardar el RIDE: ${error.message}`);
  }

  return path;
}

export type { RideLineItem };
