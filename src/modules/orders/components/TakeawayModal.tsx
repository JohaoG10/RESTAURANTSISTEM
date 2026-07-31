import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  busy: boolean;
  previewNumber: number;
  onClose: () => void;
  onSubmit: (customerName: string) => void;
};

export function TakeawayModal({ open, busy, previewNumber, onClose, onSubmit }: Props) {
  const [customerName, setCustomerName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCustomerName("");
      window.setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  if (!open) return null;

  const numLabel = previewNumber.toString().padStart(3, "0");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    onSubmit(customerName.trim());
  }

  return (
    <div
      className="tw-modal__backdrop"
      role="dialog"
      aria-modal
      aria-label="Nuevo pedido para llevar"
      onClick={onClose}
    >
      <div className="tw-modal__card" onClick={(e) => e.stopPropagation()}>

        {/* ── Header con gradiente ── */}
        <div className="tw-modal__header">
          <div className="tw-modal__header-icon" aria-hidden>🛍️</div>
          <div>
            <h2 className="tw-modal__title">Pedido para llevar</h2>
            <p className="tw-modal__subtitle">Nuevo pedido · Sin mesa asignada</p>
          </div>
          <button
            type="button"
            className="tw-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={busy}
          >
            ✕
          </button>
        </div>

        {/* ── Número de pedido ── */}
        <div className="tw-modal__num-section">
          <div className="tw-modal__num-ring">
            <span className="tw-modal__num-label">PEDIDO</span>
            <span className="tw-modal__num">#{numLabel}</span>
            <span className="tw-modal__num-date">
              {new Date().toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>
        </div>

        {/* ── Formulario ── */}
        <form className="tw-modal__form" onSubmit={handleSubmit}>
          <div className="tw-modal__field">
            <label className="tw-modal__field-label" htmlFor="tw-customer-name">
              Nombre del cliente
              <span className="tw-modal__field-optional">— opcional</span>
            </label>
            <div className="tw-modal__input-wrap">
              <span className="tw-modal__input-icon" aria-hidden>👤</span>
              <input
                ref={inputRef}
                id="tw-customer-name"
                type="text"
                className="tw-modal__input"
                placeholder="Ej: Juan, Mesa exterior, Domicilio..."
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={busy}
                maxLength={80}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="tw-modal__actions">
            <button
              type="button"
              className="tw-modal__btn tw-modal__btn--cancel"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="tw-modal__btn tw-modal__btn--create"
              disabled={busy}
            >
              {busy ? (
                <>
                  <span className="tw-modal__spinner" aria-hidden />
                  Creando…
                </>
              ) : (
                <>
                  <span aria-hidden>🛍️</span>
                  Crear pedido
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
