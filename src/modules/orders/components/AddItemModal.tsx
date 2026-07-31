import { FormEvent, useEffect, useState } from "react";
import { AnimatedModal } from "../../../app/components/AnimatedModal";
import type { MenuItem } from "../api";

type Props = {
  open: boolean;
  item: MenuItem | null;
  busy?: boolean;
  onClose: () => void;
  onAdd: (item: MenuItem, quantity: number, note: string) => Promise<void>;
};

export function AddItemModal({ open, item, busy, onClose, onAdd }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuantity(1);
    setNote("");
  }, [open, item]);

  if (!item) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (quantity < 1) return;
    await onAdd(item!, quantity, note.trim());
    onClose();
  }

  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      overlayClassName="orders-modal-overlay orders-modal-overlay--open"
      cardClassName="orders-modal orders-modal--open"
      aria-labelledby="orders-modal-title"
    >
      <div className="orders-modal__hero">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="orders-modal__hero-img" />
        ) : (
          <div className="orders-modal__hero-img orders-modal__hero-img--empty" />
        )}
        <div className="orders-modal__hero-overlay">
          <h2 id="orders-modal-title" className="orders-modal__hero-title">
            {item.name}
          </h2>
          <p className="orders-modal__hero-price">${item.price.toFixed(2)}</p>
        </div>
      </div>

      <form className="orders-modal__body" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className="orders-modal__qty">
          <button
            type="button"
            className="orders-modal__qty-btn"
            disabled={busy || quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="Menos"
          >
            −
          </button>
          <span className="orders-modal__qty-value">{quantity}</span>
          <button
            type="button"
            className="orders-modal__qty-btn"
            disabled={busy}
            onClick={() => setQuantity((q) => q + 1)}
            aria-label="Más"
          >
            +
          </button>
        </div>

        <label className="orders-modal__note-field">
          Nota:
          <input
            type="text"
            className="orders-modal__note-input"
            placeholder="Sin cebolla, bien cocido..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
        </label>

        <button type="submit" className="orders-modal__submit" disabled={busy}>
          {busy ? "Agregando…" : "Agregar a comanda"}
        </button>
      </form>
    </AnimatedModal>
  );
}
