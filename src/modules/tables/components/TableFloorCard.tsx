import type { KeyboardEvent, PointerEvent } from "react";
import type { RestaurantTable } from "../api";

type Props = {
  table: RestaurantTable;
  active: boolean;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

export function TableFloorCard({
  table,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
}: Props) {
  return (
    <div
      data-table-id={table.id}
      role="button"
      tabIndex={0}
      className={`table-card table-card--${table.status} table-card--shape-${table.shape}${active ? " table-card--active" : ""}`}
      style={{ left: table.position_x, top: table.position_y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <span className="table-card__chair table-card__chair--top" aria-hidden />
      <span className="table-card__chair table-card__chair--right" aria-hidden />
      <span className="table-card__chair table-card__chair--bottom" aria-hidden />
      <span className="table-card__chair table-card__chair--left" aria-hidden />

      <div
        className={`table-card__surface table-card__surface--${table.shape}`}
      >
        {table.status === "occupied" ? (
          <span className="table-card__pulse" aria-hidden title="Mesa ocupada" />
        ) : null}
        <span className="table-card__number">{table.number}</span>
        <span className="table-card__capacity">{table.capacity} pers.</span>
      </div>
    </div>
  );
}
