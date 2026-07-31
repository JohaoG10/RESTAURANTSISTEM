import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type RestaurantFormData,
  type RestaurantSettings,
  updateRestaurantProfile,
  uploadRestaurantLogo,
} from "../restaurant-api";
import {
  hasRestaurantFormErrors,
  validateRestaurantForm,
} from "../utils/restaurantFormValidation";
import { RestaurantField } from "./RestaurantField";

type Props = {
  settings: RestaurantSettings;
  onSaved: () => Promise<void>;
};

export function SettingsRestaurantTab({ settings, onSaved }: Props) {
  const [form, setForm] = useState<RestaurantFormData>({
    name: settings.name,
    commercial_name: settings.commercial_name ?? "",
    ruc: settings.ruc,
    address: settings.address ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    logo_url: settings.logo_url,
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.logo_url);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<"name" | "ruc" | "phone", boolean>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const fieldErrors = useMemo(() => validateRestaurantForm(form), [form]);
  const visibleErrors = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fieldErrors).filter(([key]) => touched[key as keyof typeof touched])
      ) as typeof fieldErrors,
    [fieldErrors, touched]
  );
  const formInvalid = hasRestaurantFormErrors(fieldErrors);

  useEffect(() => {
    setForm({
      name: settings.name,
      commercial_name: settings.commercial_name ?? "",
      ruc: settings.ruc,
      address: settings.address ?? "",
      phone: settings.phone ?? "",
      email: settings.email ?? "",
      logo_url: settings.logo_url,
    });
    setLogoPreview(settings.logo_url);
    setPendingLogo(null);
  }, [settings]);

  function onLogoSelected(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen válida (JPG, PNG o WebP).");
      return;
    }
    setError(null);
    setPendingLogo(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched({ name: true, ruc: true, phone: true });
    if (formInvalid) return;

    setBusy(true);
    setError(null);
    setSuccess(false);
    setUploadProgress(0);
    const tick = window.setInterval(() => {
      setUploadProgress((p) => (p >= 90 ? p : p + 12));
    }, 120);
    try {
      let logoUrl = form.logo_url;
      if (pendingLogo) {
        logoUrl = await uploadRestaurantLogo(pendingLogo, settings.id);
        setUploadProgress(100);
      }
      await updateRestaurantProfile(settings.id, { ...form, logo_url: logoUrl });
      setSuccess(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los cambios");
    } finally {
      window.clearInterval(tick);
      setBusy(false);
      setTimeout(() => setUploadProgress(0), 600);
    }
  }

  return (
    <div className="stg-card">
      <header className="stg-card__header stg-card__header--orange">
        <h2>Datos del restaurante</h2>
        <p>Logo, identidad y contacto del negocio</p>
      </header>

      <form className="stg-card__body stg-restaurant-form" onSubmit={handleSubmit}>
        <div className="stg-restaurant-form__layout">
          <div className="stg-restaurant-form__logo-col">
            <button
              type="button"
              className="stg-restaurant-logo"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Cambiar logo del restaurante"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="" className="stg-restaurant-logo__img" />
              ) : (
                <span className="stg-restaurant-logo__initial">
                  {form.name.charAt(0).toUpperCase() || "R"}
                </span>
              )}
              <span className="stg-restaurant-logo__overlay">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Editar</span>
              </span>
              {uploadProgress > 0 ? (
                <span
                  className="stg-restaurant-logo__progress"
                  style={{ width: `${uploadProgress}%` }}
                />
              ) : null}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="stg-dropzone__input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onLogoSelected(file);
              }}
            />
            <p className="stg-restaurant-logo__hint">JPG, PNG o WebP · Máx. 2 MB</p>
          </div>

          <div className="stg-restaurant-form__fields">
            <div className="stg-restaurant-form__grid">
              <RestaurantField
                label="Nombre del restaurante"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                error={visibleErrors.name}
                required
                disabled={busy}
                autoComplete="organization"
              />
              <RestaurantField
                label="RUC"
                value={form.ruc}
                onChange={(e) => setForm((f) => ({ ...f, ruc: e.target.value }))}
                onBlur={() => setTouched((t) => ({ ...t, ruc: true }))}
                error={visibleErrors.ruc}
                required
                disabled={busy}
                inputMode="numeric"
                maxLength={13}
              />
              <RestaurantField
                label="Dirección"
                full
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                disabled={busy}
                autoComplete="street-address"
              />
              <RestaurantField
                label="Teléfono"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                error={visibleErrors.phone}
                required
                disabled={busy}
                inputMode="numeric"
                maxLength={10}
                autoComplete="tel"
              />
              <RestaurantField
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                disabled={busy}
                autoComplete="email"
              />
            </div>
          </div>
        </div>

        {error ? <p className="stg-alert stg-alert--error">{error}</p> : null}
        {success ? (
          <p className="stg-alert stg-alert--success">Cambios guardados correctamente.</p>
        ) : null}

        <button
          type="submit"
          className="stg-restaurant-save"
          disabled={busy || formInvalid}
        >
          {busy ? (
            <>
              <span className="stg-restaurant-save__spinner" aria-hidden />
              Guardando…
            </>
          ) : (
            "Guardar cambios"
          )}
        </button>
      </form>
    </div>
  );
}
