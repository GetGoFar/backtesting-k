"use client";

import type { BacktestResponse, BacktestResult } from "@/lib/types";
import { formatEUR } from "@/lib/formatters";
import { computeTaxOnGain, taxModeLabel, type TaxMode } from "@/lib/tax-utils";

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
              <p className="text-xs font-medium text-brand-tertiary uppercase tracking-wider mb-2">Costes (TER + gestión)</p>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-brand-navy">
                {formatEUR(costes)}
              </p>
              <p className="text-xs text-brand-tertiary mt-1">
                TER {singleResult.fees.weightedTer.toFixed(2)}%
                {singleResult.fees.managementFee ? ` + Gestión ${singleResult.fees.managementFee.toFixed(2)}%` : ""}
              </p>
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
  const feeDifference = Math.abs(feesA - feesB);
  const cheaperName = feesA < feesB ? resultA!.portfolioName : resultB!.portfolioName;
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

        {/* Stats comparativos grandes con desglose */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Cartera A */}
          <div className="rounded-xl bg-blue-50/50 border border-blue-100/50 p-5">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
              {resultA!.portfolioName}
            </p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-brand-navy">
              {formatEUR(feesA)}
            </p>
            <p className="text-[11px] text-brand-tertiary mt-1">Coste total acumulado</p>
            {/* Desglose — siempre visible */}
            <div className="mt-3 p-3 bg-white/60 rounded-lg border border-blue-200/60">
              <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-2">
                💰 Desglose del coste
              </p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-baseline">
                  <span className="text-brand-secondary">Costes (TER + gestión):</span>
                  <span className="font-semibold text-brand-navy tabular-nums">{formatEUR(breakdownA.costes)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-brand-secondary">Impuestos adelantados:</span>
                  <span className={`font-semibold tabular-nums ${breakdownA.adelantados > 0 ? "text-amber-700" : "text-brand-tertiary"}`}>
                    {breakdownA.adelantados > 0 ? formatEUR(breakdownA.adelantados) : "0 €"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-brand-secondary">
                    Impuestos pendientes{breakdownA.isHypothetical && <span className="ml-1 text-purple-600 font-bold">*</span>}:
                  </span>
                  <span className={`font-semibold tabular-nums ${breakdownA.pendientes > 0 ? "text-purple-700" : "text-brand-tertiary"}`}>
                    {breakdownA.pendientes > 0 ? formatEUR(breakdownA.pendientes) : "0 €"}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-brand-tertiary mt-2 pt-2 border-t border-blue-100/40">
              TER: {resultA!.fees.weightedTer.toFixed(2)}%
              {resultA!.fees.managementFee ? ` + Gestión: ${resultA!.fees.managementFee.toFixed(2)}%` : ""}
              {yearsA > 0 && <> · {yearsA.toFixed(1)} años · {(feesA / yearsA).toFixed(0)} €/año</>}
            </p>
          </div>

          {/* Cartera B */}
          <div className="rounded-xl bg-rose-50/50 border border-rose-100/50 p-5">
            <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2">
              {resultB!.portfolioName}
            </p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif text-brand-navy">
              {formatEUR(feesB)}
            </p>
            <p className="text-[11px] text-brand-tertiary mt-1">Coste total acumulado</p>
            {/* Desglose — siempre visible */}
            <div className="mt-3 p-3 bg-white/60 rounded-lg border border-rose-200/60">
              <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider mb-2">
                💰 Desglose del coste
              </p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-baseline">
                  <span className="text-brand-secondary">Costes (TER + gestión):</span>
                  <span className="font-semibold text-brand-navy tabular-nums">{formatEUR(breakdownB.costes)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-brand-secondary">Impuestos adelantados:</span>
                  <span className={`font-semibold tabular-nums ${breakdownB.adelantados > 0 ? "text-amber-700" : "text-brand-tertiary"}`}>
                    {breakdownB.adelantados > 0 ? formatEUR(breakdownB.adelantados) : "0 €"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-brand-secondary">
                    Impuestos pendientes{breakdownB.isHypothetical && <span className="ml-1 text-purple-600 font-bold">*</span>}:
                  </span>
                  <span className={`font-semibold tabular-nums ${breakdownB.pendientes > 0 ? "text-purple-700" : "text-brand-tertiary"}`}>
                    {breakdownB.pendientes > 0 ? formatEUR(breakdownB.pendientes) : "0 €"}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-brand-tertiary mt-2 pt-2 border-t border-rose-100/40">
              TER: {resultB!.fees.weightedTer.toFixed(2)}%
              {resultB!.fees.managementFee ? ` + Gestión: ${resultB!.fees.managementFee.toFixed(2)}%` : ""}
              {yearsB > 0 && <> · {yearsB.toFixed(1)} años · {(feesB / yearsB).toFixed(0)} €/año</>}
            </p>
          </div>

          {/* Te ahorras */}
          <div className="rounded-xl bg-brand-navy p-5 text-white">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
              Te ahorras
            </p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight font-serif">
              {formatEUR(feeDifference)}
            </p>
            <p className="text-sm text-white/70 mt-1">
              con {cheaperName}
            </p>
            <p className="text-[10px] text-white/50 mt-3 pt-3 border-t border-white/10">
              Incluye TER, comisión de gestión, impuestos pagados durante el periodo
              y los pendientes que tributarías al liquidar la cartera.
            </p>
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
