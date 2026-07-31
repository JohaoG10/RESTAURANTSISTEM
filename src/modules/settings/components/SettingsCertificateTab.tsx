import { FormEvent, useState, type DragEvent } from "react";
import {
  formatCertExpiry,
  getCertificateStatus,
  type RestaurantSettings,
  storeSriCertificate,
} from "../restaurant-api";
import { passwordStrengthScore, strengthLabel } from "../utils/passwordStrength";
import { PremiumSaveButton } from "./PremiumSaveButton";
import { PasswordInput } from "./PasswordInput";

type Props = {
  settings: RestaurantSettings;
  onSaved: () => Promise<void>;
};

export function SettingsCertificateTab({ settings, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const status = getCertificateStatus(settings);
  const strength = passwordStrengthScore(password);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Selecciona un archivo .p12");
      return;
    }
    if (!password) {
      setError("Ingresa la contraseña del certificado");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      await storeSriCertificate(file, password);
      setFile(null);
      setPassword("");
      setShowReplace(false);
      setSuccess(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el certificado");
    } finally {
      setBusy(false);
    }
  }

  function onFileDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      setError(null);
    }
  }

  return (
    <div className="stg-card">
      <header className="stg-card__header stg-card__header--dark">
        <span className="stg-card__header-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </span>
        <div>
          <h2>Certificado digital</h2>
          <p>Firma electrónica para facturación SRI</p>
        </div>
      </header>

      <div className="stg-card__body">
        <div
          className={`stg-cert-hero stg-cert-hero--${status === "active" ? "active" : status === "expired" ? "expired" : "none"}`}
        >
          <span className="stg-cert-hero__icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <div>
            <strong>
              {status === "active" ? "Certificado activo" : status === "expired" ? "Certificado vencido" : "Sin certificado"}
            </strong>
            {settings.sri_cert_filename ? (
              <p>
                {settings.sri_cert_filename} · Vence {formatCertExpiry(settings.sri_cert_expires_at)}
              </p>
            ) : (
              <p>Sube tu archivo .p12 para habilitar la facturación electrónica</p>
            )}
          </div>
          {settings.sri_cert_storage_path && !showReplace ? (
            <button type="button" className="stg-btn-ghost" onClick={() => setShowReplace(true)} disabled={busy}>
              Reemplazar
            </button>
          ) : null}
        </div>

        {(!settings.sri_cert_storage_path || showReplace) && (
          <form onSubmit={handleSubmit} className="stg-cert-form">
            <div
              className={`stg-cert-drop${dragOver ? " stg-cert-drop--over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onFileDrop}
              onClick={() => document.getElementById("cert-file")?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") document.getElementById("cert-file")?.click();
              }}
            >
              <input
                id="cert-file"
                type="file"
                accept=".p12,application/x-pkcs12,application/pkcs12"
                className="stg-dropzone__input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFile(f);
                    setError(null);
                  }
                }}
              />
              <span className="stg-cert-drop__lock" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 118 0v4" />
                </svg>
              </span>
              <strong>Arrastra tu certificado .p12</strong>
              <span>o haz clic para seleccionar el archivo</span>
            </div>
            {file ? <p className="stg-file-name">{file.name}</p> : null}

            <div className="stg-password-block">
              <label className="stg-password-block__label">Contraseña del certificado</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                disabled={busy}
                required
                placeholder="Contraseña del archivo .p12"
                className="stg-password-input"
              />
              {password ? (
                <div className="stg-strength">
                  <div className="stg-strength__bars">
                    {[1, 2, 3, 4].map((level) => (
                      <span
                        key={level}
                        className={`stg-strength__bar${strength >= level ? " stg-strength__bar--on" : ""}`}
                        data-level={level}
                      />
                    ))}
                  </div>
                  <span className="stg-strength__label">{strengthLabel(strength)}</span>
                </div>
              ) : null}
            </div>

            <div className="stg-info-card">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <p>
                El certificado se almacena de forma segura y nunca es accesible desde el frontend.
              </p>
            </div>

            {error ? <p className="stg-alert stg-alert--error">{error}</p> : null}
            {success ? <p className="stg-alert stg-alert--success">Certificado guardado correctamente.</p> : null}

            <div className="stg-form__actions">
              {showReplace ? (
                <button
                  type="button"
                  className="stg-btn-ghost"
                  onClick={() => {
                    setShowReplace(false);
                    setFile(null);
                    setPassword("");
                  }}
                  disabled={busy}
                >
                  Cancelar
                </button>
              ) : null}
              <PremiumSaveButton busy={busy} label="Guardar certificado" disabled={!file} />
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
