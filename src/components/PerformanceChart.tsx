"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { BacktestResponse, BacktestResult, RebalanceEvent } from "@/lib/types";
import type { ValueMode } from "./MetricsTable";
import { computeTaxOnGain, type TaxMode } from "@/lib/tax-utils";
import { formatEUR, formatDateLabel } from "@/lib/formatters";

// Colores para las carteras
const COLORS = {
  a: "#2563eb", // Azul
  b: "#e11d48", // Rojo/Rosa
  benchmark: "#9333ea", // Púrpura (línea discontinua)
};

interface PerformanceChartProps {
  results: BacktestResponse;
  isLoading: boolean;
  /** Modo de visualización del valor: escala las curvas según el escenario */
  valueMode?: ValueMode;
}

// Extraer año de una fecha YYYY-MM
const getYear = (date: string): string => date.slice(0, 4);

// Tooltip personalizado
interface TooltipPayload {
  value: number;
  dataKey: string;
  color: string;
  name: string;
  payload?: Record<string, number | string>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  // Usar exactDate del primer payload entry si está disponible
  const exactDate = payload[0]?.payload?.exactDate as string | undefined;
  const displayDate = exactDate || label || "";

  return (
    <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-3 min-w-[200px]">
      <p className="text-sm font-medium text-slate-600 mb-2 border-b border-slate-100 pb-2">
        {formatDateLabel(displayDate, true)}
      </p>
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-slate-700 truncate max-w-[120px]">
                {entry.name}
              </span>
            </div>
            <span className="text-sm font-semibold text-slate-900">
              {formatEUR(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Convierte una fecha YYYY-MM-DD del rebalanceLog (que es la fecha exacta diaria)
// a la fecha que aparece en el eje del gráfico (YYYY-MM en mensual/trimestral,
// YYYY-MM-DD en diario). Si no encuentra el periodo exacto, devuelve null.
function mapRebalanceDateToChartDate(
  rebalanceDate: string,
  chartDates: string[]
): string | null {
  // El eje X usa el formato del chartData (date), que ya está en el formato
  // visualizado. Buscamos el chartDate cuya YYYY-MM (o YYYY-MM-DD) sea >= a la
  // fecha del rebalanceo. Como las fechas están ordenadas, hacemos búsqueda
  // lineal sencilla (los rebalances son pocos).
  const target = rebalanceDate.substring(0, Math.min(rebalanceDate.length, 10));
  for (const d of chartDates) {
    // d puede ser YYYY-MM (mensual) o YYYY-MM-DD (diario)
    // Comparación lexicográfica funciona porque están en formato ISO.
    if (d >= target.substring(0, d.length)) return d;
  }
  return null;
}

// Decide qué rebalanceos mostrar: si hay muchos, queda visualmente saturado;
// limitamos al decil superior por impuesto pagado.
function filterRebalancesForDisplay(
  events: RebalanceEvent[],
  maxToShowAll: number = 20
): RebalanceEvent[] {
  if (events.length <= maxToShowAll) return events;
  // Decil superior por taxPaid (si hay tax) o por totalGain
  const sortedByImportance = [...events].sort((a, b) => {
    const aw = a.taxPaid > 0 ? a.taxPaid : a.totalGain;
    const bw = b.taxPaid > 0 ? b.taxPaid : b.totalGain;
    return bw - aw;
  });
  const decileCount = Math.max(1, Math.ceil(events.length / 10));
  return sortedByImportance.slice(0, decileCount);
}

// =====================================================================
// SCALING HELPERS — adaptan los valores de la serie según el modo seleccionado
// =====================================================================
//
// El motor genera la serie "neta del camino" (valor real con impuestos
// pagados descontados en cada rebalanceo). Para "bruto" y "al liquidar"
// reconstruimos la serie POR PUNTO, no uniformemente. Así:
//   - En "bruto" el gap a "camino" CRECE escalonadamente cada vez que se
//     paga un impuesto en un rebalanceo (forma curva visible).
//   - En "liquidar" el gap a "camino" CRECE suavemente con la plusvalía
//     latente, llegando a su máximo al final.

function getEffectivePending(result: BacktestResult, otherResult?: BacktestResult | null): number {
  const ownMode = (result.fees.taxMode ?? "none") as TaxMode;
  if (ownMode !== "none") return result.fees.pendingTaxes ?? 0;
  if (otherResult) {
    const otherMode = (otherResult.fees.taxMode ?? "none") as TaxMode;
    const otherRate = otherResult.fees.taxRate ?? 0;
    if (otherMode !== "none") {
      return computeTaxOnGain(result.fees.unrealizedGain ?? 0, otherMode, otherRate);
    }
  }
  return 0;
}

/** Diferencia en meses entre dos fechas YYYY-MM o YYYY-MM-DD */
function monthsBetween(start: string, end: string): number {
  const s = new Date(start.length === 7 ? `${start}-01` : start);
  const e = new Date(end.length === 7 ? `${end}-01` : end);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

/**
 * Construye una serie de valores según el modo seleccionado.
 * Devuelve un Map<date, value> con el valor escalado punto a punto.
 *
 * Notas de cálculo:
 * - "bruto" requiere el rebalanceLog para acumular taxes pagados hasta cada
 *   fecha. Si no hay log o no hay taxes pagados, devuelve la serie original.
 * - "liquidar" estima la plusvalía latente en cada punto como
 *   max(0, value_t − contributions_t) y le aplica una tasa efectiva derivada
 *   de los datos finales (pendingFinal / unrealizedFinal). Es una aproximación
 *   que crece naturalmente con la plusvalía.
 */
function buildScaledSeries(
  result: BacktestResult,
  mode: ValueMode,
  otherResult: BacktestResult | null,
  monthlyContribution: number,
  initialAmount: number
): Map<string, number> {
  const series = new Map<string, number>();
  const ts = result.timeSeries;
  if (ts.length === 0) return series;

  if (mode === "camino") {
    for (const p of ts) series.set(p.date, p.value);
    return series;
  }

  if (mode === "bruto") {
    const events = (result.rebalanceLog ?? [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    if (events.length === 0 || (result.fees.totalTaxesPaid ?? 0) === 0) {
      for (const p of ts) series.set(p.date, p.value);
      return series;
    }
    // Recorrer puntos en orden y acumular taxes pagados hasta su fecha
    let cumPaid = 0;
    let evIdx = 0;
    const sortedTs = ts.slice().sort((a, b) => a.date.localeCompare(b.date));
    for (const p of sortedTs) {
      // p.exactDate es YYYY-MM-DD, event.date también es YYYY-MM-DD
      const pDate = p.exactDate || p.date;
      while (evIdx < events.length && events[evIdx]!.date <= pDate) {
        cumPaid += events[evIdx]!.taxPaid;
        evIdx++;
      }
      series.set(p.date, p.value + cumPaid);
    }
    return series;
  }

  // liquidar
  const pendingFinal = getEffectivePending(result, otherResult);
  const unrealizedFinal = result.fees.unrealizedGain ?? Math.max(0, result.finalValue - result.totalContributions);
  if (pendingFinal <= 0 || unrealizedFinal <= 0) {
    for (const p of ts) series.set(p.date, p.value);
    return series;
  }
  // Tasa efectiva: cuánto impuesto representa cada euro de plusvalía latente
  const effectiveRate = pendingFinal / unrealizedFinal;
  const firstDate = ts[0]!.exactDate || ts[0]!.date;

  for (const p of ts) {
    const pDate = p.exactDate || p.date;
    const monthsElapsed = Math.max(0, monthsBetween(firstDate, pDate));
    // Aproximación de aportaciones acumuladas hasta el punto t
    const contribsAtT = initialAmount + monthlyContribution * monthsElapsed;
    const unrealizedAtT = Math.max(0, p.value - contribsAtT);
    const pendingAtT = unrealizedAtT * effectiveRate;
    series.set(p.date, p.value - pendingAtT);
  }
  return series;
}

export function PerformanceChart({ results, isLoading, valueMode = "camino" }: PerformanceChartProps) {
  // Toggle para mostrar/ocultar las líneas verticales de rebalanceo
  const [showRebalances, setShowRebalances] = useState(false);
  // Escala del eje Y: lineal (por defecto) o logarítmica. La log es útil para
  // comparar a largo plazo: porcentualmente la misma subida ocupa la misma
  // distancia vertical en cualquier punto de la curva.
  const [yScale, setYScale] = useState<"linear" | "log">("linear");

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Evolución del patrimonio
        </h3>
        <div className="h-80 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Verificar que tenemos al menos un resultado válido
  if (!results.resultA && !results.resultB) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Evolución del patrimonio
        </h3>
        <p className="text-slate-500 text-center py-8">No hay datos suficientes para mostrar el gráfico.</p>
      </div>
    );
  }

  const resultA = results.resultA;
  const resultB = results.resultB;
  // Benchmark — solo si está activo en al menos una cartera
  const benchmark = resultA?.benchmark ?? resultB?.benchmark;
  const benchmarkSeriesRaw = benchmark?.benchmarkTimeSeries ?? [];
  const benchmarkName = benchmark?.benchmarkName ?? "";

  // Construir set de fechas válidas (las que aparecen en al menos una cartera)
  // para limitar el benchmark a ese rango y evitar la "cola extra" inicial cuando
  // el benchmark tiene datos anteriores al inicio real de las carteras.
  const carteraDates = new Set<string>();
  if (resultA) for (const p of resultA.timeSeries) carteraDates.add(p.date);
  if (resultB) for (const p of resultB.timeSeries) carteraDates.add(p.date);

  const benchmarkSeries = benchmarkSeriesRaw.filter((p) => carteraDates.has(p.date));
  const hasBenchmark = benchmarkSeries.length > 0;

  // Si el benchmark tiene valor inicial distinto al de la cartera (porque arrancó
  // antes o no estaba normalizado), lo reescalamos para que ambos partan del mismo
  // patrimonio inicial (el del primer punto de la cartera con datos).
  // Esto solo afecta a visualización — las métricas del benchmark se calcularon
  // sobre su propio backtest.
  const firstCarteraValue = resultA?.timeSeries[0]?.value ?? resultB?.timeSeries[0]?.value;
  const firstBenchmarkValue = benchmarkSeries[0]?.value;
  const benchmarkScale = firstCarteraValue && firstBenchmarkValue && firstBenchmarkValue > 0
    ? firstCarteraValue / firstBenchmarkValue
    : 1;

  // Construir las series ESCALADAS POR PUNTO según el modo activo. Esto hace
  // que el gap entre modos crezca con la plusvalía / impuestos pagados, en
  // lugar de aplicar un desplazamiento uniforme que dejaría la forma idéntica.
  const monthlyContribution = results.config?.monthlyContribution ?? 0;
  const initialAmount = results.config?.initialAmount ?? 0;
  const seriesA = resultA
    ? buildScaledSeries(resultA, valueMode, resultB ?? null, monthlyContribution, initialAmount)
    : new Map<string, number>();
  const seriesB = resultB
    ? buildScaledSeries(resultB, valueMode, resultA ?? null, monthlyContribution, initialAmount)
    : new Map<string, number>();
  // Para el benchmark: hereda el modo de la cartera principal. Como no tiene
  // su propio rebalanceLog rico, usamos un escalado simple proporcional al
  // valor final (igual que antes).
  const benchmarkPrimary = resultA ?? resultB ?? null;
  let scaleBench = 1;
  if (benchmarkPrimary && benchmark && valueMode !== "camino") {
    const finalBench = benchmark.benchmarkFinalValue ?? 0;
    if (finalBench > 0) {
      const benchFees = benchmark.benchmarkFees;
      if (valueMode === "bruto") {
        const paidB = benchFees?.totalTaxesPaid ?? 0;
        scaleBench = (finalBench + paidB) / finalBench;
      } else {
        // liquidar — usar el modo fiscal de la cartera principal sobre la
        // plusvalía latente del benchmark
        const ownMode = (benchFees?.taxMode ?? "none") as TaxMode;
        let pending = benchFees?.pendingTaxes ?? 0;
        if (ownMode === "none") {
          const primaryMode = (benchmarkPrimary.fees.taxMode ?? "none") as TaxMode;
          const primaryRate = benchmarkPrimary.fees.taxRate ?? 0;
          if (primaryMode !== "none") {
            pending = computeTaxOnGain(benchFees?.unrealizedGain ?? 0, primaryMode, primaryRate);
          }
        }
        scaleBench = (finalBench - pending) / finalBench;
      }
    }
  }

  // Combinar datos de las carteras disponibles por fecha
  const dataMap = new Map<string, Record<string, number | string>>();

  if (resultA) {
    for (const point of resultA.timeSeries) {
      const scaledValue = seriesA.get(point.date) ?? point.value;
      dataMap.set(point.date, {
        date: point.date,
        exactDate: point.exactDate || point.date,
        [resultA.portfolioName]: scaledValue,
      });
    }
  }

  if (resultB) {
    for (const point of resultB.timeSeries) {
      const scaledValue = seriesB.get(point.date) ?? point.value;
      const entry = dataMap.get(point.date);
      if (entry) {
        entry[resultB.portfolioName] = scaledValue;
      } else {
        dataMap.set(point.date, {
          date: point.date,
          exactDate: point.exactDate || point.date,
          [resultB.portfolioName]: scaledValue,
        });
      }
    }
  }

  if (hasBenchmark) {
    for (const point of benchmarkSeries) {
      const entry = dataMap.get(point.date);
      const scaledValue = point.value * benchmarkScale * scaleBench;
      if (entry) {
        entry[benchmarkName] = scaledValue;
      } else {
        // Este caso ya no debería darse tras el filtro previo, pero por seguridad
        dataMap.set(point.date, {
          date: point.date,
          exactDate: point.exactDate || point.date,
          [benchmarkName]: scaledValue,
        });
      }
    }
  }

  const chartData = Array.from(dataMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  );

  // Calcular el dominio del eje Y con margen (con las series escaladas)
  const allValues = [
    ...(resultA ? Array.from(seriesA.values()) : []),
    ...(resultB ? Array.from(seriesB.values()) : []),
    ...(hasBenchmark ? benchmarkSeries.map((p) => p.value * benchmarkScale * scaleBench) : []),
  ];
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const padding = (maxValue - minValue) * 0.05;

  // Determinar qué años mostrar en el eje X (primer punto de cada año)
  const yearTicks: string[] = [];
  const seenYears = new Set<string>();
  chartData.forEach((point) => {
    const year = getYear(point.date as string);
    if (!seenYears.has(year)) {
      seenYears.add(year);
      yearTicks.push(point.date as string); // usar la fecha real del primer punto del año
    }
  });

  // === Rebalanceos: preparar líneas verticales de referencia ===
  // Cada cartera puede tener su propio log de rebalanceos. Filtramos los más
  // relevantes (si hay muchos) y los mapeamos a fechas del eje del gráfico.
  const chartDates = chartData.map((p) => p.date as string);
  type RebalanceMarker = {
    chartDate: string;
    color: string;
    portfolio: "a" | "b";
    portfolioName: string;
    event: RebalanceEvent;
  };
  const markers: RebalanceMarker[] = [];
  if (showRebalances) {
    if (resultA?.rebalanceLog && resultA.rebalanceLog.length > 0) {
      const filtered = filterRebalancesForDisplay(resultA.rebalanceLog);
      for (const ev of filtered) {
        const cd = mapRebalanceDateToChartDate(ev.date, chartDates);
        if (cd) markers.push({
          chartDate: cd, color: COLORS.a, portfolio: "a",
          portfolioName: resultA.portfolioName, event: ev,
        });
      }
    }
    if (resultB?.rebalanceLog && resultB.rebalanceLog.length > 0) {
      const filtered = filterRebalancesForDisplay(resultB.rebalanceLog);
      for (const ev of filtered) {
        const cd = mapRebalanceDateToChartDate(ev.date, chartDates);
        if (cd) markers.push({
          chartDate: cd, color: COLORS.b, portfolio: "b",
          portfolioName: resultB.portfolioName, event: ev,
        });
      }
    }
  }

  // Total de rebalanceos disponibles (para el badge)
  const totalRebalances =
    (resultA?.rebalanceLog?.length ?? 0) + (resultB?.rebalanceLog?.length ?? 0);
  const filteredCount = markers.length;
  const truncated = showRebalances &&
    ((resultA?.rebalanceLog?.length ?? 0) > 20 || (resultB?.rebalanceLog?.length ?? 0) > 20);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-lg font-semibold text-slate-900">
          Evolución del patrimonio
        </h3>
        <div className="flex items-center gap-4 flex-wrap">
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

          {totalRebalances > 0 && (
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={showRebalances}
                onChange={(e) => setShowRebalances(e.target.checked)}
                className="sr-only peer"
              />
              <span className="relative inline-block w-9 h-5 bg-slate-200 rounded-full peer-checked:bg-brand-coral transition-colors">
                <span className="absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full border border-slate-300 transition-transform peer-checked:translate-x-4" />
              </span>
              <span className="text-slate-700 font-medium">
                Mostrar rebalanceos{" "}
                <span className="text-slate-400">
                  ({totalRebalances}
                  {truncated ? ` → ${filteredCount} relevantes` : ""})
                </span>
              </span>
            </label>
          )}
        </div>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tickFormatter={getYear}
              tick={{ fill: "#64748b", fontSize: 12 }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
              ticks={yearTicks}
            />
            <YAxis
              tickFormatter={(value) => formatEUR(value)}
              tick={{ fill: "#64748b", fontSize: 12 }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
              scale={yScale}
              domain={
                yScale === "log"
                  ? [
                      // En log el mínimo debe ser estrictamente > 0. Si por algún
                      // valueMode hubiese 0 o negativo, lo recortamos a 1 € para
                      // no romper la escala (es un caso patológico).
                      Math.max(1, minValue * 0.9),
                      maxValue * 1.1,
                    ]
                  : [Math.floor(minValue - padding), Math.ceil(maxValue + padding)]
              }
              allowDataOverflow={yScale === "log"}
              width={85}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: "1rem" }}
              iconType="circle"
              formatter={(value) => (
                <span className="text-sm text-slate-700">{value}</span>
              )}
            />
            {resultA && (
              <Line
                type="monotone"
                dataKey={resultA.portfolioName}
                name={resultA.portfolioName}
                stroke={COLORS.a}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: COLORS.a }}
              />
            )}
            {resultB && (
              <Line
                type="monotone"
                dataKey={resultB.portfolioName}
                name={resultB.portfolioName}
                stroke={COLORS.b}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: COLORS.b }}
              />
            )}
            {hasBenchmark && (
              <Line
                type="monotone"
                dataKey={benchmarkName}
                name={benchmarkName}
                stroke={COLORS.benchmark}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4, fill: COLORS.benchmark }}
              />
            )}
            {/* Líneas verticales de rebalanceo: una por cada evento mostrado.
                Color de la cartera correspondiente, suficientemente gruesas y
                visibles para llamar la atención cuando el toggle está activo. */}
            {markers.map((m, idx) => (
              <ReferenceLine
                key={`rb-${idx}`}
                x={m.chartDate}
                stroke={m.color}
                strokeOpacity={0.65}
                strokeWidth={2}
                strokeDasharray="4 3"
                ifOverflow="extendDomain"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
