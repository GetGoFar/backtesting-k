"use client";

import type { BacktestResponse, BacktestResult } from "@/lib/types";
import { formatEUR } from "@/lib/formatters";
import { computeTaxOnGain, taxModeLabel, type TaxMode } from "@/lib/tax-utils";
import { Tooltip } from "./Tooltip";

// Texto reutilizado para explicar por qué dos carteras con el MISMO % de TER
// pueden pagar comisiones totales muy distintas en EUR.
const TER_TOOLTIP =
  "El TER se cobra cada mes sobre el patrimonio actual de la cartera, no sobre la inversión inicial. Fórmula: comisión_mensual = (TER ÷ 12) × valor_cartera_ese_mes. Por eso, dos carteras con el mismo % de TER pueden pagar comisiones totales muy distintas: la que más crece tiene mayor patrimonio promedio y, sobre ese patrimonio mayor, el mismo % se traduce en más euros. No es un error de cálculo: es el efecto compuesto del coste sobre un capital creciente.";

const COSTS_TOOLTIP =
  "Comisión total acumulada (TER + comisión de gestión si aplica) durante todo el período del backtest. Se calcula mes a mes sobre el patrimonio real de la cartera. Cuanto mayor es el patrimonio promedio, mayor es la comisión en euros aunque el % sea el mismo.";

interface FeeImpactCardProps {
  results: BacktestResponse;
  isLoading: boolean;
}

export function FeeImpactCard({ results, isLoading }: FeeImpactCardProps) {
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

  if (!resultA && !resultB) {
    return null;
  }

  const initialAmount = config.initialAmount;
  const isSinglePortfolio = !resultA || !resultB;
  const singleResult = resultA || resultB;

  // =========================================================================
  // MODO SINGLE PORTFOLIO
  // =========================================================================
  if (isSinglePortfolio && singleResult) {
    const costes = singleResult.fees.totalFees + (singleResult.fees.managementFeePaid || 0);
    const impuestosAdelantados = singleResult.fees.totalTaxesPaid ?? 0;
    const impuestosPendientes = singleResult.fees.pendingTaxes ?? 0;
    const profit = singleResult.finalValue - singleResult.totalContributions;
    const profitNetoSiLiquida = profit - impuestosPendientes;
    const hasAnyTax = impuestosAdelantados > 0 || impuestosPendientes > 0;
    const taxModeLabel = singleResult.fees.taxMode === "spain-irpf"
      ? "IRPF tramos"
      : singleResult.fees.taxMode === "flat" && singleResult.fees.taxRate
      ? `${((singleResult.fees.taxRate) * 100).toFixed(0)}% fijo`
      : "";

    return (
      <div className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden bg-white">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-navy flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-brand-navy font-serif">{singleResult.portfolioName}</h3>
              <p className="text-sm text-brand-tertiary">Resumen financiero</p>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${hasAnyTax ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"} gap-4`}>
            <div className="rounded-xl bg-slate-50 p-5">
              <p className="text-xs font-medium text-brand-tertiary uppercase tracking-wider mb-2">Beneficio neto</p>
              <p className={`text-3xl sm:text-4xl font-bold tracking-tight font-serif ${profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatEUR(profit)}
              </p>
              {impuestosPendientes > 0 && (
                <p className="text-xs text-brand-tertiary mt-1">
                  Tras liquidar y pagar pendientes: <span className={`font-semibold ${profitNetoSiLiquida >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatEUR(profitNetoSiLiquida)}</span>
                </p>
              )}
            </div>

            <div className="rounded-xl bg-slate-50 p-5">
              <div className="flex items-center gap-1.5 mb-2">
                <p className="text-xs font-medium text-brand-tertiary uppercase tracking-wider">Costes (TER + gestión)</p>
                <Tooltip content={COSTS_TOOLTIP} wide>
                  <svg className="w-3.5 h-3.5 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                </Tooltip>
              </div>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-brand-navy">
                {formatEUR(costes)}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <p className="text-xs text-brand-tertiary">
                  TER {singleResult.fees.weightedTer.toFixed(3)}%
                  {singleResult.fees.managementFee ? ` + Gestión ${singleResult.fees.managementFee.toFixed(2)}%` : ""}
                </p>
                <Tooltip content={TER_TOOLTIP} wide>
                  <svg className="w-3 h-3 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                </Tooltip>
              </div>
            </div>

            {hasAnyTax && (
              <div className="rounded-xl bg-amber-50 p-5 border border-amber-100">
                <p className="text-xs font-medium text-amber-700 uppercase tracking-wider mb-2">
                  Impuestos adelantados
                </p>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-amber-700">
                  {formatEUR(impuestosAdelantados)}
                </p>
                <p className="text-xs text-amber-700/70 mt-1">
                  Plusvalías ya realizadas en rebalanceos {taxModeLabel && `(${taxModeLabel})`}
                </p>
              </div>
            )}

            {hasAnyTax && (
              <div className="rounded-xl bg-purple-50 p-5 border border-purple-100">
                <p className="text-xs font-medium text-purple-700 uppercase tracking-wider mb-2">
                  Impuestos pendientes
                </p>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-purple-700">
                  {formatEUR(impuestosPendientes)}
                </p>
                <p className="text-xs text-purple-700/70 mt-1">
                  Sobre {formatEUR(singleResult.fees.unrealizedGain ?? 0)} de plusvalía latente {taxModeLabel && `(${taxModeLabel})`}
                </p>
              </div>
            )}

            {!hasAnyTax && (
              <div className="rounded-xl bg-slate-50 p-5">
                <p className="text-xs font-medium text-brand-tertiary uppercase tracking-wider mb-2">
                  {singleResult.fees.managementFee ? "Coste total anual" : "TER ponderado"}
                </p>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-brand-navy">
                  {singleResult.fees.managementFee
                    ? (singleResult.fees.weightedTer + singleResult.fees.managementFee).toFixed(2)
                    : singleResult.fees.weightedTer.toFixed(2)}%
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MODO COMPARACIÓN
  // =========================================================================
  // Si una cartera tiene modo fiscal activo y la otra no, usamos el modo de
  // la que SÍ tiene para calcular impuestos hipotéticos de liquidación en la
  // que no — así la comparación es justa: al final ambas tributan al vender.
  const modeA = (resultA!.fees.taxMode ?? "none") as TaxMode;
  const modeB = (resultB!.fees.taxMode ?? "none") as TaxMode;
  const rateA = resultA!.fees.taxRate ?? 0;
  const rateB = resultB!.fees.taxRate ?? 0;

  // Modo efectivo para la cartera A (si A no tiene tax, usa el de B)
  const effectiveModeA: TaxMode = modeA !== "none" ? modeA : modeB;
  const effectiveRateA = modeA !== "none" ? rateA : rateB;
  // Modo efectivo para la cartera B
  const effectiveModeB: TaxMode = modeB !== "none" ? modeB : modeA;
  const effectiveRateB = modeB !== "none" ? rateB : rateA;

  // Cálculo del desglose por cartera
  function breakdownFor(result: BacktestResult, effMode: TaxMode, effRate: number) {
    const costes = result.fees.totalFees + (result.fees.managementFeePaid || 0);
    const adelantados = result.fees.totalTaxesPaid ?? 0;
    // Pendientes "reales" (con el modo propio) o "hipotéticos" (con el del otro)
    const ownPending = result.fees.pendingTaxes ?? 0;
    const unrealizedGain = result.fees.unrealizedGain ?? 0;
    const ownMode = (result.fees.taxMode ?? "none") as TaxMode;
    // Si la cartera NO tiene tax mode propio pero el efectivo SÍ, calcular hipotético
    const isHypothetical = ownMode === "none" && effMode !== "none";
    const hypoPending = isHypothetical
      ? computeTaxOnGain(unrealizedGain, effMode, effRate)
      : ownPending;
    const total = costes + adelantados + hypoPending;
    return {
      costes,
      adelantados,
      pendientes: hypoPending,
      total,
      isHypothetical,
      unrealizedGain,
    };
  }

  const breakdownA = breakdownFor(resultA!, effectiveModeA, effectiveRateA);
  const breakdownB = breakdownFor(resultB!, effectiveModeB, effectiveRateB);
  const feesA = breakdownA.total;
  const feesB = breakdownB.total;
  // El "Te ahorras" SOLO compara COSTES (TER + gestión), no incluye impuestos.
  // Razón pedagógica: los impuestos son PROPORCIONALES a las ganancias — pagar
  // más impuestos significa haber ganado más, no es "peor". Mezclarlos con los
  // costes en un único "ahorro" invertía el mensaje (parecía que el peor fondo
  // era mejor porque ganaba menos → tributaba menos).
  const costsA = breakdownA.costes;
  const costsB = breakdownB.costes;
  const costsDifference = Math.abs(costsA - costsB);
  const cheaperCostsName = costsA < costsB ? resultA!.portfolioName : resultB!.portfolioName;

  // --- Benchmark (3ª serie de costes). Global: A y B comparten benchmark. ---
  // Reutilizamos el mismo desglose de coste que las carteras: TER pagado +
  // comisión de gestión pagada (FeesSummary). Solo se renderiza si existe.
  const bm = resultA?.benchmark ?? resultB?.benchmark;
  const bmFees = bm?.benchmarkFees;
  const bmCosts = bmFees
    ? (bmFees.totalFees ?? 0) + (bmFees.managementFeePaid ?? 0)
    : 0;
  // Impuestos totales (adelantados + pendientes) por separado
  const taxesA = breakdownA.adelantados + breakdownA.pendientes;
  const taxesB = breakdownB.adelantados + breakdownB.pendientes;
  const taxesDifference = Math.abs(taxesA - taxesB);
  const moreTaxesName = taxesA > taxesB ? resultA!.portfolioName : resultB!.portfolioName;
  const hasAnyTax = taxesA > 0 || taxesB > 0;
  const showHypoNote = breakdownA.isHypothetical || breakdownB.isHypothetical;
  const hypoModeLabel = taxModeLabel(
    breakdownA.isHypothetical ? effectiveModeA : effectiveModeB,
    breakdownA.isHypothetical ? effectiveRateA : effectiveRateB
  );

  // Calcular periodos reales de cada cartera (en años)
  const yearsA = resultA!.timeSeries.length > 1
    ? (new Date(resultA!.timeSeries[resultA!.timeSeries.length - 1]!.exactDate || resultA!.timeSeries[resultA!.timeSeries.length - 1]!.date).getTime() -
       new Date(resultA!.timeSeries[0]!.exactDate || resultA!.timeSeries[0]!.date).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
    : 0;
  const yearsB = resultB!.timeSeries.length > 1
    ? (new Date(resultB!.timeSeries[resultB!.timeSeries.length - 1]!.exactDate || resultB!.timeSeries[resultB!.timeSeries.length - 1]!.date).getTime() -
       new Date(resultB!.timeSeries[0]!.exactDate || resultB!.timeSeries[0]!.date).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
    : 0;
  const periodsDiffer = Math.abs(yearsA - yearsB) > 0.1; // más de ~36 días de diferencia

  return (
    <div className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden bg-white">
      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-coral flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-brand-navy font-serif">Impacto de las comisiones</h3>
            <p className="text-sm text-brand-tertiary">Dinero que sale de tu bolsillo</p>
          </div>
        </div>

        {/* Aviso si los períodos no coinciden */}
        {periodsDiffer && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <div className="text-sm">
                <p className="text-amber-900 font-semibold mb-1">Comparación con períodos diferentes</p>
                <p className="text-amber-800">
                  <strong>{resultA!.portfolioName}</strong> tiene <strong>{yearsA.toFixed(1)} años</strong> de datos
                  vs <strong>{yearsB.toFixed(1)} años</strong> de <strong>{resultB!.portfolioName}</strong>.
                  Las comisiones absolutas en € no son comparables directamente. Activa "Usar rango común" para una comparación justa.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* === SECCIÓN 1: COSTES PUROS (TER + GESTIÓN) === */}
        {/* Comparable directamente entre carteras: son costes que erosionan tu
            rentabilidad independientemente de cuánto ganes. Aquí SÍ tiene
            sentido el mensaje "Te ahorras X €". */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wider">
                💸 Costes (TER + gestión)
              </h4>
              <Tooltip content={COSTS_TOOLTIP} wide>
                <svg className="w-3.5 h-3.5 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
              </Tooltip>
            </div>
            <span className="text-[10px] text-brand-tertiary italic">
              comparable directamente — más bajo = mejor
            </span>
          </div>
          <div className={`grid grid-cols-1 ${bm ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"} gap-4 mb-6`}>
            <div className="rounded-xl bg-blue-50/50 border border-blue-100/50 p-5">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
                {resultA!.portfolioName}
              </p>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-brand-navy">
                {formatEUR(costsA)}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <p className="text-[11px] text-brand-tertiary">
                  TER {resultA!.fees.weightedTer.toFixed(3)}%
                  {resultA!.fees.managementFee ? ` + Gestión ${resultA!.fees.managementFee.toFixed(2)}%` : ""}
                </p>
                <Tooltip content={TER_TOOLTIP} wide>
                  <svg className="w-3 h-3 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                </Tooltip>
              </div>
              <p className="text-[10px] text-brand-tertiary mt-2 pt-2 border-t border-blue-100/40">
                {yearsA > 0 && <>{yearsA.toFixed(1)} años · {(costsA / yearsA).toFixed(0)} €/año</>}
              </p>
            </div>

            <div className="rounded-xl bg-rose-50/50 border border-rose-100/50 p-5">
              <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2">
                {resultB!.portfolioName}
              </p>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-brand-navy">
                {formatEUR(costsB)}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <p className="text-[11px] text-brand-tertiary">
                  TER {resultB!.fees.weightedTer.toFixed(3)}%
                  {resultB!.fees.managementFee ? ` + Gestión ${resultB!.fees.managementFee.toFixed(2)}%` : ""}
                </p>
                <Tooltip content={TER_TOOLTIP} wide>
                  <svg className="w-3 h-3 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                </Tooltip>
              </div>
              <p className="text-[10px] text-brand-tertiary mt-2 pt-2 border-t border-rose-100/40">
                {yearsB > 0 && <>{yearsB.toFixed(1)} años · {(costsB / yearsB).toFixed(0)} €/año</>}
              </p>
            </div>

            {/* 3ª tarjeta de coste: BENCHMARK (púrpura, discontinuo en identidad
                visual). Solo se renderiza si hay benchmark con sus comisiones. */}
            {bm && (
              <div className="rounded-xl bg-purple-50/50 border border-purple-300 border-dashed p-5">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">
                  {bm.benchmarkName || "Benchmark"}
                </p>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-purple-700">
                  {formatEUR(bmCosts)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <p className="text-[11px] text-brand-tertiary">
                    TER {(bmFees?.weightedTer ?? 0).toFixed(3)}%
                    {bmFees?.managementFee ? ` + Gestión ${bmFees.managementFee.toFixed(2)}%` : ""}
                  </p>
                  <Tooltip content={TER_TOOLTIP} wide>
                    <svg className="w-3 h-3 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                    </svg>
                  </Tooltip>
                </div>
                <p className="text-[10px] text-brand-tertiary mt-2 pt-2 border-t border-purple-200/60">
                  Referencia de mercado
                </p>
              </div>
            )}

            <div className="rounded-xl bg-brand-navy p-5 text-white">
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                Te ahorras
              </p>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif">
                {formatEUR(costsDifference)}
              </p>
              <p className="text-sm text-white/70 mt-1">
                en costes con {cheaperCostsName}
              </p>
              <p className="text-[10px] text-white/50 mt-3 pt-3 border-t border-white/10">
                Comparación entre TER y comisión de gestión efectivamente pagados en EUR.
                Ojo: dos carteras con el MISMO % de TER pueden pagar comisiones distintas
                porque se cobran sobre el patrimonio mensual, que crece a ritmo diferente.
              </p>
            </div>
          </div>
        </div>

        {/* === SECCIÓN 2: IMPUESTOS (solo si hay) === */}
        {hasAnyTax && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wider">
                🧾 Impuestos
              </h4>
              <span className="text-[10px] text-brand-tertiary italic">
                proporcionales a la ganancia — no son "malos" en sí
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="rounded-xl bg-amber-50/40 border border-amber-100/60 p-5">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
                  {resultA!.portfolioName}
                </p>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-amber-700">
                  {formatEUR(taxesA)}
                </p>
                <p className="text-[11px] text-amber-700/70 mt-1">Impuestos totales</p>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-brand-secondary">Pagados:</span>
                    <span className={`font-semibold tabular-nums ${breakdownA.adelantados > 0 ? "text-amber-700" : "text-brand-tertiary"}`}>
                      {formatEUR(breakdownA.adelantados)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-secondary">
                      Pendientes{breakdownA.isHypothetical && <span className="ml-0.5 text-purple-600 font-bold">*</span>}:
                    </span>
                    <span className={`font-semibold tabular-nums ${breakdownA.pendientes > 0 ? "text-purple-700" : "text-brand-tertiary"}`}>
                      {formatEUR(breakdownA.pendientes)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50/40 border border-amber-100/60 p-5">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
                  {resultB!.portfolioName}
                </p>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-amber-700">
                  {formatEUR(taxesB)}
                </p>
                <p className="text-[11px] text-amber-700/70 mt-1">Impuestos totales</p>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-brand-secondary">Pagados:</span>
                    <span className={`font-semibold tabular-nums ${breakdownB.adelantados > 0 ? "text-amber-700" : "text-brand-tertiary"}`}>
                      {formatEUR(breakdownB.adelantados)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-secondary">
                      Pendientes{breakdownB.isHypothetical && <span className="ml-0.5 text-purple-600 font-bold">*</span>}:
                    </span>
                    <span className={`font-semibold tabular-nums ${breakdownB.pendientes > 0 ? "text-purple-700" : "text-brand-tertiary"}`}>
                      {formatEUR(breakdownB.pendientes)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-5">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">
                  Ojo al matiz
                </p>
                <p className="text-sm text-emerald-900 leading-snug font-medium">
                  <strong>{moreTaxesName}</strong> paga{" "}
                  <strong className="tabular-nums">{formatEUR(taxesDifference)}</strong>{" "}
                  más en impuestos.
                </p>
                <p className="text-[11px] text-emerald-800/80 mt-3 leading-relaxed">
                  Pero esto <strong>no es malo</strong>: los impuestos son proporcionales
                  a la ganancia. Si paga más es porque ha ganado más. La comparación
                  real es <strong>cuánto te llevas al bolsillo</strong> al final
                  (ver "Cómo afectan los impuestos" arriba).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Total acumulado — fila inferior compacta para referencia */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 -mt-2">
          <div className="px-3 py-2 bg-slate-50 rounded-lg flex justify-between items-baseline">
            <span className="text-[10px] text-brand-tertiary uppercase tracking-wider">Total {resultA!.portfolioName}</span>
            <span className="text-sm font-bold text-brand-navy tabular-nums">{formatEUR(feesA)}</span>
          </div>
          <div className="px-3 py-2 bg-slate-50 rounded-lg flex justify-between items-baseline">
            <span className="text-[10px] text-brand-tertiary uppercase tracking-wider">Total {resultB!.portfolioName}</span>
            <span className="text-sm font-bold text-brand-navy tabular-nums">{formatEUR(feesB)}</span>
          </div>
          <div className="px-3 py-2 bg-slate-50 rounded-lg flex justify-between items-baseline">
            <span className="text-[10px] text-brand-tertiary uppercase tracking-wider">Diferencia total</span>
            <span className="text-sm font-bold text-brand-navy tabular-nums">{formatEUR(Math.abs(feesA - feesB))}</span>
          </div>
        </div>

        {/* Nota explicativa cuando hay impuestos hipotéticos */}
        {showHypoNote && (
          <div className="rounded-xl bg-purple-50/50 border border-purple-100 p-3 mb-6 text-xs text-purple-900 flex items-start gap-2">
            <span className="text-purple-600 font-bold flex-shrink-0">*</span>
            <p className="leading-relaxed">
              <strong>Impuestos pendientes hipotéticos:</strong> la cartera que no tiene fiscalidad activa
              (típicamente fondos de inversión con traspaso) no paga impuestos durante el periodo, pero
              SÍ tributará al liquidar. Para comparar de forma justa, le aplicamos el mismo régimen
              fiscal que la otra cartera ({hypoModeLabel}) sobre la plusvalía latente al final.
            </p>
          </div>
        )}

        {/* Warning solo cuando la cartera más cara es de gestión activa */}
        {(() => {
          const expensiveResult = feesA > feesB ? resultA! : resultB!;
          const expensiveFees = Math.max(feesA, feesB);
          const expensivePercent = (expensiveFees / initialAmount) * 100;
          const isActivePortfolio = expensiveResult.portfolioType === "active";

          if (!isActivePortfolio || expensivePercent <= 15) return null;

          return (
            <div className="rounded-xl bg-red-50 border border-red-100 p-5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-red-800 font-semibold">
                    <strong>{expensiveResult.portfolioName}</strong>: las comisiones se han comido un {expensivePercent.toFixed(0)}% de tu inversión inicial
                  </p>
                  <p className="text-red-700 text-sm mt-1">
                    De los {formatEUR(initialAmount)} que invertiste, {formatEUR(expensiveFees)} se fueron en comisiones con esta cartera de gestión activa.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
