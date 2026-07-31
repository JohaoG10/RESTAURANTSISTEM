import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import type { Category, MenuItem } from "../types";
import type { MenuItemStatus } from "../utils";
import {
  hasMenuItemFieldErrors,
  sanitizePriceInput,
  validateMenuItemFields,
  type MenuItemFieldErrors,
} from "../validateMenuItemForm";

export type MenuItemFormValues = {
  name: string;
  price: string;
  description: string;
  category_id: string;
  status: MenuItemStatus;
  imageFile: File | null;
  imagePreview: string | null;
  removeImage: boolean;
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  item: MenuItem | null;
  categories: Category[];
  defaultCategoryId?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (values: MenuItemFormValues) => Promise<void>;
};

const STATUS_CARDS: {
  value: MenuItemStatus;
  label: string;
  icon: string;
  modifier: string;
}[] = [
  { value: "active", label: "Activo", icon: "✓", modifier: "active" },
  { value: "inactive", label: "Inactivo", icon: "✗", modifier: "inactive" },
  { value: "out_of_stock", label: "Agotado", icon: "!", modifier: "out-of-stock" },
];

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function emptyValues(defaultCategoryId = ""): MenuItemFormValues {
  return {
    name: "",
    price: "",
    description: "",
    category_id: defaultCategoryId,
    status: "active",
    imageFile: null,
    imagePreview: null,
    removeImage: false,
  };
}

function UploadIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="15" rx="7" ry="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 11c0-2.8 2.2-5 5-5s5 2.2 5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 4v5M9.5 6.5 12 4l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MenuItemModal({
  open,
  mode,
  item,
  categories,
  defaultCategoryId,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<MenuItemFormValues>(emptyValues());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fieldErrors: MenuItemFieldErrors = useMemo(
    () => validateMenuItemFields(values.name, values.price),
    [values.name, values.price]
  );

  const formInvalid = hasMenuItemFieldErrors(fieldErrors);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      setDragOver(false);
      return;
    }
    setSubmitError(null);
    if (mode === "edit" && item) {
      setValues({
        name: item.name,
        price: String(item.price),
        description: item.description ?? "",
        category_id: item.category_id,
        status: item.status,
        imageFile: null,
        imagePreview: item.image_url,
        removeImage: false,
      });
    } else {
      setValues(emptyValues(defaultCategoryId ?? categories[0]?.id ?? ""));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open, mode, item, defaultCategoryId, categories]);

  useEffect(() => {
    return () => {
      if (values.imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(values.imagePreview);
      }
    };
  }, [values.imagePreview]);

  if (!open) return null;

  function openFilePicker() {
    if (busy) return;
    fileInputRef.current?.click();
  }

  function applyImageFile(file: File | null) {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setSubmitError("Solo se permiten imágenes JPG, PNG o WebP.");
      return;
    }
    handleImageChange(file);
  }

  function handleImageChange(file: File) {
    if (values.imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(values.imagePreview);
    }
    const preview = URL.createObjectURL(file);
    setSubmitError(null);
    setValues((prev) => ({
      ...prev,
      imageFile: file,
      imagePreview: preview,
      removeImage: false,
    }));
  }

  function clearImage(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    if (values.imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(values.imagePreview);
    }
    setValues((prev) => ({
      ...prev,
      imageFile: null,
      imagePreview: null,
      removeImage: true,
    }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    applyImageFile(event.dataTransfer.files[0] ?? null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const errors = validateMenuItemFields(values.name, values.price);
    if (hasMenuItemFieldErrors(errors)) {
      return;
    }

    if (!values.category_id) {
      setSubmitError("Selecciona una categoría.");
      return;
    }

    try {
      await onSubmit({
        ...values,
        name: values.name.trim(),
        price: values.price.trim(),
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo guardar el plato");
    }
  }

  const title = mode === "create" ? "Nuevo plato" : "Editar plato";
  const hasImage = Boolean(values.imagePreview && !values.removeImage);

  return (
    <div
      className={`table-modal-backdrop${entered ? " table-modal-backdrop--visible" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-item-modal-title"
      onClick={onClose}
    >
      <div
        className={`table-modal dish-modal${entered ? " table-modal--visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dish-modal__header">
          <h2 className="dish-modal__title" id="menu-item-modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="dish-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <form className="dish-modal__form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="dish-modal__body">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="dish-modal__file-input"
              onChange={(e) => {
                applyImageFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
              disabled={busy}
              tabIndex={-1}
              aria-hidden
            />

            <div
              className={`dish-modal__upload${dragOver ? " dish-modal__upload--drag" : ""}${hasImage ? " dish-modal__upload--has-image" : ""}`}
              role="button"
              tabIndex={0}
              onClick={openFilePicker}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openFilePicker();
                }
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {hasImage ? (
                <>
                  <img src={values.imagePreview!} alt="" className="dish-modal__upload-preview" />
                  <button
                    type="button"
                    className="dish-modal__upload-remove"
                    onClick={clearImage}
                    disabled={busy}
                  >
                    Quitar imagen
                  </button>
                </>
              ) : (
                <div className="dish-modal__upload-empty">
                  <span className="dish-modal__upload-icon">
                    <UploadIcon />
                  </span>
                  <p className="dish-modal__upload-text">
                    Arrastra o haz click para subir
                  </p>
                  <p className="dish-modal__upload-hint">JPG, PNG o WebP</p>
                </div>
              )}
            </div>

            <div className="dish-modal__grid">
              <div className="dish-modal__field">
                <label htmlFor="dish-form-name">Nombre del plato</label>
                <input
                  id="dish-form-name"
                  name="dish-name"
                  type="text"
                  autoComplete="off"
                  value={values.name}
                  onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={busy}
                  className={fieldErrors.name ? "dish-modal__input--invalid" : undefined}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "dish-form-name-error" : undefined}
                />
                {fieldErrors.name ? (
                  <p className="dish-modal__field-error" id="dish-form-name-error" role="alert">
                    {fieldErrors.name}
                  </p>
                ) : null}
              </div>

              <div className="dish-modal__field">
                <label htmlFor="dish-form-price">Precio</label>
                <div
                  className={`dish-modal__price-wrap${fieldErrors.price ? " dish-modal__price-wrap--invalid" : ""}`}
                >
                  <span className="dish-modal__price-prefix" aria-hidden>
                    $
                  </span>
                  <input
                    id="dish-form-price"
                    name="dish-price"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={values.price}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        price: sanitizePriceInput(e.target.value),
                      }))
                    }
                    disabled={busy}
                    aria-invalid={Boolean(fieldErrors.price)}
                    aria-describedby={fieldErrors.price ? "dish-form-price-error" : undefined}
                  />
                </div>
                {fieldErrors.price ? (
                  <p className="dish-modal__field-error" id="dish-form-price-error" role="alert">
                    {fieldErrors.price}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="dish-modal__field">
              <label htmlFor="dish-form-description">Descripción</label>
              <textarea
                id="dish-form-description"
                name="dish-description"
                rows={3}
                placeholder="Ingredientes, alérgenos…"
                value={values.description}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, description: e.target.value }))
                }
                disabled={busy}
              />
            </div>

            <div className="dish-modal__field">
              <label htmlFor="dish-form-category">Categoría</label>
              <select
                id="dish-form-category"
                name="dish-category"
                value={values.category_id}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, category_id: e.target.value }))
                }
                disabled={busy}
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <section className="dish-modal__status-section" aria-labelledby="dish-status-heading">
              <h3 className="dish-modal__status-heading" id="dish-status-heading">
                Estado del plato
              </h3>
              <div
                className="dish-modal__status-cards"
                role="radiogroup"
                aria-labelledby="dish-status-heading"
              >
                {STATUS_CARDS.map((card) => (
                  <button
                    key={card.value}
                    type="button"
                    role="radio"
                    aria-checked={values.status === card.value}
                    className={`dish-modal__status-card dish-modal__status-card--${card.modifier}${
                      values.status === card.value ? " dish-modal__status-card--selected" : ""
                    }`}
                    onClick={() => setValues((prev) => ({ ...prev, status: card.value }))}
                    disabled={busy}
                  >
                    <span className="dish-modal__status-icon" aria-hidden>
                      {card.icon}
                    </span>
                    <span className="dish-modal__status-label">{card.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {submitError ? <p className="dish-modal__error">{submitError}</p> : null}
          </div>

          <footer className="dish-modal__footer">
            <button type="button" className="btn--secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button
              type="submit"
              className="dish-modal__submit"
              disabled={busy || formInvalid}
            >
              {busy ? "Guardando…" : mode === "create" ? "Crear plato" : "Guardar cambios"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
