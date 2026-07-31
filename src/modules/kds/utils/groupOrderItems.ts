import type { Tables } from "../../../types/database.types";

type OrderItem = Tables<"order_items"> & {
  served_quantity: number;
};

type MenuItem = Tables<"menu_items">;

const NO_NOTE_KEY = "__NO_NOTE__";

export type KdsItemVariant = {
  noteKey: string | null;
  label: string;
  quantity: number;
  servedQuantity: number;
  cancelled: boolean;
  items: OrderItem[];
  isNew: boolean;
  isNoNote: boolean;
};

export type KdsItemGroup = {
  menuItemId: string;
  name: string;
  variants: KdsItemVariant[];
  hasPending: boolean;
};

export function normalizeItemNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  return trimmed || null;
}

function noteBucketKey(notes: string | null | undefined): string {
  return normalizeItemNotes(notes) ?? NO_NOTE_KEY;
}

function servedQty(item: OrderItem): number {
  return item.served_quantity ?? (item.status === "served" ? item.quantity : 0);
}

function isFullyServed(item: OrderItem): boolean {
  if (item.status === "cancelled") return false;
  return servedQty(item) >= item.quantity;
}

function isNewVariant(item: OrderItem, siblings: OrderItem[]): boolean {
  const itemTs = new Date(item.created_at).getTime();
  return siblings.some(
    (other) =>
      other.id !== item.id &&
      other.status !== "cancelled" &&
      isFullyServed(other) &&
      new Date(other.created_at).getTime() < itemTs
  );
}

function mergeVariantsByNote(items: OrderItem[]): KdsItemVariant[] {
  const buckets = new Map<string, OrderItem[]>();

  for (const item of items) {
    const key = noteBucketKey(item.notes);
    const arr = buckets.get(key) ?? [];
    arr.push(item);
    buckets.set(key, arr);
  }

  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === NO_NOTE_KEY) return -1;
    if (b === NO_NOTE_KEY) return 1;
    return a.localeCompare(b);
  });

  return keys.map((key) => {
    const bucket = buckets.get(key)!;
    const isNoNote = key === NO_NOTE_KEY;
    const active = bucket.filter((i) => i.status !== "cancelled");
    const quantity = active.reduce((sum, i) => sum + i.quantity, 0);
    const servedQuantity = active.reduce((sum, i) => sum + servedQty(i), 0);
    const cancelled = bucket.length > 0 && active.length === 0;

    return {
      noteKey: isNoNote ? null : key,
      label: isNoNote ? "Sin nota" : key,
      quantity,
      servedQuantity,
      cancelled,
      items: bucket,
      isNew: bucket.some((i) => isNewVariant(i, items)),
      isNoNote,
    };
  });
}

export function groupHasSubLines(group: KdsItemGroup): boolean {
  if (group.variants.length > 1) return true;
  const only = group.variants[0];
  return Boolean(only && !only.isNoNote);
}

export function groupKdsItems(
  cardItems: OrderItem[],
  menuMap: Map<string, MenuItem>
): KdsItemGroup[] {
  const byMenu = new Map<string, OrderItem[]>();

  for (const item of cardItems) {
    const arr = byMenu.get(item.menu_item_id) ?? [];
    arr.push(item);
    byMenu.set(item.menu_item_id, arr);
  }

  const groups: KdsItemGroup[] = [];

  for (const [menuItemId, items] of byMenu) {
    const sorted = [...items].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const variants = mergeVariantsByNote(sorted);

    const hasPending = sorted.some((it) => {
      if (it.status === "cancelled") return false;
      return servedQty(it) < it.quantity;
    });

    groups.push({
      menuItemId,
      name: menuMap.get(menuItemId)?.name ?? "Ítem",
      variants,
      hasPending,
    });
  }

  groups.sort((a, b) => {
    if (a.hasPending !== b.hasPending) return a.hasPending ? -1 : 1;
    const aTs = new Date(a.variants[0]?.items[0]?.created_at ?? 0).getTime();
    const bTs = new Date(b.variants[0]?.items[0]?.created_at ?? 0).getTime();
    return aTs - bTs;
  });

  return groups;
}

function sortGroupsDeliveredLast(groups: KdsItemGroup[]): KdsItemGroup[] {
  return [...groups].sort((a, b) => {
    if (a.hasPending !== b.hasPending) return a.hasPending ? -1 : 1;
    return 0;
  });
}

export type KdsColumnLayout = {
  left: KdsItemGroup[];
  right: KdsItemGroup[];
  twoColumns: boolean;
  compact: boolean;
};

export function splitGroupsForColumns(groups: KdsItemGroup[]): KdsColumnLayout {
  const compact = groups.length > 10;
  const twoColumns = groups.length > 5;

  if (!twoColumns) {
    return {
      left: sortGroupsDeliveredLast(groups),
      right: [],
      twoColumns: false,
      compact,
    };
  }

  const mid = Math.ceil(groups.length / 2);
  return {
    left: sortGroupsDeliveredLast(groups.slice(0, mid)),
    right: sortGroupsDeliveredLast(groups.slice(mid)),
    twoColumns: true,
    compact,
  };
}
