import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  detectIdType,
  identificationLabel,
  isValidIdentification,
  normalizeIdentification,
} from "../utils/ecuadorId";
import { lookupContribuyente, type InvoiceCustomerData } from "../sri-api";

export type InvoiceBillingMode = "none" | "invoice" | "final_consumer";

type Props = {
  disabled?: boolean;
  embedded?: boolean;
  variant?: "default" | "modal";
  onModeChange?: (mode: InvoiceBillingMode) => void;
  onCustomerChange?: (data: InvoiceCustomerData | null) => void;
  onGenerate?: (data: InvoiceCustomerData) => void;
  onCancel?: () => void;
};

const EMPTY_FORM = {
  identification: "",
  razonSocial: "",
  nombreComercial: "",
  direccion: "",
  email: "",
};

export function InvoiceCustomerSection({
  disabled = false,
  embedded = false,
  variant = "default",
  onModeChange,
  onCustomerChange,
  onGenerate,
  onCancel,
}: Props) {
  const isModal = variant === "modal";
  const [mode, setMode] = useState<InvoiceBillingMode>(variant === "modal" ? "invoice" : "none");
  const [form, setForm] = useState(EMPTY_FORM);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupFound, setLookupFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const digits = normalizeIdentification(form.identification);
  const idType = detectIdType(form.identification);
  const idValid = isValidIdentification(form.identification);
  const canEmitInvoice =
    mode === "invoice" &&
    idValid &&
    form.razonSocial.trim().length > 0;

  const customerPayload = useMemo((): InvoiceCustomerData | null => {
    if (mode !== "invoice" || !idValid) return null;
    if (idType !== "ruc" && idType !== "cedula") return null;
    return {
      identification: digits,
      idType,
      razonSocial: form.razonSocial.trim(),
      nombreComercial: form.nombreComercial.trim(),
      direccion: form.direccion.trim(),
      email: form.email.trim(),
    };
  }, [mode, idValid, idType, digits, form]);

  useEffect(() => {
    onCustomerChange?.(customerPayload);
  }, [customerPayload, onCustomerChange]);

  function updateMode(next: InvoiceBillingMode) {
    setMode(next);
    onModeChange?.(next);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setLookupMessage(null);
    setLookupFound(false);
  }

  function handleConsumidorFinal() {
    resetForm();
    updateMode("final_consumer");
  }

  function handleStartInvoice() {
    if (mode === "final_consumer") {
      resetForm();
    }
    updateMode("invoice");
  }

  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    if (!digits) {
      setLookupMessage("Ingrese un RUC o cédula.");
      return;
    }

    setBusy(true);
    setLookupMessage(null);
    setLookupFound(false);

    try {
      updateMode("invoice");
      const result = await lookupContribuyente(digits);

      if (!result.valid) {
        setLookupMessage(result.message ?? "Identificación inválida.");
        return;
      }

      setForm((prev) => ({
        identification: result.identification || prev.identification,
        razonSocial: result.razonSocial ?? prev.razonSocial,
        nombreComercial: result.nombreComercial ?? prev.nombreComercial,
        direccion: result.direccion ?? prev.direccion,
        email: result.email ?? prev.email,
      }));

      setLookupFound(result.found);
      if (result.found) {
        setLookupMessage(
          result.estado
            ? `Datos encontrados — estado SRI: ${result.estado}`
            : "Datos encontrados."
        );
      } else {
        setLookupMessage(
          result.message ?? "Ingresa los datos manualmente"
        );
      }
    } catch (err) {
      setLookupMessage(
        err instanceof Error ? err.message : "Error al consultar."
      );
    } finally {
      setBusy(false);
    }
  }

  function handleGenerateInvoice() {
    if (!canEmitInvoice || !customerPayload) return;
    if (onGenerate) {
      onGenerate(customerPayload);
      return;
    }
    window.alert(
      "Emisión SRI disponible en la Fase 2.\n\nLos datos del cliente quedaron listos para facturar."
    );
  }

  return (
    <div
      className={`bl-invoice-card${embedded ? " bl-invoice-card--embedded" : ""}${isModal ? " bl-invoice-card--modal" : ""}`}
      id={isModal ? undefined : "datos-factura"}
    >
      {!isModal && (
        <div className="bl-invoice-card__head">
          <h4 className="bl-invoice-card__title">Datos para factura</h4>
          {mode === "final_consumer" && (
            <span className="bl-invoice-card__badge bl-invoice-card__badge--neutral">
              Consumidor final
            </span>
          )}
          {mode === "invoice" && idValid && (
            <span className="bl-invoice-card__badge bl-invoice-card__badge--ready">
              {identificationLabel(form.identification)} válido
            </span>
          )}
        </div>
      )}

      {isModal && mode === "invoice" && idValid && (
        <span className="bl-invoice-card__badge bl-invoice-card__badge--ready bl-invoice-card__badge--modal">
          {identificationLabel(form.identification)} válido
        </span>
      )}

      <form className="bl-invoice-lookup" onSubmit={(e) => void handleLookup(e)}>
        <label className="bl-invoice-field">
          <span className="bl-invoice-field__label">RUC o cédula</span>
          <div className="bl-invoice-lookup__row">
            <input
              className="bl-input"
              type="text"
              inputMode="numeric"
              placeholder="Ej. 1790016919001 o 1710034065"
              value={form.identification}
              disabled={disabled || busy}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, identification: e.target.value }));
                setLookupFound(false);
                setLookupMessage(null);
                if (mode === "final_consumer") updateMode("none");
              }}
              onFocus={handleStartInvoice}
            />
            <button
              type="submit"
              className="bl-btn-secondary bl-invoice-lookup__btn"
              disabled={disabled || busy || !digits}
            >
              {busy ? "Consultando…" : "Consultar"}
            </button>
          </div>
        </label>
      </form>

      {lookupMessage && (
        <p
          className={`bl-invoice-message${
            lookupFound ? " bl-invoice-message--success" : " bl-invoice-message--info"
          }`}
        >
          {lookupMessage}
        </p>
      )}

      <div className="bl-invoice-fields">
          <label className="bl-invoice-field">
            <span className="bl-invoice-field__label">Razón social</span>
            <input
              className="bl-input"
              value={form.razonSocial}
              disabled={disabled}
              placeholder="Nombre o razón social"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, razonSocial: e.target.value }))
              }
            />
          </label>
          <label className="bl-invoice-field">
            <span className="bl-invoice-field__label">Nombre comercial</span>
            <input
              className="bl-input"
              value={form.nombreComercial}
              disabled={disabled}
              placeholder="Opcional"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nombreComercial: e.target.value }))
              }
            />
          </label>
          <label className="bl-invoice-field">
            <span className="bl-invoice-field__label">Dirección</span>
            <input
              className="bl-input"
              value={form.direccion}
              disabled={disabled}
              placeholder="Dirección del cliente"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, direccion: e.target.value }))
              }
            />
          </label>
          <label className="bl-invoice-field">
            <span className="bl-invoice-field__label">Email</span>
            <input
              className="bl-input"
              type="email"
              value={form.email}
              disabled={disabled}
              placeholder="correo@ejemplo.com"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, email: e.target.value }))
              }
            />
          </label>
        </div>

      <div className="bl-invoice-actions">
        {(canEmitInvoice || (isModal && idValid && form.razonSocial.trim())) && (
          <button
            type="button"
            className="bl-btn-invoice"
            disabled={disabled || busy || !form.razonSocial.trim() || !idValid}
            onClick={handleGenerateInvoice}
          >
            {isModal ? "Generar factura" : "Emitir factura"}
          </button>
        )}
        {!isModal && (
          <button
            type="button"
            className={`bl-btn-consumer${mode === "final_consumer" ? " bl-btn-consumer--active" : ""}`}
            disabled={disabled || busy}
            onClick={handleConsumidorFinal}
          >
            Consumidor final
          </button>
        )}
        {isModal && onCancel && (
          <button
            type="button"
            className="bl-btn-consumer"
            disabled={disabled || busy}
            onClick={onCancel}
          >
            Finalizar sin factura
          </button>
        )}
      </div>
    </div>
  );
}
