"use client";

import type { BacktestResponse, BacktestResult, StressPeriodResult } from "@/lib/types";
import { formatPct } from "@/lib/formatters";
import { Tooltip } from "./Tooltip";

interface StressPeriodsTableProps {
  results: BacktestResponse;
  isLoading: boolean;
}

function formatPeriodLabel(start: string, end: string): string {
  const formatOne = (s: string) => {
    const d = new Date(`${s}-01`);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("es-ES", { month: "short", year: "numeric" }).replace(".", "");
  };
  return `${formatOne(start)} – ${formatOne(end)}`;
}

function classifyReturn(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value > -0.05) return "text-amber-600";
  return "text-red-600";
}

function classifyDrawdown(value: number): string {
  if (value > -0.05) return "text-emerald-600";
  if (value > -0.15) return "text-amber-600";
  return "text-red-600";
}

function PortfolioStressTable({
  result,
  colorClass,
}: {
  result: BacktestResult;
  colorClass: "blue" | "rose";
}) {
  const periods: StressPeriodResult[] = result.stressPeriods ?? [];
  if (periods.length === 0) return null;

  const headerColor = colorClass === "blue" ? "text-blue-600" : "text-rose-600";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className={`text-base font-semibold ${headerColor} font-serif`}>
          Comportamiento en crisis históricas — {result.portfolioName}
        </h4>
        <p className="text-xs text-brand-tertiary mt-0.5">
          Rentabilidad y drawdown durante 6 periodos de estrés. Los marcados como
          &quot;Sin datos&quot; quedan fuera del rango del backtest.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                Crisis
              </th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                Periodo
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                Rentabilidad
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                Max Drawdown
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {periods.map((period) => {
              const hasData = period.totalReturn !== null && period.maxDrawdown !== null;
              return (
                <tr key={period.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-brand-navy">{period.name}</span>
                      <Tooltip content={period.description}>
                        <svg className="w-3.5 h-3.5 text-slate-300 hover:text-brand-coral transition-colors flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                      </Tooltip>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-sm text-slate-600">
                    {formatPeriodLabel(period.start, period.end)}
                  </td>
                  {hasData ? (
                    <>
                      <td className={`py-3 px-3 text-sm text-right font-semibold tabular-nums ${classifyReturn(period.totalReturn!)}`}>
                        {formatPct(period.totalReturn!, 2)}
                      </td>
                      <td className={`py-3 px-3 text-sm text-right font-semibold tabular-nums ${classifyDrawdown(period.maxDrawdown!)}`}>
                        {formatPct(period.maxDrawdown!, 2)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-3 text-sm text-right text-slate-400 italic" colSpan={2}>
                        Sin datos para este periodo
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StressPeriodsTable({ results, isLoading }: StressPeriodsTableProps) {
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

  return (
    <div className="space-y-4">
      {resultA && <PortfolioStressTable result={resultA} colorClass="blue" />}
      {resultB && <PortfolioStressTable result={resultB} colorClass="rose" />}
    </div>
  );
}
