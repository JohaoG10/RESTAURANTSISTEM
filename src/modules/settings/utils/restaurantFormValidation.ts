import type { RestaurantFormData } from "../restaurant-api";

export type RestaurantFieldErrors = Partial<Record<"name" | "ruc" | "phone", string>>;

export function validateRestaurantForm(form: RestaurantFormData): RestaurantFieldErrors {
  const errors: RestaurantFieldErrors = {};

  const name = form.name.trim();
  if (name.length < 3) {
    errors.name = "El nombre debe tener al menos 3 caracteres.";
  }

  const rucDigits = form.ruc.replace(/\D/g, "");
  if (rucDigits.length !== 13) {
    errors.ruc = "El RUC debe tener exactamente 13 dígitos.";
  }

  const phoneDigits = form.phone.replace(/\D/g, "");
  if (phoneDigits.length !== 10) {
    errors.phone = "El teléfono debe tener 10 dígitos (Ecuador).";
  }

  return errors;
}

export function hasRestaurantFormErrors(errors: RestaurantFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
