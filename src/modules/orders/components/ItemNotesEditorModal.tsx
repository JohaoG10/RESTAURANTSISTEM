import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatedModal } from "../../../app/components/AnimatedModal";
import {
  buildNoteGroupsFromUnits,
  type MenuItem,
  type OrderItemWithServed,
} from "../api";

type Props = {
  open: boolean;
  item: OrderItemWithServed | null;
  menuItem: MenuItem | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (item: OrderItemWithServed, unitNotes: string[]) => Promise<void>;
};

function groupLabel(notes: string | null): string {
  return notes?.trim() || "Sin nota";
}

export function ItemNotesEditorModal({
  open,
  item,
  menuItem,
  busy,
  onClose,
  onSave,
}: Props) {
  const [unitNotes, setUnitNotes] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !item) return;
    const base = item.notes?.trim() ?? "";
    setUnitNotes(Array.from({ length: item.quantity }, () => base));
  }, [open, item]);

  const previewGroups = useMemo(() => {
    if (!item) return [];
    const served = item.served_quantity ?? 0;
    return buildNoteGroupsFromUnits(unitNotes, served, item.status);
  }, [item, unitNotes]);

  if (!item || !menuItem) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSave(item!, unitNotes.map((n) => n.trim()));
    onClose();
  }

  function updateUnit(index: number, value: string) {
    setUnitNotes((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      overlayClassName="orders-modal-overlay orders-modal-overlay--open"
      cardClassName="orders-modal orders-modal--open orders-modal--wide"
      aria-labelledby="item-notes-modal-title"
    >
      <div className="orders-modal__body orders-modal__body--notes">
        <h2 id="item-notes-modal-title" className="orders-modal__notes-title">
          {menuItem.name}
        </h2>
        <p className="orders-modal__notes-sub">
          Asigna una nota a cada unidad. Las unidades con la misma nota se agrupan
          automáticamente.
        </p>

        <form className="orders-notes-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="orders-notes-form__units">
            {unitNotes.map((note, index) => (
              <label key={index} className="orders-notes-form__unit">
                <span className="orders-notes-form__unit-label">Unidad {index + 1}</span>
                <input
                  type="text"
                  className="orders-modal__note-input"
                  placeholder="Sin nota"
                  value={note}
                  onChange={(e) => updateUnit(index, e.target.value)}
                  disabled={busy}
                />
              </label>
            ))}
          </div>

          <div className="orders-notes-form__preview" aria-live="polite">
            <p className="orders-notes-form__preview-title">Vista agrupada</p>
            <ul className="orders-notes-form__preview-list">
              {previewGroups.map((group) => (
                <li key={group.notes ?? "__none__"}>
                  {groupLabel(group.notes)} — x{group.quantity}
                  {group.served_quantity > 0
                    ? ` (${group.served_quantity}/${group.quantity} entregados)`
                    : ""}
                </li>
              ))}
            </ul>
          </div>

          <button type="submit" className="orders-modal__submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar notas"}
          </button>
        </form>
      </div>
    </AnimatedModal>
  );
}
