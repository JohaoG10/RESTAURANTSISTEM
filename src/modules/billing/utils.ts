import type { Tables } from "../../types/database.types";

export type PaymentMethod = Tables<"payments">["method"];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
};

const BILL_STATUS_LABELS: Record<Tables<"bills">["status"], string> = {
  draft: "Borrador",
  pending_payment: "Pendiente de pago",
  partially_paid: "Pago parcial",
  paid: "Pagada",
  voided: "Anulada",
  refunded: "Reembolsada",
};

export function formatMoney(value: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function paymentMethodLabel(method: PaymentMethod) {
  return PAYMENT_METHOD_LABELS[method];
}

export function billStatusLabel(status: Tables<"bills">["status"]) {
  return BILL_STATUS_LABELS[status];
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
