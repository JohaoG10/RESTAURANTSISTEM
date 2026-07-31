import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/AuthProvider";
import {
  fetchInvoices,
  formatDocNumberFromAccessKey,
  getXmlSignedUrl,
  invoiceStatusClass,
  invoiceStatusLabel,
  type InvoiceListItem,
} from "../invoices-api";
import {
  checkAllPendingInvoices,
  fetchInvoiceAuditEvents,
  fetchSriInvoiceMetrics,
  getRideSignedUrl,
  openRideWindow,
  reissueSriInvoice,
  type InvoiceAuditEvent,
  type SriInvoiceMetrics,
} from "../sri-invoice-api";
import { formatMoney } from "../utils";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export function InvoiceHistoryPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [fromDate, setFromDate] = useState(daysAgoIso(30));
  const [toDate, setToDate] = useState(todayIsoDate());
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [metrics, setMetrics] = useState<SriInvoiceMetrics | null>(null);
  const [auditEvents, setAuditEvents] = useState<InvoiceAuditEvent[]>([]);
  const [auditFilter, setAuditFilter] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, m] = await Promise.all([
        fetchInvoices({ fromDate, toDate }),
        fetchSriInvoiceMetrics(),
      ]);
      setInvoices(rows);
      setMetrics(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar facturas.");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const loadAudit = useCallback(async (filter: string) => {
    try {
      const events = await fetchInvoiceAuditEvents(filter || undefined);
      setAuditEvents(events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar auditoría.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showAudit) void loadAudit(auditFilter);
  }, [showAudit, auditFilter, loadAudit]);

  function handleFilterSubmit(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  async function openRide(path: string, format: "a4" | "thermal") {
    setBusyId(path);
    try {
      const url = await getRideSignedUrl(path);
      openRideWindow(url, { format });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el RIDE.");
    } finally {
      setBusyId(null);
    }
  }

  async function openXml(path: string) {
    setBusyId(path);
    try {
      const url = await getXmlSignedUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el XML.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReissue(inv: InvoiceListItem) {
    setBusyId(inv.id);
    setError(null);
    setInfo(null);
    try {
      const consumidorFinal = !inv.customer_ruc;
      const result = await reissueSriInvoice({
        previousInvoiceId: inv.id,
        invoiceType: inv.invoice_type,
        customer: {
          identification: inv.customer_ruc ?? "9999999999999",
          name: inv.customer_name,
          address: inv.customer_address ?? undefined,
          email: inv.customer_email ?? undefined,
          consumidorFinal,
        },
      });
      if (result.success) {
        setInfo(`Re-emisión autorizada: ${result.authorizationNumber ?? result.accessKey}`);
      } else {
        setError(result.error ?? result.messages?.join("\n") ?? "Re-emisión no completada");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al re-emitir.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCheckAllPending() {
    setBusyId("check-all");
    setError(null);
    try {
      const result = await checkAllPendingInvoices();
      setInfo(result.messages?.join(" ") ?? "Consulta completada");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al consultar pendientes.");
    } finally {
      setBusyId(null);
    }
  }

  const lastInv = metrics?.lastInvoice;

  return (
    <div className="bl-inv-history">
      <header className="bl-inv-history__header">
        <Link to="/billing" className="bl-inv-page__back">
          ← Volver al cobro
        </Link>
        <h1 className="bl-inv-history__title">Historial de facturas</h1>
      </header>

      {metrics && (
        <section className="bl-inv-metrics" aria-label="Métricas SRI">
          {metrics.certDaysLeft != null && metrics.certDaysLeft < 30 && (
            <div className="bl-inv-metrics__alert bl-inv-metrics__alert--warn">
              Certificado digital vence en {metrics.certDaysLeft} días — renuévelo en Configuración
            </div>
          )}
          {metrics.rejectedUnreissued > 0 && (
            <div className="bl-inv-metrics__alert bl-inv-metrics__alert--err">
              {metrics.rejectedUnreissued} factura(s) rechazada(s) sin re-emitir
            </div>
          )}

          <div className="bl-inv-metrics__grid">
            <div className="bl-inv-metrics__card">
              <span className="bl-inv-metrics__label">Hoy</span>
              <strong>{metrics.todayCount}</strong>
              <span className="bl-inv-metrics__hint">emitidas</span>
            </div>
            <div className="bl-inv-metrics__card">
              <span className="bl-inv-metrics__label">Este mes</span>
              <strong>{metrics.monthCount}</strong>
              <span className="bl-inv-metrics__hint">emitidas</span>
            </div>
            <div className="bl-inv-metrics__card">
              <span className="bl-inv-metrics__label">Tasa éxito</span>
              <strong>{metrics.successRate != null ? `${metrics.successRate}%` : "—"}</strong>
              <span className="bl-inv-metrics__hint">autorizadas / rechazadas</span>
            </div>
            <div className="bl-inv-metrics__card">
              <span className="bl-inv-metrics__label">Tiempo auth.</span>
              <strong>{metrics.avgAuthSeconds > 0 ? `${metrics.avgAuthSeconds}s` : "—"}</strong>
              <span className="bl-inv-metrics__hint">promedio mes</span>
            </div>
            <div className="bl-inv-metrics__card bl-inv-metrics__card--pending">
              <span className="bl-inv-metrics__label">Pendientes SRI</span>
              <strong>{metrics.pendingCount}</strong>
              {metrics.pendingCount > 0 && (
                <button
                  type="button"
                  className="bl-inv-history__link-btn"
                  disabled={busyId === "check-all"}
                  onClick={() => void handleCheckAllPending()}
                >
                  Re-consultar todas
                </button>
              )}
            </div>
          </div>

          {lastInv && (
            <div className="bl-inv-metrics__last">
              <span>Última factura:</span>
              <strong>{formatDocNumberFromAccessKey(lastInv.access_key)}</strong>
              <span>{lastInv.customer_name}</span>
              {lastInv.sri_response?.importeTotal != null && (
                <span>{formatMoney(Number(lastInv.sri_response.importeTotal))}</span>
              )}
              <span className="bl-inv-metrics__ago">{timeAgo(lastInv.created_at)}</span>
              <span className={`bl-inv-status ${invoiceStatusClass(lastInv.sri_status)}`}>
                {invoiceStatusLabel(lastInv.sri_status)}
              </span>
            </div>
          )}
        </section>
      )}

      <form className="bl-inv-history__filters" onSubmit={handleFilterSubmit}>
        <label className="bl-inv-history__filter">
          <span>Desde</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="bl-inv-history__filter">
          <span>Hasta</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button type="submit" className="bl-btn-invoice" disabled={loading}>
          Filtrar
        </button>
        {isAdmin && (
          <button
            type="button"
            className="bl-btn-secondary"
            onClick={() => setShowAudit((v) => !v)}
          >
            {showAudit ? "Ocultar auditoría" : "Ver auditoría"}
          </button>
        )}
      </form>

      {error && <div className="bl-inv-page__error">{error}</div>}
      {info && <p className="bl-invoice-message bl-invoice-message--success">{info}</p>}

      {showAudit && isAdmin && (
        <section className="bl-inv-audit">
          <div className="bl-inv-audit__filters">
            <label>
              Filtrar evento
              <select value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)}>
                <option value="">Todos</option>
                <option value="authorized">Autorizadas</option>
                <option value="rejected">Rechazadas</option>
                <option value="error">Errores</option>
                <option value="validation_passed">Validación OK</option>
                <option value="retry_attempted">Reintentos</option>
              </select>
            </label>
          </div>
          <ul className="bl-inv-audit__list">
            {auditEvents.map((ev) => (
              <li key={ev.id} className="bl-inv-audit__item">
                <time>{new Date(ev.created_at).toLocaleString("es-EC")}</time>
                <span>{String(ev.payload?.eventType ?? ev.to_status)}</span>
                <span className="bl-inv-audit__meta">
                  {ev.from_status} → {ev.to_status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <p className="bl-inv-history__loading">Cargando facturas…</p>
      ) : invoices.length === 0 ? (
        <p className="bl-inv-history__empty">No hay facturas en el período seleccionado.</p>
      ) : (
        <div className="bl-inv-history__table-wrap">
          <table className="bl-inv-history__table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>IVA</th>
                <th>Estado</th>
                <th>Autorización</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const total = inv.sri_response?.importeTotal ?? null;
                const iva = inv.sri_response?.ivaAmount ?? null;
                const docNum = formatDocNumberFromAccessKey(inv.access_key);
                return (
                  <tr key={inv.id}>
                    <td>{docNum}</td>
                    <td>
                      <strong>{inv.customer_name}</strong>
                      {inv.customer_ruc ? (
                        <span className="bl-inv-history__id">{inv.customer_ruc}</span>
                      ) : null}
                    </td>
                    <td>{total != null ? formatMoney(total) : "—"}</td>
                    <td>{iva != null ? formatMoney(iva) : "—"}</td>
                    <td>
                      <span className={`bl-inv-status ${invoiceStatusClass(inv.sri_status)}`}>
                        {invoiceStatusLabel(inv.sri_status)}
                      </span>
                    </td>
                    <td>
                      {inv.authorized_at
                        ? new Date(inv.authorized_at).toLocaleString("es-EC")
                        : "—"}
                    </td>
                    <td className="bl-inv-history__actions">
                      {inv.sri_status === "rejected" && (
                        <button
                          type="button"
                          className="bl-inv-history__link-btn bl-inv-history__link-btn--reissue"
                          disabled={busyId === inv.id}
                          onClick={() => void handleReissue(inv)}
                        >
                          Re-emitir
                        </button>
                      )}
                      {inv.ride_url ? (
                        <>
                          <button
                            type="button"
                            className="bl-inv-history__link-btn"
                            disabled={busyId === inv.ride_url}
                            onClick={() => void openRide(inv.ride_url!, "a4")}
                          >
                            RIDE
                          </button>
                          <button
                            type="button"
                            className="bl-inv-history__link-btn"
                            disabled={busyId === inv.ride_url}
                            onClick={() => void openRide(inv.ride_url!, "thermal")}
                          >
                            80mm
                          </button>
                        </>
                      ) : null}
                      {inv.xml_url ? (
                        <button
                          type="button"
                          className="bl-inv-history__link-btn"
                          disabled={busyId === inv.xml_url}
                          onClick={() => void openXml(inv.xml_url!)}
                        >
                          XML
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
