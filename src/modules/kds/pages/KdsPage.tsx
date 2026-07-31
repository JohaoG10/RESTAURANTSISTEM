import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "../../../lib/supabase";
import type { Tables } from "../../../types/database.types";
import { ACTIVE_ORDER_STATUSES } from "../../orders/api";
import { KdsOrderCard } from "../components/KdsOrderCard";
import { useKdsLayout } from "../hooks/useKdsLayout";
import { layoutToCssVars } from "../utils/kdsLayout";

type OrderItem = Tables<"order_items"> & {
  served_quantity: number;
  modified_at?: string | null;
  modified_seen_at?: string | null;
  cancelled_at?: string | null;
};
type Order = Tables<"orders">;
type MenuItem = Tables<"menu_items">;
type RestaurantTable = Tables<"restaurant_tables">;

type CardData = {
  order: Order;
  cardItems: OrderItem[];
  pendingCount: number;
  hasRecentCancelled: boolean;
};

type Urgency = "fresh" | "warm" | "late";

type EnrichedCard = CardData & {
  exiting: boolean;
  urgency: Urgency;
};

const CANCELLED_VISIBLE_MS = 15_000;
const NEW_CARD_RING_MS = 3_000;
const URGENCY_RANK: Record<Urgency, number> = { late: 0, warm: 1, fresh: 2 };

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function elapsedLabel(createdAt: string, nowMs: number): string {
  const totalSecs = Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 1_000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function urgencyLevel(createdAt: string, nowMs: number): Urgency {
  const mins = (nowMs - new Date(createdAt).getTime()) / 60_000;
  if (mins < 5) return "fresh";
  if (mins < 10) return "warm";
  return "late";
}

function compareCards(a: CardData, b: CardData, nowMs: number): number {
  const urgA = urgencyLevel(a.order.created_at, nowMs);
  const urgB = urgencyLevel(b.order.created_at, nowMs);
  if (URGENCY_RANK[urgA] !== URGENCY_RANK[urgB]) {
    return URGENCY_RANK[urgA] - URGENCY_RANK[urgB];
  }
  const takeA = a.order.order_type === "takeaway" ? 1 : 0;
  const takeB = b.order.order_type === "takeaway" ? 1 : 0;
  if (takeA !== takeB) return takeA - takeB;
  return new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime();
}

function sortCards(cards: CardData[], nowMs: number): CardData[] {
  return [...cards].sort((a, b) => compareCards(a, b, nowMs));
}

function enrichCard(card: CardData, exiting: boolean, nowMs: number): EnrichedCard {
  return { ...card, exiting, urgency: urgencyLevel(card.order.created_at, nowMs) };
}

function ChefEmptyIcon() {
  return (
    <svg
      className="kds-empty__chef"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="60" cy="60" r="56" stroke="#22C55E" strokeWidth="2" opacity="0.25" />
      <path
        d="M35 52c0-14 11-22 25-22s25 8 25 22"
        stroke="#22C55E"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="32" y="50" width="56" height="10" rx="5" fill="#22C55E" opacity="0.85" />
      <path
        d="M42 60v28c0 8 8 14 18 14s18-6 18-14V60"
        stroke="#4ADE80"
        strokeWidth="3"
        fill="rgba(34,197,94,0.08)"
      />
      <circle cx="48" cy="78" r="3" fill="#86EFAC" />
      <circle cx="72" cy="78" r="3" fill="#86EFAC" />
      <path d="M52 90c4 3 12 3 16 0" stroke="#86EFAC" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function KdsPage() {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const [exitingCards, setExitingCards] = useState(new Map<string, CardData>());
  const [newCardIds, setNewCardIds] = useState(new Set<string>());
  const prevCardsRef = useRef(new Map<string, CardData>());
  const exitingRef = useRef(exitingCards);
  useEffect(() => {
    exitingRef.current = exitingCards;
  }, [exitingCards]);

  const timerNow = useNow(1_000);

  const menuMap = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of menuItems) map.set(item.id, item);
    return map;
  }, [menuItems]);

  const tableMap = useMemo(() => {
    const map = new Map<string, RestaurantTable>();
    for (const table of tables) map.set(table.id, table);
    return map;
  }, [tables]);

  const orderCards = useMemo((): CardData[] => {
    const grouped = new Map<string, OrderItem[]>();
    const nowMs = Date.now();
    for (const item of items) {
      if (item.status === "cancelled") {
        const ts = item.cancelled_at ? new Date(item.cancelled_at).getTime() : 0;
        if (!ts || nowMs - ts > CANCELLED_VISIBLE_MS) continue;
      }
      const arr = grouped.get(item.order_id) ?? [];
      arr.push(item);
      grouped.set(item.order_id, arr);
    }
    return orders
      .map((order) => {
        const cardItems = grouped.get(order.id) ?? [];
        const pendingCount = cardItems.filter(
          (it) => it.status !== "cancelled" && it.served_quantity < it.quantity
        ).length;
        const hasRecentCancelled = cardItems.some((it) => it.status === "cancelled");
        return { order, cardItems, pendingCount, hasRecentCancelled };
      })
      .filter((c) => c.cardItems.length > 0 && (c.pendingCount > 0 || c.hasRecentCancelled));
  }, [items, orders]);

  useEffect(() => {
    const currentMap = new Map(orderCards.map((c) => [c.order.id, c]));
    const prev = prevCardsRef.current;

    if (prev.size > 0) {
      const appeared: string[] = [];
      for (const id of currentMap.keys()) {
        if (!prev.has(id)) appeared.push(id);
      }
      if (appeared.length > 0) {
        setNewCardIds((s) => {
          const next = new Set(s);
          for (const id of appeared) next.add(id);
          return next;
        });
        window.setTimeout(() => {
          setNewCardIds((s) => {
            const next = new Set(s);
            for (const id of appeared) next.delete(id);
            return next;
          });
        }, NEW_CARD_RING_MS);
      }
    }

    const done: Array<[string, CardData]> = [];
    for (const [id, card] of prev) {
      if (!currentMap.has(id) && !exitingRef.current.has(id)) done.push([id, card]);
    }
    prevCardsRef.current = currentMap;

    if (done.length === 0) return;
    setExitingCards((prev) => {
      const next = new Map(prev);
      for (const [id, card] of done) next.set(id, card);
      return next;
    });
    window.setTimeout(() => {
      setExitingCards((prev) => {
        const next = new Map(prev);
        for (const [id] of done) next.delete(id);
        return next;
      });
    }, 600);
  }, [orderCards]);

  async function loadAll() {
    setError(null);
    try {
      const [orderRes, itemRes, menuRes, tableRes] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .in("status", ACTIVE_ORDER_STATUSES)
          .order("created_at", { ascending: true }),
        supabase
          .from("order_items")
          .select("*")
          .in("status", ["pending", "preparing", "ready", "served", "cancelled"])
          .order("created_at", { ascending: true }),
        supabase
          .from("menu_items")
          .select("*")
          .is("deleted_at", null)
          .order("name", { ascending: true }),
        supabase
          .from("restaurant_tables")
          .select("*")
          .order("number", { ascending: true }),
      ]);

      if (orderRes.error) throw orderRes.error;
      if (itemRes.error) throw itemRes.error;
      if (menuRes.error) throw menuRes.error;
      if (tableRes.error) throw tableRes.error;

      setOrders(orderRes.data);
      setItems(
        (itemRes.data as (Tables<"order_items"> & { served_quantity?: number })[]).map((it) => ({
          ...it,
          served_quantity: it.served_quantity ?? (it.status === "served" ? it.quantity : 0),
        }))
      );
      setMenuItems(menuRes.data);
      setTables(tableRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar KDS");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();

    const channel = supabase
      .channel("kds-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "order_items" },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_items" },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "order_items" },
        () => void loadAll()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        void loadAll()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, () =>
        void loadAll()
      )
      .subscribe((status) => {
        const ok = status === "SUBSCRIBED";
        setConnected(ok);
        if (!ok && status === "CHANNEL_ERROR") void loadAll();
      });

    return () => void supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clockStr = new Date(timerNow).toLocaleTimeString("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const sortedActiveCards = useMemo(
    () => sortCards(orderCards, timerNow),
    [orderCards, timerNow]
  );

  const allDisplayCards = useMemo((): EnrichedCard[] => {
    const active = sortedActiveCards.map((c) => enrichCard(c, false, timerNow));
    const exiting = sortCards([...exitingCards.values()], timerNow).map((c) =>
      enrichCard(c, true, timerNow)
    );
    return [...active, ...exiting];
  }, [sortedActiveCards, exitingCards, timerNow]);

  const { layout, headerRef } = useKdsLayout(
    allDisplayCards.length > 0 ? allDisplayCards.length : 1
  );

  const layoutStyle = useMemo(
    () => layoutToCssVars(layout) as CSSProperties,
    [layout]
  );

  const urgencyCounts = useMemo(() => {
    const counts = { late: 0, warm: 0, fresh: 0 };
    for (const card of orderCards) {
      const u = urgencyLevel(card.order.created_at, timerNow);
      counts[u] += 1;
    }
    return counts;
  }, [orderCards, timerNow]);

  const totalActive = orderCards.length;

  return (
    <div className="kds-page" style={layoutStyle}>
      <header className="kds-header" ref={headerRef}>
        <div className="kds-header__brand">
          <h1 className="kds-header__title">COCINA</h1>
        </div>
        <div className="kds-header__stats" aria-live="polite">
          <span className="kds-header__urgency kds-header__urgency--late">
            <span aria-hidden>🔴</span> {urgencyCounts.late} urgente
            {urgencyCounts.late !== 1 ? "s" : ""}
          </span>
          <span className="kds-header__urgency kds-header__urgency--warm">
            <span aria-hidden>🟡</span> {urgencyCounts.warm} normal
            {urgencyCounts.warm !== 1 ? "es" : ""}
          </span>
          <span className="kds-header__urgency kds-header__urgency--fresh">
            <span aria-hidden>🟢</span> {urgencyCounts.fresh} nueva
            {urgencyCounts.fresh !== 1 ? "s" : ""}
          </span>
          <span className="kds-header__total">
            {totalActive} activa{totalActive !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="kds-header__right">
          <time className="kds-header__clock" dateTime={new Date(timerNow).toISOString()}>
            {clockStr}
          </time>
          <span
            className={`kds-header__dot kds-header__dot--${connected ? "on" : "off"}`}
            title={connected ? "Conectado en tiempo real" : "Sin conexión"}
            aria-label={connected ? "Conectado" : "Sin conexión"}
          />
        </div>
      </header>

      <div className="kds-stage">
        {error ? (
          <p className="kds-error" role="alert">
            {error}
          </p>
        ) : null}
        {loading && !error ? (
          <div className="kds-loading">
            <span className="kds-loading__spinner" aria-hidden />
            Cargando comandas…
          </div>
        ) : null}

        {!loading && allDisplayCards.length === 0 ? (
          <div className="kds-empty">
            <ChefEmptyIcon />
            <p className="kds-empty__text">Sin comandas pendientes</p>
            <p className="kds-empty__sub">Todo al día ✓</p>
          </div>
        ) : null}

        {!loading && allDisplayCards.length > 0 ? (
          <div className="kds-grid">
            <AnimatePresence mode="popLayout">
              {allDisplayCards.map(({ order, cardItems, exiting, urgency }) => {
                const table = order.table_id ? tableMap.get(order.table_id) : undefined;
                const isNew = newCardIds.has(order.id);

                return (
                  <KdsOrderCard
                    key={order.id}
                    order={order}
                    cardItems={cardItems}
                    table={table}
                    menuMap={menuMap}
                    urgency={urgency}
                    timerNow={timerNow}
                    isNew={isNew}
                    exiting={exiting}
                    elapsedLabel={elapsedLabel}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        ) : null}
      </div>
    </div>
  );
}
