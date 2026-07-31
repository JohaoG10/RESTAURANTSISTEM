type Props = {
  busy: boolean;
  label: string;
  busyLabel?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
};

export function PremiumSaveButton({
  busy,
  label,
  busyLabel = "Guardando…",
  type = "submit",
  disabled,
  onClick,
}: Props) {
  return (
    <button
      type={type}
      className="stg-save-btn"
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? (
        <span className="stg-save-btn__spinner" aria-hidden />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
      <span>{busy ? busyLabel : label}</span>
    </button>
  );
}
