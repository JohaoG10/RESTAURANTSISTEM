import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  full?: boolean;
};

export function RestaurantField({ label, error, full, className = "", id, ...rest }: Props) {
  const fieldId = id ?? `stg-field-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div
      className={`stg-field${full ? " stg-field--full" : ""}${error ? " stg-field--error" : ""} ${className}`.trim()}
    >
      <label htmlFor={fieldId} className="stg-field__label">
        {label}
        {rest.required ? <span className="stg-field__req" aria-hidden> *</span> : null}
      </label>
      <input
        id={fieldId}
        className="stg-field__input"
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? (
        <span className="stg-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
