const CEDULA_COEFFICIENTS = [2, 1, 2, 1, 2, 1, 2, 1, 2] as const;

/** Provincias 01–24 incluye Santo Domingo (23, 2007). */
export const CEDULA_PROVINCE_MIN = 1;
export const CEDULA_PROVINCE_MAX = 24;
/** Ecuatorianos en el exterior / consulados (Res. Registro Civil 140). */
export const CEDULA_PROVINCE_EXTERIOR = 30;

export function normalizeIdentification(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCedulaProvinceCode(province: number): boolean {
  return (
    (province >= CEDULA_PROVINCE_MIN && province <= CEDULA_PROVINCE_MAX) ||
    province === CEDULA_PROVINCE_EXTERIOR
  );
}

export function computeCedulaCheckDigit(firstNineDigits: string): number {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let value = Number(firstNineDigits[i]) * CEDULA_COEFFICIENTS[i];
    if (value >= 10) value -= 9;
    sum += value;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Cédula (10 dígitos) — solo módulo 10, nunca reglas de RUC.
 * Provincias 01–24 y 30; tercer dígito 0–6 (omitido en provincia 30).
 */
export function validateCedulaModulo10(cedula: string): boolean {
  const digits = normalizeIdentification(cedula);
  if (digits.length !== 10 || !/^\d{10}$/.test(digits)) return false;

  const provincia = Number(digits.slice(0, 2));
  if (!isValidCedulaProvinceCode(provincia)) return false;

  if (provincia !== CEDULA_PROVINCE_EXTERIOR) {
    const tercerDigito = Number(digits[2]);
    if (tercerDigito > 6) return false;
  }

  return computeCedulaCheckDigit(digits.slice(0, 9)) === Number(digits[9]);
}

export function validateCedula(cedula: string): boolean {
  return validateCedulaModulo10(cedula);
}

export function detectIdType(value: string): "ruc" | "cedula" | "invalid" {
  const digits = normalizeIdentification(value);
  if (digits.length === 13) return "ruc";
  if (digits.length === 10) return "cedula";
  return "invalid";
}

export function validateNaturalPersonRuc(ruc: string): boolean {
  const digits = normalizeIdentification(ruc);
  if (digits.length !== 13 || digits.slice(10) !== "001") return false;
  const tercerDigitoRuc = Number(digits[2]);
  if (tercerDigitoRuc > 5) return false;
  return validateCedulaModulo10(digits.slice(0, 10));
}

export function validateRucFormat(ruc: string): boolean {
  const digits = normalizeIdentification(ruc);
  if (digits.length !== 13 || !/^\d{13}$/.test(digits)) return false;

  const tercerDigito = digits[2];
  if (tercerDigito >= "0" && tercerDigito <= "5") {
    return validateNaturalPersonRuc(digits);
  }
  if (tercerDigito === "6" || tercerDigito === "9") {
    return digits.slice(10) === "001";
  }
  return false;
}

export function isValidIdentification(value: string): boolean {
  const digits = normalizeIdentification(value);
  if (digits.length === 10) return validateCedulaModulo10(digits);
  if (digits.length === 13) return validateRucFormat(digits);
  return false;
}
