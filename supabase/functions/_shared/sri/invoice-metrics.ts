import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type MetricEventType =
  | "validation_passed"
  | "xml_generated"
  | "signed"
  | "sent_to_sri"
  | "sri_response_received"
  | "authorized"
  | "rejected"
  | "retry_attempted"
  | "ride_generated"
  | "email_sent"
  | "error"
  | "reissue_of";

export async function recordMetricEvent(
  admin: SupabaseClient,
  invoiceId: string,
  currentStatus: string,
  eventType: MetricEventType,
  payload: Record<string, unknown>
): Promise<void> {
  await admin.from("invoice_events").insert({
    invoice_id: invoiceId,
    from_status: currentStatus,
    to_status: currentStatus,
    payload: {
      eventType,
      timestamp: new Date().toISOString(),
      ...payload,
    },
  });
}

export async function writeSriAuditLog(
  admin: SupabaseClient,
  userId: string,
  billId: string,
  invoiceId: string | null,
  result: "success" | "error" | "rejected" | "submitted" | "pending",
  metadata: Record<string, unknown>
): Promise<void> {
  await admin.rpc("write_audit_log_for_user", {
    p_user_id: userId,
    p_action: "invoice_emit",
    p_entity: "invoices",
    p_entity_id: invoiceId ?? billId,
    p_metadata: {
      bill_id: billId,
      invoice_id: invoiceId,
      result,
      ...metadata,
    },
  });
}

export function partialStack(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  return err.stack?.split("\n").slice(0, 4).join("\n");
}
