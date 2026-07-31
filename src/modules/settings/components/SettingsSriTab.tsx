import { FormEvent, useEffect, useState } from "react";
import {
  type RestaurantSettings,
  type SriFormData,
  updateSriSettings,
} from "../restaurant-api";
import { PremiumField } from "./PremiumField";
import { PremiumSaveButton } from "./PremiumSaveButton";

type Props = {
  settings: RestaurantSettings;
  onSaved: () => Promise<void>;
};

export function SettingsSriTab({ settings, onSaved }: Props) {
  const [form, setForm] = useState<SriFormData>({
    sri_environment: settings.sri_environment,
    sri_establishment_code: settings.sri_establishment_code,
    sri_emission_point_code: settings.sri_emission_point_code,
    sri_obligado_contabilidad: settings.sri_obligado_contabilidad === "SI",
    current_sequential: settings.current_sequential,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setForm({
      sri_environment: settings.sri_environment,
      sri_establishment_code: settings.sri_establishment_code,
      sri_emission_point_code: settings.sri_emission_point_code,
      sri_obligado_contabilidad: settings.sri_obligado_contabilidad === "SI",
      current_sequential: settings.current_sequential,
    });
  }, [settings]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      await updateSriSettings(settings.id, form);
      setSuccess(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la configuración");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stg-card">
      <header className="stg-card__header stg-card__header--dark">
        <h2>Facturación SRI</h2>
        <p>Ambiente, establecimiento y secuenciales</p>
      </header>

      <form className="stg-card__body" onSubmit={handleSubmit}>
        <fieldset className="stg-env-premium">
          <legend>Ambiente de emisión</legend>
          <div className="stg-env-premium__grid">
            <button
              type="button"
              className={`stg-env-premium__card stg-env-premium__card--test${
                form.sri_environment === "test" ? " stg-env-premium__card--selected" : ""
              }`}
              onClick={() => setForm((f) => ({ ...f, sri_environment: "test" }))}
              disabled={busy}
            >
              {form.sri_environment === "test" ? (
                <span className="stg-env-premium__check" aria-hidden>✓</span>
              ) : null}
              <span className="stg-env-premium__icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 3h6v4H9zM4 10h16v11H4z" />
                </svg>
              </span>
              <strong>Pruebas</strong>
              <span className="stg-env-premium__url">celcer.sri.gob.ec</span>
              <p>Validación sin valor fiscal</p>
            </button>
            <button
              type="button"
              className={`stg-env-premium__card stg-env-premium__card--prod${
                form.sri_environment === "production" ? " stg-env-premium__card--selected" : ""
              }`}
              onClick={() => setForm((f) => ({ ...f, sri_environment: "production" }))}
              disabled={busy}
            >
              {form.sri_environment === "production" ? (
                <span className="stg-env-premium__check" aria-hidden>✓</span>
              ) : null}
              <span className="stg-env-premium__icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <path d="M22 4L12 14.01l-3-3" />
                </svg>
              </span>
              <strong>Producción</strong>
              <span className="stg-env-premium__url">cel.sri.gob.ec</span>
              <p>Comprobantes con validez tributaria</p>
            </button>
          </div>
        </fieldset>

        <div className="stg-seq-badge">
          <span className="stg-seq-badge__label">Secuencial actual</span>
          <strong className="stg-seq-badge__value">
            {String(form.current_sequential).padStart(9, "0")}
          </strong>
        </div>

        <div className="stg-form__grid stg-form__grid--3">
          <PremiumField
            label="Código establecimiento"
            value={form.sri_establishment_code}
            onChange={(e) =>
              setForm((f) => ({ ...f, sri_establishment_code: e.target.value }))
            }
            maxLength={3}
            required
            disabled={busy}
          />
          <PremiumField
            label="Punto de emisión"
            value={form.sri_emission_point_code}
            onChange={(e) =>
              setForm((f) => ({ ...f, sri_emission_point_code: e.target.value }))
            }
            maxLength={3}
            required
            disabled={busy}
          />
          <PremiumField
            label="Ajustar secuencial"
            type="number"
            min={0}
            value={form.current_sequential}
            onChange={(e) =>
              setForm((f) => ({ ...f, current_sequential: Number(e.target.value) }))
            }
            disabled={busy}
          />
        </div>

        <label className="stg-toggle stg-toggle--premium">
          <input
            type="checkbox"
            checked={form.sri_obligado_contabilidad}
            onChange={(e) =>
              setForm((f) => ({ ...f, sri_obligado_contabilidad: e.target.checked }))
            }
            disabled={busy}
          />
          <span className="stg-toggle__track" aria-hidden />
          <span className="stg-toggle__label">Obligado a llevar contabilidad</span>
        </label>

        {error ? <p className="stg-alert stg-alert--error">{error}</p> : null}
        {success ? <p className="stg-alert stg-alert--success">Configuración SRI guardada.</p> : null}

        <div className="stg-form__actions">
          <PremiumSaveButton busy={busy} label="Guardar configuración SRI" />
        </div>
      </form>
    </div>
  );
}
