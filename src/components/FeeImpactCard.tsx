"use client";

import type { BacktestResponse } from "@/lib/types";
import { formatEUR } from "@/lib/formatters";

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
    const fees = singleResult.fees.totalFees;
    const profit = singleResult.finalValue - singleResult.totalContributions;

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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-slate-50 p-5">
              <p className="text-xs font-medium text-brand-tertiary uppercase tracking-wider mb-2">Beneficio neto</p>
              <p className={`text-4xl sm:text-5xl font-bold tracking-tight font-serif ${profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatEUR(profit)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-5">
              <p className="text-xs font-medium text-brand-tertiary uppercase tracking-wider mb-2">Comisiones pagadas</p>
              <p className="text-4xl sm:text-5xl font-bold tracking-tight font-serif text-brand-navy">
                {formatEUR(fees)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-5">
              <p className="text-xs font-medium text-brand-tertiary uppercase tracking-wider mb-2">
                {singleResult.fees.managementFee ? "Coste total" : "TER ponderado"}
              </p>
              <p className="text-4xl sm:text-5xl font-bold tracking-tight font-serif text-brand-navy">
                {singleResult.fees.managementFee
                  ? (singleResult.fees.weightedTer + singleResult.fees.managementFee).toFixed(2)
                  : singleResult.fees.weightedTer.toFixed(2)}%
              </p>
              {singleResult.fees.managementFee ? (
                <p className="text-xs text-brand-tertiary mt-1">
                  TER: {singleResult.fees.weightedTer.toFixed(2)}% + Gestión: {singleResult.fees.managementFee.toFixed(2)}%
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MODO COMPARACIÓN
  // =========================================================================
  const feesA = resultA!.fees.totalFees;
  const feesB = resultB!.fees.totalFees;
  const feeDifference = Math.abs(feesA - feesB);
  const cheaperName = feesA < feesB ? resultA!.portfolioName : resultB!.portfolioName;

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

        {/* Stats comparativos grandes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl bg-blue-50/50 border border-blue-100/50 p-5">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
              {resultA!.portfolioName}
            </p>
            <p className="text-4xl sm:text-5xl font-bold tracking-tight font-serif text-brand-navy">
              {formatEUR(feesA)}
            </p>
            <p className="text-sm text-brand-tertiary mt-1">
              TER: {resultA!.fees.weightedTer.toFixed(2)}%
              {resultA!.fees.managementFee ? ` + Gestión: ${resultA!.fees.managementFee.toFixed(2)}%` : ""}
            </p>
          </div>

          <div className="rounded-xl bg-rose-50/50 border border-rose-100/50 p-5">
            <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2">
              {resultB!.portfolioName}
            </p>
            <p className="text-4xl sm:text-5xl font-bold tracking-tight font-serif text-brand-navy">
              {formatEUR(feesB)}
            </p>
            <p className="text-sm text-brand-tertiary mt-1">
              TER: {resultB!.fees.weightedTer.toFixed(2)}%
              {resultB!.fees.managementFee ? ` + Gestión: ${resultB!.fees.managementFee.toFixed(2)}%` : ""}
            </p>
          </div>

          <div className="rounded-xl bg-brand-navy p-5 text-white">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
              Te ahorras
            </p>
            <p className="text-4xl sm:text-5xl font-bold tracking-tight font-serif">
              {formatEUR(feeDifference)}
            </p>
            <p className="text-sm text-white/70 mt-1">
              con {cheaperName}
            </p>
          </div>
        </div>

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
