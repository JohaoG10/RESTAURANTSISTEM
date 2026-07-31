/** UUID v4 cuando el navegador lo soporta; fallback para Safari iOS antiguo. */
export function generateId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
