import type { MenuItem } from "./types";

export type MenuItemStatus = MenuItem["status"];

export const MENU_ITEM_STATUS_OPTIONS: {
  value: MenuItemStatus;
  label: string;
  badgeClass: string;
}[] = [
  { value: "active", label: "Activo", badgeClass: "menu-badge--active" },
  { value: "inactive", label: "Inactivo", badgeClass: "menu-badge--inactive" },
  { value: "out_of_stock", label: "Agotado", badgeClass: "menu-badge--out-of-stock" },
];

export function menuItemStatusLabel(status: MenuItemStatus) {
  return MENU_ITEM_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function menuItemStatusBadgeClass(status: MenuItemStatus) {
  return (
    MENU_ITEM_STATUS_OPTIONS.find((o) => o.value === status)?.badgeClass ?? "menu-badge--inactive"
  );
}

export function menuItemCardStatusClass(status: MenuItemStatus) {
  if (status === "out_of_stock") return "menu-dish-card--out-of-stock";
  return `menu-dish-card--${status}`;
}

export function formatMenuPrice(price: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(price);
}
