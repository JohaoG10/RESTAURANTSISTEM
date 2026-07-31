import { useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  autoComplete?: string;
  id?: string;
  className?: string;
};

export function PasswordInput({
  value,
  onChange,
  disabled,
  required,
  minLength,
  placeholder,
  autoComplete = "new-password",
  id,
  className = "",
}: Props) {
  const [visible, setVisible] = useState(false);
  const wrapClass =
    className === "usm-password"
      ? "usm-password-wrap"
      : "password-input-wrap";

  const toggleClass =
    className === "usm-password" ? "usm-password-toggle" : "password-input-toggle";

  return (
    <div className={wrapClass}>
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className={toggleClass}
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
