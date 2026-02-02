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
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 shadow-sm p-6">
        <div className="h-32 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const { resultA, resultB, config } = results;

  // Verificar que tenemos resultados válidos
  if (!resultA || !resultB) {
    return (
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 shadow-sm p-6">
        <p className="text-amber-800 text-center">No hay datos suficientes para mostrar el impacto de comisiones.</p>
      </div>
    );
  }

  // Calcular comisiones
  const feesA = resultA.fees.totalFees;
  const feesB = resultB.fees.totalFees;
  const feeDifference = Math.abs(feesA - feesB);
  const cheaperPortfolio = feesA < feesB ? "A" : "B";
  const cheaperName = feesA < feesB ? resultA.portfolioName : resultB.portfolioName;
  const expensiveName = feesA < feesB ? resultB.portfolioName : resultA.portfolioName;

  // Calcular si las comisiones superan el 20% del capital inicial
  const initialAmount = config.initialAmount;
  const maxFees = Math.max(feesA, feesB);
  const feesPercentOfInitial = (maxFees / initialAmount) * 100;
  const showExtraWarning = feesPercentOfInitial > 20;

  // Diferencia en valor final
  const valueDifference = Math.abs(resultA.finalValue - resultB.finalValue);
  const betterPortfolioValue = resultA.finalValue > resultB.finalValue ? resultA : resultB;

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="text-2xl">💰</span>
          Impacto de las comisiones
        </h3>
      </div>

      <div className="p-6">
        {/* Grid de comisiones */}
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          {/* Cartera A */}
          <div className="bg-white/70 rounded-lg p-4 border border-amber-100">
            <p className="text-xs font-medium text-blue-600 mb-1">
              {resultA.portfolioName}
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {formatEUR(feesA)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              TER medio: {(resultA.fees.weightedTer * 100).toFixed(2)}%
            </p>
          </div>

          {/* Cartera B */}
          <div className="bg-white/70 rounded-lg p-4 border border-amber-100">
            <p className="text-xs font-medium text-rose-600 mb-1">
              {resultB.portfolioName}
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {formatEUR(feesB)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              TER medio: {(resultB.fees.weightedTer * 100).toFixed(2)}%
            </p>
          </div>

          {/* Diferencia */}
          <div className="bg-white/70 rounded-lg p-4 border border-amber-100">
            <p className="text-xs font-medium text-slate-600 mb-1">
              Diferencia
            </p>
            <p className="text-2xl font-bold text-amber-600">
              {formatEUR(feeDifference)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Ahorro con {cheaperName}
            </p>
          </div>
        </div>

        {/* Mensaje principal */}
        <div className="bg-amber-100/50 rounded-lg p-4 border border-amber-200">
          <p className="text-amber-900 font-medium">
            La diferencia en comisiones de{" "}
            <span className="font-bold">{formatEUR(feeDifference)}</span> es
            dinero que sale de <span className="uppercase font-bold">TU</span>{" "}
            bolsillo y va al banco.
          </p>

          {feeDifference > 0 && (
            <p className="text-amber-800 text-sm mt-2">
              Con <strong>{cheaperName}</strong> pagas{" "}
              <strong>{formatEUR(feeDifference)}</strong> menos en comisiones
              que con <strong>{expensiveName}</strong> durante el periodo analizado.
            </p>
          )}
        </div>

        {/* Aviso extra si las comisiones superan el 20% */}
        {showExtraWarning && (
          <div className="mt-4 bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-red-800 font-medium">
                  Las comisiones se han comido un{" "}
                  <span className="font-bold">
                    {feesPercentOfInitial.toFixed(1)}%
                  </span>{" "}
                  de tu inversión inicial.
                </p>
                <p className="text-red-700 text-sm mt-1">
                  De los {formatEUR(initialAmount)} que invertiste inicialmente,{" "}
                  {formatEUR(maxFees)} se han ido en comisiones. Esto reduce
                  significativamente el poder del interés compuesto.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Comparativa de valor final */}
        <div className="mt-4 pt-4 border-t border-amber-200">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">
              Diferencia en valor final:
            </span>
            <span className="font-bold text-emerald-600">
              {formatEUR(valueDifference)} a favor de {betterPortfolioValue.portfolioName}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Esta diferencia incluye el efecto de las comisiones más bajas componiéndose
            a lo largo del tiempo (interés compuesto).
          </p>
        </div>
      </div>
    </div>
  );
}
