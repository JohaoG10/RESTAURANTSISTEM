import { AnimatedModal } from "../../../app/components/AnimatedModal";

export type ConfirmVariant = "danger" | "success";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancelar",
  variant = "danger",
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <AnimatedModal
      open={open}
      onClose={busy ? undefined : onCancel}
      closeOnOverlay={!busy}
      overlayClassName="orders-confirm-backdrop"
      cardClassName="orders-confirm-modal"
      role="alertdialog"
      aria-labelledby="orders-confirm-title"
      aria-describedby="orders-confirm-message"
    >
      <h2 id="orders-confirm-title" className="orders-confirm-modal__title">
        {title}
      </h2>
      <p id="orders-confirm-message" className="orders-confirm-modal__message">
        {message}
      </p>
      <div className="orders-confirm-modal__actions">
        <button
          type="button"
          className="orders-confirm-modal__cancel"
          disabled={busy}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`orders-confirm-modal__confirm orders-confirm-modal__confirm--${variant}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Procesando…" : confirmLabel}
        </button>
      </div>
    </AnimatedModal>
  );
}
