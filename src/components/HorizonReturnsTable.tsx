"use client";

import type { BacktestResponse, BacktestResult, TimeSeriesPoint } from "@/lib/types";
import type { ValueMode } from "./MetricsTable";
import { buildScaledSeries } from "@/lib/value-mode-series";
import { formatPct, formatNumber } from "@/lib/formatters";
import { Tooltip } from "./Tooltip";

interface HorizonReturnsTableProps {
  results: BacktestResponse;
  isLoading: boolean;
  /** Modo de valoración: escala las cifras igual que el gráfico y las métricas. */
  valueMode?: ValueMode;
}

// -----------------------------------------------------------------------------
// Utilidades de cálculo de rentabilidades trailing (a fecha del último dato)
// -----------------------------------------------------------------------------

/** Convierte "YYYY-MM" (o "YYYY-MM-DD") a un índice de mes absoluto. */
function monthIndex(date: string): number {
  const parts = date.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  return y * 12 + (m - 1);
}

/** Una columna a comparar: cartera A, cartera B o benchmark. */
interface Column {
  name: string;
  color: "blue" | "rose" | "purple";
  /** Serie ya escalada al modo de valoración seleccionado. */
  series: TimeSeriesPoint[];
}

interface HorizonDef {
  key: string;
  label: string;
  /** Descriptor pequeño bajo la etiqueta. */
  hint: string;
  /** Meses hacia atrás desde el último dato (null = usa YTD o inicio). */
  monthsBack: number | null;
  /** Si la rentabilidad se anualiza (CAGR) o es total del periodo. */
  annualized: boolean;
  /** Casos especiales. */
  mode?: "ytd" | "inception";
}

const HORIZONS: HorizonDef[] = [
  { key: "ytd", label: "YTD", hint: "en lo que va de año · total", monthsBack: null, annualized: false, mode: "ytd" },
  { key: "1y", label: "1 año", hint: "últimos 12 meses · total", monthsBack: 12, annualized: false },
  { key: "2y", label: "2 años", hint: "anualizada (CAGR)", monthsBack: 24, annualized: true },
  { key: "3y", label: "3 años", hint: "anualizada (CAGR)", monthsBack: 36, annualized: true },
  { key: "5y", label: "5 años", hint: "anualizada (CAGR)", monthsBack: 60, annualized: true },
  { key: "10y", label: "10 años", hint: "anualizada (CAGR)", monthsBack: 120, annualized: true },
  { key: "inception", label: "Desde inicio", hint: "anualizada (CAGR)", monthsBack: null, annualized: true, mode: "inception" },
];

/**
 * Calcula la rentabilidad de una serie para un horizonte dado.
 * Devuelve null si no hay datos suficientes (N/D).
 * Trabaja sobre la serie ya escalada al modo de valoración seleccionado.
 */
function computeReturn(series: TimeSeriesPoint[], h: HorizonDef): number | null {
  if (!series || series.length < 2) return null;

  const last = series[series.length - 1];
  const first = series[0];
  if (!last || !first) return null;

  const finalIdx = monthIndex(last.date);
  const finalValue = last.value;
  const finalYear = Number(last.date.split("-")[0]);
  const firstIdx = monthIndex(first.date);

  // Índice de mes base según el horizonte
  let baseIdx: number;
  if (h.mode === "inception") {
    baseIdx = firstIdx;
  } else if (h.mode === "ytd") {
    // Base = diciembre del año anterior (cierre del ejercicio previo)
    baseIdx = (finalYear - 1) * 12 + 11;
  } else if (h.monthsBack != null) {
    baseIdx = finalIdx - h.monthsBack;
  } else {
    return null;
  }

  if (baseIdx < firstIdx) return null; // el backtest no llega tan atrás → N/D

  // Buscar el valor base: match exacto y, si no, el punto más cercano
  // anterior dentro de 2 meses (robusto para series trimestrales o con huecos).
  let baseValue: number | null = null;
  let bestIdx = -Infinity;
  for (const p of series) {
    const idx = monthIndex(p.date);
    if (idx === baseIdx) {
      baseValue = p.value;
      bestIdx = idx;
      break;
    }
    if (idx <= baseIdx && idx > bestIdx) {
      bestIdx = idx;
      baseValue = p.value;
    }
  }
  if (baseValue == null || baseValue <= 0) return null;
  if (baseIdx - bestIdx > 2) return null; // el punto más cercano queda demasiado lejos

  const monthsSpan = finalIdx - bestIdx;
  if (monthsSpan <= 0) return null;

  const growth = finalValue / baseValue;
  if (h.annualized) {
    const years = monthsSpan / 12;
    return Math.pow(growth, 1 / years) - 1;
  }
  return growth - 1;
}

/** Serie escalada al modo seleccionado (misma lógica que el gráfico). */
function scaledSeries(
  result: BacktestResult,
  mode: ValueMode,
  other: BacktestResult | null,
  monthlyContribution: number,
  initialAmount: number
): TimeSeriesPoint[] {
  const map = buildScaledSeries(result, mode, other, monthlyContribution, initialAmount);
  return result.timeSeries.map((p) => ({ ...p, value: map.get(p.date) ?? p.value }));
}

function headerColorClass(color: Column["color"]): string {
  if (color === "blue") return "text-blue-600";
  if (color === "rose") return "text-rose-600";
  return "text-purple-600";
}

function valueColorClass(v: number): string {
  return v >= 0 ? "text-emerald-600" : "text-red-600";
}

/** Formatea una diferencia en puntos porcentuales, con signo. */
function formatDiffPp(diff: number): string {
  const pp = diff * 100;
  const sign = pp >= 0 ? "+" : "";
  return `${sign}${formatNumber(pp, 2)} pp`;
}

const MODE_LABEL: Record<ValueMode, string> = {
  bruto: "bruto (sin impuestos)",
  camino: "neta del camino",
  liquidar: "al liquidar",
};

export function HorizonReturnsTable({ results, isLoading, valueMode = "camino" }: HorizonReturnsTableProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <div className="h-32 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-coral/30 border-t-brand-coral rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const { resultA, resultB } = results;
  if (!resultA && !resultB) return null;

  const initialAmount = results.config?.initialAmount ?? 10000;
  const monthlyContribution = results.config?.monthlyContribution ?? 0;

  // El benchmark es global: A y B comparten el mismo.
  const bm = resultA?.benchmark ?? resultB?.benchmark;

  const columns: Column[] = [];
  // Índices de columna de A y B (para la diferencia A−B). -1 si no existen.
  let colAIdx = -1;
  let colBIdx = -1;

  if (resultA) {
    colAIdx = columns.length;
    columns.push({
      name: resultA.portfolioName,
      color: "blue",
      series: scaledSeries(resultA, valueMode, resultB ?? null, monthlyContribution, initialAmount),
    });
  }
  if (resultB) {
    colBIdx = columns.length;
    columns.push({
      name: resultB.portfolioName,
      color: "rose",
      series: scaledSeries(resultB, valueMode, resultA ?? null, monthlyContribution, initialAmount),
    });
  }
  if (bm && bm.benchmarkTimeSeries && bm.benchmarkTimeSeries.length > 0) {
    // El benchmark es un índice de referencia (Total Return): usamos su serie
    // tal cual, sin escalar por régimen fiscal.
    columns.push({
      name: bm.benchmarkName ?? "Benchmark",
      color: "purple",
      series: bm.benchmarkTimeSeries,
    });
  }

  if (columns.length === 0) return null;

  // Etiqueta del año YTD (tomada de la primera columna con datos)
  const refSeries = columns[0]?.series;
  const lastRef = refSeries && refSeries.length > 0 ? refSeries[refSeries.length - 1] : undefined;
  const finalYear = lastRef ? Number(lastRef.date.split("-")[0]) : null;

  // Precalcular todos los valores: matriz [horizonte][columna]
  const matrix: (number | null)[][] = HORIZONS.map((h) =>
    columns.map((c) => computeReturn(c.series, h))
  );

  const canCompare = columns.length >= 2;
  const showDiff = colAIdx >= 0 && colBIdx >= 0; // hay A y B → columna de diferencia

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-base font-semibold text-brand-navy font-serif">
          Rentabilidad por horizonte temporal
        </h3>
        <div className="text-xs text-brand-tertiary mt-0.5 flex flex-wrap items-center gap-x-1">
          <span>
            Rentabilidad de cada cartera a fecha del último dato, para los plazos
            clásicos. YTD y 1 año son rentabilidad total; 2, 3, 5 y 10 años están
          </span>
          <Tooltip content="CAGR = tasa de crecimiento anual compuesto. Convierte la rentabilidad total del periodo en una media anual equivalente, para poder comparar plazos distintos con la misma vara.">
            <span className="cursor-help underline decoration-dotted">anualizadas (CAGR)</span>
          </Tooltip>
          <span>· escenario:</span>
          <span className="font-semibold text-brand-secondary">{MODE_LABEL[valueMode]}</span>
          <span>.</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="py-2.5 px-4 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                Horizonte
              </th>
              {columns.map((c) => (
                <th
                  key={c.name}
                  className={`py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-wider ${headerColorClass(c.color)}`}
                >
                  {c.name}
                </th>
              ))}
              {showDiff && (
                <th className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-wider text-brand-tertiary">
                  <Tooltip content="Diferencia A − B en puntos porcentuales (pp). Positivo (verde) = la primera cartera rinde más en ese plazo; negativo (rojo) = rinde menos.">
                    <span className="cursor-help underline decoration-dotted">Dif. A − B</span>
                  </Tooltip>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {HORIZONS.map((h, ri) => {
              const rowVals = matrix[ri];
              if (!rowVals) return null;

              // Mejor de la fila (solo si hay ≥2 carteras y ≥2 valores disponibles)
              const availIdx = rowVals
                .map((v, i) => (v == null ? -1 : i))
                .filter((i) => i >= 0);
              let bestCol = -1;
              if (canCompare && availIdx.length >= 2) {
                let bestV = -Infinity;
                for (const i of availIdx) {
                  const v = rowVals[i];
                  if (v != null && v > bestV) {
                    bestV = v;
                    bestCol = i;
                  }
                }
              }

              // Diferencia A − B (en decimal)
              const vA = colAIdx >= 0 ? rowVals[colAIdx] : null;
              const vB = colBIdx >= 0 ? rowVals[colBIdx] : null;
              const diff = vA != null && vB != null ? vA - vB : null;

              const label = h.mode === "ytd" && finalYear ? `${h.label} ${finalYear}` : h.label;

              return (
                <tr key={h.key} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-2.5 px-4">
                    <div className="text-sm font-medium text-brand-navy">{label}</div>
                    <div className="text-xs text-brand-tertiary italic">{h.hint}</div>
                  </td>
                  {rowVals.map((v, ci) => {
                    const isBest = ci === bestCol;
                    return (
                      <td
                        key={ci}
                        className={`py-2.5 px-4 text-right tabular-nums ${
                          isBest ? "bg-emerald-50/70" : ""
                        }`}
                      >
                        {v == null ? (
                          <Tooltip content="No hay suficiente histórico común para cubrir este plazo dentro del periodo del backtest.">
                            <span className="text-slate-400 italic cursor-help">N/D</span>
                          </Tooltip>
                        ) : (
                          <span
                            className={`text-sm font-semibold ${valueColorClass(v)} ${
                              isBest ? "font-bold" : ""
                            }`}
                          >
                            {formatPct(v, 2)}
                            {isBest && (
                              <span className="ml-1 text-[10px] text-emerald-600 font-semibold not-italic">
                                ▲
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {showDiff && (
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {diff == null ? (
                        <span className="text-slate-400 italic">—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${valueColorClass(diff)}`}>
                          {formatDiffPp(diff)}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100">
        <p className="text-xs text-brand-tertiary leading-relaxed">
          <span className="font-semibold text-brand-secondary">Cómo leerlo:</span>{" "}
          en horizontes cortos casi cualquier cartera puede parecer &quot;la mejor&quot;;
          cuanto más largo es el plazo, más se acercan las cifras y más pesa el
          coste soportado.{" "}
          {canCompare && (
            <>
              El triángulo <span className="text-emerald-600">▲</span> marca la mejor de cada fila
              {showDiff && <>; la columna <span className="font-medium">Dif. A − B</span> muestra la ventaja en puntos porcentuales</>}.{" "}
            </>
          )}
          <span className="italic">N/D</span> = el backtest no cubre ese plazo (p.ej. no hay 10 años completos).
          Cifras sobre la evolución del patrimonio en el escenario{" "}
          <span className="font-medium">{MODE_LABEL[valueMode]}</span> (cambia con el selector de arriba)
          {monthlyContribution > 0 && (
            <>. <span className="italic">Ojo:</span> con aportaciones periódicas activas estas cifras reflejan la trayectoria del valor, no una rentabilidad pura de la cartera</>
          )}
          .
        </p>
      </div>
    </div>
  );
}
