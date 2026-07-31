import type { Tables } from "../../types/database.types";

export type TableStatus = Tables<"restaurant_tables">["status"];
export type TableShape = "square" | "rectangle" | "round";

export const TABLE_STATUS_OPTIONS: {
  value: TableStatus;
  label: string;
  color: string;
}[] = [
  { value: "available", label: "Disponible", color: "#2D9B6F" },
  { value: "occupied", label: "Ocupada", color: "#DC3545" },
  { value: "reserved", label: "Reservada", color: "#F59E0B" },
];

export const TABLE_SHAPE_OPTIONS: {
  value: TableShape;
  label: string;
}[] = [
  { value: "square", label: "Cuadrada" },
  { value: "rectangle", label: "Rectangular" },
  { value: "round", label: "Redonda" },
];

export function tableStatusLabel(status: TableStatus) {
  return TABLE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function tableShapeLabel(shape: TableShape) {
  return TABLE_SHAPE_OPTIONS.find((option) => option.value === shape)?.label ?? shape;
}

/** Normaliza valores legacy (p. ej. rectangular → rectangle). */
export function normalizeTableShape(raw: string | null | undefined): TableShape {
  if (raw === "rectangle" || raw === "rectangular") return "rectangle";
  if (raw === "round") return "round";
  if (raw === "square") return "square";
  return "square";
}
