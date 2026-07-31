import { useNavigate } from "react-router-dom";
import { formatMoney } from "../utils";

export type PostPaymentInvoiceContext = {
  billId: string;
  orderLabel: string;
  amountPaid: number;
};

type Props = {
  context: PostPaymentInvoiceContext | null;
  onClose: () => void;
  onDismissWithoutInvoice?: (billId: string) => void | Promise<void>;
};

export function PostPaymentInvoiceModal({
  context,
  onClose,
  onDismissWithoutInvoice,
}: Props) {
  const navigate = useNavigate();

  if (!context) return null;

  function handleEmitInvoice() {
    const billId = context!.billId;
    onClose();
    navigate(`/billing/invoice/${billId}`);
  }

  async function handleDismissWithoutInvoice() {
    const billId = context!.billId;
    onClose();
    await onDismissWithoutInvoice?.(billId);
  }

  return (
    <div
      className="bl-postpay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bl-postpay-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bl-postpay-modal">
        <div className="bl-postpay-confirm">
          <div className="bl-postpay-confirm__icon" aria-hidden>
            ✓
          </div>
          <h2 id="bl-postpay-title" className="bl-postpay-confirm__title">
            ¡Pago registrado!
          </h2>
          <p className="bl-postpay-confirm__subtitle">
            {context.orderLabel} — {formatMoney(context.amountPaid)} pagado
          </p>
          <p className="bl-postpay-confirm__question">¿Desea emitir factura?</p>
          <div className="bl-postpay-confirm__actions">
            <button
              type="button"
              className="bl-btn-invoice bl-postpay-confirm__btn"
              onClick={handleEmitInvoice}
            >
              Emitir factura
            </button>
            <button
              type="button"
              className="bl-btn-consumer bl-postpay-confirm__btn"
              onClick={() => void handleDismissWithoutInvoice()}
            >
              Finalizar sin factura
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
