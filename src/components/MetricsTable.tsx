"use client";

import { useState } from "react";
import type { BacktestResponse, BacktestResult, DisplayGranularity } from "@/lib/types";
import { formatEUR, formatPct, formatPctNoSign, formatRatio } from "@/lib/formatters";
import { Tooltip } from "./Tooltip";

interface MetricsTableProps {
  results: BacktestResponse;
  isLoading: boolean;
}

// Mapeo de granularidad a etiquetas
const GRANULARITY_LABELS: Record<DisplayGranularity, { singular: string; plural: string }> = {
  daily: { singular: "día", plural: "días" },
  monthly: { singular: "mes", plural: "meses" },
  quarterly: { singular: "trimestre", plural: "trimestres" },
};

// Tooltips en español para cada métrica
function buildTooltips(granularity: DisplayGranularity) {
  const { singular, plural } = GRANULARITY_LABELS[granularity];
  return {
    finalValue:
      "Valor total de tu cartera al final del periodo, incluyendo todas las aportaciones y rendimientos.",
    totalReturn:
      "Rentabilidad total acumulada desde el inicio hasta el final. Incluye el efecto de todas las aportaciones.",
    cagr:
      "Rentabilidad media anual compuesta. El dato más relevante para comparar inversiones a largo plazo.",
    volatility:
      `Desviación estándar anualizada de los retornos ${plural === "días" ? "diarios" : plural === "meses" ? "mensuales" : "trimestrales"}. Mide cuánto fluctúa el valor de tu cartera durante el periodo seleccionado.`,
    sharpe:
      "Rentabilidad ajustada al riesgo. Mayor de 1 es bueno, mayor de 2 es excelente. Considera la tasa libre de riesgo del 1%.",
    sortino:
      "Similar al Sharpe, pero solo penaliza la volatilidad negativa (caídas). Más relevante si te preocupan las pérdidas.",
    maxDrawdown:
      "La peor caída desde un máximo histórico. Mide cuánto podrías haber perdido si hubieras invertido en el peor momento posible.",
    bestMonth:
      `El mejor ${singular} del periodo. Muestra el potencial alcista de la cartera.`,
    worstMonth:
      `El peor ${singular} del periodo. Muestra el riesgo de pérdida en un mal ${singular}.`,
    positiveMonthsRatio:
      `Porcentaje de ${plural} con rentabilidad positiva. Mayor porcentaje indica más consistencia.`,
    totalFees:
      "Total de comisiones pagadas durante todo el periodo. Incluye el TER de cada fondo y la comisión de gestión de la cartera.",
  };
}

// Definición de métricas con dirección
interface MetricConfig {
  key: string;
  label: string;
  getValue: (result: BacktestResult) => number;
  format: (value: number) => string;
  higherIsBetter: boolean;
  tooltip: string;
  isHero?: boolean; // Métricas destacadas en cards grandes
}

function buildMetricsConfig(granularity: DisplayGranularity): MetricConfig[] {
  const tooltips = buildTooltips(granularity);
  const { singular, plural } = GRANULARITY_LABELS[granularity];
  const pluralCap = plural.charAt(0).toUpperCase() + plural.slice(1);

  return [
  {
    key: "finalValue",
    label: "Valor final",
    getValue: (r) => r.finalValue,
    format: formatEUR,
    higherIsBetter: true,
    tooltip: tooltips.finalValue,
    isHero: true,
  },
  {
    key: "cagr",
    label: "CAGR",
    getValue: (r) => r.metrics.cagr,
    format: (v) => formatPct(v),
    higherIsBetter: true,
    tooltip: tooltips.cagr,
    isHero: true,
  },
  {
    key: "volatility",
    label: "Volatilidad",
    getValue: (r) => r.metrics.volatility,
    format: (v) => formatPctNoSign(v),
    higherIsBetter: false,
    tooltip: tooltips.volatility,
    isHero: true,
  },
  {
    key: "maxDrawdown",
    label: "Max Drawdown",
    getValue: (r) => r.metrics.maxDrawdown,
    format: (v) => formatPct(v, 1),
    higherIsBetter: true,
    tooltip: tooltips.maxDrawdown,
    isHero: true,
  },
  {
    key: "totalReturn",
    label: "Rentabilidad total",
    getValue: (r) => r.metrics.totalReturn,
    format: (v) => formatPct(v),
    higherIsBetter: true,
    tooltip: tooltips.totalReturn,
  },
  {
    key: "sharpe",
    label: "Ratio Sharpe",
    getValue: (r) => r.metrics.sharpe,
    format: formatRatio,
    higherIsBetter: true,
    tooltip: tooltips.sharpe,
  },
  {
    key: "sortino",
    label: "Ratio Sortino",
    getValue: (r) => r.metrics.sortino,
    format: formatRatio,
    higherIsBetter: true,
    tooltip: tooltips.sortino,
  },
  {
    key: "bestMonth",
    label: `Mejor ${singular}`,
    getValue: (r) => r.metrics.bestMonth,
    format: (v) => formatPct(v, 1),
    higherIsBetter: true,
    tooltip: tooltips.bestMonth,
  },
  {
    key: "worstMonth",
    label: `Peor ${singular}`,
    getValue: (r) => r.metrics.worstMonth,
    format: (v) => formatPct(v, 1),
    higherIsBetter: true,
    tooltip: tooltips.worstMonth,
  },
  {
    key: "positiveMonthsRatio",
    label: `% ${pluralCap} positivos`,
    getValue: (r) => r.metrics.positiveMonthsRatio,
    format: (v) => formatPctNoSign(v),
    higherIsBetter: true,
    tooltip: tooltips.positiveMonthsRatio,
  },
  {
    key: "totalFees",
    label: "Comisiones pagadas",
    getValue: (r) => r.fees.totalFees + (r.fees.managementFeePaid || 0),
    format: formatEUR,
    higherIsBetter: false,
    tooltip: tooltips.totalFees,
  },
  ];
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

// ============================================================================
// HERO STAT CARD — números gigantes
// ============================================================================

function HeroStatCard({
  label,
  valueA,
  valueB,
  format,
  higherIsBetter,
  tooltip,
  nameA,
  nameB,
}: {
  label: string;
  valueA?: number;
  valueB?: number;
  format: (v: number) => string;
  higherIsBetter: boolean;
  tooltip: string;
  nameA?: string;
  nameB?: string;
}) {
  const hasTwo = valueA !== undefined && valueB !== undefined;
  const winner = hasTwo ? getWinner(valueA!, valueB!, higherIsBetter) : "tie";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-7 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium text-brand-tertiary uppercase tracking-wide">
          {label}
        </span>
        <Tooltip content={tooltip}>
          <svg className="w-4 h-4 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
          </svg>
        </Tooltip>
      </div>

      {/* Valores */}
      {hasTwo ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight font-serif ${
              winner === "a" ? "text-brand-navy" : "text-slate-400"
            }`} style={{ fontVariantNumeric: "tabular-nums" }}>
              {format(valueA!)}
            </span>
            {winner === "a" && (
              <span className="text-xs font-semibold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">MEJOR</span>
            )}
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight font-serif ${
              winner === "b" ? "text-brand-navy" : "text-slate-400"
            }`} style={{ fontVariantNumeric: "tabular-nums" }}>
              {format(valueB!)}
            </span>
            {winner === "b" && (
              <span className="text-xs font-semibold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">MEJOR</span>
            )}
          </div>
          <div className="flex justify-between pt-2 border-t border-slate-100">
            <span className="text-xs text-blue-600 font-medium">{nameA}</span>
            <span className="text-xs text-rose-600 font-medium">{nameB}</span>
          </div>
        </div>
      ) : (
        <div className="text-4xl sm:text-5xl lg:text-6xl font-bold text-brand-navy tracking-tight font-serif" style={{ fontVariantNumeric: "tabular-nums" }}>
          {format(valueA ?? valueB ?? 0)}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MetricsTable({ results, isLoading }: MetricsTableProps) {
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <div className="h-64 flex items-center justify-center">
          <div className="w-10 h-10 border-3 border-brand-coral/30 border-t-brand-coral rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const { resultA, resultB, correlation } = results;

  if (!resultA && !resultB) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
        <p className="text-brand-tertiary text-lg">No hay datos suficientes para mostrar métricas.</p>
      </div>
    );
  }

  const granularity: DisplayGranularity = results.displayGranularity ?? "monthly";
  const metricsConfig = buildMetricsConfig(granularity);
  const heroMetrics = metricsConfig.filter((m) => m.isHero);
  const tableMetrics = metricsConfig.filter((m) => !m.isHero);
  const isSinglePortfolio = !resultA || !resultB;
  const singleResult = resultA || resultB;

  return (
    <div className="space-y-6">
      {/* === HERO STATS GRID === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {heroMetrics.map((metric) => (
          <HeroStatCard
            key={metric.key}
            label={metric.label}
            valueA={resultA ? metric.getValue(resultA) : undefined}
            valueB={resultB ? metric.getValue(resultB) : undefined}
            format={metric.format}
            higherIsBetter={metric.higherIsBetter}
            tooltip={metric.tooltip}
            nameA={resultA?.portfolioName}
            nameB={resultB?.portfolioName}
          />
        ))}
      </div>

      {/* === CORRELACIÓN BADGE === */}
      {correlation !== undefined && !isSinglePortfolio && (
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-white rounded-full border border-slate-100 shadow-sm">
            <span className="text-sm font-medium text-brand-secondary">Correlación entre carteras</span>
            <span className={`text-2xl sm:text-3xl font-bold font-serif ${
              Math.abs(correlation) > 0.7 ? "text-amber-600" :
              Math.abs(correlation) > 0.3 ? "text-blue-600" :
              "text-emerald-600"
            }`}>
              {(correlation * 100).toFixed(0)}%
            </span>
            <Tooltip content="Correlación de Pearson entre los retornos mensuales de ambas carteras. Cerca de 100% = se mueven igual. Cerca de 0% = independientes.">
              <svg className="w-4 h-4 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
            </Tooltip>
          </div>
        </div>
      )}

      {/* === TABLA DETALLADA === */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowAllMetrics(!showAllMetrics)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
        >
          <h3 className="text-base font-semibold text-brand-navy">
            {showAllMetrics ? "Todas las métricas" : "Ver todas las métricas"}
          </h3>
          <svg className={`w-5 h-5 text-brand-tertiary transition-transform ${showAllMetrics ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAllMetrics && (
          <div className="px-6 pb-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-100">
                    <th className="py-3 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                      Métrica
                    </th>
                    {resultA && (
                      <th className="py-3 px-3 text-right text-xs font-semibold text-blue-600 uppercase tracking-wider">
                        {resultA.portfolioName}
                      </th>
                    )}
                    {resultB && (
                      <th className="py-3 px-3 text-right text-xs font-semibold text-rose-600 uppercase tracking-wider">
                        {resultB.portfolioName}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tableMetrics.map((metric) => {
                    const valA = resultA ? metric.getValue(resultA) : undefined;
                    const valB = resultB ? metric.getValue(resultB) : undefined;
                    const winner =
                      valA !== undefined && valB !== undefined
                        ? getWinner(valA, valB, metric.higherIsBetter)
                        : "tie";

                    return (
                      <tr key={metric.key} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-brand-navy">
                              {metric.label}
                            </span>
                            <Tooltip content={metric.tooltip}>
                              <svg className="w-3.5 h-3.5 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                              </svg>
                            </Tooltip>
                          </div>
                        </td>
                        {valA !== undefined && (
                          <td className={`py-4 px-3 text-right text-base font-semibold ${
                            winner === "a" ? "text-emerald-600" : "text-brand-navy"
                          }`}>
                            {metric.format(valA)}
                            {winner === "a" && <span className="ml-1.5 text-emerald-500">&#10003;</span>}
                          </td>
                        )}
                        {valB !== undefined && (
                          <td className={`py-4 px-3 text-right text-base font-semibold ${
                            winner === "b" ? "text-emerald-600" : "text-brand-navy"
                          }`}>
                            {metric.format(valB)}
                            {winner === "b" && <span className="ml-1.5 text-emerald-500">&#10003;</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
