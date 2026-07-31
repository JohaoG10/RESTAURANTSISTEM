import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import gsap from "gsap";
import { PageHeader } from "../components/PageHeader";
import { DashboardFloorSection } from "../components/DashboardFloorSection";
import {
  fetchDashboardSnapshot,
  fetchFloorTableOverview,
  type DashboardSnapshot,
  type FloorTableTile,
} from "../dashboard/api";
import { useAuth } from "../../modules/auth/context/AuthProvider";
import type { UserRole } from "../../modules/auth/types";
import { formatMoney } from "../../modules/billing/utils";
import { staggerContainer, staggerItem } from "../../lib/animations/motion";
import { useGsapCounter } from "../../lib/animations/gsap-hooks";

type MetricVariant = "sales" | "tables" | "orders" | "shift-open" | "shift-closed";
type QuickLinkTone = "orders" | "billing" | "kds" | "reports";

type QuickLink = {
  to: string;
  label: string;
  description: string;
  roles: UserRole[];
  tone: QuickLinkTone;
  icon: ReactNode;
};

const QUICK_LINKS: QuickLink[] = [
  {
    to: "/orders",
    label: "Comandas",
    description: "Tomar y gestionar pedidos",
    roles: ["admin", "waiter"],
    tone: "orders",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
      </svg>
    ),
  },
  {
    to: "/billing",
    label: "Cobro",
    description: "Pre-cuenta, división y pago",
    roles: ["admin", "waiter"],
    tone: "billing",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
  {
    to: "/kds",
    label: "KDS Cocina",
    description: "Pantalla de preparación",
    roles: ["admin", "kitchen"],
    tone: "kds",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M6 2v4M18 2v4M4 8h16" />
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    ),
  },
  {
    to: "/reports",
    label: "Reportes",
    description: "Ventas del día y turnos",
    roles: ["admin"],
    tone: "reports",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M4 19V5M10 19V9M16 19v-6M22 19V3" />
      </svg>
    ),
  },
];

function GsapMoneyCounter({
  amount,
  loading,
  resetKey,
}: {
  amount: number;
  loading: boolean;
  resetKey: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || loading) return;

    const obj = { val: 0 };
    const tween = gsap.to(obj, {
      val: amount,
      duration: 0.35,
      ease: "power3.out",
      onUpdate: () => {
        el.textContent = formatMoney(obj.val);
      },
    });
    return () => {
      tween.kill();
    };
  }, [amount, loading, resetKey]);

  return <span ref={ref}>{loading ? "—" : formatMoney(0)}</span>;
}

function MetricCard({
  variant,
  label,
  value,
  loading,
  numericValue,
  animateKey,
}: {
  variant: MetricVariant;
  label: string;
  value: ReactNode;
  loading: boolean;
  numericValue?: number;
  animateKey?: string;
}) {
  const counterRef = useGsapCounter(numericValue ?? 0, !loading && numericValue != null, {
    resetKey: animateKey,
  });

  return (
    <motion.article
      className={`dashboard-metric dashboard-metric--${variant}`}
      variants={staggerItem}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
    >
      <div className="dashboard-metric__icon" aria-hidden>
        {variant === "sales" && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
        )}
        {variant === "tables" && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 10h18" />
          </svg>
        )}
        {variant === "orders" && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
          </svg>
        )}
        {(variant === "shift-open" || variant === "shift-closed") && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
          </svg>
        )}
      </div>
      <div className="dashboard-metric__content">
        <span className="dashboard-metric__label">{label}</span>
        <strong className="dashboard-metric__value">
          {loading ? "—" : numericValue != null ? <span ref={counterRef}>0</span> : value}
        </strong>
      </div>
    </motion.article>
  );
}

export function DashboardPage() {
  const { profile, restaurant } = useAuth();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [floorTables, setFloorTables] = useState<FloorTableTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [floorLoading, setFloorLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = profile?.role;
  const isAdmin = role === "admin";
  const showFloor = role === "admin" || role === "waiter";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setFloorLoading(true);
      setError(null);
      try {
        const snapshotPromise = fetchDashboardSnapshot();
        const floorPromise = showFloor
          ? fetchFloorTableOverview()
          : Promise.resolve([] as FloorTableTile[]);

        const [data, floor] = await Promise.all([snapshotPromise, floorPromise]);
        if (!cancelled) {
          setSnapshot(data);
          setFloorTables(floor);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el resumen");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setFloorLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [showFloor]);

  const quickLinks = useMemo(
    () => (role ? QUICK_LINKS.filter((link) => link.roles.includes(role)) : []),
    [role]
  );

  const formattedDate = snapshot
    ? new Date(snapshot.date + "T12:00:00").toLocaleDateString("es-EC", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  const cashShiftOpen = snapshot?.cashShiftOpen ?? false;
  const animateKey = snapshot?.date ?? "loading";

  return (
    <main className="app-page dashboard-page">
      <PageHeader
        title="Dashboard"
        subtitle={
          restaurant?.name
            ? `${restaurant.name} · Resumen del ${formattedDate || "día"}`
            : "Resumen operativo del día"
        }
      />

      <div className="app-page__body">
        {error ? <p className="billing-error">{error}</p> : null}

        <motion.section
          className="dashboard-metrics"
          aria-label="Métricas del día"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {isAdmin ? (
            <MetricCard
              variant="sales"
              label="Vendido hoy"
              loading={loading}
              value={
                snapshot?.totalSoldToday != null ? (
                  <GsapMoneyCounter
                    amount={snapshot.totalSoldToday}
                    loading={loading}
                    resetKey={animateKey}
                  />
                ) : (
                  "—"
                )
              }
            />
          ) : null}

          <MetricCard
            variant="tables"
            label="Mesas ocupadas"
            loading={loading}
            numericValue={snapshot?.occupiedTables}
            animateKey={animateKey}
            value={snapshot?.occupiedTables ?? 0}
          />

          <MetricCard
            variant="orders"
            label="Comandas activas"
            loading={loading}
            numericValue={snapshot?.activeOrders}
            animateKey={animateKey}
            value={snapshot?.activeOrders ?? 0}
          />

          {isAdmin ? (
            <Link
              to="/reports"
              className={`dashboard-metric-link dashboard-metric-link--${cashShiftOpen ? "shift-open" : "shift-closed"}`}
            >
              <MetricCard
                variant={cashShiftOpen ? "shift-open" : "shift-closed"}
                label="Turno de caja"
                loading={loading}
                value={cashShiftOpen ? "Abierto" : "Cerrado"}
              />
            </Link>
          ) : null}
        </motion.section>

        {quickLinks.length > 0 ? (
          <section className="dashboard-quick" aria-label="Accesos rápidos">
            <h2 className="dashboard-section-title">Accesos rápidos</h2>
            <motion.div
              className="dashboard-quick-grid"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {quickLinks.map((link) => (
                <motion.div key={link.to} variants={staggerItem}>
                  <Link
                    to={link.to}
                    className={`dashboard-quick-card dashboard-quick-card--${link.tone}`}
                  >
                    <motion.span
                      className="dashboard-quick-card__icon"
                      whileHover={{ scale: 1.08 }}
                      transition={{ duration: 0.2 }}
                    >
                      {link.icon}
                    </motion.span>
                    <span className="dashboard-quick-card__label">{link.label}</span>
                    <span className="dashboard-quick-card__desc">{link.description}</span>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </section>
        ) : null}

        {showFloor ? (
          <DashboardFloorSection tables={floorTables} loading={floorLoading} />
        ) : null}
      </div>
    </main>
  );
}
