import {
  autorizarComprobante,
  type AutorizacionResult,
  sleep,
} from "./soap-client.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { recordMetricEvent } from "./invoice-metrics.ts";

const MAX_AUTH_RETRIES = 5;
const RETRY_DELAY_MS = 3000;
const SOAP_TIMEOUT_MS = 30_000;

export type AuthRetryResult = {
  autorizacion: AutorizacionResult;
  attempts: number;
  timedOut: boolean;
};

export async function autorizarWithRetries(
  admin: SupabaseClient,
  invoiceId: string,
  currentStatus: string,
  autorizacionUrl: string,
  accessKey: string
): Promise<AuthRetryResult> {
  let lastResult: AutorizacionResult | null = null;
  let timedOut = false;

  for (let attempt = 1; attempt <= MAX_AUTH_RETRIES; attempt++) {
    const start = Date.now();
    try {
      lastResult = await autorizarComprobante(autorizacionUrl, accessKey, SOAP_TIMEOUT_MS);
    } catch (err) {
      const elapsed = Date.now() - start;
      if (elapsed >= SOAP_TIMEOUT_MS || (err instanceof Error && err.message.includes("timeout"))) {
        timedOut = true;
      }
      await recordMetricEvent(admin, invoiceId, currentStatus, "retry_attempted", {
        attempt,
        phase: "autorizacion",
        error: err instanceof Error ? err.message : String(err),
        timedOut,
      });
      if (attempt < MAX_AUTH_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }

    const elapsed = Date.now() - start;
    await recordMetricEvent(admin, invoiceId, currentStatus, "sri_response_received", {
      attempt,
      phase: "autorizacion",
      elapsedMs: elapsed,
      estado: lastResult.estado,
    });

    const estado = lastResult.estado.toUpperCase();
    if (estado === "AUTORIZADO") {
      return { autorizacion: lastResult, attempts: attempt, timedOut: false };
    }
    if (estado.includes("NO AUTORIZADO") || estado === "RECHAZADA") {
      return { autorizacion: lastResult, attempts: attempt, timedOut: false };
    }
    if (estado !== "EN PROCESO" && !estado.includes("PROCESO")) {
      return { autorizacion: lastResult, attempts: attempt, timedOut: false };
    }

    await recordMetricEvent(admin, invoiceId, currentStatus, "retry_attempted", {
      attempt,
      phase: "autorizacion",
      estado: lastResult.estado,
      nextRetryInMs: attempt < MAX_AUTH_RETRIES ? RETRY_DELAY_MS : null,
    });

    if (attempt < MAX_AUTH_RETRIES) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  return {
    autorizacion: lastResult ?? {
      estado: "EN PROCESO",
      messages: [],
      raw: "",
    },
    attempts: MAX_AUTH_RETRIES,
    timedOut,
  };
}
