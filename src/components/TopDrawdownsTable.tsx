"use client";

import type { BacktestResponse, BacktestResult, DrawdownEpisode } from "@/lib/types";
import { formatPct } from "@/lib/formatters";

interface TopDrawdownsTableProps {
  results: BacktestResponse;
  isLoading: boolean;
}

// Convierte YYYY-MM o YYYY-MM-DD a "Mmm YYYY" en español abreviado en inglés (Feb 2020, Mar 2020...)
function formatMonthYear(date: string | undefined | null): string {
  if (!date) return "—";
  const iso = date.length === 7 ? `${date}-01` : date;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("es-ES", { month: "short", year: "numeric" }).replace(".", "");
}

// Convierte número de meses a "X meses" o "X años Y meses"
function formatDurationMonths(months: number | null): string {
  if (months === null) return "—";
  const m = Math.max(0, Math.round(months));
  if (m === 0) return "< 1 mes";
  if (m < 12) return m === 1 ? "1 mes" : `${m} meses`;
  const years = Math.floor(m / 12);
  const remainingMonths = m % 12;
  if (remainingMonths === 0) {
    return years === 1 ? "1 año" : `${years} años`;
  }
  return `${years === 1 ? "1 año" : `${years} años`} ${remainingMonths === 1 ? "1 mes" : `${remainingMonths} meses`}`;
}

function PortfolioDrawdownsTable({
  result,
  colorClass,
}: {
  result: BacktestResult;
  colorClass: "blue" | "rose";
}) {
  const episodes: DrawdownEpisode[] = result.topDrawdowns ?? [];
  if (episodes.length === 0) return null;

  const headerColor = colorClass === "blue" ? "text-blue-600" : "text-rose-600";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className={`text-base font-semibold ${headerColor} font-serif`}>
          Drawdowns — {result.portfolioName}
        </h4>
        <p className="text-xs text-brand-tertiary mt-0.5">
          Top {episodes.length} peores caídas desde un máximo, con tiempo de recuperación
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">#</th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">Inicio</th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">Valle</th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider" title="Tiempo desde el pico hasta el valle">Duración caída</th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">Recuperación</th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider" title="Tiempo desde el valle hasta volver al pico">Tiempo recuperación</th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider" title="Tiempo total bajo el pico (caída + recuperación)">Underwater total</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">Drawdown</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {episodes.map((ep, idx) => {
              const notRecovered = ep.recoveryDate === null;
              return (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-2.5 px-3 text-xs font-semibold text-brand-tertiary">{idx + 1}</td>
                  <td className="py-2.5 px-3 text-sm text-slate-700">{formatMonthYear(ep.peakDate)}</td>
                  <td className="py-2.5 px-3 text-sm text-slate-700">{formatMonthYear(ep.troughDate)}</td>
                  <td className="py-2.5 px-3 text-sm text-slate-600">{formatDurationMonths(ep.lengthMonths)}</td>
                  <td className="py-2.5 px-3 text-sm">
                    {notRecovered ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
                        No recuperado
                      </span>
                    ) : (
                      <span className="text-slate-700">{formatMonthYear(ep.recoveryDate)}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-slate-600">
                    {notRecovered ? "—" : formatDurationMonths(ep.recoveryMonths)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-slate-600">{formatDurationMonths(ep.underwaterMonths)}</td>
                  <td className="py-2.5 px-3 text-sm text-right font-semibold text-red-600 tabular-nums">
                    {formatPct(ep.drawdownPct, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TopDrawdownsTable({ results, isLoading }: TopDrawdownsTableProps) {
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
      {resultA && <PortfolioDrawdownsTable result={resultA} colorClass="blue" />}
      {resultB && <PortfolioDrawdownsTable result={resultB} colorClass="rose" />}
    </div>
  );
}
