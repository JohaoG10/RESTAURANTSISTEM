import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import {
  fetchAvailableMenuItems,
  fetchOrderItems,
  fetchTablesForOrders,
  type MenuItem,
  type Order,
} from "../../orders/api";
import {
  fetchBillById,
  fetchBillItems,
  type Bill,
  type BillLine,
} from "../api";
import { emitSriInvoice, fetchCurrentIvaRate, getRideSignedUrl, openRideWindow, checkSriInvoiceStatus, pingSriService, isSriConfigError, type EmitInvoiceResult } from "../sri-invoice-api";
import { fetchInvoiceByBillId } from "../invoices-api";
import { getCachedSriConnectivity, setCachedSriConnectivity } from "../utils/sriConnectivity";
import { lookupContribuyente } from "../sri-api";
import { formatMoney } from "../utils";
import {
  detectIdType,
  inferComprobanteType,
  isValidIdentification,
  normalizeIdentification,
} from "../utils/ecuadorId";

type ComprobanteType = "invoice" | "sales_note";

const EMPTY_FORM = {
  identification: "",
  razonSocial: "",
  direccion: "",
  email: "",
};

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 8;

export function InvoiceEmitPage() {
  const { billId } = useParams<{ billId: string }>();
  const navigate = useNavigate();

  const [bill, setBill] = useState<Bill | null>(null);
  const [lines, setLines] = useState<BillLine[]>([]);
  const [menuMap, setMenuMap] = useState<Map<string, MenuItem>>(new Map());
  const [orderLabel, setOrderLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupFound, setLookupFound] = useState(false);
  const [consumidorFinal, setConsumidorFinal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [ivaRate, setIvaRate] = useState<number | null>(null);
  const [emitResult, setEmitResult] = useState<string | null>(null);
  const [authorizedInvoice, setAuthorizedInvoice] = useState<{
    authorizationNumber: string;
    accessKey: string;
    ridePath: string | null;
  } | null>(null);
  const [pendingInvoice, setPendingInvoice] = useState<{
    invoiceId: string;
    accessKey: string;
  } | null>(null);
  const [rejectedInvoice, setRejectedInvoice] = useState<{
    messages: string[];
  } | null>(null);
  const [sriSlow, setSriSlow] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingExhausted, setPollingExhausted] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const pollAttemptsRef = useRef(0);

  const backHref = orderId ? `/billing?order=${orderId}` : "/billing";

  const digits = normalizeIdentification(form.identification);
  const idValid = consumidorFinal || isValidIdentification(form.identification);
  const comprobanteType: ComprobanteType = useMemo(
    () => inferComprobanteType(form.identification, consumidorFinal),
    [form.identification, consumidorFinal]
  );

  const canGenerate =
    consumidorFinal ||
    (idValid && form.razonSocial.trim().length > 0);

  const taxableSubtotal = bill?.subtotal ?? 0;
  const ivaAmount =
    ivaRate != null ? Math.round(taxableSubtotal * (ivaRate / 100) * 100) / 100 : null;
  const grandTotal =
    bill && ivaAmount != null
      ? Math.round((taxableSubtotal + ivaAmount + bill.tip_amount) * 100) / 100
      : bill?.total ?? 0;

  useEffect(() => {
    void fetchCurrentIvaRate()
      .then(setIvaRate)
      .catch(() => setIvaRate(null));
  }, []);

  useEffect(() => {
    const cached = getCachedSriConnectivity();
    if (cached) {
      setSriSlow(!cached.available);
      return;
    }
    void pingSriService().then((ok) => {
      setCachedSriConnectivity(ok);
      setSriSlow(!ok);
    });
  }, []);

  const applyCheckResult = useCallback(
    (result: EmitInvoiceResult, accessKeyFallback: string): boolean => {
      if (result.success && result.sriStatus === "authorized") {
        setPendingInvoice(null);
        setIsPolling(false);
        setPollingExhausted(false);
        setAuthorizedInvoice({
          authorizationNumber: result.authorizationNumber ?? "",
          accessKey: result.accessKey ?? accessKeyFallback,
          ridePath: result.rideUrl ?? null,
        });
        setEmitResult(
          `Factura autorizada.\nNº autorización: ${result.authorizationNumber}\nClave de acceso: ${result.accessKey ?? accessKeyFallback}`
        );
        return true;
      }

      if (result.sriStatus === "rejected") {
        setPendingInvoice(null);
        setIsPolling(false);
        setPollingExhausted(false);
        const detail = result.messages?.join("\n") ?? result.error ?? "Rechazada";
        setRejectedInvoice({ messages: result.messages ?? [detail] });
        setError(`Factura rechazada:\n${detail}`);
        return true;
      }

      return false;
    },
    []
  );

  useEffect(() => {
    if (!pendingInvoice || authorizedInvoice || pollingExhausted) return;

    let cancelled = false;
    pollAttemptsRef.current = 0;
    setPollAttempt(0);
    setIsPolling(true);

    async function runPoll() {
      if (cancelled || pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        if (!cancelled && pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
          setIsPolling(false);
          setPollingExhausted(true);
        }
        return;
      }

      pollAttemptsRef.current += 1;
      setPollAttempt(pollAttemptsRef.current);
      const invoiceId = pendingInvoice!.invoiceId;
      const accessKey = pendingInvoice!.accessKey;

      try {
        const result = await checkSriInvoiceStatus({ invoiceId });
        if (cancelled) return;

        if (applyCheckResult(result, accessKey)) return;

        if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
          setIsPolling(false);
          setPollingExhausted(true);
        }
      } catch {
        if (cancelled) return;
        if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
          setIsPolling(false);
          setPollingExhausted(true);
        }
      }
    }

    void runPoll();
    const timer = window.setInterval(() => void runPoll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      setIsPolling(false);
    };
  }, [pendingInvoice, authorizedInvoice, pollingExhausted, applyCheckResult]);

  useEffect(() => {
    if (!billId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setPageError(null);
      try {
        const billRow = await fetchBillById(billId!);
        if (!billRow) {
          if (!cancelled) setPageError("Cuenta no encontrada.");
          return;
        }
        if (billRow.status !== "paid") {
          if (!cancelled) setPageError("La cuenta debe estar pagada para emitir factura.");
          return;
        }

        const [billItems, menuItems, tables] = await Promise.all([
          fetchBillItems(billId!),
          fetchAvailableMenuItems(),
          fetchTablesForOrders(),
        ]);

        const { data: orderRow, error: orderError } = await supabase
          .from("orders")
          .select("*")
          .eq("id", billRow.order_id)
          .maybeSingle();

        if (orderError || !orderRow) {
          if (!cancelled) setPageError("Comanda no encontrada.");
          return;
        }

        const orderItems = await fetchOrderItems([billRow.order_id]);
        const menu = new Map<string, MenuItem>();
        for (const item of menuItems) menu.set(item.id, item);

        const computedLines: BillLine[] = billItems.flatMap((billItem) => {
          const orderItem = orderItems.find((row) => row.id === billItem.order_item_id);
          if (!orderItem) return [];
          const allocated =
            billItem.allocated_amount != null ? Number(billItem.allocated_amount) : null;
          const fullLineTotal = orderItem.quantity * orderItem.price_at_order;
          return [
            {
              billItem,
              orderItem,
              lineTotal: allocated ?? billItem.quantity * orderItem.price_at_order,
              fullLineTotal: allocated != null ? fullLineTotal : undefined,
            },
          ];
        });

        const tableMap = new Map(tables.map((t) => [t.id, t]));
        const ord = orderRow as Order;
        let label = "Comanda";
        if ((ord as Order & { order_type?: string }).order_type === "takeaway") {
          const num = (
            (ord as Order & { takeaway_number?: number | null }).takeaway_number ?? 0
          )
            .toString()
            .padStart(3, "0");
          const name = (ord as Order & { customer_name?: string | null }).customer_name;
          label = name ? `#${num} — ${name}` : `#${num} — Para llevar`;
        } else if (ord.table_id) {
          const table = tableMap.get(ord.table_id);
          label = table ? `Mesa ${table.number}` : "Mesa";
        }

        if (billRow.split_label) label = `${label} — ${billRow.split_label}`;

        if (!cancelled) {
          setBill(billRow);
          setOrderId(billRow.order_id);
          setLines(computedLines);
          setMenuMap(menu);
          setOrderLabel(label);

          const existingInvoice = await fetchInvoiceByBillId(billId!);
          if (existingInvoice?.sri_status === "submitted" || existingInvoice?.sri_status === "received") {
            setPollingExhausted(false);
            setPendingInvoice({
              invoiceId: existingInvoice.id,
              accessKey: existingInvoice.access_key ?? "",
            });
            setEmitResult(
              existingInvoice.access_key
                ? `Clave de acceso: ${existingInvoice.access_key}`
                : "Comprobante en procesamiento en el SRI."
            );
          } else if (existingInvoice?.sri_status === "authorized") {
            setAuthorizedInvoice({
              authorizationNumber: existingInvoice.authorization_number ?? "",
              accessKey: existingInvoice.access_key ?? "",
              ridePath: existingInvoice.ride_url,
            });
            setEmitResult(
              `Factura ya autorizada.\nNº autorización: ${existingInvoice.authorization_number}`
            );
          } else if (existingInvoice?.sri_status === "rejected") {
            const sriResp = existingInvoice.sri_response as {
              recepcion?: { messages?: Array<{ mensaje?: string; informacionAdicional?: string }> };
              autorizacion?: { messages?: Array<{ mensaje?: string; informacionAdicional?: string }> };
            } | null;
            const msgs = [
              ...(sriResp?.recepcion?.messages ?? []),
              ...(sriResp?.autorizacion?.messages ?? []),
            ]
              .map((m) => [m.mensaje, m.informacionAdicional].filter(Boolean).join(" — "))
              .filter(Boolean);
            setRejectedInvoice({ messages: msgs });
            setError(
              msgs.length
                ? `La última emisión fue rechazada:\n${msgs.join("\n")}`
                : "La última emisión fue rechazada por el SRI. Corrija los datos del cliente y vuelva a emitir."
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          setPageError(err instanceof Error ? err.message : "Error al cargar la cuenta.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [billId]);

  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    if (!digits) {
      setLookupMessage("Ingrese un RUC o cédula.");
      return;
    }
    setConsumidorFinal(false);
    setBusy(true);
    setLookupMessage(null);
    setLookupFound(false);
    try {
      const result = await lookupContribuyente(digits);
      if (!result.valid) {
        setLookupMessage(result.message ?? "Identificación inválida.");
        return;
      }
      setForm((prev) => ({
        identification: result.identification || prev.identification,
        razonSocial: result.razonSocial ?? prev.razonSocial,
        direccion: result.direccion ?? prev.direccion,
        email: result.email ?? prev.email,
      }));
      setLookupFound(result.found);
      setLookupMessage(
        result.found
          ? result.estado
            ? `Datos encontrados — estado SRI: ${result.estado}`
            : "Datos encontrados."
          : result.message ?? "Ingresa los datos manualmente"
      );
    } catch (err) {
      setLookupMessage(err instanceof Error ? err.message : "Error al consultar.");
    } finally {
      setBusy(false);
    }
  }

  function handleConsumidorFinal() {
    setConsumidorFinal(true);
    setForm({
      identification: "9999999999999",
      razonSocial: "CONSUMIDOR FINAL",
      direccion: "",
      email: "",
    });
    setLookupMessage(null);
    setLookupFound(false);
  }

  async function handleGenerate() {
    if (!canGenerate || !bill) return;
    setBusy(true);
    setError(null);
    setEmitResult(null);
    setAuthorizedInvoice(null);
    setPendingInvoice(null);
    setRejectedInvoice(null);
    setPollingExhausted(false);
    setIsPolling(false);
    try {
      const result = await emitSriInvoice({
        billId: bill.id,
        invoiceType: comprobanteType,
        customer: {
          identification: form.identification,
          name: form.razonSocial.trim(),
          address: form.direccion.trim() || undefined,
          email: form.email.trim() || undefined,
          consumidorFinal,
        },
      });

      if (result.success && result.sriStatus === "authorized") {
        setAuthorizedInvoice({
          authorizationNumber: result.authorizationNumber ?? "",
          accessKey: result.accessKey ?? "",
          ridePath: result.rideUrl ?? null,
        });
        setEmitResult(
          `Factura autorizada.\nNº autorización: ${result.authorizationNumber}\nClave de acceso: ${result.accessKey}`
        );
        return;
      }

      if (result.sriStatus === "rejected") {
        const detail = result.messages?.join("\n") ?? result.error ?? "Rechazada por el SRI";
        setRejectedInvoice({ messages: result.messages ?? [detail] });
        setError(`Factura rechazada:\n${detail}`);
        return;
      }

      if (result.sriStatus === "submitted" && result.invoiceId && result.accessKey) {
        setPollingExhausted(false);
        setPendingInvoice({ invoiceId: result.invoiceId, accessKey: result.accessKey });
        setEmitResult(`Clave de acceso: ${result.accessKey}`);
        return;
      }

      if (result.accessKey) {
        setEmitResult(
          `Comprobante en procesamiento.\nClave de acceso: ${result.accessKey}\n${result.messages?.join(" ") ?? ""}`
        );
        return;
      }

      setError(result.error ?? "No se pudo completar la emisión.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al emitir factura.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckStatus() {
    if (!pendingInvoice) return;
    setBusy(true);
    setError(null);
    try {
      const result = await checkSriInvoiceStatus({ invoiceId: pendingInvoice.invoiceId });
      if (!applyCheckResult(result, pendingInvoice.accessKey)) {
        setEmitResult(
          `Aún en procesamiento.\nClave: ${result.accessKey ?? pendingInvoice.accessKey}\n${result.messages?.join(" ") ?? ""}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al consultar estado SRI.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenRide(format: "a4" | "thermal", action?: "print") {
    if (!authorizedInvoice?.ridePath) {
      setError("RIDE no disponible. La factura fue autorizada pero no se generó la representación impresa.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const signedUrl = await getRideSignedUrl(authorizedInvoice.ridePath);
      openRideWindow(signedUrl, { format, action });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el RIDE.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadPdf(format: "a4" | "thermal") {
    if (!authorizedInvoice?.ridePath) {
      setError("RIDE no disponible para descargar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const signedUrl = await getRideSignedUrl(authorizedInvoice.ridePath);
      openRideWindow(signedUrl, { format, action: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="bl-inv-page">
        <header className="bl-inv-page__header">
          <Link to={backHref} className="bl-inv-page__back">
            ← Volver
          </Link>
          <h1 className="bl-inv-page__title">Emitir factura electrónica</h1>
        </header>
        <div className="bl-inv-page__loading">Cargando cuenta…</div>
      </div>
    );
  }

  if (pageError || !bill) {
    return (
      <div className="bl-inv-page">
        <header className="bl-inv-page__header">
          <Link to={backHref} className="bl-inv-page__back">
            ← Volver
          </Link>
          <h1 className="bl-inv-page__title">Emitir factura electrónica</h1>
        </header>
        <div className="bl-inv-page__error">{pageError ?? "Cuenta no disponible."}</div>
      </div>
    );
  }

  return (
    <div className="bl-inv-page">
      <header className="bl-inv-page__header">
        <Link to={backHref} className="bl-inv-page__back">
          ← Volver
        </Link>
        <h1 className="bl-inv-page__title">Emitir factura electrónica</h1>
      </header>

      {sriSlow && (
        <div className="bl-inv-page__sri-banner" role="status">
          El servicio SRI está experimentando demoras. Puede intentar emitir, pero la autorización podría tardar.
        </div>
      )}

      {error && isSriConfigError(error) && (
        <div className="bl-inv-page__config-banner" role="alert">
          <p className="bl-inv-page__config-banner-text">{error}</p>
          <Link to="/settings" className="bl-inv-page__config-banner-btn">
            Ir a Configuración
          </Link>
        </div>
      )}

      <div className="bl-inv-page__body">
        {/* Resumen — solo lectura */}
        <section className="bl-inv-page__summary" aria-label="Resumen de cuenta">
          <h2 className="bl-inv-page__section-title">Resumen de cuenta</h2>
          <p className="bl-inv-page__order-label">{orderLabel}</p>

          <div className="bl-inv-page__items">
            {lines.map((line) => {
              const menu = menuMap.get(line.orderItem.menu_item_id);
              return (
                <div key={line.orderItem.id} className="bl-inv-page__item-row">
                  <span>{menu?.name ?? "Ítem"}</span>
                  <span className="bl-inv-page__item-qty">×{line.orderItem.quantity}</span>
                  <span className="bl-inv-page__item-price">{formatMoney(line.lineTotal)}</span>
                </div>
              );
            })}
          </div>

          <dl className="bl-inv-page__totals">
            <div className="bl-inv-page__total-row">
              <dt>Subtotal sin impuestos</dt>
              <dd>{formatMoney(bill.subtotal)}</dd>
            </div>
            {ivaRate != null && ivaAmount != null && (
              <div className="bl-inv-page__total-row">
                <dt>IVA ({ivaRate}%)</dt>
                <dd>{formatMoney(ivaAmount)}</dd>
              </div>
            )}
            {bill.tip_amount > 0 && (
              <div className="bl-inv-page__total-row">
                <dt>Propina ({bill.tip_percent}%)</dt>
                <dd>{formatMoney(bill.tip_amount)}</dd>
              </div>
            )}
            <div className="bl-inv-page__total-row bl-inv-page__total-row--grand">
              <dt>Total factura</dt>
              <dd>{formatMoney(grandTotal)}</dd>
            </div>
          </dl>
        </section>

        {/* Formulario cliente */}
        <section className="bl-inv-page__form-panel" aria-label="Datos del cliente">
          <h2 className="bl-inv-page__section-title">Datos del cliente</h2>

          {error && !isSriConfigError(error) && (
            <div className="bl-inv-page__error" role="alert">
              {error}
            </div>
          )}
          {rejectedInvoice && (
            <div className="bl-inv-page__rejected" role="alert">
              <strong>Emisión rechazada — corrija y re-emita</strong>
              {rejectedInvoice.messages.length > 0 && (
                <ul className="bl-inv-page__rejected-list">
                  {rejectedInvoice.messages.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {pendingInvoice && !authorizedInvoice && (
            <div className="bl-inv-page__pending">
              {isPolling && !pollingExhausted && (
                <div className="bl-inv-page__polling" role="status" aria-live="polite">
                  <span className="bl-spinner bl-inv-page__polling-spinner" aria-hidden />
                  <p className="bl-inv-page__polling-text">Esperando autorización del SRI…</p>
                  <p className="bl-inv-page__polling-hint">
                    Consultando cada 15 segundos (intento {pollAttempt} de {MAX_POLL_ATTEMPTS})
                  </p>
                  {pendingInvoice.accessKey && (
                    <p className="bl-inv-page__polling-hint">Clave: {pendingInvoice.accessKey}</p>
                  )}
                </div>
              )}

              {pollingExhausted && (
                <div className="bl-inv-page__polling-timeout">
                  <p className="bl-invoice-message bl-invoice-message--info">
                    El SRI está tardando más de lo normal. Puedes consultar el estado manualmente desde el
                    historial de facturas.
                  </p>
                  <Link to="/billing/invoices" className="bl-btn-invoice bl-inv-page__check-btn">
                    Ir al historial de facturas
                  </Link>
                </div>
              )}

              {!isPolling && !pollingExhausted && (
                <>
                  <p className="bl-invoice-message bl-invoice-message--info">
                    Comprobante en procesamiento en el SRI.
                  </p>
                  <button
                    type="button"
                    className="bl-btn-invoice bl-inv-page__check-btn"
                    disabled={busy}
                    onClick={() => void handleCheckStatus()}
                  >
                    Consultar estado SRI
                  </button>
                </>
              )}
            </div>
          )}

          {emitResult && !isPolling && (
            <p className="bl-invoice-message bl-invoice-message--success">{emitResult}</p>
          )}

          {authorizedInvoice && (
            <div className="bl-inv-page__ride-panel" aria-label="Representación impresa">
              <h3 className="bl-inv-page__ride-title">RIDE — Representación impresa</h3>
              <div className="bl-inv-page__ride-actions">
                <button
                  type="button"
                  className="bl-btn-invoice bl-inv-page__ride-btn"
                  disabled={busy || !authorizedInvoice.ridePath}
                  onClick={() => void handleOpenRide("a4", "print")}
                >
                  Imprimir RIDE (A4)
                </button>
                <button
                  type="button"
                  className="bl-btn-invoice bl-inv-page__ride-btn"
                  disabled={busy || !authorizedInvoice.ridePath}
                  onClick={() => void handleOpenRide("thermal", "print")}
                >
                  Imprimir térmico 80mm
                </button>
                <button
                  type="button"
                  className="bl-btn-secondary bl-inv-page__ride-btn"
                  disabled={busy || !authorizedInvoice.ridePath}
                  onClick={() => void handleDownloadPdf("a4")}
                >
                  Descargar PDF (A4)
                </button>
                <button
                  type="button"
                  className="bl-btn-secondary bl-inv-page__ride-btn"
                  disabled={busy || !authorizedInvoice.ridePath}
                  onClick={() => void handleDownloadPdf("thermal")}
                >
                  Descargar PDF (80mm)
                </button>
                <button
                  type="button"
                  className="bl-btn-secondary bl-inv-page__ride-btn"
                  disabled={busy}
                  onClick={() => navigate(backHref)}
                >
                  Volver al cobro
                </button>
              </div>
              {!authorizedInvoice.ridePath && (
                <p className="bl-invoice-message bl-invoice-message--info">
                  La factura fue autorizada pero el RIDE no se generó. Contacte al administrador.
                </p>
              )}
            </div>
          )}

          <form className="bl-inv-page__lookup" onSubmit={(e) => void handleLookup(e)}>
            <label className="bl-inv-page__field">
              <span className="bl-inv-page__field-label">RUC o cédula</span>
              <div className="bl-inv-page__lookup-row">
                <input
                  className="bl-inv-page__id-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="Ej. 1790016919001 o 1710034065"
                  value={form.identification}
                  disabled={busy || consumidorFinal}
                  onChange={(e) => {
                    setConsumidorFinal(false);
                    setForm((prev) => ({ ...prev, identification: e.target.value }));
                    setLookupFound(false);
                    setLookupMessage(null);
                  }}
                />
                <button
                  type="submit"
                  className="bl-btn-invoice bl-inv-page__lookup-btn"
                  disabled={busy || !digits || consumidorFinal}
                >
                  {busy ? "Consultando…" : "Consultar"}
                </button>
              </div>
            </label>
          </form>

          {lookupMessage && (
            <p
              className={`bl-invoice-message${
                lookupFound ? " bl-invoice-message--success" : " bl-invoice-message--info"
              }`}
            >
              {lookupMessage}
            </p>
          )}

          <button
            type="button"
            className={`bl-btn-consumer bl-inv-page__consumer-btn${consumidorFinal ? " bl-btn-consumer--active" : ""}`}
            disabled={busy}
            onClick={handleConsumidorFinal}
          >
            Consumidor final
          </button>

          <div className="bl-inv-page__fields">
            <label className="bl-inv-page__field">
              <span className="bl-inv-page__field-label">Razón social</span>
              <input
                className="bl-input"
                value={form.razonSocial}
                disabled={busy || consumidorFinal}
                placeholder="Nombre o razón social"
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, razonSocial: e.target.value }))
                }
              />
            </label>
            <label className="bl-inv-page__field">
              <span className="bl-inv-page__field-label">Dirección</span>
              <input
                className="bl-input"
                value={form.direccion}
                disabled={busy || consumidorFinal}
                placeholder="Dirección del cliente"
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, direccion: e.target.value }))
                }
              />
            </label>
            <label className="bl-inv-page__field">
              <span className="bl-inv-page__field-label">Email</span>
              <input
                className="bl-input"
                type="email"
                value={form.email}
                disabled={busy}
                placeholder="correo@ejemplo.com"
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </label>
          </div>

          <div className="bl-inv-page__comprobante">
            <span className="bl-inv-page__field-label">Tipo de comprobante</span>
            <div
              className={`bl-inv-page__comprobante-badge${
                comprobanteType === "invoice"
                  ? " bl-inv-page__comprobante-badge--invoice"
                  : " bl-inv-page__comprobante-badge--note"
              }`}
            >
              {comprobanteType === "invoice" ? "Factura (RUC)" : "Nota de venta (cédula / CF)"}
            </div>
            {!consumidorFinal && form.identification && (
              <span className="bl-inv-page__comprobante-hint">
                {detectIdType(form.identification) === "ruc"
                  ? "RUC detectado → factura electrónica"
                  : detectIdType(form.identification) === "cedula"
                    ? "Cédula detectada → nota de venta"
                    : "Ingrese un RUC o cédula válido"}
              </span>
            )}
          </div>

          <div className="bl-inv-page__actions">
            {!authorizedInvoice && !pendingInvoice && (
              <>
                <button
                  type="button"
                  className="bl-btn-invoice bl-inv-page__generate-btn"
                  disabled={busy || !canGenerate}
                  onClick={() => void handleGenerate()}
                >
                  Generar factura
                </button>
                <button
                  type="button"
                  className="bl-btn-secondary bl-inv-page__cancel-btn"
                  disabled={busy}
                  onClick={() => navigate(backHref)}
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
