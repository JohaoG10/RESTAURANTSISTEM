import { FormEvent, useEffect, useState } from "react";

type Props = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

export function CategoryModal({ open, busy, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    setName("");
    setError(null);
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("El nombre es obligatorio.");
      return;
    }
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la categoría");
    }
  }

  return (
    <div
      className={`table-modal-backdrop${entered ? " table-modal-backdrop--visible" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-modal-title"
      onClick={onClose}
    >
      <div
        className={`table-modal panel table-modal--compact${entered ? " table-modal--visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="table-modal__header">
          <h2 className="table-modal__title table-modal__title--solo" id="category-modal-title">
            Nueva categoría
          </h2>
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
          <div className="table-modal__field table-modal__field--full">
            <label htmlFor="category-name">Nombre</label>
            <input
              id="category-name"
              type="text"
              autoFocus
              placeholder="Ej. Entradas"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>

          {error ? <p className="table-modal__error">{error}</p> : null}

          <footer className="table-modal__actions">
            <button type="button" className="btn--secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="table-modal__btn-primary" disabled={busy}>
              {busy ? "Creando…" : "Crear categoría"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
