import { FormEvent, useEffect, useMemo, useState } from "react";
import type { RestaurantTable } from "../api";
import {
  hasCreateTableFieldErrors,
  validateCreateTableFields,
  type CreateTableFieldErrors,
} from "../validateCreateTable";
import {
  TABLE_SHAPE_OPTIONS,
  TABLE_STATUS_OPTIONS,
  type TableShape,
  type TableStatus,
} from "../utils";

export type TableFormValues = {
  number: string;
  capacity: string;
  status: TableStatus;
  shape: TableShape;
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  table: RestaurantTable | null;
  busy?: boolean;
  existingTableNumbers?: number[];
  onClose: () => void;
  onCreate: (values: { number: number; capacity: number; shape: TableShape }) => Promise<void>;
  onSave: (values: { capacity: number; status: TableStatus }) => Promise<void>;
  onDelete: () => Promise<void>;
};

const emptyCreate: TableFormValues = {
  number: "",
  capacity: "4",
  status: "available",
  shape: "square",
};

function TableIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect x="4" y="7" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="7" cy="5" r="1.25" fill="currentColor" />
      <circle cx="12" cy="5" r="1.25" fill="currentColor" />
      <circle cx="17" cy="5" r="1.25" fill="currentColor" />
      <circle cx="7" cy="19" r="1.25" fill="currentColor" />
      <circle cx="12" cy="19" r="1.25" fill="currentColor" />
      <circle cx="17" cy="19" r="1.25" fill="currentColor" />
    </svg>
  );
}

function ShapeIcon({ shape }: { shape: TableShape }) {
  if (shape === "round") {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <circle cx="14" cy="14" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (shape === "square") {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <rect x="6" y="6" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="4" y="9" width="20" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function TablePreview({
  shape,
  number,
  capacity,
}: {
  shape: TableShape;
  number: string;
  capacity: string;
}) {
  const displayNumber = number.trim() || "?";
  const displayCap = capacity.trim() || "—";

  return (
    <div className="table-modal-preview" aria-live="polite">
      <span className="table-modal-preview__label">Vista previa</span>
      <div className="table-modal-preview__stage">
        <div
          className={`table-modal-preview__mesa table-modal-preview__mesa--${shape}`}
          data-status="available"
        >
          <span className="table-modal-preview__number">{displayNumber}</span>
          <span className="table-modal-preview__cap">{displayCap} pers.</span>
        </div>
      </div>
    </div>
  );
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function TableFormModal({
  open,
  mode,
  table,
  busy,
  existingTableNumbers = [],
  onClose,
  onCreate,
  onSave,
  onDelete,
}: Props) {
  const [values, setValues] = useState<TableFormValues>(emptyCreate);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  const fieldErrors: CreateTableFieldErrors = useMemo(() => {
    if (mode !== "create") return {};
    return validateCreateTableFields(values.number, values.capacity, existingTableNumbers);
  }, [mode, values.number, values.capacity, existingTableNumbers]);

  const createFormInvalid = mode === "create" && hasCreateTableFieldErrors(fieldErrors);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    setSubmitError(null);
    if (mode === "edit" && table) {
      setValues({
        number: String(table.number),
        capacity: String(table.capacity),
        status: table.status,
        shape: table.shape,
      });
    } else {
      setValues(emptyCreate);
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open, mode, table]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    if (mode === "create") {
      const errors = validateCreateTableFields(
        values.number,
        values.capacity,
        existingTableNumbers
      );
      if (hasCreateTableFieldErrors(errors)) {
        return;
      }

      const number = Number(values.number.trim());
      const capacity = Number(values.capacity.trim());

      try {
        await onCreate({ number, capacity, shape: values.shape });
        onClose();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "No se pudo crear la mesa");
      }
      return;
    }

    const capacity = Number(values.capacity);
    if (!Number.isFinite(capacity) || capacity < 1) {
      setSubmitError("La capacidad debe ser al menos 1.");
      return;
    }

    try {
      await onSave({ capacity, status: values.status });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo guardar la mesa");
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `¿Eliminar la mesa ${table?.number ?? ""}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setSubmitError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo eliminar la mesa");
    }
  }

  return (
    <div
      className={`table-modal-backdrop${entered ? " table-modal-backdrop--visible" : ""}`}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`table-modal panel${entered ? " table-modal--visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="table-modal__header">
          {mode === "create" ? (
            <div className="table-modal__title-row">
              <span className="table-modal__title-icon" aria-hidden>
                <TableIcon />
              </span>
              <h2 className="table-modal__title">Nueva mesa</h2>
            </div>
          ) : (
            <h2 className="table-modal__title table-modal__title--solo">
              Mesa {table?.number ?? ""}
            </h2>
          )}
          <button
            type="button"
            className="table-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <form className="table-modal__form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          {mode === "create" ? (
            <>
              <div className="table-modal__row">
                <div className="table-modal__field">
                  <label htmlFor="table-number">Número de mesa</label>
                  <input
                    id="table-number"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Ej. 12"
                    value={values.number}
                    onChange={(e) =>
                      setValues((p) => ({ ...p, number: digitsOnly(e.target.value) }))
                    }
                    disabled={busy}
                    className={fieldErrors.number ? "table-modal__input--invalid" : undefined}
                    aria-invalid={Boolean(fieldErrors.number)}
                    aria-describedby={fieldErrors.number ? "table-number-error" : undefined}
                  />
                  {fieldErrors.number ? (
                    <p className="table-modal__field-error" id="table-number-error" role="alert">
                      {fieldErrors.number}
                    </p>
                  ) : null}
                </div>
                <div className="table-modal__field">
                  <label htmlFor="table-capacity">Capacidad (personas)</label>
                  <input
                    id="table-capacity"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="1–20"
                    value={values.capacity}
                    onChange={(e) =>
                      setValues((p) => ({ ...p, capacity: digitsOnly(e.target.value) }))
                    }
                    disabled={busy}
                    className={fieldErrors.capacity ? "table-modal__input--invalid" : undefined}
                    aria-invalid={Boolean(fieldErrors.capacity)}
                    aria-describedby={fieldErrors.capacity ? "table-capacity-error" : undefined}
                  />
                  {fieldErrors.capacity ? (
                    <p className="table-modal__field-error" id="table-capacity-error" role="alert">
                      {fieldErrors.capacity}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="table-modal__section">
                <span className="table-modal__section-label" id="table-shape-label">
                  Forma de la mesa
                </span>
                <div
                  className="table-shape-picker"
                  role="group"
                  aria-labelledby="table-shape-label"
                >
                  {TABLE_SHAPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`table-shape-option${
                        values.shape === option.value ? " table-shape-option--selected" : ""
                      }`}
                      onClick={() => setValues((p) => ({ ...p, shape: option.value }))}
                      disabled={busy}
                      aria-pressed={values.shape === option.value}
                      title={option.label}
                    >
                      <ShapeIcon shape={option.value} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <TablePreview
                shape={values.shape}
                number={values.number}
                capacity={values.capacity}
              />
            </>
          ) : (
            <>
              <div className="table-modal__field table-modal__field--full">
                <label htmlFor="table-capacity-edit">Capacidad (personas)</label>
                <input
                  id="table-capacity-edit"
                  type="number"
                  min={1}
                  required
                  value={values.capacity}
                  onChange={(e) => setValues((p) => ({ ...p, capacity: e.target.value }))}
                  disabled={busy}
                />
              </div>

              <div className="table-modal__section">
                <span className="table-modal__section-label" id="table-status-label">
                  Estado
                </span>
                <div
                  className="table-status-pills"
                  role="group"
                  aria-labelledby="table-status-label"
                >
                  {TABLE_STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`table-status-pill table-status-pill--${option.value}${
                        values.status === option.value ? " table-status-pill--selected" : ""
                      }`}
                      onClick={() => setValues((p) => ({ ...p, status: option.value }))}
                      disabled={busy}
                      aria-pressed={values.status === option.value}
                    >
                      <span
                        className="table-status-pill__dot"
                        style={{ background: option.color }}
                        aria-hidden
                      />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {submitError ? <p className="table-modal__error">{submitError}</p> : null}

          {mode === "create" ? (
            <footer className="table-modal__actions">
              <button type="button" className="btn--secondary" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button
                type="submit"
                className="table-modal__btn-primary"
                disabled={busy || createFormInvalid}
              >
                {busy ? "Creando…" : "Crear mesa"}
              </button>
            </footer>
          ) : (
            <>
              <footer className="table-modal__actions">
                <button type="button" className="btn--secondary" onClick={onClose} disabled={busy}>
                  Cancelar
                </button>
                <button type="submit" className="table-modal__btn-primary" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar"}
                </button>
              </footer>
              <div className="table-modal__danger-zone">
                <button
                  type="button"
                  className="table-modal__btn-danger"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                >
                  Eliminar mesa
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
