"use client";

import { useState } from "react";
import type { BacktestResponse, BacktestResult } from "@/lib/types";
import { formatEUR, formatPct, formatPctNoSign, formatRatio } from "@/lib/formatters";

interface MetricsTableProps {
  results: BacktestResponse;
  isLoading: boolean;
}

// Tooltips en español para cada métrica
const METRIC_TOOLTIPS = {
  finalValue:
    "Valor total de tu cartera al final del periodo, incluyendo todas las aportaciones y rendimientos.",
  totalReturn:
    "Rentabilidad total acumulada desde el inicio hasta el final. Incluye el efecto de todas las aportaciones.",
  cagr:
    "Rentabilidad media anual compuesta. El dato más relevante para comparar inversiones a largo plazo.",
  volatility:
    "Desviación estándar anualizada de los retornos. Mide cuánto fluctúa el valor de tu cartera. Menor es más estable.",
  sharpe:
    "Rentabilidad ajustada al riesgo. Mayor de 1 es bueno, mayor de 2 es excelente. Considera la tasa libre de riesgo.",
  sortino:
    "Similar al Sharpe, pero solo penaliza la volatilidad negativa (caídas). Más relevante si te preocupan las pérdidas.",
  maxDrawdown:
    "La peor caída desde un máximo. Mide cuánto podrías haber perdido en el peor momento. Menos negativo es mejor.",
  bestMonth:
    "El mejor mes del periodo. Muestra el potencial alcista de la cartera.",
  worstMonth:
    "El peor mes del periodo. Muestra el riesgo de pérdida en un mal mes.",
  positiveMonthsRatio:
    "Porcentaje de meses con rentabilidad positiva. Mayor porcentaje indica más consistencia.",
  totalFees:
    "Total de comisiones pagadas durante todo el periodo. Incluye TER aplicado mensualmente.",
} as const;

// Definición de métricas con dirección (si mayor o menor es mejor)
interface MetricConfig {
  key: string;
  label: string;
  getValue: (result: BacktestResult) => number;
  format: (value: number) => string;
  higherIsBetter: boolean;
  tooltip: string;
}


// Configuración de todas las métricas
const METRICS_CONFIG: MetricConfig[] = [
  {
    key: "finalValue",
    label: "Valor final",
    getValue: (r) => r.finalValue,
    format: formatEUR,
    higherIsBetter: true,
    tooltip: METRIC_TOOLTIPS.finalValue,
  },
  {
    key: "totalReturn",
    label: "Rentabilidad total",
    getValue: (r) => r.metrics.totalReturn,
    format: (v) => formatPct(v),
    higherIsBetter: true,
    tooltip: METRIC_TOOLTIPS.totalReturn,
  },
  {
    key: "cagr",
    label: "CAGR",
    getValue: (r) => r.metrics.cagr,
    format: (v) => formatPct(v),
    higherIsBetter: true,
    tooltip: METRIC_TOOLTIPS.cagr,
  },
  {
    key: "volatility",
    label: "Volatilidad",
    getValue: (r) => r.metrics.volatility,
    format: (v) => formatPctNoSign(v),
    higherIsBetter: false,
    tooltip: METRIC_TOOLTIPS.volatility,
  },
  {
    key: "sharpe",
    label: "Ratio Sharpe",
    getValue: (r) => r.metrics.sharpe,
    format: formatRatio,
    higherIsBetter: true,
    tooltip: METRIC_TOOLTIPS.sharpe,
  },
  {
    key: "sortino",
    label: "Ratio Sortino",
    getValue: (r) => r.metrics.sortino,
    format: formatRatio,
    higherIsBetter: true,
    tooltip: METRIC_TOOLTIPS.sortino,
  },
  {
    key: "maxDrawdown",
    label: "Max Drawdown",
    getValue: (r) => r.metrics.maxDrawdown,
    format: (v) => formatPct(v, 1),
    higherIsBetter: true, // Menos negativo es mejor (closer to 0)
    tooltip: METRIC_TOOLTIPS.maxDrawdown,
  },
  {
    key: "bestMonth",
    label: "Mejor mes",
    getValue: (r) => r.metrics.bestMonth,
    format: (v) => formatPct(v, 1),
    higherIsBetter: true,
    tooltip: METRIC_TOOLTIPS.bestMonth,
  },
  {
    key: "worstMonth",
    label: "Peor mes",
    getValue: (r) => r.metrics.worstMonth,
    format: (v) => formatPct(v, 1),
    higherIsBetter: true, // Menos negativo es mejor
    tooltip: METRIC_TOOLTIPS.worstMonth,
  },
  {
    key: "positiveMonthsRatio",
    label: "% Meses positivos",
    getValue: (r) => r.metrics.positiveMonthsRatio,
    format: (v) => formatPctNoSign(v),
    higherIsBetter: true,
    tooltip: METRIC_TOOLTIPS.positiveMonthsRatio,
  },
  {
    key: "totalFees",
    label: "Comisiones pagadas",
    getValue: (r) => r.fees.totalFees,
    format: formatEUR,
    higherIsBetter: false,
    tooltip: METRIC_TOOLTIPS.totalFees,
  },
];

// Componente Tooltip inline
function MetricTooltip({ content }: { content: string }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Más información"
      >
        <span className="text-sm">ℹ️</span>
      </button>
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg w-64 shadow-xl">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2">
            <div className="border-4 border-transparent border-t-slate-800" />
          </div>
        </div>
      )}
    </div>
  );
}

// Determinar el ganador
function getWinner(
  valueA: number,
  valueB: number,
  higherIsBetter: boolean
): "a" | "b" | "tie" {
  if (!isFinite(valueA) || !isFinite(valueB)) return "tie";
  if (Math.abs(valueA - valueB) < 0.0001) return "tie";

  if (higherIsBetter) {
    return valueA > valueB ? "a" : "b";
  } else {
    return valueA < valueB ? "a" : "b";
  }
}

export function MetricsTable({ results, isLoading }: MetricsTableProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Métricas comparativas
        </h3>
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const { resultA, resultB } = results;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Métricas comparativas
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="py-3 px-4 text-left text-sm font-semibold text-slate-600">
                Métrica
              </th>
              <th className="py-3 px-4 text-right text-sm font-semibold text-blue-600">
                {resultA.portfolioName}
              </th>
              <th className="py-3 px-4 text-right text-sm font-semibold text-rose-600">
                {resultB.portfolioName}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {METRICS_CONFIG.map((metric) => {
              const valueA = metric.getValue(resultA);
              const valueB = metric.getValue(resultB);
              const winner = getWinner(valueA, valueB, metric.higherIsBetter);

              return (
                <tr
                  key={metric.key}
                  className="hover:bg-slate-50 transition-colors"
                >
                  {/* Métrica */}
                  <td className="py-3 px-4">
                    <div className="flex items-center">
                      <span className="text-sm text-slate-700">
                        {metric.label}
                      </span>
                      <MetricTooltip content={metric.tooltip} />
                      <span
                        className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                          metric.higherIsBetter
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {metric.higherIsBetter ? "↑ mejor" : "↓ mejor"}
                      </span>
                    </div>
                  </td>

                  {/* Valor Cartera A */}
                  <td
                    className={`py-3 px-4 text-right text-sm ${
                      winner === "a"
                        ? "font-bold text-emerald-600"
                        : "text-slate-700"
                    }`}
                  >
                    {metric.format(valueA)}
                    {winner === "a" && (
                      <span className="ml-1 text-emerald-500">✓</span>
                    )}
                  </td>

                  {/* Valor Cartera B */}
                  <td
                    className={`py-3 px-4 text-right text-sm ${
                      winner === "b"
                        ? "font-bold text-emerald-600"
                        : "text-slate-700"
                    }`}
                  >
                    {metric.format(valueB)}
                    {winner === "b" && (
                      <span className="ml-1 text-emerald-500">✓</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Leyenda */}
      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">
            ↑ mejor
          </span>
          <span>= Mayor valor es mejor</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
            ↓ mejor
          </span>
          <span>= Menor valor es mejor</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-emerald-500 font-bold">✓</span>
          <span>= Valor ganador</span>
        </div>
      </div>
    </div>
  );
}
