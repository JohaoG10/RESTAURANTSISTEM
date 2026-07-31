export type CreateTableFieldErrors = {
  number?: string;
  capacity?: string;
};

export function validateCreateTableFields(
  number: string,
  capacity: string,
  existingNumbers: number[]
): CreateTableFieldErrors {
  const errors: CreateTableFieldErrors = {};
  const numberTrim = number.trim();
  const capacityTrim = capacity.trim();

  if (!numberTrim) {
    errors.number = "El número de mesa es obligatorio.";
  } else if (!/^\d+$/.test(numberTrim)) {
    errors.number = "Solo se permiten números.";
  } else {
    const parsed = Number(numberTrim);
    if (parsed < 1) {
      errors.number = "El número debe ser mayor a 0.";
    } else if (existingNumbers.includes(parsed)) {
      errors.number = "Ya existe una mesa con este número.";
    }
  }

  if (!capacityTrim) {
    errors.capacity = "La capacidad es obligatoria.";
  } else if (!/^\d+$/.test(capacityTrim)) {
    errors.capacity = "Solo se permiten números.";
  } else {
    const parsed = Number(capacityTrim);
    if (parsed < 1) {
      errors.capacity = "La capacidad mínima es 1 persona.";
    } else if (parsed > 20) {
      errors.capacity = "La capacidad máxima es 20 personas.";
    }
  }

  return errors;
}

export function hasCreateTableFieldErrors(errors: CreateTableFieldErrors) {
  return Boolean(errors.number || errors.capacity);
}
