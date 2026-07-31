import { FormEvent, useEffect, useState } from "react";
import type { RestaurantTable } from "../api";

type Props = {
  open: boolean;
  tables: RestaurantTable[];
  initialTableId?: string | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (tableId: string, label: string) => Promise<void>;
};

function TableIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="3" y="9" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 9V7a4 4 0 0 1 8 0v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function isSelectable(status: string) {
  return status === "available";
}

export function NewOrderModal({
  open,
  tables,
  initialTableId,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const [tableId, setTableId] = useState("");
  const [label, setLabel] = useState("");
  const [showLabel, setShowLabel] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    setLabel("");
    setShowLabel(false);
    const preset =
      initialTableId != null
        ? tables.find((t) => t.id === initialTableId && isSelectable(t.status))
        : undefined;
    const firstFree = tables.find((t) => t.status === "available");
    setTableId(preset?.id ?? firstFree?.id ?? "");
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open, tables, initialTableId]);

  if (!open) return null;

  const selectedTable = tables.find((t) => t.id === tableId);
  const canSubmit =
    Boolean(tableId) &&
    selectedTable != null &&
    isSelectable(selectedTable.status) &&
    !busy;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit(tableId, label.trim());
    onClose();
  }

  function handleSelectTable(table: RestaurantTable) {
    if (!isSelectable(table.status) || busy) return;
    setTableId(table.id);
  }

  function statusSubLabel(status: string) {
    if (status === "occupied") return "Ocupada";
    if (status === "reserved") return "Reservada";
    return "Libre";
  }

  return (
    <div
      className={`nom-backdrop${entered ? " nom-backdrop--in" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nom-modal-title"
      onClick={onClose}
    >
      <div
        className={`nom-modal${entered ? " nom-modal--in" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="nom-modal__header">
          <div className="nom-modal__header-title">
            <TableIcon />
            <h2 id="nom-modal-title">Nueva comanda</h2>
          </div>
          <button
            type="button"
            className="nom-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <form className="nom-modal__form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="nom-modal__body">
            <p className="nom-modal__hint">Selecciona una mesa disponible</p>
            <div className="nom-modal__grid">
              {tables.map((table) => {
                const selectable = isSelectable(table.status);
                const selected = tableId === table.id;
                const isOccupied = table.status === "occupied";
                const isReserved = table.status === "reserved";

                return (
                  <button
                    key={table.id}
                    type="button"
                    className={[
                      "nom-table-card",
                      isOccupied
                        ? "nom-table-card--busy"
                        : isReserved
                          ? "nom-table-card--reserved"
                          : "nom-table-card--free",
                      selected && selectable ? "nom-table-card--selected" : "",
                      !selectable ? "nom-table-card--locked" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleSelectTable(table)}
                    disabled={busy || !selectable}
                    aria-pressed={selected && selectable}
                    aria-disabled={!selectable}
                  >
                    {selected && selectable ? (
                      <span className="nom-table-card__check" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                    <span className="nom-table-card__number">{table.number}</span>
                    <span className="nom-table-card__status">
                      {statusSubLabel(table.status)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="nom-modal__label-wrap">
              {!showLabel ? (
                <button
                  type="button"
                  className="nom-modal__label-toggle"
                  onClick={() => setShowLabel(true)}
                  disabled={busy}
                >
                  + Agregar etiqueta de grupo
                </button>
              ) : (
                <label className="nom-modal__label-field">
                  Etiqueta de grupo
                  <input
                    type="text"
                    placeholder="Ej: Grupo A, Terraza…"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    disabled={busy}
                    autoFocus
                  />
                </label>
              )}
            </div>
          </div>

          <footer className="nom-modal__footer">
            <button
              type="button"
              className="nom-modal__btn nom-modal__btn--secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="nom-modal__btn nom-modal__btn--primary"
              disabled={!canSubmit}
            >
              {busy ? "Creando…" : "Crear comanda"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
