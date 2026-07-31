import { FormEvent, useEffect, useMemo, useState } from "react";
import type { UserRole } from "../../auth/types";
import { PasswordInput } from "./PasswordInput";
import { staffRoleOptions } from "../utils";

export type StaffFormValues = {
  name: string;
  email: string;
  password: string;
  role: Extract<UserRole, "waiter" | "kitchen">;
};

type FieldErrors = Partial<Record<keyof StaffFormValues, string>>;

type Props = {
  open: boolean;
  mode: "create" | "edit";
  title: string;
  submitLabel: string;
  initialValues: StaffFormValues;
  userEmail?: string;
  tempPassword?: string | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (values: StaffFormValues) => Promise<void>;
};

function validate(values: StaffFormValues, mode: "create" | "edit"): FieldErrors {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const password = values.password.trim();

  if (!name) {
    errors.name = "El nombre es obligatorio.";
  } else if (name.length < 2) {
    errors.name = "Mínimo 2 caracteres.";
  }

  if (mode === "create") {
    if (!email) {
      errors.email = "El email es obligatorio.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Ingresa un email válido.";
    }
  }

  if (mode === "create") {
    if (!password) {
      errors.password = "La contraseña temporal es obligatoria.";
    } else if (password.length < 6) {
      errors.password = "Mínimo 6 caracteres.";
    }
  } else if (password && password.length < 6) {
    errors.password = "Si cambias la contraseña, usa al menos 6 caracteres.";
  }

  if (!values.role) {
    errors.role = "Selecciona un rol.";
  }

  return errors;
}

export function StaffUserFormModal({
  open,
  mode,
  title,
  submitLabel,
  initialValues,
  userEmail,
  tempPassword,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<StaffFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof StaffFormValues, boolean>>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(initialValues);
    setFieldErrors({});
    setTouched({});
    setCopied(false);
  }, [open, initialValues]);

  const roleOptions = useMemo(() => staffRoleOptions(), []);

  if (!open) return null;

  function setField<K extends keyof StaffFormValues>(key: K, value: StaffFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const errors = validate(values, mode);
    setFieldErrors(errors);
    setTouched({
      name: true,
      email: true,
      password: true,
      role: true,
    });
    if (Object.keys(errors).length > 0) return;
    await onSubmit({
      ...values,
      name: values.name.trim(),
      email: values.email.trim(),
      password: values.password.trim(),
    });
  }

  function showError(field: keyof StaffFormValues) {
    return touched[field] ? fieldErrors[field] : undefined;
  }

  async function handleCopyPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="usm-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="usm-modal" onClick={(event) => event.stopPropagation()}>
        <header className="usm-header">
          <h3 className="usm-header__title">{title}</h3>
          <button
            type="button"
            className="usm-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <form className="usm-body" onSubmit={(e) => void handleSubmit(e)} noValidate>
          {mode === "edit" && tempPassword ? (
            <div className="usm-temp-password">
              <span className="usm-temp-password__label">Contraseña temporal</span>
              <code className="usm-temp-password__value">{tempPassword}</code>
              <button
                type="button"
                className="usm-temp-password__copy"
                onClick={() => void handleCopyPassword()}
                disabled={busy}
              >
                {copied ? "Copiado ✓" : "Copiar"}
              </button>
            </div>
          ) : null}

          {mode === "edit" && userEmail && !tempPassword ? (
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>{userEmail}</p>
          ) : null}

          <div className={`usm-field${showError("name") ? " usm-field--error" : ""}`}>
            <label htmlFor="staff-name">Nombre completo</label>
            <input
              id="staff-name"
              value={values.name}
              onChange={(e) => setField("name", e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, name: true }))}
              disabled={busy}
              placeholder="Ej. María López"
              autoComplete="name"
            />
            {showError("name") ? (
              <span className="usm-field-error">{showError("name")}</span>
            ) : null}
          </div>

          {mode === "create" ? (
            <div className={`usm-field${showError("email") ? " usm-field--error" : ""}`}>
              <label htmlFor="staff-email">Email</label>
              <input
                id="staff-email"
                type="email"
                value={values.email}
                onChange={(e) => setField("email", e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                disabled={busy}
                placeholder="nombre@restaurante.com"
                autoComplete="off"
              />
              {showError("email") ? (
                <span className="usm-field-error">{showError("email")}</span>
              ) : null}
            </div>
          ) : null}

          <div className={`usm-field${showError("role") ? " usm-field--error" : ""}`}>
            <span className="usm-field__label">Rol</span>
            <div className="usm-role-picker" role="radiogroup" aria-label="Rol del colaborador">
              {roleOptions.map((option) => {
                const selected = values.role === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`usm-role-option usm-role-option--${option.value}${
                      selected ? " usm-role-option--selected" : ""
                    }`}
                    onClick={() => setField("role", option.value)}
                    disabled={busy}
                    aria-pressed={selected}
                  >
                    <span className="usm-role-option__icon" aria-hidden>
                      {option.value === "waiter" ? "🍽️" : "👨‍🍳"}
                    </span>
                    <span className="usm-role-option__label">{option.label}</span>
                  </button>
                );
              })}
            </div>
            {showError("role") ? (
              <span className="usm-field-error">{showError("role")}</span>
            ) : null}
          </div>

          <div className={`usm-field${showError("password") ? " usm-field--error" : ""}`}>
            <label htmlFor="staff-password">
              {mode === "create" ? "Contraseña temporal" : "Nueva contraseña (opcional)"}
            </label>
            <PasswordInput
              id="staff-password"
              value={values.password}
              onChange={(v) => setField("password", v)}
              disabled={busy}
              required={mode === "create"}
              minLength={mode === "create" ? 6 : undefined}
              placeholder={
                mode === "create" ? "Mínimo 6 caracteres" : "Dejar vacío para no cambiar"
              }
              className="usm-password"
            />
            {showError("password") ? (
              <span className="usm-field-error">{showError("password")}</span>
            ) : null}
          </div>

          <footer className="usm-footer">
            <button type="button" className="usm-btn-cancel" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="usm-btn-submit" disabled={busy}>
              {busy ? "Guardando…" : submitLabel}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
