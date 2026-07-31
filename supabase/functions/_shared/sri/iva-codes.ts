/** Mapeo tarifa IVA → codigoPorcentaje SRI (tabla oficial). */
export function mapIvaCodigoPorcentaje(rate: number): string {
  const rounded = Math.round(rate * 100) / 100;
  if (rounded === 0) return "0";
  if (rounded === 12) return "2";
  if (rounded === 15) return "4";
  if (rounded === 5) return "5";
  // Fallback: usar tarifa como texto en tarifa; codigo 4 es el vigente en 2024+
  return "4";
}
