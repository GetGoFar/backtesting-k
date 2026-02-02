"use client";

import { useState, useEffect, useCallback } from "react";
import { FundSearch } from "./FundSearch";
import type { Fund, PortfolioPreset, PortfolioHolding } from "@/lib/types";
import { getAllPresets } from "@/lib/portfolio-presets";
import { getFundById } from "@/lib/fund-database";

// Tipo interno para manejar allocaciones con datos completos del fondo
export interface FundAllocation {
  fund: Fund;
  weight: number;
}

interface PortfolioBuilderProps {
  side: "a" | "b";
  onUpdate: (data: {
    name: string;
    holdings: PortfolioHolding[];
    isValid: boolean;
  }) => void;
}

// Colores según el side
const SIDE_COLORS = {
  a: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    headerBg: "bg-gradient-to-r from-blue-600 to-blue-700",
    accent: "blue",
    ring: "ring-blue-500",
  },
  b: {
    bg: "bg-rose-50",
    border: "border-rose-200",
    headerBg: "bg-gradient-to-r from-rose-600 to-rose-700",
    accent: "rose",
    ring: "ring-rose-500",
  },
};

export function PortfolioBuilder({ side, onUpdate }: PortfolioBuilderProps) {
  const [allocations, setAllocations] = useState<FundAllocation[]>([]);
  const [name, setName] = useState(
    side === "a" ? "Cartera Indexada" : "Cartera Bancaria"
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);

  const presets = getAllPresets();
  const colors = SIDE_COLORS[side];

  // Calcular peso total
  const totalWeight = allocations.reduce((sum, a) => sum + a.weight, 0);
  const isValid = allocations.length > 0 && Math.abs(totalWeight - 100) <= 2;

  // Notificar cambios al padre
  const notifyUpdate = useCallback(() => {
    onUpdate({
      name,
      holdings: allocations.map((a) => ({
        fundId: a.fund.id,
        weight: a.weight,
        // Incluir datos del fondo para fondos dinámicos (Yahoo Finance)
        fund: a.fund.id.startsWith("yahoo-") ? a.fund : undefined,
      })),
      isValid,
    });
  }, [name, allocations, isValid, onUpdate]);

  useEffect(() => {
    notifyUpdate();
  }, [notifyUpdate]);

  // Marcar como personalizada cuando se modifica manualmente
  const markAsCustom = () => {
    if (selectedPresetId !== null) {
      setSelectedPresetId(null);
      // Solo cambiar nombre si no fue editado manualmente
      const currentPreset = presets.find((p) => p.id === selectedPresetId);
      if (currentPreset && name === currentPreset.name) {
        setName("Cartera Personalizada");
      }
    }
  };

  const handleAddFund = (fund: Fund) => {
    // Evitar duplicados
    if (allocations.some((a) => a.fund.id === fund.id)) return;
    setAllocations([...allocations, { fund, weight: 0 }]);
    markAsCustom();
  };

  const handleRemoveFund = (fundId: string) => {
    setAllocations(allocations.filter((a) => a.fund.id !== fundId));
    markAsCustom();
  };

  const handleWeightChange = (fundId: string, weight: number) => {
    setAllocations(
      allocations.map((a) =>
        a.fund.id === fundId
          ? { ...a, weight: Math.min(100, Math.max(0, weight)) }
          : a
      )
    );
    markAsCustom();
  };

  const handlePresetSelect = (preset: PortfolioPreset) => {
    // Convertir holdings del preset a allocaciones con fondos completos
    const newAllocations: FundAllocation[] = [];
    for (const holding of preset.holdings) {
      const fund = getFundById(holding.fundId);
      if (fund) {
        newAllocations.push({ fund, weight: holding.weight });
      }
    }

    setAllocations(newAllocations);
    setName(preset.name);
    setSelectedPresetId(preset.id);
    setShowPresetDropdown(false);
  };

  const handleNameChange = (newName: string) => {
    setName(newName);
    // Marcar como personalizada si el nombre difiere del preset
    const currentPreset = presets.find((p) => p.id === selectedPresetId);
    if (currentPreset && newName !== currentPreset.name) {
      setSelectedPresetId(null);
    }
  };

  // Calcular TER medio ponderado
  const weightedTer =
    totalWeight > 0
      ? allocations.reduce((sum, a) => sum + a.fund.ter * a.weight, 0) /
        totalWeight
      : 0;

  // Obtener IDs de fondos ya añadidos para excluir del buscador
  const excludedFundIds = allocations.map((a) => a.fund.id);

  // Agrupar presets por tipo
  const indexPresets = presets.filter((p) => p.type === "index");
  const activePresets = presets.filter((p) => p.type === "active");

  return (
    <div
      className={`${colors.bg} border ${colors.border} rounded-xl overflow-hidden shadow-sm`}
    >
      {/* Header con color */}
      <div className={`${colors.headerBg} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">
              {side.toUpperCase()}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="font-semibold text-white bg-transparent border-b border-transparent hover:border-white/50 focus:border-white focus:outline-none px-1 placeholder-white/60"
              placeholder="Nombre de la cartera"
            />
          </div>
          {selectedPresetId && (
            <span className="text-xs text-white/70 bg-white/10 px-2 py-1 rounded">
              Preset
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Selector de preset */}
        <div className="relative">
          <button
            onClick={() => setShowPresetDropdown(!showPresetDropdown)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors"
          >
            <span className="text-slate-600">
              {selectedPresetId
                ? presets.find((p) => p.id === selectedPresetId)?.name
                : "Seleccionar cartera predefinida..."}
            </span>
            <svg
              className={`w-5 h-5 text-slate-400 transition-transform ${
                showPresetDropdown ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showPresetDropdown && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-72 overflow-auto">
              {/* Carteras K (Indexadas) */}
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
                  Carteras K (Indexadas)
                </p>
                {indexPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors ${
                      selectedPresetId === preset.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="font-medium text-sm text-slate-800">
                        {preset.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 ml-4 mt-0.5">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>

              {/* Carteras Bancarias */}
              <div className="p-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
                  Carteras Bancarias (Activas)
                </p>
                {activePresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 transition-colors ${
                      selectedPresetId === preset.id ? "bg-rose-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span className="font-medium text-sm text-slate-800">
                        {preset.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 ml-4 mt-0.5">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Buscador de fondos */}
        <FundSearch onSelect={handleAddFund} excludeIds={excludedFundIds} />

        {/* Lista de fondos */}
        <div className="space-y-2">
          {allocations.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <svg
                className="w-12 h-12 mx-auto mb-2 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              <p className="text-sm">Selecciona un preset o busca fondos</p>
            </div>
          ) : (
            allocations.map((allocation) => (
              <div
                key={allocation.fund.id}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-100 shadow-sm"
              >
                {/* Badge de tipo */}
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${
                    allocation.fund.type === "index"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {allocation.fund.type === "index" ? "Indexado" : "Activo"}
                </span>

                {/* Info del fondo */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {allocation.fund.shortName}
                  </p>
                  <p className="text-xs text-slate-500">
                    TER: {allocation.fund.ter}%
                  </p>
                </div>

                {/* Input de peso */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={allocation.weight}
                    onChange={(e) =>
                      handleWeightChange(
                        allocation.fund.id,
                        Number(e.target.value)
                      )
                    }
                    className={`w-16 px-2 py-1.5 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:${colors.ring}`}
                  />
                  <span className="text-sm text-slate-400">%</span>
                </div>

                {/* Botón eliminar */}
                <button
                  onClick={() => handleRemoveFund(allocation.fund.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Eliminar fondo"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Resumen de peso y TER */}
        {allocations.length > 0 && (
          <div className="pt-3 border-t border-slate-200 space-y-2">
            {/* Peso total */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Peso total:</span>
              <div className="flex items-center gap-2">
                <div
                  className={`w-24 h-2 rounded-full overflow-hidden ${
                    isValid ? "bg-emerald-100" : "bg-amber-100"
                  }`}
                >
                  <div
                    className={`h-full rounded-full transition-all ${
                      isValid ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${Math.min(totalWeight, 100)}%` }}
                  />
                </div>
                <span
                  className={`font-bold text-sm ${
                    isValid ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {totalWeight.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Mensaje de validación */}
            {!isValid && (
              <p
                className={`text-xs ${
                  totalWeight < 98 ? "text-amber-600" : "text-amber-600"
                }`}
              >
                {totalWeight < 98
                  ? `Faltan ${(100 - totalWeight).toFixed(0)}% por asignar`
                  : totalWeight > 102
                  ? `Excedido por ${(totalWeight - 100).toFixed(0)}%`
                  : "Los pesos deben sumar 100%"}
              </p>
            )}

            {/* TER promedio */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">TER promedio ponderado:</span>
              <span
                className={`font-medium ${
                  weightedTer < 0.5 ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {weightedTer.toFixed(2)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Función auxiliar para convertir allocaciones a holdings del API
export function allocationsToHoldings(
  allocations: FundAllocation[]
): PortfolioHolding[] {
  return allocations.map((a) => ({
    fundId: a.fund.id,
    weight: a.weight,
  }));
}
