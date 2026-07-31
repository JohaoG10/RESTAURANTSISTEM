import { Link } from "react-router-dom";
import type { FloorTableTile, TableStatus } from "../dashboard/api";
import { tableStatusLabel } from "../dashboard/api";

const STATUS_META: Record<TableStatus, { color: string; className: string }> = {
  available: { color: "#2D9B6F", className: "dashboard-floor-tile--available" },
  occupied: { color: "#DC3545", className: "dashboard-floor-tile--occupied" },
  reserved: { color: "#F59E0B", className: "dashboard-floor-tile--reserved" },
};

const LEGEND = [
  { status: "available" as const, label: "Disponible", color: "#2D9B6F" },
  { status: "occupied" as const, label: "Ocupada", color: "#DC3545" },
  { status: "reserved" as const, label: "Reservada", color: "#F59E0B" },
];

function FloorTableMini({ table, index }: { table: FloorTableTile; index: number }) {
  const meta = STATUS_META[table.status];
  const statusLabel = tableStatusLabel(table.status);
  const ariaLabel = `Mesa ${table.number}, ${statusLabel}${
    table.activeOrdersCount > 0 ? `, ${table.activeOrdersCount} comandas activas` : ""
  }`;

  const content = (
    <>
      {table.status === "occupied" && table.activeOrdersCount > 0 ? (
        <span className="dashboard-floor-tile__badge" aria-label={`${table.activeOrdersCount} comandas`}>
          {table.activeOrdersCount}
        </span>
      ) : null}
      <span className="dashboard-floor-tile__number">{table.number}</span>
      <span className="dashboard-floor-tile__status">
        <span
          className="dashboard-floor-tile__dot"
          style={{ backgroundColor: meta.color }}
          aria-hidden
        />
        <span className="dashboard-floor-tile__status-text">{statusLabel}</span>
      </span>
    </>
  );

  const className = `dashboard-floor-tile ${meta.className}`;
  const style = { animationDelay: `${index * 50}ms` };

  if (table.status === "occupied") {
    return (
      <Link
        to="/orders"
        className={className}
        style={style}
        title={`${ariaLabel}. Ir a comandas`}
        aria-label={ariaLabel}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={className} style={style} title={ariaLabel} aria-label={ariaLabel}>
      {content}
    </div>
  );
}

type DashboardFloorSectionProps = {
  tables: FloorTableTile[];
  loading: boolean;
};

export function DashboardFloorSection({ tables, loading }: DashboardFloorSectionProps) {
  return (
    <section className="dashboard-floor dashboard-floor--dark" aria-label="Estado actual del salón">
      <div className="dashboard-floor__header">
        <h2 className="dashboard-floor__title">Estado del salón</h2>
        <ul className="dashboard-floor__legend" aria-label="Leyenda de estados">
          {LEGEND.map((item) => (
            <li key={item.status}>
              <span
                className="dashboard-floor__legend-swatch"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      {loading ? (
        <p className="dashboard-floor__loading">Cargando mesas…</p>
      ) : tables.length === 0 ? (
        <p className="dashboard-floor__empty">No hay mesas configuradas.</p>
      ) : (
        <div className="dashboard-floor__grid" role="list">
          {tables.map((table, index) => (
            <div key={table.id} className="dashboard-floor__item" role="listitem">
              <FloorTableMini table={table} index={index} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
