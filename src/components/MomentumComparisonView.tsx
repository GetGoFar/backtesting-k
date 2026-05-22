"use client";

// =============================================================================
// MOMENTUM COMPARISON VIEW — Comparativa A vs B
// =============================================================================
//
// Muestra dos resultados de estrategia momentum lado a lado para compararlos:
//   • Gráfico de evolución del patrimonio CON LAS DOS CURVAS superpuestas
//     (más un benchmark opcional, tomado del primer resultado que lo tenga).
//   • Tabla de métricas clave en columnas (A · B · Δ B−A).
//
// La idea es que el usuario vea de un vistazo cuál estrategia funciona mejor
// sobre el mismo periodo. El detalle de cada estrategia (ranking vivo, stats,
// historial completo) se muestra DEBAJO de este resumen, renderizado por
// MomentumResultsView para cada una.
// =============================================================================

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import { formatEUR, formatPct, formatNumber } from "@/lib/formatters";
import type { MomentumResponse } from "@/lib/momentum-types";

interface Props {
  resultsA: MomentumResponse;
  resultsB: MomentumResponse;
  /** Nombres legibles de cada estrategia (mostrados en la leyenda y la tabla). */
  nameA: string;
  nameB: string;
}

const COLOR_A = "#1d4ed8"; // azul navy (mismo que Cartera A en backtest)
const COLOR_B = "#e11d48"; // coral rosa (mismo que Cartera B en backtest)
const COLOR_BENCH = "#94a3b8"; // gris azulado para el benchmark

export function MomentumComparisonView({
  resultsA,
  resultsB,
  nameA,
  nameB,
}: Props) {
  const [yScale, setYScale] = useState<"linear" | "log">("linear");

  // Si ambos resultados comparten nombre, los desambiguamos con (1)/(2) para
  // que Recharts no colapse las dos líneas (mismo bug que el de la página de
  // backtest).
  const collides = nameA === nameB;
  const labelA = collides ? `${nameA} (A)` : nameA;
  const labelB = collides ? `${nameB} (B)` : nameB;
  const benchmarkName =
    resultsA.config.benchmarkTicker ??
    resultsB.config.benchmarkTicker ??
    null;

  // Combinamos las dos equity curves + benchmark por fecha
  const chartData = useMemo(() => {
    const map = new Map<
      string,
      { date: string; [series: string]: string | number | undefined }
    >();

    for (const p of resultsA.equityCurve) {
      const row = map.get(p.date) ?? { date: p.date };
      row[labelA] = p.value;
      map.set(p.date, row);
    }
    for (const p of resultsB.equityCurve) {
      const row = map.get(p.date) ?? { date: p.date };
      row[labelB] = p.value;
      map.set(p.date, row);
    }
    // Benchmark: tomamos el primero disponible (suelen ser el mismo si el
    // usuario puso el mismo ticker en ambas estrategias).
    const benchSeries =
      resultsA.benchmarkCurve ?? resultsB.benchmarkCurve ?? [];
    if (benchmarkName) {
      for (const p of benchSeries) {
        const row = map.get(p.date) ?? { date: p.date };
        row[benchmarkName] = p.value;
        map.set(p.date, row);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string)
    );
  }, [resultsA, resultsB, labelA, labelB, benchmarkName]);

  // Min/max para el eje Y logarítmico
  const { minValue, maxValue } = useMemo(() => {
    const values: number[] = [];
    for (const row of chartData) {
      const a = row[labelA];
      const b = row[labelB];
      const bm = benchmarkName ? row[benchmarkName] : undefined;
      if (typeof a === "number") values.push(a);
      if (typeof b === "number") values.push(b);
      if (typeof bm === "number") values.push(bm);
    }
    if (values.length === 0) return { minValue: 1, maxValue: 1 };
    return { minValue: Math.min(...values), maxValue: Math.max(...values) };
  }, [chartData, labelA, labelB, benchmarkName]);

  // Helper para formatear deltas (B − A) con signo y color
  function delta(a: number, b: number, format: "pct" | "num", invertColor = false) {
    const diff = b - a;
    const colorClass = invertColor
      ? diff < 0
        ? "text-emerald-700"
        : diff > 0
        ? "text-red-600"
        : "text-brand-tertiary"
      : diff > 0
      ? "text-emerald-700"
      : diff < 0
      ? "text-red-600"
      : "text-brand-tertiary";
    const sign = diff > 0 ? "+" : "";
    const formatted =
      format === "pct"
        ? `${sign}${formatNumber(diff, 2)} pp`
        : `${sign}${formatNumber(diff, 2)}`;
    return <span className={`font-mono text-xs ${colorClass}`}>{formatted}</span>;
  }

  const ma = resultsA.metrics;
  const mb = resultsB.metrics;
  const finalA = resultsA.equityCurve[resultsA.equityCurve.length - 1]?.value ?? 0;
  const finalB = resultsB.equityCurve[resultsB.equityCurve.length - 1]?.value ?? 0;

  return (
    <div className="space-y-8">
      {/* === Equity overlay === */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-lg font-semibold text-brand-navy font-serif">
            Comparativa de patrimonio
          </h3>
          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setYScale("linear")}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                yScale === "linear"
                  ? "bg-white text-brand-navy shadow-sm"
                  : "text-slate-500 hover:text-brand-navy"
              }`}
            >
              Lineal
            </button>
            <button
              onClick={() => setYScale("log")}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                yScale === "log"
                  ? "bg-white text-brand-navy shadow-sm"
                  : "text-slate-500 hover:text-brand-navy"
              }`}
            >
              Log
            </button>
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#64748b" }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickFormatter={(v) => formatEUR(v as number)}
                width={70}
                scale={yScale}
                domain={
                  yScale === "log"
                    ? [Math.max(1, minValue * 0.9), maxValue * 1.1]
                    : ["auto", "auto"]
                }
                allowDataOverflow={yScale === "log"}
              />
              <RechartsTooltip
                formatter={(value: number) => formatEUR(value)}
                labelFormatter={(l) => `Fecha: ${l}`}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line
                type="monotone"
                dataKey={labelA}
                stroke={COLOR_A}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey={labelB}
                stroke={COLOR_B}
                strokeWidth={2}
                dot={false}
              />
              {benchmarkName && (
                <Line
                  type="monotone"
                  dataKey={benchmarkName}
                  stroke={COLOR_BENCH}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* === Métricas comparativas === */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
          Métricas comparativas
        </h3>
        <p className="text-xs text-brand-tertiary mb-4">
          Lado a lado, con la diferencia (B − A) destacada. En métricas de
          riesgo (vol, max DD, peor mes) menos es mejor — la columna Δ usa
          color invertido.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3">
                  Métrica
                </th>
                <th className="text-right text-[11px] font-semibold uppercase tracking-wider py-2 px-3" style={{ color: COLOR_A }}>
                  {labelA}
                </th>
                <th className="text-right text-[11px] font-semibold uppercase tracking-wider py-2 px-3" style={{ color: COLOR_B }}>
                  {labelB}
                </th>
                <th className="text-right text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3">
                  Δ (B − A)
                </th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow
                label="Rentabilidad total"
                a={formatPct(ma.totalReturn / 100)}
                b={formatPct(mb.totalReturn / 100)}
                delta={delta(ma.totalReturn, mb.totalReturn, "pct")}
              />
              <ComparisonRow
                label="CAGR"
                a={formatPct(ma.cagr / 100)}
                b={formatPct(mb.cagr / 100)}
                delta={delta(ma.cagr, mb.cagr, "pct")}
              />
              <ComparisonRow
                label="Volatilidad"
                a={formatPct(ma.volatility / 100)}
                b={formatPct(mb.volatility / 100)}
                delta={delta(ma.volatility, mb.volatility, "pct", true)}
              />
              <ComparisonRow
                label="Sharpe"
                a={formatNumber(ma.sharpe, 2)}
                b={formatNumber(mb.sharpe, 2)}
                delta={delta(ma.sharpe, mb.sharpe, "num")}
              />
              <ComparisonRow
                label="Sortino"
                a={formatNumber(ma.sortino, 2)}
                b={formatNumber(mb.sortino, 2)}
                delta={delta(ma.sortino, mb.sortino, "num")}
              />
              <ComparisonRow
                label="Max Drawdown"
                a={formatPct(ma.maxDrawdown / 100)}
                b={formatPct(mb.maxDrawdown / 100)}
                delta={delta(ma.maxDrawdown, mb.maxDrawdown, "pct")}
              />
              <ComparisonRow
                label="Mejor mes"
                a={formatPct(ma.bestMonth / 100)}
                b={formatPct(mb.bestMonth / 100)}
                delta={delta(ma.bestMonth, mb.bestMonth, "pct")}
              />
              <ComparisonRow
                label="Peor mes"
                a={formatPct(ma.worstMonth / 100)}
                b={formatPct(mb.worstMonth / 100)}
                delta={delta(ma.worstMonth, mb.worstMonth, "pct")}
              />
              <ComparisonRow
                label="% meses positivos"
                a={formatPct(ma.positiveMonths / 100, 1)}
                b={formatPct(mb.positiveMonths / 100, 1)}
                delta={delta(ma.positiveMonths, mb.positiveMonths, "pct")}
              />
              <ComparisonRow
                label="Rotaciones / año"
                a={formatNumber(ma.tradesPerYear, 1)}
                b={formatNumber(mb.tradesPerYear, 1)}
                delta={delta(ma.tradesPerYear, mb.tradesPerYear, "num", true)}
              />
              <ComparisonRow
                label="Rebalanceos totales"
                a={ma.totalRebalances.toString()}
                b={mb.totalRebalances.toString()}
                delta={delta(ma.totalRebalances, mb.totalRebalances, "num", true)}
              />
              <ComparisonRow
                label="Valor final"
                a={formatEUR(finalA)}
                b={formatEUR(finalB)}
                delta={
                  <span
                    className={`font-mono text-xs ${
                      finalB >= finalA ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {finalB >= finalA ? "+" : ""}
                    {formatEUR(finalB - finalA)}
                  </span>
                }
              />
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ComparisonRow({
  label,
  a,
  b,
  delta,
}: {
  label: string;
  a: string;
  b: string;
  delta: React.ReactNode;
}) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50">
      <td className="py-2 px-3 text-xs text-brand-secondary">{label}</td>
      <td className="py-2 px-3 text-xs text-right font-mono font-semibold" style={{ color: COLOR_A }}>
        {a}
      </td>
      <td className="py-2 px-3 text-xs text-right font-mono font-semibold" style={{ color: COLOR_B }}>
        {b}
      </td>
      <td className="py-2 px-3 text-right">{delta}</td>
    </tr>
  );
}
