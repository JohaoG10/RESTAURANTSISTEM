import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  addIsoDays,
  formatReportDateSubtitle,
  todayIsoDate,
} from "../../../lib/dates";
import { formatMoney, paymentMethodLabel } from "../../billing/utils";
import type { PaymentMethod } from "../../billing/utils";
import {
  closeCashShift,
  fetchActiveCashShift,
  fetchDailyReport,
  fetchShiftLiveSummary,
  openCashShift,
  type CashShift,
  type DailyReport,
  type ShiftLiveSummary,
} from "../api";
import { CashShiftPanel, CashShiftStatusPill } from "../components/CashShiftPanel";
import { useGsapCounter, useGsapProgressBar } from "../../../lib/animations/gsap-hooks";

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: string }).message);
  }
  return fallback;
}

const METHOD_META: Record<
  PaymentMethod,
  { icon: string; rowClass: string }
> = {
  cash: { icon: "💵", rowClass: "rp-method-row--cash" },
  card: { icon: "💳", rowClass: "rp-method-row--card" },
  transfer: { icon: "📱", rowClass: "rp-method-row--transfer" },
};

function AnimatedMoney({
  amount,
  loading,
  animateKey,
}: {
  amount: number;
  loading: boolean;
  animateKey: string;
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
  }, [amount, loading, animateKey]);

  return <span ref={ref}>{formatMoney(0)}</span>;
}

function AnimatedCount({
  count,
  loading,
  animateKey,
}: {
  count: number;
  loading: boolean;
  animateKey: string;
}) {
  const ref = useGsapCounter(count, !loading, { resetKey: animateKey });
  return <span ref={ref}>0</span>;
}

function MethodProgressBar({
  pct,
  ready,
  animateKey,
}: {
  pct: number;
  ready: boolean;
  animateKey: string;
}) {
  const barRef = useGsapProgressBar(pct, ready, animateKey);
  return <div ref={barRef} className="rp-method-row__fill" />;
}

export function ReportsPage() {
  const [reportDate, setReportDate] = useState(todayIsoDate);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [shiftSummary, setShiftSummary] = useState<ShiftLiveSummary | null>(null);
  const [openingAmount, setOpeningAmount] = useState("0");
  const [declaredAmount, setDeclaredAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barsReady, setBarsReady] = useState(false);

  const today = todayIsoDate();
  const canGoNext = reportDate < today;
  const isViewingToday = reportDate === today;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBarsReady(false);
    try {
      const [reportData, shift] = await Promise.all([
        fetchDailyReport(reportDate),
        fetchActiveCashShift(),
      ]);
      setReport(reportData);
      setActiveShift(shift);

      if (shift?.id) {
        const summary = await fetchShiftLiveSummary(shift.id);
        setShiftSummary(summary);
        setDeclaredAmount((current) =>
          current === "" ? String(summary.expected_cash) : current
        );
      } else {
        setShiftSummary(null);
        setDeclaredAmount("");
      }
    } catch (err) {
      setError(getErrorMessage(err, "No se pudieron cargar los reportes"));
    } finally {
      setLoading(false);
    }
  }, [reportDate]);

  const refreshShiftSummary = useCallback(async () => {
    if (!activeShift?.id) return;
    try {
      const [summary, reportData] = await Promise.all([
        fetchShiftLiveSummary(activeShift.id),
        reportDate === today ? fetchDailyReport(reportDate) : Promise.resolve(null),
      ]);
      setShiftSummary(summary);
      if (reportData) setReport(reportData);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo actualizar el turno"));
    }
  }, [activeShift?.id, reportDate, today]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!activeShift?.id || loading) return undefined;
    const interval = window.setInterval(() => {
      void refreshShiftSummary();
    }, 20000);
    return () => window.clearInterval(interval);
  }, [activeShift?.id, loading, refreshShiftSummary]);

  useEffect(() => {
    if (!loading && report) {
      const t1 = requestAnimationFrame(() => setBarsReady(true));
      return () => {
        cancelAnimationFrame(t1);
      };
    }
    return undefined;
  }, [loading, report, reportDate]);

  function goPrevDay() {
    setReportDate((d) => addIsoDays(d, -1));
  }

  function goNextDay() {
    if (canGoNext) setReportDate((d) => addIsoDays(d, 1));
  }

  function goToday() {
    setReportDate(today);
  }

  async function handleOpenShift(event: FormEvent) {
    event.preventDefault();
    const amount = Number(openingAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Ingresa un monto inicial válido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openCashShift(amount);
      setDeclaredAmount("");
      setCloseNotes("");
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo abrir la caja"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseShift(event: FormEvent) {
    event.preventDefault();
    const amount = Number(declaredAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Ingresa el monto contado en caja.");
      return;
    }
    if (
      !window.confirm(
        "¿Cerrar el turno de caja? No se podrán registrar más pagos hasta abrir uno nuevo."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await closeCashShift(amount, closeNotes);
      setDeclaredAmount("");
      setCloseNotes("");
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo cerrar la caja"));
    } finally {
      setBusy(false);
    }
  }

  const topMethodLabel = report?.top_payment_method
    ? paymentMethodLabel(report.top_payment_method as PaymentMethod)
    : "—";

  const revenueMethods: Array<{ key: PaymentMethod; amount: number }> = report
    ? [
        { key: "cash", amount: Number(report.revenue_by_method?.cash ?? 0) },
        { key: "card", amount: Number(report.revenue_by_method?.card ?? 0) },
        {
          key: "transfer",
          amount: Number(report.revenue_by_method?.transfer ?? 0),
        },
      ]
    : [];

  const totalBilled = Number(report?.total_billed ?? 0);
  const animateKey = `${reportDate}-${loading}`;

  return (
    <main className="app-page rp-page">
      <header
        className={`rp-header${
          !loading && activeShift
            ? " rp-header--shift-open"
            : !loading
              ? " rp-header--shift-closed"
              : ""
        }`}
      >
        <div className="rp-header__intro">
          <div className="rp-header__title-row">
            <h1 className="rp-header__title">Reportes y caja</h1>
            {!loading ? <CashShiftStatusPill open={Boolean(activeShift)} /> : null}
          </div>
          <p className="rp-header__lead">
            Ventas del día, métodos de pago y control del turno de caja.
          </p>
          <p className="rp-header__subtitle">{formatReportDateSubtitle(reportDate)}</p>
        </div>

        <div className="rp-date-search">
          <div className="rp-date-search__head">
            <span className="rp-date-search__icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </span>
            <div>
              <span className="rp-date-search__label">Consultar ventas por fecha</span>
              <span className="rp-date-search__hint">
                Usa las flechas o el calendario para revisar otro día
              </span>
            </div>
          </div>
          <div className="rp-date-search__controls">
            <div className="rp-date-nav" role="group" aria-label="Seleccionar fecha del reporte">
              <button
                type="button"
                className="rp-date-nav__btn"
                onClick={goPrevDay}
                disabled={busy}
                aria-label="Día anterior"
                title="Día anterior"
              >
                ←
              </button>
              <input
                type="date"
                className="rp-date-nav__input"
                value={reportDate}
                max={today}
                onChange={(e) => setReportDate(e.target.value)}
                disabled={busy}
                aria-label="Fecha del reporte"
              />
              <button
                type="button"
                className="rp-date-nav__btn"
                onClick={goNextDay}
                disabled={busy || !canGoNext}
                aria-label="Día siguiente"
                title="Día siguiente"
              >
                →
              </button>
            </div>
            {!isViewingToday ? (
              <button
                type="button"
                className="rp-date-search__today"
                onClick={goToday}
                disabled={busy}
              >
                Ir a hoy
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="app-page__body">
        {error ? (
          <div className="rp-alert" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rp-loading" aria-live="polite">
            <span className="rp-spinner" aria-hidden />
            Cargando reportes…
          </div>
        ) : null}

        {!loading && report ? (
          <>
            <section className="rp-metrics" aria-label="Métricas del día">
              <article className="rp-metric rp-metric--sales">
                <div className="rp-metric__icon" aria-hidden>
                  $
                </div>
                <div className="rp-metric__body">
                  <span className="rp-metric__label">Total facturado</span>
                  <strong className="rp-metric__value">
                    <AnimatedMoney
                      amount={totalBilled}
                      loading={loading}
                      animateKey={animateKey}
                    />
                  </strong>
                </div>
              </article>

              <article className="rp-metric rp-metric--tables">
                <div className="rp-metric__icon" aria-hidden>
                  🪑
                </div>
                <div className="rp-metric__body">
                  <span className="rp-metric__label">Comandas cobradas</span>
                  <strong className="rp-metric__value">
                    <AnimatedCount
                      count={report.tables_served}
                      loading={loading}
                      animateKey={animateKey}
                    />
                  </strong>
                </div>
              </article>

              <article className="rp-metric rp-metric--method">
                <div className="rp-metric__icon" aria-hidden>
                  💳
                </div>
                <div className="rp-metric__body">
                  <span className="rp-metric__label">Método más usado</span>
                  <strong className="rp-metric__value rp-metric__value--text">
                    {topMethodLabel}
                  </strong>
                </div>
              </article>
            </section>

            <div className="rp-report-grid">
              <section className="rp-methods-card" aria-labelledby="rp-methods-title">
                <h2 id="rp-methods-title" className="rp-section-title">
                  Ingresos por método de pago
                </h2>
                <ul className="rp-methods-list">
                  {revenueMethods.map((row) => {
                    const total = totalBilled || 1;
                    const pct = Math.round((row.amount / total) * 100);
                    const meta = METHOD_META[row.key];
                    return (
                      <li
                        key={row.key}
                        className={`rp-method-row ${meta.rowClass}`}
                      >
                        <span className="rp-method-row__icon" aria-hidden>
                          {meta.icon}
                        </span>
                        <div className="rp-method-row__info">
                          <span className="rp-method-row__name">
                            {paymentMethodLabel(row.key)}
                          </span>
                          <div className="rp-method-row__bar">
                            <MethodProgressBar
                              pct={Math.min(pct, 100)}
                              ready={barsReady}
                              animateKey={`${animateKey}-${row.key}`}
                            />
                          </div>
                        </div>
                        <span className="rp-method-row__amount">
                          {formatMoney(row.amount)}
                        </span>
                        <span className="rp-method-row__pct">{pct}%</span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="rp-dishes-card" aria-labelledby="rp-dishes-title">
                <h2 id="rp-dishes-title" className="rp-section-title">
                  Top 5 platos del día
                </h2>
                {report.top_dishes.length === 0 ? (
                  <p className="rp-empty">Sin ventas registradas en esta fecha.</p>
                ) : (
                  <div className="rp-dishes-grid">
                    {report.top_dishes.map((dish, index) => {
                      const rank = index + 1;
                      const rankClass =
                        rank === 1
                          ? "rp-dish-card__rank--1"
                          : rank === 2
                            ? "rp-dish-card__rank--2"
                            : rank === 3
                              ? "rp-dish-card__rank--3"
                              : "rp-dish-card__rank--default";
                      return (
                        <article
                          key={dish.menu_item_id}
                          className="rp-dish-card rp-dish-card--visible"
                        >
                          <span
                            className={`rp-dish-card__rank ${rankClass}`}
                            aria-hidden
                          >
                            {rank}
                          </span>
                          <div className="rp-dish-card__info">
                            <span className="rp-dish-card__name">{dish.name}</span>
                            <div className="rp-dish-card__badges">
                              <span className="rp-dish-badge rp-dish-badge--qty">
                                ×{dish.quantity}
                              </span>
                              <span className="rp-dish-badge rp-dish-badge--rev">
                                {formatMoney(Number(dish.revenue))}
                              </span>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        ) : null}

        <section className="rp-cash-section" aria-labelledby="rp-cash-title">
          <div className="rp-cash-section__head">
            <h2 id="rp-cash-title" className="rp-section-title">
              Turno de caja
            </h2>
            {!loading ? (
              <p className="rp-cash-section__hint">
                {activeShift ? "Turno activo" : "Sin turno — cobros bloqueados"}
              </p>
            ) : null}
          </div>
          {!loading ? (
            <CashShiftPanel
              activeShift={activeShift}
              shiftSummary={shiftSummary}
              openingAmount={openingAmount}
              declaredAmount={declaredAmount}
              closeNotes={closeNotes}
              busy={busy}
              onOpeningAmountChange={setOpeningAmount}
              onDeclaredAmountChange={setDeclaredAmount}
              onCloseNotesChange={setCloseNotes}
              onOpenShift={handleOpenShift}
              onCloseShift={handleCloseShift}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}
