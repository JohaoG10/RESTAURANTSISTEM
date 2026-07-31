export type MenuItemFieldErrors = {
  name?: string;
  price?: string;
};

export function sanitizePriceInput(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

export function validateMenuItemFields(
  name: string,
  price: string
): MenuItemFieldErrors {
  const errors: MenuItemFieldErrors = {};
  const nameTrim = name.trim();

  if (!nameTrim) {
    errors.name = "El nombre es obligatorio.";
  } else if (nameTrim.length < 2) {
    errors.name = "Mínimo 2 caracteres.";
  }

  const priceTrim = price.trim();
  if (!priceTrim) {
    errors.price = "El precio es obligatorio.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(priceTrim)) {
    errors.price = "Solo números positivos (máx. 2 decimales).";
  } else {
    const parsed = Number(priceTrim);
    if (!Number.isFinite(parsed) || parsed < 0.01) {
      errors.price = "El precio mínimo es $0.01.";
    }
  }

  return errors;
}

export function hasMenuItemFieldErrors(errors: MenuItemFieldErrors) {
  return Boolean(errors.name || errors.price);
}
