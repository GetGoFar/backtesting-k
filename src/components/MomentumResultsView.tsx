"use client";

// =============================================================================
// MOMENTUM RESULTS VIEW — Equity curve, métricas, rebalanceos y holdings
// =============================================================================

import { useMemo } from "react";
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
  results: MomentumResponse;
}

export function MomentumResultsView({ results }: Props) {
  // Combinamos equity curve de la estrategia y del benchmark para Recharts
  const chartData = useMemo(() => {
    const benchMap = new Map(
      (results.benchmarkCurve ?? []).map((p) => [p.date, p.value])
    );
    return results.equityCurve.map((p) => ({
      date: p.date,
      Estrategia: p.value,
      Benchmark: benchMap.get(p.date),
    }));
  }, [results]);

  return (
    <div className="space-y-8">
      {/* Avisos */}
      {results.warnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-semibold text-amber-900 mb-1">Avisos</p>
          <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
            {results.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Métricas resumen */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-4">Métricas</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Metric
            label="Rentabilidad total"
            value={formatPct(results.metrics.totalReturn / 100)}
            color={results.metrics.totalReturn >= 0 ? "emerald" : "red"}
          />
          <Metric label="CAGR" value={formatPct(results.metrics.cagr / 100)} />
          <Metric
            label="Volatilidad"
            value={formatPct(results.metrics.volatility / 100)}
          />
          <Metric label="Sharpe" value={formatNumber(results.metrics.sharpe, 2)} />
          <Metric label="Sortino" value={formatNumber(results.metrics.sortino, 2)} />
          <Metric
            label="Max Drawdown"
            value={formatPct(results.metrics.maxDrawdown / 100)}
            color="red"
          />
          <Metric label="Mejor mes" value={formatPct(results.metrics.bestMonth / 100)} color="emerald" />
          <Metric label="Peor mes" value={formatPct(results.metrics.worstMonth / 100)} color="red" />
          <Metric
            label="% meses positivos"
            value={formatPct(results.metrics.positiveMonths / 100, 1)}
          />
          <Metric
            label="Rotaciones / año"
            value={formatNumber(results.metrics.tradesPerYear, 1)}
          />
          <Metric
            label="Rebalanceos totales"
            value={results.metrics.totalRebalances.toString()}
          />
          <Metric
            label="Valor final"
            value={formatEUR(
              results.equityCurve[results.equityCurve.length - 1]?.value ?? 0
            )}
          />
        </div>

        {/* Comparativa con benchmark */}
        {results.benchmarkMetrics && (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <h4 className="text-sm font-semibold text-brand-tertiary uppercase tracking-wider mb-3">
              Benchmark ({results.config.benchmarkTicker})
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Metric label="CAGR" value={formatPct(results.benchmarkMetrics.cagr / 100)} compact />
              <Metric
                label="Sharpe"
                value={formatNumber(results.benchmarkMetrics.sharpe, 2)}
                compact
              />
              <Metric
                label="Max DD"
                value={formatPct(results.benchmarkMetrics.maxDrawdown / 100)}
                color="red"
                compact
              />
              <Metric
                label="Diferencia CAGR"
                value={formatPct(
                  (results.metrics.cagr - results.benchmarkMetrics.cagr) / 100
                )}
                color={
                  results.metrics.cagr >= results.benchmarkMetrics.cagr ? "emerald" : "red"
                }
                compact
              />
            </div>
          </div>
        )}
      </section>

      {/* Equity curve */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-4">
          Evolución del patrimonio
        </h3>
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
              />
              <RechartsTooltip
                formatter={(value: number) => formatEUR(value)}
                labelFormatter={(l) => `Mes: ${l}`}
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
                dataKey="Estrategia"
                stroke="#e11d48"
                strokeWidth={2}
                dot={false}
              />
              {results.benchmarkCurve && (
                <Line
                  type="monotone"
                  dataKey="Benchmark"
                  stroke="#1d4ed8"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Rentabilidades anuales */}
      {results.annualReturns.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-brand-navy font-serif mb-4">
            Rentabilidades anuales
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
            {results.annualReturns.map((yr) => (
              <div
                key={yr.year}
                className={`rounded-lg p-3 text-center border ${
                  yr.returnPercent >= 0
                    ? "bg-emerald-50 border-emerald-100"
                    : "bg-red-50 border-red-100"
                }`}
              >
                <div className="text-xs text-brand-tertiary">{yr.year}</div>
                <div
                  className={`text-sm font-semibold mt-0.5 ${
                    yr.returnPercent >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {formatPct(yr.returnPercent / 100, 1)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Historial de rebalanceos */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
          Historial de rotaciones
        </h3>
        <p className="text-xs text-brand-tertiary mb-4">
          Cada vez que cambiaron los activos seleccionados (no se muestran los meses sin cambios).
        </p>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Mes
                </th>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Sale
                </th>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Entra
                </th>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3 hidden lg:table-cell">
                  Top 5 ranking (momentum %)
                </th>
              </tr>
            </thead>
            <tbody>
              {results.rebalances.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-2 px-3 font-mono text-xs text-brand-secondary">
                    {r.date}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {r.previousHoldings.length > 0 ? (
                      <span className="text-brand-tertiary">
                        {r.previousHoldings.join(", ")}
                      </span>
                    ) : (
                      <span className="text-brand-tertiary italic">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs font-semibold">
                    {r.forcedCash ? (
                      <span className="px-2 py-0.5 bg-slate-100 text-brand-navy rounded">
                        CASH (filtro MA)
                      </span>
                    ) : (
                      <span className="text-brand-coral">{r.newHoldings.join(", ")}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-[11px] hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {r.ranking.slice(0, 5).map((c, idx) => (
                        <span
                          key={c.ticker}
                          className={`px-1.5 py-0.5 rounded font-mono ${
                            idx === 0
                              ? "bg-brand-coral/10 text-brand-coral font-semibold"
                              : c.aboveMA
                              ? "bg-slate-50 text-brand-secondary"
                              : "bg-red-50 text-red-700 line-through"
                          }`}
                        >
                          {c.ticker} {formatPct(c.momentumPercent / 100, 0)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  color,
  compact,
}: {
  label: string;
  value: string;
  color?: "emerald" | "red";
  compact?: boolean;
}) {
  const colorClass =
    color === "emerald"
      ? "text-emerald-600"
      : color === "red"
      ? "text-red-600"
      : "text-brand-navy";
  return (
    <div className={`rounded-lg bg-slate-50 ${compact ? "p-3" : "p-4"}`}>
      <p className="text-[10px] sm:text-[11px] font-medium text-brand-tertiary uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`${compact ? "text-base" : "text-lg sm:text-xl"} font-bold font-serif ${colorClass}`}>
        {value}
      </p>
    </div>
  );
}
