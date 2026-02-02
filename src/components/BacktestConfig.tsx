"use client";

import type { RebalanceFrequency } from "@/lib/types";

// Componente de configuración del backtest

interface BacktestConfigProps {
  startDate: string;
  endDate: string;
  initialInvestment: number;
  monthlyContribution: number;
  rebalanceFrequency: RebalanceFrequency;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onInitialInvestmentChange: (amount: number) => void;
  onMonthlyContributionChange: (amount: number) => void;
  onRebalanceFrequencyChange: (freq: RebalanceFrequency) => void;
  onRunBacktest: () => void;
  isLoading?: boolean;
  canRun?: boolean;
}

export function BacktestConfig({
  startDate,
  endDate,
  initialInvestment,
  monthlyContribution,
  rebalanceFrequency,
  onStartDateChange,
  onEndDateChange,
  onInitialInvestmentChange,
  onMonthlyContributionChange,
  onRebalanceFrequencyChange,
  onRunBacktest,
  isLoading = false,
  canRun = false,
}: BacktestConfigProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Configuración del Backtest
      </h2>

      <div className="space-y-4">
        {/* Fechas */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha inicio
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha fin
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Inversión inicial */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Inversión inicial (€)
          </label>
          <input
            type="number"
            min="1000"
            step="1000"
            value={initialInvestment}
            onChange={(e) => onInitialInvestmentChange(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Aportación mensual */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Aportación mensual (€)
          </label>
          <input
            type="number"
            min="0"
            step="100"
            value={monthlyContribution}
            onChange={(e) => onMonthlyContributionChange(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Opcional. Déjalo en 0 si no hay aportaciones.
          </p>
        </div>

        {/* Rebalanceo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Frecuencia de rebalanceo
          </label>
          <select
            value={rebalanceFrequency}
            onChange={(e) =>
              onRebalanceFrequencyChange(e.target.value as RebalanceFrequency)
            }
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="none">Sin rebalanceo</option>
            <option value="monthly">Mensual</option>
            <option value="quarterly">Trimestral</option>
            <option value="annual">Anual</option>
          </select>
        </div>

        {/* Botón ejecutar */}
        <button
          onClick={onRunBacktest}
          disabled={isLoading || !canRun}
          className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
            isLoading || !canRun
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Calculando...
            </span>
          ) : (
            "Ejecutar Backtest"
          )}
        </button>

        {!canRun && !isLoading && (
          <p className="text-xs text-center text-amber-600">
            Configura ambas carteras con pesos que sumen 100% para ejecutar
          </p>
        )}
      </div>
    </div>
  );
}
