import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
  full?: boolean;
  error?: string;
};

export function PremiumField({ label, icon, full, error, className = "", value, ...rest }: Props) {
  const strValue = value !== undefined && value !== null ? String(value) : "";
  const hasValue = strValue !== "";

  return (
    <div
      className={`stg-float-field${full ? " stg-float-field--full" : ""}${!icon ? " stg-float-field--no-icon" : ""}${hasValue ? " has-value" : ""}${error ? " stg-float-field--error" : ""} ${className}`.trim()}
    >
      <label className="stg-float-field__wrap">
        {icon ? <span className="stg-float-field__icon" aria-hidden>{icon}</span> : null}
        <input
          className="stg-float-field__input"
          value={value}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        <span className="stg-float-field__label">{label}</span>
      </label>
      {error ? <span className="stg-float-field__error" role="alert">{error}</span> : null}
    </div>
  );
}
