"use client";

// =============================================================================
// /cartera-backtest — Panel del alumno, pestaña BACKTEST (Fase 1)
// =============================================================================
// Lee el perfil de riesgo del alumno (localStorage ck-cartera, escrito por
// "Mi Cartera"), resuelve su Cartera K y la compara históricamente contra un
// ETF indexado de referencia. Reutiliza el motor vía /api/campus/cartera-backtest.
// Comparación de estrategia (TWR, suma global, sin aportaciones).
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// --- Marca ---
const ROJO = "#C81E2E";
const GRIS = "#8A8A8A";
const BEIGE = "#F5F0EB";
const TINTA = "#202020";
const SUAVE = "#6B6B6B";
const VERDE = "#15633F";

const BENCHMARKS = [
  { key: "vwce", label: "MSCI All-World (VWCE)" },
  { key: "world", label: "MSCI World (IWDA)" },
  { key: "sp500", label: "S&P 500 (SXR8)" },
];
const PERIODS: { key: string; label: string }[] = [
  { key: "1y", label: "1A" },
  { key: "3y", label: "3A" },
  { key: "5y", label: "5A" },
  { key: "max", label: "Máx" },
  { key: "ytd", label: "YTD" },
];

interface Metrics {
  totalReturn: number;
  cagr: number;
  volatility: number;
  maxDrawdown: number;
  positiveMonthsRatio: number;
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
  cartera: Result;
  benchmark?: Result;
  presetName: string;
  presetDescription: string;
  benchmarkName: string;
  effectiveDateRange?: { startDate?: string; endDate?: string };
  warnings?: { message: string }[];
  error?: string;
  message?: string;
}

const pct = (d: number) => `${(d * 100).toFixed(1).replace(".", ",")}%`;
const pctSigned = (d: number) =>
  `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1).replace(".", ",")}%`;
const pctRaw = (n: number) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")}%`;

function readProfile(): number | null {
  try {
    const raw = localStorage.getItem("ck-cartera");
    if (!raw) return null;
    const r = Number(JSON.parse(raw)?.riesgo);
    return Number.isFinite(r) && r >= 1 && r <= 10 ? Math.round(r) : null;
  } catch {
    return null;
  }
}

export default function CarteraBacktestPage() {
  const [profile, setProfile] = useState<number>(5);
  const [detected, setDetected] = useState<boolean>(false);
  const [benchmark, setBenchmark] = useState<string>("vwce");
  const [period, setPeriod] = useState<string>("max");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Leer el perfil del alumno una sola vez al montar.
  useEffect(() => {
    const p = readProfile();
    if (p) { setProfile(p); setDetected(true); }
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/campus/cartera-backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, benchmark, period }),
      });
      const json: ApiResponse = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || "No se pudo ejecutar el backtest.");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [profile, benchmark, period]);

  useEffect(() => { run(); }, [run]);

  // --- Serie combinada rebasada a 0% ---
  const chartData = (() => {
    if (!data?.cartera?.timeSeries?.length) return [];
    const a = data.cartera.timeSeries;
    const b = data.benchmark?.timeSeries ?? [];
    const a0 = a[0]?.value || 1;
    const b0 = b[0]?.value || 1;
    const bByDate = new Map(b.map((p) => [p.date, p.value]));
    return a.map((p) => {
      const bv = bByDate.get(p.date);
      return {
        date: p.date,
        cartera: (p.value / a0 - 1) * 100,
        benchmark: bv !== undefined ? (bv / b0 - 1) * 100 : null,
      };
    });
  })();

  const benchLabel = BENCHMARKS.find((x) => x.key === benchmark)?.label ?? "Referencia";

  return (
    <div style={{ background: BEIGE, minHeight: "100vh", color: TINTA, padding: "22px 18px 48px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Cabecera */}
        <h1 style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "1.9rem", margin: "0 0 4px", color: ROJO }}>
          Backtest de tu Cartera K
        </h1>
        <p style={{ color: SUAVE, margin: "0 0 18px", fontSize: ".95rem" }}>
          Cómo se habría comportado la cartera de tu perfil frente a un índice indexado de referencia.
          Comparación de estrategia (inversión única, rentabilidad time-weighted).
        </p>

        {/* Controles */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", background: "#fff", border: "1px solid #e7ddcf", borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".8rem", fontWeight: 600, color: SUAVE }}>
            Perfil de riesgo {detected && <span style={{ color: VERDE, fontWeight: 600 }}>· detectado</span>}
            <select value={profile} onChange={(e) => setProfile(Number(e.target.value))} disabled={loading}
              style={selStyle}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>Perfil {n}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".8rem", fontWeight: 600, color: SUAVE }}>
            Referencia
            <select value={benchmark} onChange={(e) => setBenchmark(e.target.value)} disabled={loading} style={selStyle}>
              {BENCHMARKS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".8rem", fontWeight: 600, color: SUAVE }}>
            Periodo
            <div style={{ display: "flex", gap: 6 }}>
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => setPeriod(p.key)} disabled={loading}
                  style={{
                    ...pillStyle,
                    background: period === p.key ? ROJO : "#fff",
                    color: period === p.key ? "#fff" : SUAVE,
                    borderColor: period === p.key ? ROJO : "#e0d7c8",
                  }}>{p.label}</button>
              ))}
            </div>
          </div>

          {loading && <span style={{ color: SUAVE, fontSize: ".85rem", marginLeft: "auto" }}>Calculando…</span>}
        </div>

        {error && (
          <div style={{ background: "#FBE9E7", border: "1px solid #f3c9c2", color: "#8a2c22", borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
            {error}
          </div>
        )}

        {data && !error && (
          <>
            {/* Gráfico de rentabilidad acumulada */}
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <h2 style={h2Style}>Rentabilidad acumulada</h2>
                <span style={{ fontSize: ".8rem", color: SUAVE }}>
                  {data.effectiveDateRange?.startDate} → {data.effectiveDateRange?.endDate}
                </span>
              </div>
              <div style={{ width: "100%", height: 360 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ece5da" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: SUAVE }} minTickGap={36} />
                    <YAxis tick={{ fontSize: 11, fill: SUAVE }} tickFormatter={(v) => `${v.toFixed(0)}%`} width={48} />
                    <Tooltip
                      formatter={(v: number, name: string) => [`${v >= 0 ? "+" : ""}${v.toFixed(1)}%`, name === "cartera" ? `Tu Cartera K (Perfil ${data.profile})` : benchLabel]}
                      labelStyle={{ color: TINTA }}
                      contentStyle={{ borderRadius: 10, border: "1px solid #e7ddcf", fontSize: ".82rem" }}
                    />
                    <Legend formatter={(v) => v === "cartera" ? `Tu Cartera K (Perfil ${data.profile})` : benchLabel} />
                    <Line type="monotone" dataKey="cartera" stroke={ROJO} strokeWidth={2.4} dot={false} name="cartera" />
                    {data.benchmark && (
                      <Line type="monotone" dataKey="benchmark" stroke={GRIS} strokeWidth={2} dot={false} strokeDasharray="5 4" name="benchmark" connectNulls />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Métricas comparadas */}
            <div style={cardStyle}>
              <h2 style={h2Style}>Comparativa</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".92rem" }}>
                  <thead>
                    <tr>
                      <th style={thLeft}></th>
                      <th style={thCell}><span style={{ color: ROJO }}>●</span> Tu Cartera K<br /><span style={{ fontWeight: 400, color: SUAVE, fontSize: ".78rem" }}>Perfil {data.profile}</span></th>
                      <th style={thCell}><span style={{ color: GRIS }}>●</span> {benchLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricRow("Rentabilidad total", data.cartera.metrics.totalReturn, data.benchmark?.metrics.totalReturn, "signed")}
                    {metricRow("Rentabilidad anual (CAGR)", data.cartera.metrics.cagr, data.benchmark?.metrics.cagr, "signed")}
                    {metricRow("Volatilidad", data.cartera.metrics.volatility, data.benchmark?.metrics.volatility, "plain")}
                    {metricRow("Máxima caída (drawdown)", data.cartera.metrics.maxDrawdown, data.benchmark?.metrics.maxDrawdown, "plain")}
                    {metricRow("Meses positivos", data.cartera.metrics.positiveMonthsRatio, data.benchmark?.metrics.positiveMonthsRatio, "plain")}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rentabilidad por año */}
            {data.cartera.annualReturns?.length > 0 && (
              <div style={cardStyle}>
                <h2 style={h2Style}>Rentabilidad por año</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem" }}>
                    <thead>
                      <tr>
                        <th style={thLeft}>Año</th>
                        {data.cartera.annualReturns.map((a) => (
                          <th key={a.year} style={{ ...thCell, padding: "8px 6px", fontSize: ".82rem" }}>{a.year}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ ...tdLeft, color: ROJO }}>Cartera K</td>
                        {data.cartera.annualReturns.map((a) => (
                          <td key={a.year} style={{ ...tdNum, color: a.returnPct >= 0 ? VERDE : ROJO }}>{pctRaw(a.returnPct)}</td>
                        ))}
                      </tr>
                      {data.benchmark?.annualReturns && (
                        <tr>
                          <td style={{ ...tdLeft, color: GRIS }}>{benchLabel}</td>
                          {data.cartera.annualReturns.map((a) => {
                            const m = data.benchmark!.annualReturns.find((x) => x.year === a.year);
                            return <td key={a.year} style={{ ...tdNum, color: SUAVE }}>{m ? pctRaw(m.returnPct) : "—"}</td>;
                          })}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <p style={{ fontSize: ".76rem", color: SUAVE, marginTop: 16, lineHeight: 1.5 }}>
              Cartera simulada con fines educativos. Las rentabilidades pasadas no garantizan rentabilidades futuras.
              Esto no es asesoramiento financiero ni una recomendación personalizada. Datos de mercado vía EODHD;
              la Cartera K mostrada es la cartera modelo del perfil, sin tus aportaciones reales.
            </p>
            {data.warnings && data.warnings.length > 0 && (
              <ul style={{ fontSize: ".74rem", color: SUAVE, marginTop: 8 }}>
                {data.warnings.slice(0, 4).map((w, i) => <li key={i}>{w.message}</li>)}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- helpers de render de fila de métrica ---
function metricRow(
  label: string,
  a: number,
  b: number | undefined,
  mode: "signed" | "plain"
) {
  const fmt = (v: number) =>
    mode === "signed"
      ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")}%`
      : `${(v * 100).toFixed(1).replace(".", ",")}%`;
  return (
    <tr style={{ borderTop: "1px solid #efe8dc" }}>
      <td style={tdLeft}>{label}</td>
      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(a)}</td>
      <td style={{ ...tdNum, color: "#6B6B6B" }}>{b !== undefined ? fmt(b) : "—"}</td>
    </tr>
  );
}

// --- estilos ---
const selStyle: React.CSSProperties = {
  fontFamily: "inherit", fontSize: ".9rem", padding: "8px 10px",
  border: "1px solid #e0d7c8", borderRadius: 8, background: "#fff", color: "#202020", minWidth: 150,
};
const pillStyle: React.CSSProperties = {
  fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600, padding: "8px 14px",
  border: "1px solid", borderRadius: 999, cursor: "pointer",
};
const cardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #e7ddcf", borderRadius: 14,
  padding: "18px 20px", marginBottom: 16, boxShadow: "0 1px 3px rgba(32,32,32,.04)",
};
const h2Style: React.CSSProperties = {
  fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "1.15rem", margin: "0 0 12px", color: "#202020",
};
const thCell: React.CSSProperties = { textAlign: "right", padding: "8px 12px", fontSize: ".82rem", color: "#202020", borderBottom: "2px solid #C81E2E" };
const thLeft: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #C81E2E" };
const tdLeft: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontWeight: 600 };
const tdNum: React.CSSProperties = { textAlign: "right", padding: "9px 12px", fontVariantNumeric: "tabular-nums" };
