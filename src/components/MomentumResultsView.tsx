"use client";

// =============================================================================
// MOMENTUM RESULTS VIEW — Equity curve, métricas, rebalanceos y holdings
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
import { AnnualReturnsHeatmap, type HeatmapColumn } from "./AnnualReturnsHeatmap";
import { MonthlyReturnsHeatmap, type HeatmapSeries as MonthlySeries } from "./MonthlyReturnsHeatmap";
import { CorrelationMatrix } from "./CorrelationMatrix";

interface Props {
  results: MomentumResponse;
}

export function MomentumResultsView({ results }: Props) {
  // Escala Y del gráfico de patrimonio: lineal o logarítmica.
  const [yScale, setYScale] = useState<"linear" | "log">("linear");

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

  // Cálculo de min/max para el domain logarítmico
  const { minValue, maxValue } = useMemo(() => {
    const values: number[] = [];
    for (const row of chartData) {
      if (typeof row.Estrategia === "number") values.push(row.Estrategia);
      if (typeof row.Benchmark === "number") values.push(row.Benchmark);
    }
    if (values.length === 0) return { minValue: 1, maxValue: 1 };
    return { minValue: Math.min(...values), maxValue: Math.max(...values) };
  }, [chartData]);

  // Ranking actual = el del último rebalanceo. Las holdings activos son los del
  // último punto de equity (incluye CASH si MA forzó salida).
  const currentRanking = useMemo(() => {
    if (results.rebalances.length === 0) return null;
    const last = results.rebalances[results.rebalances.length - 1]!;
    const lastEquity = results.equityCurve[results.equityCurve.length - 1];
    return {
      date: last.date,
      asOf: lastEquity?.date ?? last.date,
      holdings: lastEquity?.holdings ?? last.newHoldings,
      ranking: last.ranking,
      forcedCash: last.forcedCash,
    };
  }, [results.rebalances, results.equityCurve]);

  // Enriquece cada rebalanceo con la rentabilidad obtenida hasta el siguiente
  // rebalanceo (o hasta el final del backtest si es el último) y la duración
  // del periodo. Se calcula buscando el valor de equity en la fecha del
  // rebalanceo y en la fecha del siguiente.
  const enrichedRebalances = useMemo(() => {
    const equityByDate = new Map<string, number>();
    for (const p of results.equityCurve) equityByDate.set(p.date, p.value);

    // Función auxiliar: encuentra el primer punto de equity en o después de una
    // fecha dada (tolerante a desfases de 1-2 días por festivos).
    const equitySortedDates = results.equityCurve.map((p) => p.date);
    function valueAtOrAfter(date: string): number | undefined {
      const exact = equityByDate.get(date);
      if (exact !== undefined) return exact;
      for (const d of equitySortedDates) {
        if (d >= date) return equityByDate.get(d);
      }
      return undefined;
    }

    const lastEquityDate = equitySortedDates[equitySortedDates.length - 1] ?? "";
    const rebs = results.rebalances;

    return rebs.map((r, i) => {
      const startDate = r.date;
      const endDate = i < rebs.length - 1 ? rebs[i + 1]!.date : lastEquityDate;
      const startVal = valueAtOrAfter(startDate);
      const endVal = valueAtOrAfter(endDate);
      const returnPct =
        startVal !== undefined && endVal !== undefined && startVal > 0
          ? (endVal / startVal - 1) * 100
          : null;
      const durationDays =
        startDate && endDate
          ? Math.max(
              0,
              Math.round(
                (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                  (1000 * 60 * 60 * 24)
              )
            )
          : null;
      return { ...r, returnPct, durationDays, isOpen: i === rebs.length - 1 };
    });
  }, [results.rebalances, results.equityCurve]);

  // Vista de la tabla: más reciente arriba.
  const rebalancesDescending = useMemo(
    () => [...enrichedRebalances].reverse(),
    [enrichedRebalances]
  );

  // Formatea una duración en días como "Xd" o "Xm Yd" (>=30 días → meses).
  function formatDuration(days: number | null): string {
    if (days === null) return "—";
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    const rem = days % 30;
    return rem > 0 ? `${months}m ${rem}d` : `${months}m`;
  }

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

      {/* Ranking actual — posiciones que la estrategia mantiene HOY y ranking
          completo del último rebalanceo. Útil para saber qué tendrías que
          tener en cartera AHORA mismo según el modelo. */}
      {currentRanking && (
        <section className="bg-white rounded-2xl border border-brand-coral/20 shadow-sm p-6">
          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-lg font-semibold text-brand-navy font-serif">
              Ranking actual
            </h3>
            <span className="text-xs text-brand-tertiary">
              Último rebalanceo: <strong>{currentRanking.date}</strong>
            </span>
          </div>

          {/* Posiciones activas */}
          <div className="mb-4">
            <p className="text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider mb-2">
              Posiciones activas
            </p>
            <div className="flex flex-wrap gap-2">
              {currentRanking.forcedCash ? (
                <span className="px-3 py-1.5 bg-slate-100 text-brand-navy rounded-full text-sm font-semibold">
                  CASH (filtro MA)
                </span>
              ) : (
                currentRanking.holdings.map((ticker) => (
                  <span
                    key={ticker}
                    className="px-3 py-1.5 bg-brand-coral/10 text-brand-coral border border-brand-coral/30 rounded-full text-sm font-semibold"
                  >
                    {ticker}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Ranking completo del universo */}
          <div>
            <p className="text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider mb-2">
              Ranking completo del universo
              {results.config.rankingMethod === "sharpe" && (
                <span className="ml-2 normal-case text-brand-tertiary/80 font-normal">
                  · ordenado por retorno / volatilidad
                </span>
              )}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left text-[10px] font-semibold text-brand-tertiary uppercase py-1.5 px-2">
                      #
                    </th>
                    <th className="text-left text-[10px] font-semibold text-brand-tertiary uppercase py-1.5 px-2">
                      Ticker
                    </th>
                    <th className="text-right text-[10px] font-semibold text-brand-tertiary uppercase py-1.5 px-2">
                      Momentum
                    </th>
                    {results.config.rankingMethod === "sharpe" && (
                      <>
                        <th className="text-right text-[10px] font-semibold text-brand-tertiary uppercase py-1.5 px-2">
                          Volatilidad
                        </th>
                        <th className="text-right text-[10px] font-semibold text-brand-tertiary uppercase py-1.5 px-2">
                          Ratio
                        </th>
                      </>
                    )}
                    <th className="text-center text-[10px] font-semibold text-brand-tertiary uppercase py-1.5 px-2">
                      Filtro MA
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentRanking.ranking.map((c, idx) => {
                    const isHeld = currentRanking.holdings.includes(c.ticker);
                    return (
                      <tr
                        key={c.ticker}
                        className={`border-b border-slate-100 ${
                          isHeld ? "bg-brand-coral/5" : ""
                        }`}
                      >
                        <td className="py-1.5 px-2 text-xs font-mono text-brand-tertiary">
                          {idx + 1}
                        </td>
                        <td className="py-1.5 px-2 text-xs font-mono font-semibold text-brand-navy">
                          {c.ticker}
                          {isHeld && (
                            <span className="ml-1.5 text-[10px] text-brand-coral">●</span>
                          )}
                        </td>
                        <td
                          className={`py-1.5 px-2 text-xs text-right font-mono ${
                            c.momentumPercent >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {formatPct(c.momentumPercent / 100, 2)}
                        </td>
                        {results.config.rankingMethod === "sharpe" && (
                          <>
                            <td className="py-1.5 px-2 text-xs text-right font-mono text-brand-secondary">
                              {c.volatilityPercent !== undefined
                                ? formatPct(c.volatilityPercent / 100, 1)
                                : "—"}
                            </td>
                            <td className="py-1.5 px-2 text-xs text-right font-mono font-semibold text-brand-navy">
                              {formatNumber(c.score, 2)}
                            </td>
                          </>
                        )}
                        <td className="py-1.5 px-2 text-xs text-center">
                          {c.aboveMA ? (
                            <span className="text-emerald-600">✓</span>
                          ) : (
                            <span className="text-red-500" title="Por debajo de la media móvil">
                              ✗
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
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
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-lg font-semibold text-brand-navy font-serif">
            Evolución del patrimonio
          </h3>
          {/* Toggle escala lineal / logarítmica */}
          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setYScale("linear")}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                yScale === "linear"
                  ? "bg-white text-brand-navy shadow-sm"
                  : "text-slate-500 hover:text-brand-navy"
              }`}
              title="Escala lineal: cada euro ocupa lo mismo en el eje Y."
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
              title="Escala logarítmica: cada % de subida ocupa lo mismo en el eje Y. Útil para ver el crecimiento compuesto a largo plazo."
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

      {/* Rentabilidades anuales — heatmap con gradiente rojo→verde */}
      {results.annualReturns.length > 0 && (() => {
        const stratValues = new Map<number, number>(
          results.annualReturns.map((yr) => [yr.year, yr.returnPercent])
        );
        const columns: HeatmapColumn[] = [
          { label: "Estrategia", values: stratValues, accentClass: "text-rose-600" },
        ];
        // Si hay benchmark, añadirlo como segunda columna para comparar año a año
        if (results.benchmarkCurve && results.benchmarkCurve.length > 1) {
          const benchByYear = new Map<number, number>();
          // Agregar valores por año (último del año)
          for (const p of results.benchmarkCurve) {
            const year = parseInt(p.date.substring(0, 4), 10);
            benchByYear.set(year, p.value);
          }
          const sortedYears = Array.from(benchByYear.keys()).sort((a, b) => a - b);
          const benchReturns = new Map<number, number>();
          let prev: number | null = null;
          for (const year of sortedYears) {
            const end = benchByYear.get(year)!;
            const start = prev ?? results.config.initialAmount;
            benchReturns.set(year, start > 0 ? (end / start - 1) * 100 : 0);
            prev = end;
          }
          columns.push({
            label: `Benchmark (${results.config.benchmarkTicker})`,
            values: benchReturns,
            accentClass: "text-blue-600",
          });
        }
        return (
          <AnnualReturnsHeatmap
            columns={columns}
            title="Rentabilidades anuales (mapa de calor)"
            description="Intensidad proporcional al máximo absoluto del rango — los peores años en rojo, los mejores en verde. Pasa el cursor sobre cada celda para ver el detalle."
          />
        );
      })()}

      {/* Mapa de calor MENSUAL — matriz año × mes apilada por serie */}
      {(() => {
        const monthSeries: MonthlySeries[] = [];
        const initialAmount = results.config.initialAmount;
        if (results.equityCurve.length > 0) {
          monthSeries.push({
            label: "Estrategia",
            accentClass: "text-rose-600",
            initialValue: initialAmount,
            monthlyValues: results.equityCurve.map((p) => ({
              monthKey: p.date.substring(0, 7),
              value: p.value,
            })),
          });
        }
        if (results.benchmarkCurve && results.benchmarkCurve.length > 0) {
          monthSeries.push({
            label: `Benchmark (${results.config.benchmarkTicker})`,
            accentClass: "text-blue-600",
            initialValue: initialAmount,
            monthlyValues: results.benchmarkCurve.map((p) => ({
              monthKey: p.date.substring(0, 7),
              value: p.value,
            })),
          });
        }
        if (monthSeries.length === 0) return null;
        return (
          <MonthlyReturnsHeatmap
            series={monthSeries}
            title="Mapa de calor mensual"
            description="Matriz año × mes. Lee horizontal para ver cómo evolucionó cada año, vertical para detectar estacionalidad. La intensidad se calcula sobre el máximo absoluto MENSUAL — los meses extremos saltan a la vista."
          />
        );
      })()}

      {/* Matriz de correlaciones — estrategia vs cada activo del universo */}
      {results.correlationMatrix && results.correlationMatrix.fundIds.length >= 2 && (
        <section>
          <p className="text-xs text-brand-tertiary mb-3 px-1">
            La primera fila/columna es la propia <strong>Estrategia Momentum</strong>. Te dice
            cuánto se aleja la rotación del comportamiento individual de cada componente —
            valores bajos significan que la estrategia aporta diversificación real.
          </p>
          <CorrelationMatrix
            correlationMatrix={results.correlationMatrix}
            warnings={[]}
          />
        </section>
      )}

      {/* Historial de rebalanceos */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
          Historial de rotaciones
        </h3>
        <p className="text-xs text-brand-tertiary mb-4">
          Ordenado de más reciente a más antiguo. Rentabilidad y duración son las
          obtenidas entre cada rotación y la siguiente (la última operación abierta marca el periodo hasta hoy).
          {results.config.rankingMethod === "sharpe" && (
            <>
              {" "}Ranking por <strong>retorno / volatilidad</strong> ({results.config.volatilityPeriodMonths ?? 3}m).
            </>
          )}
        </p>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Fecha
                </th>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Sale
                </th>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Entra
                </th>
                <th className="text-right text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Rentabilidad
                </th>
                <th className="text-right text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Duración
                </th>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3 hidden lg:table-cell">
                  {results.config.rankingMethod === "sharpe"
                    ? "Top 5 (retorno · vol · ratio)"
                    : "Top 5 ranking (momentum %)"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rebalancesDescending.map((r, i) => (
                <tr key={`${r.date}-${i}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-2 px-3 font-mono text-xs text-brand-secondary">
                    {r.date}
                    {r.isOpen && (
                      <span className="ml-2 text-[10px] uppercase font-semibold text-brand-coral">
                        abierta
                      </span>
                    )}
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
                  <td
                    className={`py-2 px-3 text-xs text-right font-mono ${
                      r.returnPct === null
                        ? "text-brand-tertiary"
                        : r.returnPct >= 0
                        ? "text-emerald-600 font-semibold"
                        : "text-red-600 font-semibold"
                    }`}
                  >
                    {r.returnPct === null ? "—" : formatPct(r.returnPct / 100, 2)}
                  </td>
                  <td className="py-2 px-3 text-xs text-right font-mono text-brand-secondary">
                    {formatDuration(r.durationDays)}
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
                          title={
                            results.config.rankingMethod === "sharpe" && c.volatilityPercent !== undefined
                              ? `${c.ticker}: ret ${formatPct(c.momentumPercent / 100, 1)}, vol ${formatPct(c.volatilityPercent / 100, 1)}, ratio ${formatNumber(c.score, 2)}`
                              : `${c.ticker}: momentum ${formatPct(c.momentumPercent / 100, 2)}`
                          }
                        >
                          {results.config.rankingMethod === "sharpe" && c.volatilityPercent !== undefined ? (
                            <>
                              {c.ticker} {formatNumber(c.score, 2)}
                            </>
                          ) : (
                            <>
                              {c.ticker} {formatPct(c.momentumPercent / 100, 0)}
                            </>
                          )}
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
