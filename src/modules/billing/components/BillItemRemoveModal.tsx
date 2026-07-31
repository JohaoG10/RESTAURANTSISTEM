import { useEffect, useMemo, useState } from "react";
import type { OrderItemWithServed } from "../../orders/api";
import { formatMoney } from "../utils";

export type BillItemRemoveContext = {
  orderItem: OrderItemWithServed;
  menuName: string;
  orderLabel: string;
  hasTable: boolean;
  servedQty: number;
  maxRemovable: number;
  otherBillableItemCount: number;
  willRegenerateBill: boolean;
  willVoidSplitBills: boolean;
};

type Props = {
  context: BillItemRemoveContext | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (removeQty: number) => void | Promise<void>;
};

export function BillItemRemoveModal({ context, busy, onClose, onConfirm }: Props) {
  const [removeQty, setRemoveQty] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!context) return;
    setRemoveQty(1);
    setError(null);
  }, [context]);

  const remainingQty = useMemo(() => {
    if (!context) return 0;
    return context.orderItem.quantity - removeQty;
  }, [context, removeQty]);

  const removedAmount = useMemo(() => {
    if (!context) return 0;
    return removeQty * context.orderItem.price_at_order;
  }, [context, removeQty]);

  const willEmptyOrder = useMemo(() => {
    if (!context) return false;
    const thisRemaining = context.orderItem.quantity - removeQty;
    return thisRemaining <= 0 && context.otherBillableItemCount === 0;
  }, [context, removeQty]);

  if (!context) return null;

  const {
    orderItem,
    menuName,
    orderLabel,
    hasTable,
    servedQty,
    maxRemovable,
    willRegenerateBill,
    willVoidSplitBills,
  } = context;

  function handleQtyChange(next: number) {
    const clamped = Math.min(maxRemovable, Math.max(1, next));
    setRemoveQty(clamped);
    setError(null);
  }

  async function handleSubmit() {
    if (removeQty < 1 || removeQty > maxRemovable) {
      setError(`Indica entre 1 y ${maxRemovable} unidad(es) a quitar.`);
      return;
    }
    if (remainingQty < servedQty) {
      setError(`No puedes dejar menos de ${servedQty} (ya entregadas).`);
      return;
    }
    await onConfirm(removeQty);
  }

  return (
    <div
      className="bl-remove-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bl-remove-title"
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bl-remove-modal">
        <header className="bl-remove-modal__header">
          <h2 id="bl-remove-title" className="bl-remove-modal__title">
            Quitar ítem de la cuenta
          </h2>
          <button
            type="button"
            className="bl-remove-modal__close"
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="bl-remove-modal__body">
          <p className="bl-remove-modal__item-name">{menuName}</p>
          <p className="bl-remove-modal__unit-price">
            {formatMoney(orderItem.price_at_order)} c/u
          </p>

          <div className="bl-remove-modal__stats">
            <div className="bl-remove-modal__stat">
              <span className="bl-remove-modal__stat-label">En la cuenta</span>
              <strong>{orderItem.quantity}</strong>
            </div>
            {servedQty > 0 ? (
              <div className="bl-remove-modal__stat bl-remove-modal__stat--warn">
                <span className="bl-remove-modal__stat-label">Entregadas</span>
                <strong>{servedQty}</strong>
              </div>
            ) : null}
            <div className="bl-remove-modal__stat bl-remove-modal__stat--accent">
              <span className="bl-remove-modal__stat-label">Máx. a quitar</span>
              <strong>{maxRemovable}</strong>
            </div>
          </div>

          {servedQty > 0 ? (
            <p className="bl-remove-modal__hint">
              Las {servedQty} unidad(es) ya entregadas no se pueden quitar.
            </p>
          ) : null}

          <label className="bl-remove-modal__qty-label" htmlFor="bl-remove-qty">
            ¿Cuántas unidades quitar?
          </label>
          <div className="bl-remove-modal__qty-row">
            <button
              type="button"
              className="bl-remove-modal__qty-btn"
              disabled={busy || removeQty <= 1}
              onClick={() => handleQtyChange(removeQty - 1)}
              aria-label="Quitar una unidad menos"
            >
              −
            </button>
            <input
              id="bl-remove-qty"
              className="bl-remove-modal__qty-input"
              type="number"
              min={1}
              max={maxRemovable}
              value={removeQty}
              disabled={busy}
              onChange={(e) => handleQtyChange(Number(e.target.value) || 1)}
            />
            <button
              type="button"
              className="bl-remove-modal__qty-btn"
              disabled={busy || removeQty >= maxRemovable}
              onClick={() => handleQtyChange(removeQty + 1)}
              aria-label="Quitar una unidad más"
            >
              +
            </button>
            {maxRemovable > 1 ? (
              <button
                type="button"
                className="bl-remove-modal__qty-all"
                disabled={busy}
                onClick={() => handleQtyChange(maxRemovable)}
              >
                Todas ({maxRemovable})
              </button>
            ) : null}
          </div>

          <div className="bl-remove-modal__preview">
            {willEmptyOrder ? (
              <div className="bl-remove-modal__cancel-banner">
                <strong>Se anulará la comanda completa</strong>
                <p>
                  {orderLabel} quedará cancelada, sin ítems que cobrar
                  {hasTable ? " y la mesa se liberará" : ""}.
                </p>
              </div>
            ) : (
              <>
                <div className="bl-remove-modal__preview-row">
                  <span>Quedarían a cobrar</span>
                  <strong>
                    {remainingQty} × {formatMoney(orderItem.price_at_order)} ={" "}
                    {formatMoney(remainingQty * orderItem.price_at_order)}
                  </strong>
                </div>
                <div className="bl-remove-modal__preview-row bl-remove-modal__preview-row--muted">
                  <span>Se descuenta</span>
                  <strong>−{formatMoney(removedAmount)}</strong>
                </div>
              </>
            )}
          </div>

          {!willEmptyOrder && willRegenerateBill ? (
            <p className="bl-remove-modal__notice">
              {willVoidSplitBills
                ? "Las cuentas divididas se anularán y deberás volver a generarlas."
                : "La pre-cuenta se actualizará con el nuevo total."}
            </p>
          ) : null}

          {error ? <p className="bl-remove-modal__error">{error}</p> : null}
        </div>

        <footer className="bl-remove-modal__footer">
          <button
            type="button"
            className="bl-btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="bl-btn-danger"
            disabled={busy}
            onClick={() => void handleSubmit()}
          >
            {busy
              ? "Aplicando…"
              : willEmptyOrder
                ? "Sí, anular comanda"
                : removeQty >= maxRemovable && remainingQty === 0
                  ? "Eliminar ítem"
                  : `Quitar ${removeQty} unidad${removeQty !== 1 ? "es" : ""}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
