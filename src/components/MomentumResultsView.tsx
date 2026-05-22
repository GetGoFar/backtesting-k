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
import type { MomentumResponse, MomentumRebalance } from "@/lib/momentum-types";
import { AnnualReturnsHeatmap, type HeatmapColumn } from "./AnnualReturnsHeatmap";
import { MonthlyReturnsHeatmap, type HeatmapSeries as MonthlySeries } from "./MonthlyReturnsHeatmap";

interface Props {
  results: MomentumResponse;
  /** Sufijo opcional para los IDs de las sub-secciones (p.ej. "-a" o "-b"
   *  en modo comparación). Permite al sidebar saltar a cada sub-sección
   *  por estrategia. En modo single, dejar undefined → IDs sin sufijo. */
  idSuffix?: string;
}

/** Una "operación" cerrada o en curso: holding period entre dos rebalanceos
 *  consecutivos (o desde el último hasta hoy si está abierta). */
interface Operation {
  rebalance: MomentumRebalance;
  /** Fecha exacta donde se entró (= rebalance.date). */
  startDate: string;
  /** Fecha exacta donde se cerró (= siguiente rebalance.date) o último día
   *  de la equity curve si está abierta. */
  endDate: string;
  /** Equity al entrar. */
  startEquity: number;
  /** Equity al cerrar (o equity actual si está abierta). */
  endEquity: number;
  /** Rentabilidad de la operación en %. */
  returnPct: number;
  /** Cuántos meses ha durado (aprox). */
  durationMonths: number;
  /** True si es la operación más reciente y aún no se ha cerrado. */
  isOpen: boolean;
}

export function MomentumResultsView({ results, idSuffix = "" }: Props) {
  const sid = (base: string) => `section-${base}${idSuffix}`;
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

  // === OPERACIONES ===
  // Una operación es el holding period entre dos rebalanceos consecutivos.
  // Para cada uno calculamos la rentabilidad obtenida con el set de holdings
  // mantenido durante ese periodo. La última operación se marca como abierta
  // y su rentabilidad es "no realizada" — el último valor de la equity curve.
  const operations = useMemo<Operation[]>(() => {
    if (results.rebalances.length === 0 || results.equityCurve.length === 0) {
      return [];
    }
    // El motor ya descarta las rotaciones agendadas para el futuro (nextClose
    // mode) y reemplaza el último equity point por uno en HOY con la
    // rentabilidad MTD real. Mantenemos un filtro defensivo por si acaso.
    const todayStr = new Date().toISOString().slice(0, 10);
    const pastRebalances = results.rebalances.filter((r) => r.date <= todayStr);
    if (pastRebalances.length === 0) return [];

    const equityByDate = new Map(
      results.equityCurve.map((p) => [p.date, p.value])
    );
    const sortedDates = results.equityCurve.map((p) => p.date);

    // Devuelve el valor de equity en `date`, o el primer punto disponible
    // posterior (por si el rebalanceo cayó en un día sin equity exacto).
    function equityAt(date: string): number | null {
      if (equityByDate.has(date)) return equityByDate.get(date)!;
      for (const d of sortedDates) {
        if (d >= date) return equityByDate.get(d)!;
      }
      return null;
    }

    const ops: Operation[] = [];
    const lastEquity = results.equityCurve[results.equityCurve.length - 1]!;
    for (let i = 0; i < pastRebalances.length; i++) {
      const r = pastRebalances[i]!;
      const startEquity = equityAt(r.date);
      const isOpen = i === pastRebalances.length - 1;
      const endDate = isOpen
        ? lastEquity.date
        : pastRebalances[i + 1]!.date;
      const endEquity = isOpen ? lastEquity.value : equityAt(endDate);
      if (startEquity == null || endEquity == null || startEquity <= 0) continue;
      const returnPct = (endEquity / startEquity - 1) * 100;

      // Duración en meses (aproximada por diferencia de YYYY-MM)
      const [y1, m1] = r.date.substring(0, 7).split("-").map(Number);
      const [y2, m2] = endDate.substring(0, 7).split("-").map(Number);
      const durationMonths = Math.max(
        0,
        (y2! - y1!) * 12 + (m2! - m1!)
      );

      ops.push({
        rebalance: r,
        startDate: r.date,
        endDate,
        startEquity,
        endEquity,
        returnPct,
        durationMonths,
        isOpen,
      });
    }
    return ops;
  }, [results]);

  // === ESTADÍSTICAS DE LA ESTRATEGIA ===
  // Calculadas sobre las operaciones CERRADAS (excluye la abierta).
  const opStats = useMemo(() => {
    const closed = operations.filter((o) => !o.isOpen);
    if (closed.length === 0) return null;

    const total = closed.length;
    const winners = closed.filter((o) => o.returnPct > 0);
    const losers = closed.filter((o) => o.returnPct < 0);
    const winRate = winners.length / total;

    const avgWin =
      winners.length > 0
        ? winners.reduce((s, o) => s + o.returnPct, 0) / winners.length
        : 0;
    const avgLoss =
      losers.length > 0
        ? losers.reduce((s, o) => s + o.returnPct, 0) / losers.length
        : 0;

    // Win/Loss ratio: media de las ganadoras / |media de las perdedoras|.
    // Si no hay perdedoras, devolvemos null (sin denominador).
    const winLossRatio =
      losers.length > 0 ? avgWin / Math.abs(avgLoss) : null;

    // Esperanza matemática = E[X] sobre la distribución de operaciones.
    // = winRate * avgWin + (1-winRate) * avgLoss  (avgLoss es negativo).
    const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;

    const avgReturn = closed.reduce((s, o) => s + o.returnPct, 0) / total;
    const bestOp = Math.max(...closed.map((o) => o.returnPct));
    const worstOp = Math.min(...closed.map((o) => o.returnPct));

    // Calmar = CAGR / |Max DD|. Lo usamos como "ratio rentabilidad/riesgo"
    // de la estrategia entera (cuántos puntos de rentabilidad anual por cada
    // punto de drawdown máximo).
    const calmar =
      results.metrics.maxDrawdown !== 0
        ? results.metrics.cagr / Math.abs(results.metrics.maxDrawdown)
        : null;

    return {
      total,
      winnerCount: winners.length,
      loserCount: losers.length,
      winRate,
      avgWin,
      avgLoss,
      winLossRatio,
      expectancy,
      avgReturn,
      bestOp,
      worstOp,
      calmar,
    };
  }, [operations, results.metrics]);

  // Operaciones ordenadas MÁS RECIENTE PRIMERO para el historial
  const operationsDesc = useMemo(
    () => [...operations].slice().reverse(),
    [operations]
  );

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
      <section id={sid("metrics")} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 scroll-mt-24">
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
      <section id={sid("equity")} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 scroll-mt-24">
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
          <div id={sid("annual")} className="scroll-mt-24">
            <AnnualReturnsHeatmap
              columns={columns}
              title="Rentabilidades anuales (mapa de calor)"
              description="Intensidad proporcional al máximo absoluto del rango — los peores años en rojo, los mejores en verde. Pasa el cursor sobre cada celda para ver el detalle."
            />
          </div>
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
          <div id={sid("monthly")} className="scroll-mt-24">
            <MonthlyReturnsHeatmap
              series={monthSeries}
              title="Mapa de calor mensual"
              description="Matriz año × mes. Lee horizontal para ver cómo evolucionó cada año, vertical para detectar estacionalidad. La intensidad se calcula sobre el máximo absoluto MENSUAL — los meses extremos saltan a la vista."
            />
          </div>
        );
      })()}

      {/* Ranking ACTUAL VIVO — qué se mantendría si rebalanceáramos hoy */}
      {results.liveRanking && (
        <section id={sid("live")} className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 scroll-mt-24">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
            <div>
              <h3 className="text-lg font-semibold text-brand-navy font-serif flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Ranking actual (vivo)
              </h3>
              <p className="text-xs text-brand-tertiary mt-1">
                Posiciones que se sostendrían si el rebalanceo se ejecutara HOY,
                usando datos diarios desde{" "}
                <span className="font-mono">{results.liveRanking.startDate}</span> hasta{" "}
                <span className="font-mono">{results.liveRanking.signalDate}</span>.
                Replica la página <em>Model Signals</em> de Portfoliovisualizer:
                no excluye el mes en curso y usa el último precio diario disponible.
                Pequeñas diferencias frente a PV pueden deberse a la fuente de
                datos (PV usa Yahoo; aquí EODHD por defecto — cámbialo con el
                engranaje del header si quieres alinear exactamente).
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider mb-1">
                Posiciones VIVAS
              </p>
              <p className="text-base font-bold text-emerald-700">
                {results.liveRanking.forcedCash
                  ? "CASH (filtro MA)"
                  : results.liveRanking.holdings.join(", ")}
              </p>
            </div>
          </div>

          {/* Comparación con las posiciones REALES de la última rotación */}
          {operations.length > 0 && (() => {
            const lastOp = operations[operations.length - 1]!;
            const liveSet = new Set(results.liveRanking!.holdings);
            const realSet = new Set(lastOp.rebalance.newHoldings);
            const wouldChange =
              liveSet.size !== realSet.size ||
              [...liveSet].some((t) => !realSet.has(t));
            return (
              <div
                className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium ${
                  wouldChange
                    ? "bg-amber-50 border border-amber-200 text-amber-800"
                    : "bg-emerald-50 border border-emerald-200 text-emerald-800"
                }`}
              >
                {wouldChange ? (
                  <>
                    ⚠ Cambio previsto: ahora mantienes{" "}
                    <strong>{lastOp.rebalance.newHoldings.join(", ")}</strong>{" "}
                    pero el ranking vivo apunta a{" "}
                    <strong>{results.liveRanking!.holdings.join(", ")}</strong>.
                  </>
                ) : (
                  <>
                    ✓ Sin cambios: el ranking vivo coincide con las posiciones actuales.
                  </>
                )}
              </div>
            );
          })()}

          {/* Tabla del ranking completo */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="text-left text-[10px] font-semibold text-brand-tertiary uppercase py-2 px-3">
                    #
                  </th>
                  <th className="text-left text-[10px] font-semibold text-brand-tertiary uppercase py-2 px-3">
                    Ticker
                  </th>
                  <th className="text-right text-[10px] font-semibold text-brand-tertiary uppercase py-2 px-3">
                    Momentum
                  </th>
                  {results.config.rankingMethod === "sharpe" && (
                    <>
                      <th className="text-right text-[10px] font-semibold text-brand-tertiary uppercase py-2 px-3">
                        Volatilidad
                      </th>
                      <th className="text-right text-[10px] font-semibold text-brand-tertiary uppercase py-2 px-3">
                        Ratio (ret/vol)
                      </th>
                    </>
                  )}
                  {results.config.movingAverageMonths != null &&
                    results.config.movingAverageMonths > 0 && (
                      <th className="text-center text-[10px] font-semibold text-brand-tertiary uppercase py-2 px-3">
                        &gt; MA{results.config.movingAverageMonths}
                      </th>
                    )}
                </tr>
              </thead>
              <tbody>
                {results.liveRanking.ranking.map((c, idx) => {
                  const inHoldings = results.liveRanking!.holdings.includes(c.ticker);
                  return (
                    <tr
                      key={c.ticker}
                      className={`border-b border-slate-100 ${
                        inHoldings ? "bg-emerald-50/40" : "hover:bg-slate-50/50"
                      }`}
                    >
                      <td className="py-2 px-3 text-xs font-mono text-brand-tertiary">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 text-xs">
                        <span
                          className={`font-mono font-semibold ${
                            inHoldings ? "text-emerald-700" : "text-brand-navy"
                          }`}
                        >
                          {c.ticker}
                        </span>
                        {inHoldings && (
                          <span className="ml-2 text-[9px] font-semibold text-emerald-700 uppercase">
                            ✓ holding
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2 px-3 text-xs text-right font-mono ${
                          c.momentumPercent >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {formatPct(c.momentumPercent / 100, 2)}
                      </td>
                      {results.config.rankingMethod === "sharpe" && (
                        <>
                          <td className="py-2 px-3 text-xs text-right font-mono text-brand-secondary">
                            {c.volatilityPercent !== undefined
                              ? formatPct(c.volatilityPercent / 100, 2)
                              : "—"}
                          </td>
                          <td className="py-2 px-3 text-xs text-right font-mono font-semibold text-brand-navy">
                            {formatNumber(c.score, 2)}
                          </td>
                        </>
                      )}
                      {results.config.movingAverageMonths != null &&
                        results.config.movingAverageMonths > 0 && (
                          <td className="py-2 px-3 text-xs text-center">
                            {c.aboveMA ? (
                              <span className="text-emerald-600">✓</span>
                            ) : (
                              <span className="text-red-600">✗</span>
                            )}
                          </td>
                        )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Estadísticas de la estrategia — métricas operacionales (no de mercado) */}
      {opStats && (
        <section id={sid("stats")} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 scroll-mt-24">
          <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
            Estadísticas de la estrategia
          </h3>
          <p className="text-xs text-brand-tertiary mb-4">
            Análisis trade-by-trade sobre las {opStats.total} operaciones cerradas
            (la operación abierta no cuenta hasta que se cierre).
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <Metric
              label="Operaciones totales"
              value={opStats.total.toString()}
            />
            <Metric
              label="% ganadoras"
              value={`${formatPct(opStats.winRate, 1)} (${opStats.winnerCount}/${opStats.total})`}
              color={opStats.winRate >= 0.5 ? "emerald" : undefined}
            />
            <Metric
              label="Win / Loss ratio"
              value={
                opStats.winLossRatio === null
                  ? "∞"
                  : formatNumber(opStats.winLossRatio, 2)
              }
              color={
                opStats.winLossRatio === null || opStats.winLossRatio >= 1
                  ? "emerald"
                  : "red"
              }
              hint="Media de las ganadoras dividida entre |media de las perdedoras|. > 1 significa que cuando aciertas ganas más de lo que pierdes cuando te equivocas."
            />
            <Metric
              label="Esperanza matemática"
              value={formatPct(opStats.expectancy / 100, 2)}
              color={opStats.expectancy >= 0 ? "emerald" : "red"}
              hint="Rentabilidad esperada por operación = winRate × media ganadoras + (1 − winRate) × media perdedoras. Positivo = la estrategia tiene ventaja matemática."
            />
            <Metric
              label="Beneficio medio / op"
              value={formatPct(opStats.avgReturn / 100, 2)}
              color={opStats.avgReturn >= 0 ? "emerald" : "red"}
            />
            <Metric
              label="Mejor operación"
              value={formatPct(opStats.bestOp / 100, 2)}
              color="emerald"
            />
            <Metric
              label="Peor operación"
              value={formatPct(opStats.worstOp / 100, 2)}
              color="red"
            />
            <Metric
              label="Mejor mes"
              value={formatPct(results.metrics.bestMonth / 100)}
              color="emerald"
            />
            <Metric
              label="Peor mes"
              value={formatPct(results.metrics.worstMonth / 100)}
              color="red"
            />
            <Metric
              label="Media ganadoras"
              value={formatPct(opStats.avgWin / 100, 2)}
              color="emerald"
            />
            <Metric
              label="Media perdedoras"
              value={formatPct(opStats.avgLoss / 100, 2)}
              color="red"
            />
            <Metric
              label="Rentabilidad / Riesgo"
              value={
                opStats.calmar === null
                  ? "—"
                  : formatNumber(opStats.calmar, 2)
              }
              color={
                opStats.calmar !== null && opStats.calmar >= 1
                  ? "emerald"
                  : undefined
              }
              hint="Ratio Calmar = CAGR / |Max Drawdown|. Cuántos puntos de rentabilidad anual obtienes por cada punto de caída máxima sufrida. > 1 se considera bueno."
            />
          </div>
        </section>
      )}

      {/* Historial de rotaciones — MÁS RECIENTE PRIMERO, con rentabilidad por op */}
      <section id={sid("history")} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 scroll-mt-24">
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
          Historial de operaciones
        </h3>
        <p className="text-xs text-brand-tertiary mb-4">
          Ordenado de más reciente a más antigua. Cada fila es una "operación":
          el holding period entre dos rotaciones. La rentabilidad mostrada es la
          obtenida con esos holdings durante ese periodo.{" "}
          {results.config.rankingMethod === "sharpe" && (
            <>
              Ranking por <strong>retorno / volatilidad</strong> ({results.config.volatilityPeriodMonths ?? 3}m).
            </>
          )}
        </p>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Entrada
                </th>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Salida
                </th>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Posiciones
                </th>
                <th className="text-right text-xs font-semibold text-brand-tertiary uppercase py-2 px-3">
                  Rentabilidad
                </th>
                <th className="text-left text-xs font-semibold text-brand-tertiary uppercase py-2 px-3 hidden lg:table-cell">
                  {results.config.rankingMethod === "sharpe"
                    ? "Top 5 ranking (retorno · ratio)"
                    : "Top 5 ranking (momentum %)"}
                </th>
              </tr>
            </thead>
            <tbody>
              {operationsDesc.map((op, i) => (
                <tr
                  key={i}
                  className={`border-b border-slate-100 hover:bg-slate-50/50 ${
                    op.isOpen ? "bg-emerald-50/30" : ""
                  }`}
                >
                  <td className="py-2 px-3 font-mono text-xs text-brand-secondary">
                    {op.startDate}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs">
                    {op.isOpen ? (
                      <span className="text-emerald-700 font-semibold">
                        EN CURSO
                      </span>
                    ) : (
                      <span className="text-brand-secondary">{op.endDate}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs font-semibold">
                    {op.rebalance.forcedCash ? (
                      <span className="px-2 py-0.5 bg-slate-100 text-brand-navy rounded">
                        CASH (filtro MA)
                      </span>
                    ) : (
                      <span className="text-brand-coral">
                        {op.rebalance.newHoldings.join(", ")}
                      </span>
                    )}
                    {op.durationMonths > 0 && (
                      <span className="ml-2 text-[10px] text-brand-tertiary">
                        ({op.durationMonths}{op.durationMonths === 1 ? "m" : "m"})
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2 px-3 text-xs text-right font-mono font-bold ${
                      op.returnPct >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {op.returnPct >= 0 ? "+" : ""}
                    {formatNumber(op.returnPct, 2)}%
                    {op.isOpen && (
                      <span className="block text-[9px] font-normal text-brand-tertiary uppercase">
                        MTD · no realizada
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-[11px] hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {op.rebalance.ranking.slice(0, 5).map((c, idx) => (
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
  hint,
}: {
  label: string;
  value: string;
  color?: "emerald" | "red";
  compact?: boolean;
  /** Tooltip educativo opcional sobre la métrica (se muestra en title HTML). */
  hint?: string;
}) {
  const colorClass =
    color === "emerald"
      ? "text-emerald-600"
      : color === "red"
      ? "text-red-600"
      : "text-brand-navy";
  return (
    <div
      className={`rounded-lg bg-slate-50 ${compact ? "p-3" : "p-4"} ${
        hint ? "cursor-help" : ""
      }`}
      title={hint}
    >
      <p className="text-[10px] sm:text-[11px] font-medium text-brand-tertiary uppercase tracking-wider mb-1 flex items-center gap-1">
        {label}
        {hint && (
          <span className="text-brand-tertiary/60" aria-hidden="true">
            ⓘ
          </span>
        )}
      </p>
      <p className={`${compact ? "text-base" : "text-lg sm:text-xl"} font-bold font-serif ${colorClass}`}>
        {value}
      </p>
    </div>
  );
}
