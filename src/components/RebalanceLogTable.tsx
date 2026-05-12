"use client";

import { useState } from "react";
import type { BacktestResponse, BacktestResult, RebalanceEvent } from "@/lib/types";
import { formatEUR, formatPct } from "@/lib/formatters";

interface RebalanceLogTableProps {
  results: BacktestResponse;
  isLoading: boolean;
}

function formatMonthYear(date: string): string {
  const iso = date.length === 7 ? `${date}-01` : date;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
}

function PortfolioRebalanceLog({
  result,
  colorClass,
}: {
  result: BacktestResult;
  colorClass: "blue" | "rose";
}) {
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const events: RebalanceEvent[] = result.rebalanceLog ?? [];
  if (events.length === 0) return null;

  const headerColor = colorClass === "blue" ? "text-blue-600" : "text-rose-600";

  const toggle = (idx: number) => {
    setExpandedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Totales acumulados
  const totalGain = events.reduce((s, e) => s + e.totalGain, 0);
  const totalTax = events.reduce((s, e) => s + e.taxPaid, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className={`text-base font-semibold ${headerColor} font-serif`}>
          Historial de rebalanceos — {result.portfolioName}
        </h4>
        <p className="text-xs text-brand-tertiary mt-0.5">
          {events.length} rebalanceos realizados durante el backtest. Total plusvalía/minusvalía
          realizada acumulada: <strong className={totalGain >= 0 ? "text-emerald-600" : "text-red-600"}>{formatEUR(totalGain)}</strong>
          {totalTax > 0 && (
            <> · Impuestos pagados: <strong className="text-amber-700">{formatEUR(totalTax)}</strong></>
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider w-8"></th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">#</th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">Fecha</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">Valor antes</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">Operaciones</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">Plusvalía / Minusvalía</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">Impuesto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {events.map((event, idx) => {
              const isExpanded = expandedIdx.has(idx);
              const sellsCount = event.trades.filter((t) => t.action === "sell").length;
              const buysCount = event.trades.filter((t) => t.action === "buy").length;
              return (
                <>
                  <tr
                    key={idx}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                    onClick={() => toggle(idx)}
                  >
                    <td className="py-3 px-3">
                      <svg
                        className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </td>
                    <td className="py-3 px-3 text-xs font-semibold text-brand-tertiary">{idx + 1}</td>
                    <td className="py-3 px-3 text-sm text-slate-700 whitespace-nowrap">
                      {formatMonthYear(event.date)}
                    </td>
                    <td className="py-3 px-3 text-sm text-right text-slate-700 tabular-nums">
                      {formatEUR(event.portfolioValueBefore)}
                    </td>
                    <td className="py-3 px-3 text-sm text-right text-slate-600 whitespace-nowrap">
                      <span className="text-red-500">{sellsCount} venta{sellsCount !== 1 ? "s" : ""}</span>
                      {" · "}
                      <span className="text-emerald-600">{buysCount} compra{buysCount !== 1 ? "s" : ""}</span>
                    </td>
                    <td className={`py-3 px-3 text-sm text-right font-semibold tabular-nums ${
                      event.totalGain > 0 ? "text-emerald-600" : event.totalGain < 0 ? "text-red-600" : "text-slate-500"
                    }`}>
                      {event.totalGain !== 0 ? formatEUR(event.totalGain) : "—"}
                    </td>
                    <td className="py-3 px-3 text-sm text-right font-semibold text-amber-700 tabular-nums">
                      {event.taxPaid > 0 ? formatEUR(event.taxPaid) : "—"}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${idx}-detail`} className="bg-slate-50/30">
                      <td colSpan={7} className="py-3 px-3">
                        <div className="ml-8 pl-2 border-l-2 border-slate-200">
                          <div className="text-xs text-brand-tertiary mb-2">
                            Detalle del rebalanceo del {formatMonthYear(event.date)}
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[10px] text-brand-tertiary uppercase tracking-wider">
                                <th className="text-left py-1 px-2">Operación</th>
                                <th className="text-left py-1 px-2">Fondo</th>
                                <th className="text-right py-1 px-2">Importe</th>
                                <th className="text-right py-1 px-2">Coste base vendido</th>
                                <th className="text-right py-1 px-2">Plusvalía/Minusvalía</th>
                                <th className="text-right py-1 px-2">% gain</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* Primero ventas */}
                              {event.trades
                                .filter((t) => t.action === "sell")
                                .map((t, ti) => (
                                  <tr key={`sell-${ti}`} className="border-t border-slate-100">
                                    <td className="py-1.5 px-2">
                                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">
                                        VENTA
                                      </span>
                                    </td>
                                    <td className="py-1.5 px-2 text-slate-700">{t.fundName}</td>
                                    <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">
                                      {formatEUR(t.amount)}
                                    </td>
                                    <td className="py-1.5 px-2 text-right text-slate-500 tabular-nums">
                                      {t.costBasisPortion !== undefined ? formatEUR(t.costBasisPortion) : "—"}
                                    </td>
                                    <td className={`py-1.5 px-2 text-right font-semibold tabular-nums ${
                                      (t.gain ?? 0) > 0 ? "text-emerald-600" : (t.gain ?? 0) < 0 ? "text-red-600" : "text-slate-500"
                                    }`}>
                                      {t.gain !== undefined ? formatEUR(t.gain) : "—"}
                                    </td>
                                    <td className={`py-1.5 px-2 text-right tabular-nums ${
                                      (t.gain ?? 0) > 0 ? "text-emerald-600" : (t.gain ?? 0) < 0 ? "text-red-600" : "text-slate-500"
                                    }`}>
                                      {t.gain !== undefined && t.costBasisPortion && t.costBasisPortion > 0
                                        ? formatPct(t.gain / t.costBasisPortion, 1)
                                        : "—"}
                                    </td>
                                  </tr>
                                ))}
                              {/* Luego compras */}
                              {event.trades
                                .filter((t) => t.action === "buy")
                                .map((t, ti) => (
                                  <tr key={`buy-${ti}`} className="border-t border-slate-100">
                                    <td className="py-1.5 px-2">
                                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100">
                                        COMPRA
                                      </span>
                                    </td>
                                    <td className="py-1.5 px-2 text-slate-700">{t.fundName}</td>
                                    <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">
                                      {formatEUR(t.amount)}
                                    </td>
                                    <td className="py-1.5 px-2 text-right text-slate-400">—</td>
                                    <td className="py-1.5 px-2 text-right text-slate-400">—</td>
                                    <td className="py-1.5 px-2 text-right text-slate-400">—</td>
                                  </tr>
                                ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-slate-200 bg-slate-50/50 font-semibold">
                                <td colSpan={4} className="py-1.5 px-2 text-right text-slate-600">
                                  Totales:
                                </td>
                                <td className={`py-1.5 px-2 text-right tabular-nums ${
                                  event.totalGain > 0 ? "text-emerald-700" : event.totalGain < 0 ? "text-red-700" : "text-slate-700"
                                }`}>
                                  {formatEUR(event.totalGain)}
                                </td>
                                <td className="py-1.5 px-2 text-right text-amber-700 tabular-nums">
                                  Imp: {formatEUR(event.taxPaid)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100">
        <p className="text-xs text-brand-tertiary leading-relaxed">
          <span className="font-semibold text-brand-secondary">Cómo leerlo:</span>{" "}
          haz click en cualquier fila para ver el detalle de qué fondos se vendieron y compraron.
          Las plusvalías y coste base se calculan por fondo (método FIFO/promedio): el coste base
          de cada fondo se reduce proporcionalmente a la cantidad vendida.
        </p>
      </div>
    </div>
  );
}

export function RebalanceLogTable({ results, isLoading }: RebalanceLogTableProps) {
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
  const hasLogA = (resultA?.rebalanceLog?.length ?? 0) > 0;
  const hasLogB = (resultB?.rebalanceLog?.length ?? 0) > 0;
  if (!hasLogA && !hasLogB) return null;

  return (
    <div className="space-y-4">
      {hasLogA && <PortfolioRebalanceLog result={resultA!} colorClass="blue" />}
      {hasLogB && <PortfolioRebalanceLog result={resultB!} colorClass="rose" />}
    </div>
  );
}
