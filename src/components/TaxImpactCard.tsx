"use client";

// =============================================================================
// TaxImpactCard — "Cómo afectan los impuestos a tu rentabilidad real"
// =============================================================================
//
// Muestra las TRES rentabilidades que necesita entender un inversor:
//
//   1️⃣ BRUTA       — rentabilidad antes de cualquier impuesto (ficción contable)
//   2️⃣ NETA CAMINO — descontando impuestos pagados en rebalanceos (ETFs)
//   3️⃣ NETA LIQUIDANDO — descontando también la plusvalía latente pendiente
//
// La #3 es la verdadera, la que de verdad se lleva el inversor al bolsillo.
//
// =============================================================================

import type { BacktestResponse, BacktestResult } from "@/lib/types";
import { formatEUR, formatPct } from "@/lib/formatters";
import { computeTaxOnGain, taxModeLabel, type TaxMode } from "@/lib/tax-utils";

interface TaxImpactCardProps {
  results: BacktestResponse;
  isLoading: boolean;
}

interface Breakdown {
  // Rentabilidad #1 — sobre el papel (sin descontar ningún impuesto pagado)
  brutoFinalValue: number;
  brutoReturn: number;
  // Rentabilidad #2 — neta del camino (lo que ves hoy en tu cuenta)
  netoCaminoFinalValue: number; // = result.finalValue
  netoCaminoReturn: number;
  // Rentabilidad #3 — neta al liquidar (lo que te llevas al bolsillo)
  netoLiquidandoFinalValue: number;
  netoLiquidandoReturn: number;
  // Componentes
  initialAmount: number;
  totalTaxesPaid: number;
  pendingTaxes: number;
  unrealizedGain: number;
  // Modo fiscal aplicado (puede ser el propio o un hipotético)
  effectiveMode: TaxMode;
  effectiveRate: number;
  isHypotheticalPending: boolean;
}

/** Construye el breakdown de las 3 rentabilidades para una cartera.
 *  Usa el TOTAL APORTADO (inicial + aportaciones mensuales) como base, NO solo
 *  la inversión inicial. Así el % refleja la ganancia/pérdida REAL sobre el
 *  dinero que el inversor ha metido en la cartera.
 *  Sin aportaciones mensuales: totalContributions = initialAmount → equivalente. */
function buildBreakdown(
  result: BacktestResult,
  initialAmount: number,
  effectiveMode: TaxMode,
  effectiveRate: number
): Breakdown {
  const totalTaxesPaid = result.fees.totalTaxesPaid ?? 0;
  const unrealizedGain = result.fees.unrealizedGain ?? 0;
  const ownMode = (result.fees.taxMode ?? "none") as TaxMode;
  const isHypothetical = ownMode === "none" && effectiveMode !== "none";

  // Pendientes: si la cartera no tributa por sí misma pero hay modo efectivo,
  // calcular el hipotético para que la comparación sea justa.
  const pendingTaxes = isHypothetical
    ? computeTaxOnGain(unrealizedGain, effectiveMode, effectiveRate)
    : (result.fees.pendingTaxes ?? 0);

  // Valor "bruto" — finalValue tal como está + impuestos ya pagados durante
  // el camino. Esto representa la rentabilidad "de folleto" antes de ningún
  // impacto fiscal real.
  const brutoFinalValue = result.finalValue + totalTaxesPaid;

  // Valor "neto del camino" — finalValue tal como está (ya descontó los
  // impuestos pagados en rebalanceos).
  const netoCaminoFinalValue = result.finalValue;

  // Valor "neto al liquidar" — descontamos también los pendientes.
  const netoLiquidandoFinalValue = result.finalValue - pendingTaxes;

  // Denominador = TOTAL APORTADO (inicial + aportaciones mensuales acumuladas).
  // Es la cifra correcta: el inversor quiere saber "de los X € que metí, qué
  // % es ganancia/pérdida real". Sin aportaciones mensuales coincide con
  // initialAmount.
  const denom = result.totalContributions > 0 ? result.totalContributions
    : (initialAmount > 0 ? initialAmount : 1);
  return {
    brutoFinalValue,
    brutoReturn: (brutoFinalValue - denom) / denom,
    netoCaminoFinalValue,
    netoCaminoReturn: (netoCaminoFinalValue - denom) / denom,
    netoLiquidandoFinalValue,
    netoLiquidandoReturn: (netoLiquidandoFinalValue - denom) / denom,
    initialAmount: denom,
    totalTaxesPaid,
    pendingTaxes,
    unrealizedGain,
    effectiveMode,
    effectiveRate,
    isHypotheticalPending: isHypothetical,
  };
}

/** Genera un insight automático comparando dos breakdowns. */
function generateInsight(
  a: Breakdown,
  b: Breakdown,
  nameA: string,
  nameB: string
): string {
  const brutoDiffPP = (a.brutoReturn - b.brutoReturn) * 100; // en pp
  const netoDiffPP = (a.netoLiquidandoReturn - b.netoLiquidandoReturn) * 100;
  const absBrutoDiff = Math.abs(brutoDiffPP);
  const absNetoDiff = Math.abs(netoDiffPP);

  const brutoWinner = brutoDiffPP > 0 ? nameA : nameB;
  const netoWinner = netoDiffPP > 0 ? nameA : nameB;

  // Caso 1: cambio de ganador entre bruto y neto liquidando
  if (brutoWinner !== netoWinner && absBrutoDiff > 0.1 && absNetoDiff > 0.1) {
    return `Sobre el papel ${brutoWinner} parece ganar por ${absBrutoDiff.toFixed(1)}%, pero al liquidar la realidad se invierte: ${netoWinner} gana por ${absNetoDiff.toFixed(1)}%. Los impuestos cambian el resultado.`;
  }

  // Caso 2: la ventaja crece al liquidar
  if (absNetoDiff > absBrutoDiff + 0.3) {
    return `Sobre el papel ${brutoWinner} bate a la otra cartera por ${absBrutoDiff.toFixed(1)}%. Al liquidar, la ventaja crece a ${absNetoDiff.toFixed(1)}% por el coste fiscal acumulado.`;
  }

  // Caso 3: la ventaja se reduce al liquidar
  if (absBrutoDiff > absNetoDiff + 0.3) {
    return `${brutoWinner} aparenta una ventaja de ${absBrutoDiff.toFixed(1)}% en bruto, pero los impuestos la reducen a ${absNetoDiff.toFixed(1)}% al liquidar.`;
  }

  // Caso 4: prácticamente igual
  if (absNetoDiff < 0.3) {
    return `Las dos carteras quedan prácticamente empatadas al liquidar (${absNetoDiff.toFixed(1)}% de diferencia). El factor fiscal compensa las diferencias brutas.`;
  }

  // Caso por defecto
  return `${netoWinner} gana por ${absNetoDiff.toFixed(1)}% al liquidar.`;
}

/** Barra apilada visual mostrando dónde está cada euro. */
function StackedBar({
  breakdown,
  name,
  colorBase,
}: {
  breakdown: Breakdown;
  name: string;
  colorBase: "blue" | "rose" | "purple";
}) {
  const total = breakdown.brutoFinalValue;
  if (total <= 0) return null;
  const wPocket = (breakdown.netoLiquidandoFinalValue / total) * 100;
  const wPaid = (breakdown.totalTaxesPaid / total) * 100;
  const wPending = (breakdown.pendingTaxes / total) * 100;
  // accent: barra principal del color de la cartera
  const accent =
    colorBase === "blue"
      ? "bg-blue-600"
      : colorBase === "rose"
      ? "bg-rose-600"
      : "bg-purple-600";
  const labelColor =
    colorBase === "blue"
      ? "text-blue-700"
      : colorBase === "rose"
      ? "text-rose-700"
      : "text-purple-700";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-semibold ${labelColor}`}>{name}</span>
        <span className="text-brand-tertiary tabular-nums">
          Total bruto: <strong className="text-brand-navy">{formatEUR(total)}</strong>
        </span>
      </div>
      <div className="flex h-7 w-full rounded-md overflow-hidden border border-slate-200 bg-slate-100">
        {wPocket > 0 && (
          <div
            className={`${accent} flex items-center justify-center text-[10px] font-bold text-white px-1`}
            style={{ width: `${wPocket}%` }}
            title={`Al bolsillo: ${formatEUR(breakdown.netoLiquidandoFinalValue)}`}
          >
            {wPocket > 12 ? formatEUR(breakdown.netoLiquidandoFinalValue) : ""}
          </div>
        )}
        {wPaid > 0 && (
          <div
            className="bg-amber-400 flex items-center justify-center text-[10px] font-bold text-amber-900 px-1"
            style={{ width: `${wPaid}%` }}
            title={`Pagados: ${formatEUR(breakdown.totalTaxesPaid)}`}
          >
            {wPaid > 8 ? formatEUR(breakdown.totalTaxesPaid) : ""}
          </div>
        )}
        {wPending > 0 && (
          <div
            className="bg-purple-300 flex items-center justify-center text-[10px] font-bold text-purple-900 px-1"
            style={{ width: `${wPending}%` }}
            title={`Pendientes: ${formatEUR(breakdown.pendingTaxes)}`}
          >
            {wPending > 8 ? formatEUR(breakdown.pendingTaxes) : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export function TaxImpactCard({ results, isLoading }: TaxImpactCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-100 shadow-sm p-8 bg-white">
        <div className="h-32 flex items-center justify-center">
          <div className="w-10 h-10 border-3 border-brand-coral/30 border-t-brand-coral rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const { resultA, resultB, config } = results;
  if (!resultA && !resultB) return null;
  const initialAmount = config.initialAmount;

  // Determinar modo fiscal "efectivo" para cada cartera (hereda del otro si
  // no tiene uno propio, igual que en FeeImpactCard).
  const modeA = (resultA?.fees.taxMode ?? "none") as TaxMode;
  const modeB = (resultB?.fees.taxMode ?? "none") as TaxMode;
  const rateA = resultA?.fees.taxRate ?? 0;
  const rateB = resultB?.fees.taxRate ?? 0;
  const effModeA: TaxMode = modeA !== "none" ? modeA : modeB;
  const effRateA = modeA !== "none" ? rateA : rateB;
  const effModeB: TaxMode = modeB !== "none" ? modeB : modeA;
  const effRateB = modeB !== "none" ? rateB : rateA;

  const breakdownA = resultA ? buildBreakdown(resultA, initialAmount, effModeA, effRateA) : null;
  const breakdownB = resultB ? buildBreakdown(resultB, initialAmount, effModeB, effRateB) : null;

  // Benchmark: hereda el modo de la cartera A (la principal). Tributa al
  // liquidar bajo el mismo régimen para que la comparación sea justa.
  const benchmark = resultA?.benchmark ?? resultB?.benchmark;
  const benchmarkResult: BacktestResult | null =
    benchmark && benchmark.benchmarkMetrics && benchmark.benchmarkFees && benchmark.benchmarkFinalValue !== undefined
      ? ({
          portfolioName: benchmark.benchmarkName,
          portfolioType: "index",
          timeSeries: benchmark.benchmarkTimeSeries,
          metrics: benchmark.benchmarkMetrics,
          annualReturns: [],
          drawdowns: [],
          topDrawdowns: [],
          stressPeriods: [],
          rebalanceLog: [],
          rollingReturns: { oneYear: [], threeYear: [], fiveYear: [] },
          rollingStats: {} as never,
          returnsHistogram: { periodLabel: "mes", bins: [], mean: 0, stdDev: 0, totalCount: 0 },
          allocation: { byCategory: [], byAssetClass: [], byManagement: [] },
          fees: benchmark.benchmarkFees,
          totalContributions: benchmark.benchmarkTotalContributions ?? 0,
          finalValue: benchmark.benchmarkFinalValue,
        } as unknown as BacktestResult)
      : null;
  // Modo del benchmark = modo de la cartera A (la principal), o B si solo hay B
  const effModeBench: TaxMode = effModeA !== "none" ? effModeA : effModeB;
  const effRateBench = effModeA !== "none" ? effRateA : effRateB;
  const breakdownBench = benchmarkResult
    ? buildBreakdown(benchmarkResult, initialAmount, effModeBench, effRateBench)
    : null;

  // Forzar isHypothetical=true en el benchmark porque su modo fiscal nunca
  // estuvo activo (no se calcularon impuestos durante el camino). Lo único
  // que mostramos es el pendiente hipotético al liquidar.
  if (breakdownBench && effModeBench !== "none") {
    breakdownBench.isHypotheticalPending = true;
  }

  const showBench = !!breakdownBench;
  const isSingle = !resultA || !resultB;

  // Insight automático — solo en modo comparación
  let insight: string | null = null;
  if (!isSingle && breakdownA && breakdownB) {
    insight = generateInsight(breakdownA, breakdownB, resultA!.portfolioName, resultB!.portfolioName);
  }

  // Detectar si alguna cartera tiene impuestos involucrados (de lo contrario
  // esta sección no aporta nada).
  const hasAnyTaxRelevance =
    (breakdownA && (breakdownA.totalTaxesPaid > 0 || breakdownA.pendingTaxes > 0)) ||
    (breakdownB && (breakdownB.totalTaxesPaid > 0 || breakdownB.pendingTaxes > 0));
  if (!hasAnyTaxRelevance) {
    // Sin fiscalidad en ninguna cartera ni hipotética: no mostrar la sección.
    return null;
  }

  const hypoModeStr = taxModeLabel(effModeA !== "none" ? effModeA : effModeB,
    effModeA !== "none" ? effRateA : effRateB);

  return (
    <div className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden bg-white">
      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-xl">
            🧾
          </div>
          <div>
            <h3 className="text-xl font-semibold text-brand-navy font-serif">
              Cómo afectan los impuestos
            </h3>
            <p className="text-sm text-brand-tertiary">
              Las 3 rentabilidades que importan: papel vs. cuenta vs. bolsillo
            </p>
          </div>
        </div>

        {/* Insight automático */}
        {insight && (
          <div className="rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                💡
              </div>
              <p className="text-sm text-purple-900 leading-relaxed">{insight}</p>
            </div>
          </div>
        )}

        {/* Tabla de las 3 rentabilidades */}
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-brand-tertiary">
                <th className="text-left py-2 pr-3 font-semibold w-1/3">Escenario</th>
                {breakdownA && (
                  <th className="text-right py-2 px-3 font-semibold text-blue-700">
                    {resultA!.portfolioName}
                  </th>
                )}
                {breakdownB && (
                  <th className="text-right py-2 px-3 font-semibold text-rose-700">
                    {resultB!.portfolioName}
                  </th>
                )}
                {showBench && (
                  <th className="text-right py-2 pl-3 font-semibold text-purple-700">
                    {benchmarkResult!.portfolioName}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {/* 1️⃣ BRUTA */}
              <tr className="border-t border-slate-100">
                <td className="py-3 pr-3">
                  <div className="font-semibold text-brand-secondary">1️⃣ Bruta (en el papel)</div>
                  <div className="text-[11px] text-brand-tertiary italic">
                    Antes de cualquier impuesto, como en el folleto del producto
                  </div>
                </td>
                {breakdownA && (
                  <td className="py-3 px-3 text-right tabular-nums">
                    <div className="font-semibold text-brand-navy">{formatEUR(breakdownA.brutoFinalValue)}</div>
                    <div className="text-[11px] text-brand-tertiary">{formatPct(breakdownA.brutoReturn)}</div>
                  </td>
                )}
                {breakdownB && (
                  <td className="py-3 px-3 text-right tabular-nums">
                    <div className="font-semibold text-brand-navy">{formatEUR(breakdownB.brutoFinalValue)}</div>
                    <div className="text-[11px] text-brand-tertiary">{formatPct(breakdownB.brutoReturn)}</div>
                  </td>
                )}
                {showBench && breakdownBench && (
                  <td className="py-3 pl-3 text-right tabular-nums">
                    <div className="font-semibold text-brand-navy">{formatEUR(breakdownBench.brutoFinalValue)}</div>
                    <div className="text-[11px] text-brand-tertiary">{formatPct(breakdownBench.brutoReturn)}</div>
                  </td>
                )}
              </tr>

              {/* 2️⃣ NETA DEL CAMINO */}
              <tr className="border-t border-slate-100">
                <td className="py-3 pr-3">
                  <div className="font-semibold text-brand-secondary">2️⃣ Neta del camino</div>
                  <div className="text-[11px] text-brand-tertiary italic">
                    Patrimonio que veo hoy en mi cuenta (con impuestos pagados ya descontados)
                  </div>
                </td>
                {breakdownA && (
                  <td className="py-3 px-3 text-right tabular-nums">
                    <div className="font-semibold text-brand-navy">{formatEUR(breakdownA.netoCaminoFinalValue)}</div>
                    <div className="text-[11px] text-amber-700">
                      {breakdownA.totalTaxesPaid > 0
                        ? `−${formatEUR(breakdownA.totalTaxesPaid)} pagados`
                        : "Sin impuestos pagados"}
                    </div>
                  </td>
                )}
                {breakdownB && (
                  <td className="py-3 px-3 text-right tabular-nums">
                    <div className="font-semibold text-brand-navy">{formatEUR(breakdownB.netoCaminoFinalValue)}</div>
                    <div className="text-[11px] text-amber-700">
                      {breakdownB.totalTaxesPaid > 0
                        ? `−${formatEUR(breakdownB.totalTaxesPaid)} pagados`
                        : "Sin impuestos pagados"}
                    </div>
                  </td>
                )}
                {showBench && breakdownBench && (
                  <td className="py-3 pl-3 text-right tabular-nums">
                    <div className="font-semibold text-brand-navy">{formatEUR(breakdownBench.netoCaminoFinalValue)}</div>
                    <div className="text-[11px] text-amber-700">
                      {breakdownBench.totalTaxesPaid > 0
                        ? `−${formatEUR(breakdownBench.totalTaxesPaid)} pagados`
                        : "Sin impuestos pagados"}
                    </div>
                  </td>
                )}
              </tr>

              {/* 3️⃣ NETA LIQUIDANDO — fila destacada */}
              <tr className="border-t-2 border-purple-200 bg-purple-50/40">
                <td className="py-4 pr-3">
                  <div className="font-bold text-purple-800">3️⃣ Neta al liquidar hoy</div>
                  <div className="text-[11px] text-purple-700/80 italic">
                    Lo que de verdad te llevas al bolsillo si vendieras todo ahora
                  </div>
                </td>
                {breakdownA && (
                  <td className="py-4 px-3 text-right tabular-nums">
                    <div className="text-lg font-bold text-purple-800">{formatEUR(breakdownA.netoLiquidandoFinalValue)}</div>
                    <div className="text-[11px] text-purple-700/80">
                      {breakdownA.pendingTaxes > 0
                        ? `−${formatEUR(breakdownA.pendingTaxes)} pendientes${breakdownA.isHypotheticalPending ? "*" : ""}`
                        : "Sin pendientes"}
                    </div>
                  </td>
                )}
                {breakdownB && (
                  <td className="py-4 px-3 text-right tabular-nums">
                    <div className="text-lg font-bold text-purple-800">{formatEUR(breakdownB.netoLiquidandoFinalValue)}</div>
                    <div className="text-[11px] text-purple-700/80">
                      {breakdownB.pendingTaxes > 0
                        ? `−${formatEUR(breakdownB.pendingTaxes)} pendientes${breakdownB.isHypotheticalPending ? "*" : ""}`
                        : "Sin pendientes"}
                    </div>
                  </td>
                )}
                {showBench && breakdownBench && (
                  <td className="py-4 pl-3 text-right tabular-nums">
                    <div className="text-lg font-bold text-purple-800">{formatEUR(breakdownBench.netoLiquidandoFinalValue)}</div>
                    <div className="text-[11px] text-purple-700/80">
                      {breakdownBench.pendingTaxes > 0
                        ? `−${formatEUR(breakdownBench.pendingTaxes)} pendientes*`
                        : "Sin pendientes"}
                    </div>
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Barras apiladas: ¿Dónde está el dinero? */}
        <div className="mt-8 p-5 bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-brand-navy uppercase tracking-wider">
              ¿Dónde está cada euro?
            </h4>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-600" /> Al bolsillo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-400" /> Impuestos pagados
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-purple-300" /> Impuestos pendientes
              </span>
            </div>
          </div>
          <div className="space-y-4">
            {breakdownA && (
              <StackedBar
                breakdown={breakdownA}
                name={resultA!.portfolioName}
                colorBase="blue"
              />
            )}
            {breakdownB && (
              <StackedBar
                breakdown={breakdownB}
                name={resultB!.portfolioName}
                colorBase="rose"
              />
            )}
            {showBench && breakdownBench && (
              <StackedBar
                breakdown={breakdownBench}
                name={benchmarkResult!.portfolioName}
                colorBase="purple"
              />
            )}
          </div>
        </div>

        {/* Nota explicativa */}
        <div className="mt-5 text-xs text-brand-tertiary leading-relaxed space-y-1.5">
          {(breakdownA?.isHypotheticalPending || breakdownB?.isHypotheticalPending || breakdownBench?.isHypotheticalPending) && (
            <p>
              <span className="text-purple-600 font-bold">*</span>{" "}
              <strong>Pendientes hipotéticos:</strong> la cartera o el benchmark sin fiscalidad
              propia (fondos con traspaso o índice teórico) tributaría al liquidar bajo el régimen
              de la cartera con la que se compara ({hypoModeStr}). Es la única forma de comparar peras con peras.
            </p>
          )}
          <p>
            La rentabilidad bruta es la que aparece en los folletos. La <strong className="text-purple-800">neta al liquidar (3️⃣)</strong> es
            la que de verdad va a tu bolsillo: descuenta TER, gestión, impuestos pagados durante
            los rebalanceos y los pendientes sobre la plusvalía latente.
          </p>
        </div>
      </div>
    </div>
  );
}
