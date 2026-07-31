type Props = {
  message: string;
  variant?: "success" | "error";
};

export function AppToast({ message, variant = "success" }: Props) {
  return (
    <div
      className={`app-toast app-toast--${variant}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
