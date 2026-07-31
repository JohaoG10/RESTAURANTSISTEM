import { FormEvent, useState } from "react";
import { formatMoney } from "../../billing/utils";
import type { CashShift, ShiftLiveSummary } from "../api";

function formatShiftTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  activeShift: CashShift | null;
  shiftSummary: ShiftLiveSummary | null;
  openingAmount: string;
  declaredAmount: string;
  closeNotes: string;
  busy: boolean;
  onOpeningAmountChange: (value: string) => void;
  onDeclaredAmountChange: (value: string) => void;
  onCloseNotesChange: (value: string) => void;
  onOpenShift: (event: FormEvent) => void;
  onCloseShift: (event: FormEvent) => void;
};

export function CashShiftPanel({
  activeShift,
  shiftSummary,
  openingAmount,
  declaredAmount,
  closeNotes,
  busy,
  onOpeningAmountChange,
  onDeclaredAmountChange,
  onCloseNotesChange,
  onOpenShift,
  onCloseShift,
}: Props) {
  const [showCloseForm, setShowCloseForm] = useState(false);

  const cashDifference =
    shiftSummary && declaredAmount
      ? Number(declaredAmount) - shiftSummary.expected_cash
      : null;

  if (!activeShift) {
    return (
      <div className="rp-cash-bar rp-cash-bar--closed">
        <div className="rp-cash-bar__info">
          <CashShiftStatusPill open={false} />
          <p className="rp-cash-bar__text">
            Abre un turno para registrar cobros. Los totales del día se actualizan al
            cobrar en el módulo de Cobro.
          </p>
        </div>
        <form className="rp-cash-bar__open" onSubmit={onOpenShift}>
          <label className="rp-cash-bar__field">
            <span className="rp-cash-bar__field-label">Efectivo inicial</span>
            <input
              type="number"
              className="rp-cash-bar__input"
              min={0}
              step={0.01}
              value={openingAmount}
              onChange={(e) => onOpeningAmountChange(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          <button type="submit" className="rp-cash-bar__btn rp-cash-bar__btn--open" disabled={busy}>
            {busy ? "Abriendo…" : "Abrir caja"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={`rp-cash-bar rp-cash-bar--active${showCloseForm ? " rp-cash-bar--closing" : ""}`}>
      <div className="rp-cash-bar__row">
        <div className="rp-cash-bar__status-block">
          <CashShiftStatusPill open />
          <span className="rp-cash-bar__since">Desde {formatShiftTime(activeShift.opened_at)}</span>
        </div>

        {shiftSummary ? (
          <dl className="rp-cash-bar__metrics">
            <div className="rp-cash-bar__metric">
              <dt>Base</dt>
              <dd>{formatMoney(shiftSummary.opening_amount)}</dd>
            </div>
            <div className="rp-cash-bar__metric rp-cash-bar__metric--accent">
              <dt>Efectivo esperado</dt>
              <dd>{formatMoney(shiftSummary.expected_cash)}</dd>
            </div>
          </dl>
        ) : null}

        {!showCloseForm ? (
          <button
            type="button"
            className="rp-cash-bar__btn rp-cash-bar__btn--close"
            disabled={busy}
            onClick={() => setShowCloseForm(true)}
          >
            Cerrar turno
          </button>
        ) : null}
      </div>

      {!showCloseForm ? (
        <p className="rp-cash-bar__hint">
          Registra cobros en el módulo Cobro · Cierra el turno al finalizar el día
        </p>
      ) : null}

      {showCloseForm ? (
        <form className="rp-cash-bar__close" onSubmit={onCloseShift}>
          <p className="rp-cash-bar__close-lead">
            Cuenta el efectivo físico y compáralo con lo esperado (
            {shiftSummary ? formatMoney(shiftSummary.expected_cash) : "—"}).
          </p>
          <div className="rp-cash-bar__close-grid">
            <label className="rp-cash-bar__field">
              <span className="rp-cash-bar__field-label">Efectivo contado</span>
              <input
                type="number"
                className="rp-cash-bar__input"
                min={0}
                step={0.01}
                value={declaredAmount}
                onChange={(e) => onDeclaredAmountChange(e.target.value)}
                disabled={busy}
                required
              />
            </label>
            <label className="rp-cash-bar__field">
              <span className="rp-cash-bar__field-label">Notas (opcional)</span>
              <input
                className="rp-cash-bar__input"
                value={closeNotes}
                onChange={(e) => onCloseNotesChange(e.target.value)}
                disabled={busy}
                placeholder="Observaciones"
              />
            </label>
          </div>
          {cashDifference !== null && Number.isFinite(cashDifference) ? (
            <p
              className={`rp-diff ${
                Math.abs(cashDifference) < 0.01 ? "rp-diff--ok" : "rp-diff--warn"
              }`}
            >
              Diferencia: {formatMoney(cashDifference)}
            </p>
          ) : null}
          <div className="rp-cash-bar__close-actions">
            <button
              type="button"
              className="rp-cash-bar__btn rp-cash-bar__btn--ghost"
              disabled={busy}
              onClick={() => setShowCloseForm(false)}
            >
              Cancelar
            </button>
            <button type="submit" className="rp-cash-bar__btn rp-cash-bar__btn--close" disabled={busy}>
              {busy ? "Cerrando…" : "Confirmar cierre"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function CashShiftStatusPill({ open }: { open: boolean }) {
  return (
    <span
      className={`rp-cash-pill${open ? " rp-cash-pill--open" : " rp-cash-pill--closed"}`}
      role="status"
    >
      <span className="rp-cash-pill__dot" aria-hidden />
      {open ? "Caja abierta" : "Caja cerrada"}
    </span>
  );
}
