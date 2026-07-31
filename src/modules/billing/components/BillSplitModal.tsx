import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { OrderItemWithServed } from "../../orders/api";
import type { MenuItem } from "../../orders/api";
import { generateId } from "../../../lib/generateId";
import { formatMoney } from "../utils";

export type ItemSplitGroup = {
  label: string;
  unitKeys: string[];
};

const UNASSIGNED_ZONE_ID = "unassigned";

type UnitRow = {
  key: string;
  itemName: string;
  unitLabel: string;
  unitPrice: number;
};

type SplitAccount = {
  id: string;
  label: string;
  unitKeys: string[];
};

type Props = {
  open: boolean;
  items: OrderItemWithServed[];
  menuMap: Map<string, MenuItem>;
  onClose: () => void;
  onEqualSplit: (parts: number) => Promise<void>;
  onItemSplit: (groups: ItemSplitGroup[]) => Promise<void>;
};

function createAccount(index: number): SplitAccount {
  return {
    id: `account-${index}-${generateId()}`,
    label: `Cuenta ${index}`,
    unitKeys: [],
  };
}

/* ── Draggable card ── */
function DraggableUnitCard({ unit, variant }: { unit: UnitRow; variant: "pool" | "account" }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: unit.key,
    data: { type: "unit", unit },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      className={`bsd-card${variant === "pool" ? " bsd-card--pool" : " bsd-card--account"}`}
      {...listeners}
      {...attributes}
    >
      <span className="bsd-card__name">{unit.itemName}</span>
      <span className="bsd-card__unit">{unit.unitLabel}</span>
      <span className="bsd-card__price">{formatMoney(unit.unitPrice)}</span>
    </div>
  );
}

/* ── Pool zone (sin asignar) ── */
function PoolZone({
  unitKeys,
  unitMap,
}: {
  unitKeys: string[];
  unitMap: Map<string, UnitRow>;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: UNASSIGNED_ZONE_ID });

  return (
    <div className="bsd-pool" ref={setNodeRef}>
      <div className="bsd-pool__header">
        <span className="bsd-pool__title">SIN ASIGNAR</span>
        <span className="bsd-pool__count">{unitKeys.length}</span>
      </div>
      <div className={`bsd-pool__body${isOver ? " bsd-pool__body--over" : ""}`}>
        {unitKeys.length === 0 ? (
          <div className="bsd-pool__empty">
            <span aria-hidden>✓</span>
            <p>Todo asignado</p>
          </div>
        ) : (
          unitKeys.map((key) => {
            const unit = unitMap.get(key);
            if (!unit) return null;
            return <DraggableUnitCard key={key} unit={unit} variant="pool" />;
          })
        )}
      </div>
    </div>
  );
}

/* ── Account column ── */
function AccountZone({
  account,
  subtotal,
  unitMap,
  onRemove,
  removeDisabled,
}: {
  account: SplitAccount;
  subtotal: number;
  unitMap: Map<string, UnitRow>;
  onRemove: () => void;
  removeDisabled: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: account.id });

  return (
    <div className={`bsd-account${isOver ? " bsd-account--over" : ""}`}>
      {/* Header */}
      <div className="bsd-account__header">
        <div className="bsd-account__header-left">
          <span className="bsd-account__title">{account.label.toUpperCase()}</span>
          <span className="bsd-account__count">{account.unitKeys.length} ítem{account.unitKeys.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="bsd-account__header-right">
          <span className="bsd-account__subtotal">{formatMoney(subtotal)}</span>
          <button
            type="button"
            className="bsd-account__remove"
            onClick={onRemove}
            disabled={removeDisabled}
            title={`Eliminar ${account.label}`}
          >
            ×
          </button>
        </div>
      </div>
      {/* Drop body */}
      <div className="bsd-account__body" ref={setNodeRef}>
        {account.unitKeys.length === 0 ? (
          <div className="bsd-account__empty">
            <span aria-hidden>↓</span>
            <p>Arrastra aquí</p>
          </div>
        ) : (
          account.unitKeys.map((key) => {
            const unit = unitMap.get(key);
            if (!unit) return null;
            return <DraggableUnitCard key={key} unit={unit} variant="account" />;
          })
        )}
      </div>
    </div>
  );
}

/* ── Main Modal ── */
export function BillSplitModal({
  open,
  items,
  menuMap,
  onClose,
  onEqualSplit,
  onItemSplit,
}: Props) {
  const [accounts, setAccounts] = useState<SplitAccount[]>([
    createAccount(1),
    createAccount(2),
  ]);
  const [unassignedKeys, setUnassignedKeys] = useState<string[]>([]);
  const [activeDragKey, setActiveDragKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const unitRows = useMemo(() => {
    const rows: UnitRow[] = [];
    for (const item of items) {
      const menu = menuMap.get(item.menu_item_id);
      const name = menu?.name ?? "Ítem";
      for (let idx = 1; idx <= item.quantity; idx += 1) {
        rows.push({
          key: `${item.id}#${idx}`,
          itemName: name,
          unitLabel: item.quantity > 1 ? `Unidad ${idx}/${item.quantity}` : "Unidad",
          unitPrice: item.price_at_order,
        });
      }
    }
    return rows;
  }, [items, menuMap]);

  const unitMap = useMemo(() => {
    const map = new Map<string, UnitRow>();
    for (const row of unitRows) map.set(row.key, row);
    return map;
  }, [unitRows]);

  const orderTotal = useMemo(
    () => unitRows.reduce((acc, row) => acc + row.unitPrice, 0),
    [unitRows]
  );

  const accountSubtotals = useMemo(() => {
    return accounts.map((account) =>
      account.unitKeys.reduce((sum, key) => sum + (unitMap.get(key)?.unitPrice ?? 0), 0)
    );
  }, [accounts, unitMap]);

  useEffect(() => {
    if (!open) return;
    setAccounts([createAccount(1), createAccount(2)]);
    setUnassignedKeys(unitRows.map((row) => row.key));
    setActiveDragKey(null);
    setError(null);
  }, [open, unitRows]);

  if (!open) return null;

  const activeUnit = activeDragKey ? unitMap.get(activeDragKey) : null;

  function moveUnitToZone(unitKey: string, targetZoneId: string) {
    setUnassignedKeys((prev) => prev.filter((key) => key !== unitKey));
    setAccounts((prev) =>
      prev.map((account) => ({
        ...account,
        unitKeys: account.unitKeys.filter((key) => key !== unitKey),
      }))
    );

    if (targetZoneId === UNASSIGNED_ZONE_ID) {
      setUnassignedKeys((prev) => (prev.includes(unitKey) ? prev : [...prev, unitKey]));
      return;
    }

    setAccounts((prev) =>
      prev.map((account) =>
        account.id === targetZoneId
          ? {
              ...account,
              unitKeys: account.unitKeys.includes(unitKey)
                ? account.unitKeys
                : [...account.unitKeys, unitKey],
            }
          : account
      )
    );
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragKey(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragKey(null);
    const unitKey = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    moveUnitToZone(unitKey, overId);
  }

  function distributeEvenlyInUi() {
    const keys = unitRows.map((row) => row.key);
    if (accounts.length === 0) return;
    const nextAccounts = accounts.map((account) => ({ ...account, unitKeys: [] as string[] }));
    keys.forEach((key, index) => {
      nextAccounts[index % nextAccounts.length].unitKeys.push(key);
    });
    setAccounts(nextAccounts);
    setUnassignedKeys([]);
  }

  function addAccount() {
    if (accounts.length >= 20) {
      setError("Máximo 20 cuentas.");
      return;
    }
    setAccounts((prev) => [...prev, createAccount(prev.length + 1)]);
  }

  function resetAssignment() {
    setAccounts((prev) => prev.map((account) => ({ ...account, unitKeys: [] })));
    setUnassignedKeys(unitRows.map((row) => row.key));
    setError(null);
  }

  function removeAccount(accountId: string) {
    if (accounts.length <= 1) {
      setError("Debe quedar al menos una cuenta.");
      return;
    }
    const target = accounts.find((account) => account.id === accountId);
    if (!target) return;

    setUnassignedKeys((prev) => {
      const next = [...prev];
      for (const key of target.unitKeys) {
        if (!next.includes(key)) next.push(key);
      }
      return next;
    });

    setAccounts((prev) => {
      const filtered = prev.filter((account) => account.id !== accountId);
      return filtered.map((account, index) => ({
        ...account,
        label: `Cuenta ${index + 1}`,
      }));
    });
    setError(null);
  }

  async function handleEqualSplitSave() {
    if (accounts.length < 2) {
      setError("Necesitas al menos 2 cuentas.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onEqualSplit(accounts.length);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo dividir en partes iguales");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSplit() {
    if (unassignedKeys.length > 0) {
      setError("Asigna todas las unidades antes de confirmar.");
      return;
    }
    if (accounts.some((account) => account.unitKeys.length === 0)) {
      setError("Cada cuenta debe tener al menos una unidad.");
      return;
    }

    const groups: ItemSplitGroup[] = accounts.map((account) => ({
      label: account.label,
      unitKeys: account.unitKeys,
    }));

    setBusy(true);
    setError(null);
    try {
      await onItemSplit(groups);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la división");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bsd-backdrop" role="dialog" aria-modal="true" aria-label="Dividir cuenta">
      <div className="bsd-modal">
        {/* ── Header ── */}
        <div className="bsd-header">
          <div className="bsd-header__top">
            <div className="bsd-header__info">
              <h3 className="bsd-header__title">Dividir cuenta</h3>
              <p className="bsd-header__subtitle">
                Total: <strong>{formatMoney(orderTotal)}</strong>{" "}
                · {unitRows.length} unidad{unitRows.length !== 1 ? "es" : ""}
              </p>
            </div>
            <button
              type="button"
              className="bsd-header__close"
              onClick={onClose}
              disabled={busy}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          {/* Toolbar */}
          <div className="bsd-toolbar">
            <button
              type="button"
              className="bsd-toolbar__btn bsd-toolbar__btn--ghost"
              disabled={busy}
              onClick={resetAssignment}
            >
              ↺ Reset
            </button>
            <button
              type="button"
              className="bsd-toolbar__btn bsd-toolbar__btn--outline"
              disabled={busy}
              onClick={distributeEvenlyInUi}
            >
              Partes iguales
            </button>
            <button
              type="button"
              className="bsd-toolbar__btn bsd-toolbar__btn--blue"
              disabled={busy}
              onClick={() => void handleEqualSplitSave()}
            >
              Guardar iguales
            </button>
            <button
              type="button"
              className="bsd-toolbar__btn bsd-toolbar__btn--primary"
              disabled={busy}
              onClick={() => void handleConfirmSplit()}
            >
              {busy ? "Guardando…" : "Confirmar división ✓"}
            </button>
          </div>

          {error && (
            <div className="bsd-error" role="alert">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* ── Board ── */}
        <div className="bsd-body">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="bsd-board">
              {/* Panel izquierdo — Sin asignar */}
              <PoolZone unitKeys={unassignedKeys} unitMap={unitMap} />

              {/* Panel derecho — Cuentas */}
              <div className="bsd-accounts-wrap">
                <div className="bsd-accounts">
                  {accounts.map((account, index) => (
                    <AccountZone
                      key={account.id}
                      account={account}
                      subtotal={accountSubtotals[index]}
                      unitMap={unitMap}
                      onRemove={() => removeAccount(account.id)}
                      removeDisabled={busy || accounts.length <= 1}
                    />
                  ))}

                  {/* Nueva cuenta */}
                  <button
                    type="button"
                    className="bsd-add-account"
                    onClick={addAccount}
                    disabled={busy || accounts.length >= 20}
                    title="Agregar cuenta"
                  >
                    <span className="bsd-add-account__icon">+</span>
                    <span className="bsd-add-account__label">Nueva cuenta</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Overlay al arrastrar */}
            <DragOverlay>
              {activeUnit ? (
                <div className="bsd-card bsd-card--overlay">
                  <span className="bsd-card__name">{activeUnit.itemName}</span>
                  <span className="bsd-card__unit">{activeUnit.unitLabel}</span>
                  <span className="bsd-card__price">{formatMoney(activeUnit.unitPrice)}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Print area (heredado) */}
      <div className="billing-print-area" />
    </div>
  );
}
