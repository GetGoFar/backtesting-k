"use client";

import type { BacktestResponse, RollingStats, RollingStatsBucket } from "@/lib/types";
import { formatPct } from "@/lib/formatters";
import { Tooltip } from "./Tooltip";

interface RollingStatsTableProps {
  results: BacktestResponse;
  isLoading: boolean;
}

function formatMonthYear(date: string | null): string {
  if (!date) return "—";
  const iso = date.length === 7 ? `${date}-01` : date;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("es-ES", { month: "short", year: "numeric" }).replace(".", "");
}

function classifyCagr(value: number): string {
  if (value > 0.05) return "text-emerald-600";
  if (value > 0) return "text-emerald-500";
  if (value > -0.05) return "text-amber-600";
  return "text-red-600";
}

function PortfolioRollingTable({
  name,
  stats,
  colorClass,
}: {
  name: string;
  stats: RollingStats | undefined;
  colorClass: "blue" | "rose" | "purple";
}) {
  if (!stats) return null;

  const buckets: RollingStatsBucket[] = [stats.oneYear, stats.threeYear, stats.fiveYear, stats.tenYear];
  const headerColor =
    colorClass === "blue"
      ? "text-blue-600"
      : colorClass === "rose"
      ? "text-rose-600"
      : "text-purple-600";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className={`text-base font-semibold ${headerColor} font-serif`}>
          Rangos de rentabilidad rolling — {name}
        </h4>
        <p className="text-xs text-brand-tertiary mt-0.5">
          Estadísticos sobre todas las ventanas posibles del periodo backtested:
          mejor, peor, media y mediana, y % de ventanas con rentabilidad positiva.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                Ventana
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                <Tooltip content="Número de ventanas rolling calculadas. Si el backtest dura 10 años, hay ~108 ventanas de 1 año (una empezando cada mes).">
                  <span className="cursor-help underline decoration-dotted">N° ventanas</span>
                </Tooltip>
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                <Tooltip content="Mejor CAGR de todas las ventanas rolling de esta duración. Te dice cuál sería el escenario más favorable invirtiendo durante este número de años.">
                  <span className="cursor-help underline decoration-dotted">Mejor CAGR</span>
                </Tooltip>
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                <Tooltip content="Peor CAGR de todas las ventanas rolling de esta duración. Te dice cuál sería el escenario más desfavorable invirtiendo durante este número de años.">
                  <span className="cursor-help underline decoration-dotted">Peor CAGR</span>
                </Tooltip>
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                <Tooltip content="CAGR medio (aritmético) de todas las ventanas. Convergerá hacia el CAGR del periodo completo a medida que la ventana se acerca a la longitud del backtest.">
                  <span className="cursor-help underline decoration-dotted">Media</span>
                </Tooltip>
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                <Tooltip content="CAGR mediano. Más robusto que la media porque no se distorsiona con ventanas extremas. Si la mediana &lt; media → distribución asimétrica positiva (más ventanas malas pero alguna muy buena tira de la media).">
                  <span className="cursor-help underline decoration-dotted">Mediana</span>
                </Tooltip>
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                <Tooltip content="Porcentaje de ventanas rolling con rentabilidad >= 0%. A medida que la ventana crece, este % debería tender al 100% si la cartera tiene CAGR positivo (un horizonte largo elimina la probabilidad de perder dinero).">
                  <span className="cursor-help underline decoration-dotted">% positivas</span>
                </Tooltip>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {buckets.map((bucket) => {
              if (bucket.count === 0) {
                return (
                  <tr key={bucket.label} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-3 text-sm font-medium text-brand-navy">{bucket.label}</td>
                    <td className="py-2.5 px-3 text-sm text-right text-slate-400 italic" colSpan={6}>
                      Backtest demasiado corto para esta ventana
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={bucket.label} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-2.5 px-3 text-sm font-medium text-brand-navy">{bucket.label}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-slate-600 tabular-nums">{bucket.count}</td>
                  <td className={`py-2.5 px-3 text-sm text-right font-semibold tabular-nums ${classifyCagr(bucket.bestCagr)}`}>
                    {formatPct(bucket.bestCagr, 2)}
                    <div className="text-xs text-brand-tertiary font-normal italic">
                      acabó en {formatMonthYear(bucket.bestEndDate)}
                    </div>
                  </td>
                  <td className={`py-2.5 px-3 text-sm text-right font-semibold tabular-nums ${classifyCagr(bucket.worstCagr)}`}>
                    {formatPct(bucket.worstCagr, 2)}
                    <div className="text-xs text-brand-tertiary font-normal italic">
                      acabó en {formatMonthYear(bucket.worstEndDate)}
                    </div>
                  </td>
                  <td className={`py-2.5 px-3 text-sm text-right font-semibold tabular-nums ${classifyCagr(bucket.avgCagr)}`}>
                    {formatPct(bucket.avgCagr, 2)}
                  </td>
                  <td className={`py-2.5 px-3 text-sm text-right font-semibold tabular-nums ${classifyCagr(bucket.medianCagr)}`}>
                    {formatPct(bucket.medianCagr, 2)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right font-semibold text-brand-navy tabular-nums">
                    {(bucket.positiveRatio * 100).toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100">
        <p className="text-xs text-brand-tertiary leading-relaxed">
          <span className="font-semibold text-brand-secondary">Cómo leerlo:</span>{" "}
          si una ventana de 5 años tiene &quot;% positivas = 100%&quot; significa que
          cualquier inversor que mantuviera la cartera 5 años consecutivos en este
          periodo habría obtenido ganancias. Cuanto mayor sea la ventana, más
          relevante es esta métrica para horizontes largos.
        </p>
      </div>
    </div>
  );
}

export function RollingStatsTable({ results, isLoading }: RollingStatsTableProps) {
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

  // El benchmark es global: A y B comparten el mismo. Lo tomamos del que exista.
  const bm = resultA?.benchmark ?? resultB?.benchmark;

  return (
    <div className="space-y-4">
      {resultA && (
        <PortfolioRollingTable
          name={resultA.portfolioName}
          stats={resultA.rollingStats}
          colorClass="blue"
        />
      )}
      {resultB && (
        <PortfolioRollingTable
          name={resultB.portfolioName}
          stats={resultB.rollingStats}
          colorClass="rose"
        />
      )}
      {bm?.benchmarkRollingStats && (
        <PortfolioRollingTable
          name={bm.benchmarkName ?? "Benchmark"}
          stats={bm.benchmarkRollingStats}
          colorClass="purple"
        />
      )}
    </div>
  );
}
