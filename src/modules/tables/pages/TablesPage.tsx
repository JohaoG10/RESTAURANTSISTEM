import { useEffect, useRef, useState, type PointerEvent } from "react";
import { AppToast } from "../../../app/components/AppToast";
import { PageHeader } from "../../../app/components/PageHeader";
import { TableFormModal } from "../components/TableFormModal";
import {
  createTable,
  deleteTable,
  fetchTables,
  updateTable,
  type RestaurantTable,
} from "../api";
import { TableFloorCard } from "../components/TableFloorCard";
import { TABLE_STATUS_OPTIONS, type TableShape, type TableStatus } from "../utils";

const DRAG_THRESHOLD_PX = 8;

type PointerSession = {
  tableId: string;
  startClientX: number;
  startClientY: number;
  offsetX: number;
  offsetY: number;
  dragging: boolean;
  lastX?: number;
  lastY?: number;
};

export function TablesPage() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTable, setEditTable] = useState<RestaurantTable | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const pointerRef = useRef<PointerSession | null>(null);
  const floorRef = useRef<HTMLDivElement | null>(null);

  async function loadTables() {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchTables();
      setTables(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar mesas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTables();
  }, []);

  useEffect(() => {
    if (!successToast) return;
    const timer = window.setTimeout(() => setSuccessToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [successToast]);

  function nextTablePosition() {
    const index = tables.length;
    return {
      position_x: 24 + (index % 6) * 152,
      position_y: 24 + Math.floor(index / 6) * 118,
    };
  }

  async function handleCreate(payload: {
    number: number;
    capacity: number;
    shape: TableShape;
  }) {
    setBusy(true);
    try {
      const position = nextTablePosition();
      const created = await createTable({
        number: payload.number,
        capacity: payload.capacity,
        shape: payload.shape,
        status: "available",
        ...position,
      });
      setTables((prev) => [...prev, created].sort((a, b) => a.number - b.number));
      setCreateOpen(false);
      setSuccessToast("Mesa creada correctamente");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(tableId: string, payload: { capacity: number; status: TableStatus }) {
    setBusy(true);
    try {
      await updateTable(tableId, {
        capacity: payload.capacity,
        status: payload.status,
      });
      setTables((prev) =>
        prev.map((table) =>
          table.id === tableId
            ? { ...table, capacity: payload.capacity, status: payload.status }
            : table
        )
      );
      setEditTable((prev) =>
        prev?.id === tableId
          ? { ...prev, capacity: payload.capacity, status: payload.status }
          : prev
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(tableId: string) {
    setBusy(true);
    try {
      await deleteTable(tableId);
      setTables((prev) => prev.filter((table) => table.id !== tableId));
      setEditTable(null);
    } finally {
      setBusy(false);
    }
  }

  function handleTablePointerDown(event: PointerEvent<HTMLDivElement>, table: RestaurantTable) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const floor = floorRef.current;
    if (!floor) return;

    const floorRect = floor.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - floorRect.left;
    const mouseY = event.clientY - floorRect.top;
    const elementX = targetRect.left - floorRect.left;
    const elementY = targetRect.top - floorRect.top;

    event.currentTarget.setPointerCapture(event.pointerId);

    pointerRef.current = {
      tableId: table.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: mouseX - elementX,
      offsetY: mouseY - elementY,
      dragging: false,
    };
  }

  function handlePointerMove(clientX: number, clientY: number) {
    const session = pointerRef.current;
    const floor = floorRef.current;
    if (!session || !floor) return;

    const distance = Math.hypot(clientX - session.startClientX, clientY - session.startClientY);

    if (!session.dragging && distance > DRAG_THRESHOLD_PX) {
      session.dragging = true;
    }

    if (!session.dragging) return;

    const floorRect = floor.getBoundingClientRect();
    const mouseX = clientX - floorRect.left;
    const mouseY = clientY - floorRect.top;
    const nextX = Math.max(0, mouseX - session.offsetX);
    const nextY = Math.max(0, mouseY - session.offsetY);

    session.lastX = nextX;
    session.lastY = nextY;

    setTables((prev) =>
      prev.map((table) =>
        table.id === session.tableId
          ? { ...table, position_x: nextX, position_y: nextY }
          : table
      )
    );
  }

  async function handlePointerUp() {
    const session = pointerRef.current;
    if (!session) return;

    pointerRef.current = null;

    if (session.dragging) {
      const x = session.lastX ?? 0;
      const y = session.lastY ?? 0;
      try {
        await updateTable(session.tableId, {
          position_x: Number(x.toFixed(2)),
          position_y: Number(y.toFixed(2)),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la posición");
        void loadTables();
      }
      return;
    }

    const table = tables.find((row) => row.id === session.tableId);
    if (table) {
      setEditTable(table);
    }
  }

  return (
    <main className="app-page tables-page">
      <PageHeader
        title="Mesas"
        subtitle="Arrastra las mesas en el plano o haz clic para editar."
        action={
          <button type="button" className="primary" onClick={() => setCreateOpen(true)}>
            Nueva mesa
          </button>
        }
      />

      <div className="app-page__body tables-page__body">
        {error ? <p className="billing-error">{error}</p> : null}

        <section className="tables-floor" aria-label="Plano del salón">
          <div ref={floorRef} className="floor-map">
            <span className="floor-map__room-label">Salón principal</span>

            {loading ? <p className="floor-map__loading">Cargando mesas…</p> : null}
            {!loading && tables.length === 0 ? (
              <p className="floor-map__empty">No hay mesas. Crea la primera con «Nueva mesa».</p>
            ) : null}

            {tables.map((table) => (
              <TableFloorCard
                key={table.id}
                table={table}
                active={editTable?.id === table.id}
                onPointerDown={(e) => handleTablePointerDown(e, table)}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    handlePointerMove(e.clientX, e.clientY);
                  }
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    void handlePointerUp();
                  }
                }}
                onPointerCancel={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    void handlePointerUp();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditTable(table);
                  }
                }}
              />
            ))}

            <ul className="floor-map__legend-mini" aria-label="Leyenda de estados">
              {TABLE_STATUS_OPTIONS.map((item) => (
                <li key={item.value}>
                  <span
                    className={`floor-map__legend-dot floor-map__legend-dot--${item.value}`}
                    aria-hidden
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {successToast ? <AppToast message={successToast} variant="success" /> : null}

      <TableFormModal
        open={createOpen}
        mode="create"
        table={null}
        busy={busy}
        existingTableNumbers={tables.map((t) => t.number)}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        onSave={async () => {}}
        onDelete={async () => {}}
      />

      <TableFormModal
        open={editTable !== null}
        mode="edit"
        table={editTable}
        busy={busy}
        onClose={() => setEditTable(null)}
        onCreate={async () => {}}
        onSave={(values) => handleSave(editTable!.id, values)}
        onDelete={() => handleDelete(editTable!.id)}
      />
    </main>
  );
}
