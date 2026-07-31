/** Fecha local en formato ISO (YYYY-MM-DD) para reportes y dashboard. */
export function todayIsoDate() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** Suma o resta días a una fecha ISO (YYYY-MM-DD). */
export function addIsoDays(iso: string, delta: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** Subtítulo legible para el selector de fecha del reporte. */
export function formatReportDateSubtitle(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-EC", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
