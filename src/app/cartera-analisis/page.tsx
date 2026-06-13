"use client";

// =============================================================================
// /cartera-analisis — Panel del alumno, pestaña ANÁLISIS (Fase 2)
// =============================================================================
// KPIs grandes (CAGR, volatilidad, máx drawdown, % meses positivos, YTD, total)
// + heatmap de rentabilidades años×meses. Trabaja sobre la cartera REAL del
// alumno (ck-cartera-holdings) o, si no la ha creado, el modelo K de su perfil.
// Reutiliza /api/campus/cartera-backtest (mismo motor, misma corrida).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

const ROJO = "#C81E2E";
const GRIS = "#8A8A8A";
const BEIGE = "#F5F0EB";
const TINTA = "#202020";
const SUAVE = "#6B6B6B";
const VERDE = "#15633F";

const BENCHMARKS = [
  { key: "carterak", label: "Cartera K de tu perfil" },
  { key: "vwce", label: "MSCI All-World (VWCE)" },
  { key: "world", label: "MSCI World (IWDA)" },
  { key: "sp500", label: "S&P 500 (SXR8)" },
];
const PERIODS = [
  { key: "1y", label: "1A" },
  { key: "3y", label: "3A" },
  { key: "5y", label: "5A" },
  { key: "max", label: "Máx" },
  { key: "ytd", label: "YTD" },
];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface Metrics {
  totalReturn: number; cagr: number; volatility: number;
  maxDrawdown: number; positiveMonthsRatio: number;
}
interface SeriesPoint { date: string; value: number; exactDate?: string }
interface Result {
  portfolioName: string;
  timeSeries: SeriesPoint[];
  metrics: Metrics;
  annualReturns: { year: number; returnPct: number }[];
}
interface ApiResponse {
  profile: number;
  source?: "cartera" | "modelo";
  carteraName?: string;
  cartera: Result;
  benchmark?: Result;
  benchmarkName: string;
  droppedIsins?: string[];
  droppedWeightPct?: number;
  reliable?: boolean;
  requestedStart?: string;
  windowLimitedBy?: { name: string; start: string } | null;
  effectiveDateRange?: { startDate?: string; endDate?: string };
  warnings?: { message: string }[];
  error?: string;
  message?: string;
}

const fmtPct = (d: number, signed = false) =>
  `${signed && d >= 0 ? "+" : ""}${(d * 100).toFixed(1).replace(".", ",")}%`;

function readProfile(): number | null {
  try {
    const r = Number(JSON.parse(localStorage.getItem("ck-cartera") || "{}")?.riesgo);
    return Number.isFinite(r) && r >= 1 && r <= 10 ? Math.round(r) : null;
  } catch { return null; }
}
function readHoldings(): { isin: string; weight: number }[] | null {
  try {
    const h = JSON.parse(localStorage.getItem("ck-cartera-holdings") || "{}")?.holdings;
    return Array.isArray(h) && h.length > 0 ? h : null;
  } catch { return null; }
}
function readEstrategia(): "geo" | "sector" {
  try {
    const e = String(JSON.parse(localStorage.getItem("ck-cartera") || "{}")?.estrategia || "");
    return e.startsWith("geo") ? "geo" : "sector";
  } catch { return "sector"; }
}

// Color de celda del heatmap: rojo (<0) → blanco (0) → verde (>0); satura a ±6%.
function heatColor(r: number | undefined): string {
  if (r === undefined || r === null || Number.isNaN(r)) return "#faf7f2";
  const t = Math.max(-1, Math.min(1, r / 0.06));
  const mix = (to: number, a: number) => Math.round(255 + (to - 255) * a);
  if (t >= 0) return `rgb(${mix(21, t)},${mix(99, t)},${mix(63, t)})`;
  const a = -t;
  return `rgb(${mix(200, a)},${mix(30, a)},${mix(46, a)})`;
}
function heatText(r: number | undefined): string {
  if (r === undefined || r === null || Number.isNaN(r)) return "#bbb";
  return Math.abs(r) / 0.06 > 0.55 ? "#fff" : "#333";
}

export default function CarteraAnalisisPage() {
  const [profile, setProfile] = useState(5);
  const [detected, setDetected] = useState(false);
  const [benchmark, setBenchmark] = useState("carterak");
  const [period, setPeriod] = useState("max");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<{ isin: string; weight: number }[] | null>(null);
  const [carteraKStrategy, setCarteraKStrategy] = useState<"geo" | "sector">("sector");

  const reqIdRef = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const p = readProfile();
    if (p) { setProfile(p); setDetected(true); }
    setCarteraKStrategy(readEstrategia());
    const h = readHoldings();
    if (h) setHoldings(h);
    else setBenchmark("vwce"); // sin cartera propia, no comparamos Cartera K vs sí misma
    setReady(true);
  }, []);

  const run = useCallback(async () => {
    const myId = ++reqIdRef.current;
    setLoading(true); setError(null);
    try {
      const usarCartera = !!holdings && holdings.length > 0;
      const res = await fetch("/api/campus/cartera-backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          usarCartera
            ? { profile, benchmark, carteraKStrategy, period, holdings, carteraName: "Mi Cartera" }
            : { profile, benchmark, carteraKStrategy, period }
        ),
      });
      const json: ApiResponse = await res.json();
      if (myId !== reqIdRef.current) return;
      if (!res.ok) { setError(json.message || json.error || "No se pudo analizar la cartera."); setData(null); }
      else setData(json);
    } catch {
      if (myId === reqIdRef.current) { setError("Error de red. Inténtalo de nuevo."); setData(null); }
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, [profile, benchmark, carteraKStrategy, period, holdings]);

  useEffect(() => { if (ready) run(); }, [ready, run]);

  const benchLabel = data?.benchmarkName || BENCHMARKS.find((x) => x.key === benchmark)?.label || "Referencia";
  const carteraLabel = data
    ? data.source === "cartera" ? (data.carteraName || "Tu cartera") : `Cartera K (Perfil ${data.profile})`
    : "Tu cartera";

  // --- Heatmap: rentabilidades mensuales (TWR) por año desde la serie ---
  const annualByYear = new Map<number, number>(
    (data?.cartera.annualReturns ?? []).map((a) => [a.year, a.returnPct / 100])
  );
  const monthlyByYear = new Map<number, Record<number, number>>();
  if (data?.cartera.timeSeries?.length) {
    const ts = data.cartera.timeSeries;
    for (let i = 1; i < ts.length; i++) {
      const cur = ts[i]; const prevPt = ts[i - 1];
      if (!cur || !prevPt || !prevPt.value) continue;
      const [yStr, mStr] = cur.date.split("-");
      if (!yStr || !mStr) continue;
      const y = Number(yStr); const m = Number(mStr);
      if (!monthlyByYear.has(y)) monthlyByYear.set(y, {});
      monthlyByYear.get(y)![m] = cur.value / prevPt.value - 1;
    }
  }
  const heatYears = [...new Set([...annualByYear.keys(), ...monthlyByYear.keys()])].sort((a, b) => b - a);

  // YTD = año natural en curso (última entrada de annualReturns)
  const ytdEntry = data?.cartera.annualReturns?.length
    ? data.cartera.annualReturns[data.cartera.annualReturns.length - 1]
    : null;

  const kpis = data ? [
    { label: "Rentabilidad total", value: fmtPct(data.cartera.metrics.totalReturn, true), color: data.cartera.metrics.totalReturn >= 0 ? VERDE : ROJO, tip: "Lo que habría crecido tu cartera en todo el periodo.", sub: data.benchmark ? `índice: ${fmtPct(data.benchmark.metrics.totalReturn, true)}` : undefined },
    { label: "Rentabilidad anual (CAGR)", value: fmtPct(data.cartera.metrics.cagr, true), color: data.cartera.metrics.cagr >= 0 ? VERDE : ROJO, tip: "Tu rentabilidad media anual compuesta.", sub: data.benchmark ? `índice: ${fmtPct(data.benchmark.metrics.cagr, true)}` : undefined },
    { label: ytdEntry ? `Este año (${ytdEntry.year})` : "Este año", value: ytdEntry ? `${ytdEntry.returnPct >= 0 ? "+" : ""}${ytdEntry.returnPct.toFixed(1).replace(".", ",")}%` : "—", color: ytdEntry && ytdEntry.returnPct >= 0 ? VERDE : ROJO, tip: "Lo que llevas ganado este año natural." },
    { label: "Volatilidad", value: fmtPct(data.cartera.metrics.volatility), color: TINTA, tip: "Lo movida que es tu cartera. Más alta = sube y baja más fuerte." },
    { label: "Máxima caída", value: fmtPct(data.cartera.metrics.maxDrawdown), color: ROJO, tip: "La mayor caída desde un máximo: tu peor susto histórico." },
    { label: "Meses positivos", value: fmtPct(data.cartera.metrics.positiveMonthsRatio), color: TINTA, tip: "De cada 100 meses, cuántos cerraron en verde." },
  ] : [];

  return (
    <div style={{ background: BEIGE, minHeight: "100vh", color: TINTA, padding: "22px 18px 48px" }}>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "1.9rem", margin: "0 0 4px", color: ROJO }}>
          Análisis de tu cartera
        </h1>
        <p style={{ color: SUAVE, margin: "0 0 18px", fontSize: ".95rem" }}>
          Las cifras que importan, de un vistazo. Cuánto rinde {carteraLabel.toLowerCase()} y cuánto puede doler.
        </p>

        {/* Controles */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", background: "#fff", border: "1px solid #e7ddcf", borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".8rem", fontWeight: 600, color: SUAVE }}>
            Perfil de riesgo {detected && <span style={{ color: VERDE }}>· detectado</span>}
            <select value={profile} onChange={(e) => setProfile(Number(e.target.value))} disabled={loading} style={selStyle}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Perfil {n}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".8rem", fontWeight: 600, color: SUAVE }}>
            Comparar con
            <select value={benchmark} onChange={(e) => setBenchmark(e.target.value)} disabled={loading} style={selStyle}>
              {BENCHMARKS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".8rem", fontWeight: 600, color: SUAVE }}>
            Periodo
            <div style={{ display: "flex", gap: 6 }}>
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => setPeriod(p.key)} disabled={loading}
                  style={{ ...pillStyle, background: period === p.key ? ROJO : "#fff", color: period === p.key ? "#fff" : SUAVE, borderColor: period === p.key ? ROJO : "#e0d7c8" }}>{p.label}</button>
              ))}
            </div>
          </div>
          {loading && <span style={{ color: SUAVE, fontSize: ".85rem", marginLeft: "auto" }}>Calculando…</span>}
        </div>

        {error && (
          <div style={{ background: "#FBE9E7", border: "1px solid #f3c9c2", color: "#8a2c22", borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>{error}</div>
        )}

        {data && !error && (
          <>
            {data.reliable === false && (
              <div style={{ background: "#FBE9E7", border: "1px solid #e9a59a", color: "#8a2c22", borderRadius: 12, padding: "14px 16px", marginBottom: 16, fontSize: ".9rem" }}>
                <strong>⚠ Análisis no representativo.</strong> Nos falta el histórico de precios del {data.droppedWeightPct}% de tu cartera (instrumentos excluidos: {(data.droppedIsins || []).join(", ")}). Las cifras reescalan el resto, así que no reflejan tu cartera real. Estamos añadiendo esos instrumentos.
              </div>
            )}
            {(() => {
              const es = data.effectiveDateRange?.startDate; const rs = data.requestedStart;
              if (!es || !rs) return null;
              const ep = es.slice(0, 7).split("-"); const rp = rs.slice(0, 7).split("-");
              const ey = Number(ep[0]); const em = Number(ep[1]);
              const ry = Number(rp[0]); const rm = Number(rp[1]);
              if (![ey, em, ry, rm].every(Number.isFinite)) return null;
              if ((ey - ry) * 12 + (em - rm) <= 6) return null;
              return (
                <div style={{ background: "#FFF7E6", border: "1px solid #ecdca6", color: "#7a5b10", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: ".85rem" }}>
                  ℹ️ El histórico empieza en <strong>{es}</strong>: {data.windowLimitedBy
                    ? <>no llega más atrás porque <strong>{data.windowLimitedBy.name}</strong> solo tiene datos desde {data.windowLimitedBy.start.slice(0, 7)}. Si lo sustituyes por un equivalente con más historia, verás más años.</>
                    : "no llega más atrás porque algún instrumento de tu cartera (normalmente un ETF de renta fija reciente) no tiene datos anteriores. Para ver más años, sustitúyelo por un equivalente con más historia."}
                </div>
              );
            })()}
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 12, marginBottom: 16 }}>
              {kpis.map((k) => (
                <div key={k.label} title={k.tip} style={{ background: "#fff", border: "1px solid #e7ddcf", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 3px rgba(32,32,32,.04)", cursor: "help" }}>
                  <div style={{ fontSize: ".74rem", textTransform: "uppercase", letterSpacing: ".4px", color: SUAVE, fontWeight: 600, marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "1.85rem", fontWeight: 700, lineHeight: 1, color: k.color }}>{k.value}</div>
                  {k.sub && <div style={{ fontSize: ".76rem", color: SUAVE, marginTop: 5 }}>{k.sub}</div>}
                </div>
              ))}
            </div>

            {/* Heatmap años × meses */}
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <h2 style={h2Style}>Rentabilidad mes a mes</h2>
                <span style={{ fontSize: ".8rem", color: SUAVE }}>{data.effectiveDateRange?.startDate} → {data.effectiveDateRange?.endDate}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 2, fontSize: ".72rem", minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: SUAVE, fontWeight: 600 }}>Año</th>
                      {MESES.map((m) => <th key={m} style={{ textAlign: "center", padding: "4px 2px", color: SUAVE, fontWeight: 600 }}>{m}</th>)}
                      <th style={{ textAlign: "center", padding: "4px 6px", color: TINTA, fontWeight: 700, borderLeft: "2px solid #e7ddcf" }}>Año</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatYears.map((y) => {
                      const months = monthlyByYear.get(y) || {};
                      const annual = annualByYear.get(y);
                      return (
                        <tr key={y}>
                          <td style={{ padding: "4px 8px", fontWeight: 700, color: TINTA }}>{y}</td>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                            const r = months[m];
                            return (
                              <td key={m} title={r !== undefined ? `${MESES[m - 1]} ${y}: ${fmtPct(r, true)}` : ""}
                                style={{ textAlign: "center", padding: "6px 2px", borderRadius: 4, background: heatColor(r), color: heatText(r), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                                {r !== undefined ? `${(r * 100).toFixed(1).replace(".", ",")}` : ""}
                              </td>
                            );
                          })}
                          <td style={{ textAlign: "center", padding: "6px 6px", borderLeft: "2px solid #e7ddcf", fontWeight: 800, color: annual === undefined ? "#bbb" : annual >= 0 ? VERDE : ROJO, fontVariantNumeric: "tabular-nums" }}>
                            {annual !== undefined ? fmtPct(annual, true) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: ".74rem", color: SUAVE, marginTop: 10 }}>
                Cada celda es la rentabilidad de ese mes. Verde = mes en positivo, rojo = en negativo. La última columna es el total del año.
              </p>
            </div>

            {data.droppedIsins && data.droppedIsins.length > 0 && (
              <div style={{ background: "#FFF7E6", border: "1px solid #ecdca6", color: "#7a5b10", borderRadius: 10, padding: "10px 14px", marginTop: 14, fontSize: ".82rem" }}>
                {data.droppedIsins.length} instrumento(s) de tu cartera no tienen histórico de precios y se han excluido del análisis ({data.droppedIsins.join(", ")}).
              </div>
            )}
            <p style={{ fontSize: ".76rem", color: SUAVE, marginTop: 16, lineHeight: 1.5 }}>
              Cartera simulada con fines educativos. Las rentabilidades pasadas no garantizan rentabilidades futuras.
              Esto no es asesoramiento financiero ni una recomendación personalizada. Datos de mercado vía EODHD.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const selStyle: React.CSSProperties = { fontFamily: "inherit", fontSize: ".9rem", padding: "8px 10px", border: "1px solid #e0d7c8", borderRadius: 8, background: "#fff", color: "#202020", minWidth: 150 };
const pillStyle: React.CSSProperties = { fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600, padding: "8px 14px", border: "1px solid", borderRadius: 999, cursor: "pointer" };
const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e7ddcf", borderRadius: 14, padding: "18px 20px", marginBottom: 16, boxShadow: "0 1px 3px rgba(32,32,32,.04)" };
const h2Style: React.CSSProperties = { fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "1.15rem", margin: "0 0 12px", color: "#202020" };
