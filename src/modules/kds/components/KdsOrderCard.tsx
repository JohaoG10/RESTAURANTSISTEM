import { motion } from "framer-motion";
import { useMemo } from "react";
import type { Tables } from "../../../types/database.types";
import {
  groupKdsItems,
  splitGroupsForColumns,
  type KdsItemGroup,
  type KdsItemVariant,
} from "../utils/groupOrderItems";

type OrderItem = Tables<"order_items"> & {
  served_quantity: number;
  modified_at?: string | null;
  modified_seen_at?: string | null;
  cancelled_at?: string | null;
};
type Order = Tables<"orders">;
type MenuItem = Tables<"menu_items">;
type RestaurantTable = Tables<"restaurant_tables">;
type Urgency = "fresh" | "warm" | "late";

type Props = {
  order: Order;
  cardItems: OrderItem[];
  table: RestaurantTable | undefined;
  menuMap: Map<string, MenuItem>;
  urgency: Urgency;
  timerNow: number;
  isNew: boolean;
  exiting: boolean;
  elapsedLabel: (createdAt: string, nowMs: number) => string;
};

const CARD_ENTER = {
  initial: { y: -36, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.55, ease: "easeOut" } },
  transition: { type: "spring", stiffness: 340, damping: 28 },
};

function remainingLabel(pending: number): string | null {
  if (pending <= 0) return null;
  if (pending === 1) return "falta 1";
  return `faltan ${pending}`;
}

function KdsItemRow({
  name,
  variant,
  showDivider,
}: {
  name: string;
  variant: KdsItemVariant;
  showDivider: boolean;
}) {
  const { label, quantity, servedQuantity, isNew, isNoNote, cancelled } = variant;
  const pending = Math.max(0, quantity - servedQuantity);
  const served = !cancelled && pending === 0 && quantity > 0;
  const partial = !cancelled && servedQuantity > 0 && pending > 0;
  const noteText = !isNoNote && label !== "Estándar" ? label : null;

  return (
    <div
      className={[
        "kds-item",
        served ? "kds-item--served" : "",
        partial ? "kds-item--partial" : "",
        cancelled ? "kds-item--cancelled" : "",
        showDivider ? "kds-item--divider" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="kds-item__row">
        <span className="kds-item__bullet" aria-hidden>
          •
        </span>

        <div className="kds-item__title-qty">
          <span className="kds-item__name">{name}</span>
          {!cancelled && quantity > 0 ? (
            <span className="kds-item__qty">x{quantity}</span>
          ) : null}
        </div>

        <div className="kds-item__trail">
          {cancelled ? (
            <>
              <span className="kds-item__sep" aria-hidden>
                |
              </span>
              <span className="kds-item__cancelled-inline">Cancelado</span>
            </>
          ) : served ? (
            <span className="kds-item__delivered-badge">✓ Entregado</span>
          ) : partial ? (
            <>
              <span className="kds-item__sep" aria-hidden>
                |
              </span>
              <span className="kds-item__remaining">{remainingLabel(pending)}</span>
            </>
          ) : null}

          {isNew && !served && !cancelled ? (
            <span className="kds-item__new">NUEVO</span>
          ) : null}
        </div>
      </div>

      {noteText ? (
        <div className="kds-item__note-line">
          <span className="kds-item__note-icon" aria-hidden>
            📝
          </span>
          <span className="kds-item__note-text">{noteText}</span>
        </div>
      ) : null}
    </div>
  );
}

function KdsItemColumn({ groups }: { groups: KdsItemGroup[] }) {
  const rows = groups.flatMap((group) =>
    group.variants.map((variant) => ({ group, variant }))
  );

  return (
    <div className="kds-card__col">
      {rows.map(({ group, variant }, index) => (
        <KdsItemRow
          key={`${group.menuItemId}-${variant.noteKey ?? "no-note"}-${variant.items[0]?.id ?? index}`}
          name={group.name}
          variant={variant}
          showDivider={index < rows.length - 1}
        />
      ))}
    </div>
  );
}

export function KdsOrderCard({
  order,
  cardItems,
  table,
  menuMap,
  urgency,
  timerNow,
  isNew,
  exiting,
  elapsedLabel,
}: Props) {
  const isTakeaway = order.order_type === "takeaway";
  const orderNum = isTakeaway
    ? `#${(order.takeaway_number ?? 0).toString().padStart(3, "0")}`
    : null;

  const groups = useMemo(() => groupKdsItems(cardItems, menuMap), [cardItems, menuMap]);
  const { left, right, twoColumns, compact } = useMemo(
    () => splitGroupsForColumns(groups),
    [groups]
  );

  const headClass = isTakeaway
    ? "kds-card__head kds-card__head--takeaway"
    : `kds-card__head kds-card__head--${urgency}`;

  const cardClass = [
    "kds-card",
    isNew ? "kds-card--new" : "",
    exiting ? "kds-card--exiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const bodyClass = [
    "kds-card__body",
    twoColumns ? "kds-card__body--two-cols" : "",
    compact ? "kds-card__body--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.article
      layout
      className={cardClass}
      initial={CARD_ENTER.initial}
      animate={exiting ? { opacity: 0, scale: 0.97 } : CARD_ENTER.animate}
      exit={CARD_ENTER.exit}
      transition={exiting ? { duration: 0.55, ease: "easeOut" } : CARD_ENTER.transition}
    >
      <div className={headClass}>
        <div className="kds-card__head-info">
          {isTakeaway ? (
            <>
              <span className="kds-card__takeaway-badge">LLEVAR {orderNum}</span>
              {order.customer_name ? (
                <span className="kds-card__customer">{order.customer_name}</span>
              ) : null}
            </>
          ) : (
            <div className="kds-card__mesa">
              <span className="kds-card__mesa-label">MESA</span>
              <span className="kds-card__mesa-num">{table?.number ?? "?"}</span>
            </div>
          )}
        </div>
        <div className="kds-card__timer">
          <span className="kds-card__timer-val">
            {elapsedLabel(order.created_at, timerNow)}
          </span>
        </div>
      </div>

      <div className={bodyClass}>
        {twoColumns ? (
          <>
            <KdsItemColumn groups={left} />
            <KdsItemColumn groups={right} />
          </>
        ) : (
          <KdsItemColumn groups={left} />
        )}
      </div>
    </motion.article>
  );
}
