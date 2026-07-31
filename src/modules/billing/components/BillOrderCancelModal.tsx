type Props = {
  open: boolean;
  orderLabel: string;
  hasTable: boolean;
  itemCount: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function BillOrderCancelModal({
  open,
  orderLabel,
  hasTable,
  itemCount,
  busy,
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="bl-remove-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bl-cancel-order-title"
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bl-remove-modal bl-remove-modal--cancel-order">
        <header className="bl-remove-modal__header bl-remove-modal__header--danger">
          <h2 id="bl-cancel-order-title" className="bl-remove-modal__title">
            Anular comanda completa
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
          <p className="bl-remove-modal__item-name">{orderLabel}</p>
          <p className="bl-remove-modal__cancel-lead">
            Vas a cancelar esta comanda con{" "}
            <strong>
              {itemCount} ítem{itemCount !== 1 ? "s" : ""}
            </strong>
            . Esta acción no se puede deshacer.
          </p>

          <ul className="bl-remove-modal__cancel-list">
            <li>Se anularán las cuentas y pre-cuentas asociadas (sin pagos).</li>
            <li>Se eliminarán todos los ítems de la comanda.</li>
            <li>No habrá nada que cobrar en caja.</li>
            {hasTable ? <li>La mesa quedará libre automáticamente.</li> : null}
          </ul>

          <p className="bl-remove-modal__cancel-hint">
            Usa esta opción solo si la comanda se creó por error o el cliente se retiró
            sin consumir nada.
          </p>
        </div>

        <footer className="bl-remove-modal__footer">
          <button type="button" className="bl-btn-ghost" disabled={busy} onClick={onClose}>
            Volver
          </button>
          <button
            type="button"
            className="bl-btn-danger"
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "Anulando…" : "Sí, anular comanda"}
          </button>
        </footer>
      </div>
    </div>
  );
}
