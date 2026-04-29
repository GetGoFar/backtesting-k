"use client";

import { useState, useMemo } from "react";
import type { BacktestResponse, CorrelationMatrix as CorrelationMatrixType, PortfolioHolding } from "@/lib/types";
import { Tooltip } from "./Tooltip";
import { formatNumber } from "@/lib/formatters";

interface CorrelationMatrixProps {
  results: BacktestResponse;
  isLoading?: boolean;
  /** Fund IDs in portfolio A */
  portfolioAFundIds?: string[];
  /** Fund IDs in portfolio B */
  portfolioBFundIds?: string[];
  /** Holdings de la cartera A (con pesos) */
  portfolioAHoldings?: PortfolioHolding[];
  /** Holdings de la cartera B (con pesos) */
  portfolioBHoldings?: PortfolioHolding[];
  /** Name of portfolio A */
  portfolioAName?: string;
  /** Name of portfolio B */
  portfolioBName?: string;
}

type ViewMode = "all" | "portfolioA" | "portfolioB";

// -----------------------------------------------------------------------------
// Cálculo del Intraportfolio Correlation (IPC)
// -----------------------------------------------------------------------------

interface IPCResult {
  /** Coeficiente IPC (-1 a +1) */
  ipc: number;
  /** Porcentaje de riesgo no sistemático eliminado (0-100%) */
  riskRemoved: number;
}

/**
 * Calcula el Intraportfolio Correlation (IPC) de una cartera.
 *
 * Fórmula: IPC = Σ_i Σ_j (Wi × Wj × ρij)
 * donde Wi, Wj son los pesos normalizados (0-1) y ρij la correlación.
 *
 * Riesgo no sistemático eliminado = -0.5 × IPC + 0.5
 */
function calculateIPC(
  matrix: CorrelationMatrixType,
  holdings: PortfolioHolding[]
): IPCResult | null {
  // Mapear fundId → peso normalizado (0-1)
  const weightMap = new Map<string, number>();
  let totalWeight = 0;
  for (const h of holdings) {
    totalWeight += h.weight;
  }
  if (totalWeight <= 0) return null;

  // Acumular pesos por fundId (pueden repetirse)
  for (const h of holdings) {
    const prev = weightMap.get(h.fundId) || 0;
    weightMap.set(h.fundId, prev + h.weight / totalWeight);
  }

  // Solo usar los fondos que están en la matriz de correlaciones
  const fundIndices: { idx: number; weight: number }[] = [];
  for (const [fundId, weight] of weightMap) {
    const matrixIdx = matrix.fundIds.indexOf(fundId);
    if (matrixIdx !== -1) {
      fundIndices.push({ idx: matrixIdx, weight });
    }
  }

  if (fundIndices.length < 2) return null;

  // Renormalizar pesos solo con los fondos disponibles en la matriz
  const availableWeightSum = fundIndices.reduce((sum, f) => sum + f.weight, 0);
  if (availableWeightSum <= 0) return null;
  const normalized = fundIndices.map((f) => ({
    idx: f.idx,
    weight: f.weight / availableWeightSum,
  }));

  // IPC = Σ_i Σ_j (Wi × Wj × ρij)
  let ipc = 0;
  for (const fi of normalized) {
    for (const fj of normalized) {
      const rho = matrix.matrix[fi.idx]![fj.idx]!;
      ipc += fi.weight * fj.weight * rho;
    }
  }

  // Riesgo no sistemático eliminado por la diversificación
  const riskRemoved = (-0.5 * ipc + 0.5) * 100;

  return { ipc, riskRemoved };
}

/**
 * Obtiene el color de fondo según el valor de correlación
 */
function getCorrelationColor(corr: number): string {
  const absCorr = Math.abs(corr);

  if (absCorr >= 0.9) {
    return "bg-red-500 text-white";
  } else if (absCorr >= 0.7) {
    return "bg-orange-400 text-white";
  } else if (absCorr >= 0.5) {
    return "bg-yellow-400 text-slate-900";
  } else if (absCorr >= 0.3) {
    return "bg-emerald-300 text-slate-900";
  } else {
    return "bg-emerald-500 text-white";
  }
}

/**
 * Interpreta el nivel de correlación
 */
function getCorrelationLabel(corr: number): string {
  const absCorr = Math.abs(corr);
  const sign = corr < 0 ? "negativa" : "positiva";

  if (absCorr >= 0.9) {
    return `Muy alta ${sign}`;
  } else if (absCorr >= 0.7) {
    return `Alta ${sign}`;
  } else if (absCorr >= 0.5) {
    return `Moderada ${sign}`;
  } else if (absCorr >= 0.3) {
    return `Baja ${sign}`;
  } else {
    return `Muy baja`;
  }
}

/**
 * Componente de celda de la matriz
 */
function MatrixCell({
  value,
  isDiagonal,
  fundName1,
  fundName2,
}: {
  value: number;
  isDiagonal: boolean;
  fundName1: string;
  fundName2: string;
}) {
  const colorClass = isDiagonal ? "bg-slate-200 text-slate-500" : getCorrelationColor(value);
  const displayValue = isDiagonal ? "1.00" : value.toFixed(2);

  const tooltipContent = isDiagonal
    ? `${fundName1} consigo mismo`
    : `${fundName1} vs ${fundName2}: ${getCorrelationLabel(value)}`;

  return (
    <Tooltip content={tooltipContent}>
      <div
        className={`w-full h-full flex items-center justify-center text-xs sm:text-sm font-medium rounded transition-transform hover:scale-105 cursor-help ${colorClass}`}
        style={{ minHeight: "40px" }}
      >
        {displayValue}
      </div>
    </Tooltip>
  );
}

/**
 * Filtra la matriz de correlaciones para mostrar solo los fondos indicados
 */
function filterMatrix(
  matrix: CorrelationMatrixType,
  fundIds: string[]
): CorrelationMatrixType | null {
  // Encontrar los índices de los fondos solicitados que existen en la matriz
  const indices: number[] = [];
  const filteredFundIds: string[] = [];
  const filteredFundNames: string[] = [];

  for (const fid of fundIds) {
    const idx = matrix.fundIds.indexOf(fid);
    if (idx !== -1) {
      indices.push(idx);
      filteredFundIds.push(matrix.fundIds[idx]!);
      filteredFundNames.push(matrix.fundNames[idx]!);
    }
  }

  if (indices.length < 2) return null;

  // Construir sub-matriz
  const filteredMatrixData: number[][] = [];
  for (const i of indices) {
    const row: number[] = [];
    for (const j of indices) {
      row.push(matrix.matrix[i]![j]!);
    }
    filteredMatrixData.push(row);
  }

  // Construir entries filtrados
  const filteredEntries = matrix.entries.filter(
    (e) => fundIds.includes(e.fundId1) && fundIds.includes(e.fundId2)
  );

  return {
    fundIds: filteredFundIds,
    fundNames: filteredFundNames,
    matrix: filteredMatrixData,
    entries: filteredEntries,
  };
}

/**
 * Renderiza una tabla de correlaciones
 */
function MatrixTable({ matrix }: { matrix: CorrelationMatrixType }) {
  const n = matrix.fundIds.length;

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse border border-slate-300">
        <thead>
          <tr>
            <th className="min-w-[200px] sm:min-w-[280px] border border-slate-300 bg-slate-50"></th>
            {matrix.fundNames.map((name, i) => (
              <th
                key={`col-${i}`}
                className="border border-slate-300 bg-slate-50 p-1 align-bottom"
                style={{ minWidth: "56px", width: "56px", height: "120px" }}
              >
                <Tooltip content={name}>
                  <div
                    className="text-xs font-medium text-slate-600 cursor-help text-center leading-tight"
                    style={{
                      writingMode: "vertical-rl",
                      textOrientation: "mixed",
                      transform: "rotate(180deg)",
                      maxHeight: "112px",
                      overflow: "hidden"
                    }}
                  >
                    {name}
                  </div>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.fundNames.map((rowName, i) => (
            <tr key={`row-${i}`}>
              <td className="p-2 pr-3 text-right border border-slate-300 bg-slate-50" style={{ maxWidth: "260px" }}>
                <Tooltip content={rowName}>
                  <span className="text-xs font-medium text-slate-600 cursor-help leading-snug block">
                    {rowName}
                  </span>
                </Tooltip>
              </td>
              {matrix.matrix[i]!.map((value, j) => (
                <td key={`cell-${i}-${j}`} className="p-1 border border-slate-300" style={{ width: "52px", height: "44px" }}>
                  <MatrixCell
                    value={value}
                    isDiagonal={i === j}
                    fundName1={matrix.fundNames[i]!}
                    fundName2={matrix.fundNames[j]!}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Componente destacado del IPC — muestra el porcentaje de riesgo no sistemático eliminado
 */
function IPCDisplay({
  ipcA,
  ipcB,
  nameA,
  nameB,
  viewMode,
}: {
  ipcA: IPCResult | null;
  ipcB: IPCResult | null;
  nameA: string;
  nameB: string;
  viewMode: ViewMode;
}) {
  // Determinar qué IPC mostrar según el tab activo
  const showA = viewMode === "all" || viewMode === "portfolioA";
  const showB = viewMode === "all" || viewMode === "portfolioB";

  if (!ipcA && !ipcB) return null;
  if (viewMode === "portfolioA" && !ipcA) return null;
  if (viewMode === "portfolioB" && !ipcB) return null;

  const getRiskColor = (riskRemoved: number) => {
    if (riskRemoved >= 30) return "text-emerald-600";
    if (riskRemoved >= 15) return "text-amber-600";
    return "text-red-600";
  };

  const getRiskBg = (riskRemoved: number) => {
    if (riskRemoved >= 30) return "from-emerald-50 to-emerald-100/50 border-emerald-200";
    if (riskRemoved >= 15) return "from-amber-50 to-amber-100/50 border-amber-200";
    return "from-red-50 to-red-100/50 border-red-200";
  };

  const getRiskLabel = (riskRemoved: number) => {
    if (riskRemoved >= 40) return "Excelente diversificación";
    if (riskRemoved >= 30) return "Buena diversificación";
    if (riskRemoved >= 20) return "Diversificación moderada";
    if (riskRemoved >= 10) return "Diversificación limitada";
    return "Baja diversificación";
  };

  const renderIPCCard = (ipc: IPCResult, portfolioName: string, color: string) => (
    <div
      className={`flex-1 bg-gradient-to-br ${getRiskBg(ipc.riskRemoved)} border rounded-xl p-4 sm:p-5`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${color}`}
            />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {portfolioName}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl sm:text-3xl font-bold ${getRiskColor(ipc.riskRemoved)}`}>
              {formatNumber(ipc.riskRemoved, 1)}%
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            de riesgo no sistemático eliminado
          </p>
        </div>
        <Tooltip
          content={`IPC (Intraportfolio Correlation) = ${ipc.ipc.toFixed(4)}. Mide cuánto riesgo diversificable elimina la combinación de activos. Cuanto mayor es el porcentaje, mejor está diversificada la cartera.`}
        >
          <div className="flex flex-col items-end gap-1">
            <svg
              className="w-4 h-4 text-slate-400 cursor-help"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[10px] text-slate-400 font-mono">
              IPC: {ipc.ipc.toFixed(3)}
            </span>
          </div>
        </Tooltip>
      </div>
      <div className="mt-3">
        {/* Barra de progreso visual */}
        <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              ipc.riskRemoved >= 30
                ? "bg-emerald-500"
                : ipc.riskRemoved >= 15
                ? "bg-amber-500"
                : "bg-red-500"
            }`}
            style={{ width: `${Math.min(Math.max(ipc.riskRemoved, 0), 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className={`text-xs font-medium ${getRiskColor(ipc.riskRemoved)}`}>
            {getRiskLabel(ipc.riskRemoved)}
          </span>
          <span className="text-[10px] text-slate-400">0% — 50%</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <h4 className="text-sm font-semibold text-slate-700">
          Beneficio de la diversificación
        </h4>
        <Tooltip content="El IPC (Intraportfolio Correlation) mide la correlación interna de la cartera. Cuanto menor es el IPC, mayor porcentaje de riesgo no sistemático (diversificable) elimina la combinación de activos.">
          <svg
            className="w-3.5 h-3.5 text-slate-400 cursor-help"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </Tooltip>
      </div>
      <div className="flex gap-3">
        {showA && ipcA && renderIPCCard(ipcA, nameA, "bg-blue-500")}
        {showB && ipcB && renderIPCCard(ipcB, nameB, "bg-rose-500")}
      </div>
    </div>
  );
}

/**
 * Resumen estadístico de una matriz de correlaciones
 */
function MatrixSummary({ matrix }: { matrix: CorrelationMatrixType }) {
  const avgCorrelation = useMemo(() => {
    if (matrix.entries.length === 0) return 0;
    const sum = matrix.entries.reduce((acc, e) => acc + e.correlation, 0);
    return sum / matrix.entries.length;
  }, [matrix]);

  const { minPair, maxPair } = useMemo(() => {
    if (matrix.entries.length === 0) return { minPair: null, maxPair: null };
    let min = matrix.entries[0]!;
    let max = matrix.entries[0]!;
    for (const entry of matrix.entries) {
      if (entry.correlation < min.correlation) min = entry;
      if (entry.correlation > max.correlation) max = entry;
    }
    return { minPair: min, maxPair: max };
  }, [matrix]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
      <div className="flex flex-col">
        <span className="text-slate-500">Correlación promedio</span>
        <span className={`font-semibold ${avgCorrelation > 0.7 ? "text-red-600" : avgCorrelation > 0.5 ? "text-amber-600" : "text-emerald-600"}`}>
          {avgCorrelation.toFixed(2)}
        </span>
      </div>
      {minPair && (
        <div className="flex flex-col">
          <span className="text-slate-500">Menor correlación</span>
          <span className="font-semibold text-emerald-600">
            {minPair.correlation.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500 leading-snug">
            {minPair.name1}
          </span>
          <span className="text-xs text-slate-500 leading-snug">
            {minPair.name2}
          </span>
        </div>
      )}
      {maxPair && (
        <div className="flex flex-col">
          <span className="text-slate-500">Mayor correlación</span>
          <span className={`font-semibold ${maxPair.correlation > 0.8 ? "text-red-600" : "text-amber-600"}`}>
            {maxPair.correlation.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500 leading-snug">
            {maxPair.name1}
          </span>
          <span className="text-xs text-slate-500 leading-snug">
            {maxPair.name2}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Componente principal de la matriz de correlaciones
 */
export function CorrelationMatrix({
  results,
  isLoading,
  portfolioAFundIds = [],
  portfolioBFundIds = [],
  portfolioAHoldings = [],
  portfolioBHoldings = [],
  portfolioAName = "Cartera A",
  portfolioBName = "Cartera B",
}: CorrelationMatrixProps) {
  const fullMatrix = results.correlationMatrix;
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  // Determinar qué tabs mostrar
  const hasTwoPortfolios = portfolioAFundIds.length >= 2 && portfolioBFundIds.length >= 2;
  const hasPortfolioA = portfolioAFundIds.length >= 2;
  const hasPortfolioB = portfolioBFundIds.length >= 2;

  // Filtrar warnings de activos excluidos
  const excludedWarnings = useMemo(() => {
    return (results.warnings || []).filter(
      (w) => w.type === "asset_excluded" && w.message.includes("correlaciones")
    );
  }, [results.warnings]);

  // Matrices filtradas por cartera
  const matrixA = useMemo(() => {
    if (!fullMatrix || !hasPortfolioA) return null;
    return filterMatrix(fullMatrix, portfolioAFundIds);
  }, [fullMatrix, portfolioAFundIds, hasPortfolioA]);

  const matrixB = useMemo(() => {
    if (!fullMatrix || !hasPortfolioB) return null;
    return filterMatrix(fullMatrix, portfolioBFundIds);
  }, [fullMatrix, portfolioBFundIds, hasPortfolioB]);

  // Calcular IPC para cada cartera
  const ipcA = useMemo(() => {
    if (!fullMatrix || portfolioAHoldings.length < 2) return null;
    return calculateIPC(fullMatrix, portfolioAHoldings);
  }, [fullMatrix, portfolioAHoldings]);

  const ipcB = useMemo(() => {
    if (!fullMatrix || portfolioBHoldings.length < 2) return null;
    return calculateIPC(fullMatrix, portfolioBHoldings);
  }, [fullMatrix, portfolioBHoldings]);

  // Matriz activa según el tab
  const activeMatrix = useMemo(() => {
    if (viewMode === "portfolioA" && matrixA) return matrixA;
    if (viewMode === "portfolioB" && matrixB) return matrixB;
    return fullMatrix;
  }, [viewMode, matrixA, matrixB, fullMatrix]);

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="h-48 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!fullMatrix || fullMatrix.fundIds.length < 2) return null;
  if (!activeMatrix) return null;

  const showTabs = hasPortfolioA || hasPortfolioB;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-slate-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-slate-900">
              Matriz de Correlaciones
            </h3>
            <Tooltip content="Muestra la correlación entre los retornos mensuales de cada par de activos. Valores cercanos a 0 indican mayor diversificación.">
              <svg
                className="w-4 h-4 text-slate-400 cursor-help"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            </Tooltip>
          </div>
          <span className="text-sm text-slate-500">
            {activeMatrix.fundIds.length} activos analizados
          </span>
        </div>

        {/* Tabs de vista */}
        {showTabs && (
          <div className="flex gap-1 mt-3 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("all")}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                viewMode === "all"
                  ? "bg-white text-brand-navy shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Todas
            </button>
            {hasPortfolioA && (
              <button
                onClick={() => setViewMode("portfolioA")}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  viewMode === "portfolioA"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {portfolioAName.length > 20 ? portfolioAName.substring(0, 18) + "..." : portfolioAName}
              </button>
            )}
            {hasPortfolioB && (
              <button
                onClick={() => setViewMode("portfolioB")}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  viewMode === "portfolioB"
                    ? "bg-white text-rose-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {portfolioBName.length > 20 ? portfolioBName.substring(0, 18) + "..." : portfolioBName}
              </button>
            )}
          </div>
        )}
      </div>

      {/* IPC + Matriz */}
      <div className="p-4 sm:p-6">
        {/* Beneficio de la diversificación (IPC) */}
        <IPCDisplay
          ipcA={ipcA}
          ipcB={ipcB}
          nameA={portfolioAName}
          nameB={portfolioBName}
          viewMode={viewMode}
        />

        <MatrixTable matrix={activeMatrix} />

        {/* Leyenda de colores */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-emerald-500"></div>
            <span>&lt; 0.3 (Muy baja)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-emerald-300"></div>
            <span>0.3 - 0.5 (Baja)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-yellow-400"></div>
            <span>0.5 - 0.7 (Moderada)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-orange-400"></div>
            <span>0.7 - 0.9 (Alta)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-red-500"></div>
            <span>&gt; 0.9 (Muy alta)</span>
          </div>
        </div>
      </div>

      {/* Resumen de correlaciones */}
      <div className="px-4 sm:px-6 py-4 bg-slate-50 border-t border-slate-200">
        <MatrixSummary matrix={activeMatrix} />

        {/* Avisos de activos excluidos */}
        {excludedWarnings.length > 0 && viewMode === "all" && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex gap-2">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-xs text-amber-700">
                {excludedWarnings.map((w, i) => (
                  <p key={i}>{w.message}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Nota sobre diversificación */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <div className="flex gap-2">
            <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <p className="text-xs text-blue-700">
              <strong>Diversificación:</strong> Correlaciones bajas (&lt; 0.5) entre activos mejoran la diversificación de la cartera,
              reduciendo el riesgo sin sacrificar rentabilidad. Correlaciones altas (&gt; 0.7) indican que los activos se mueven
              de forma similar, ofreciendo menor beneficio de diversificación.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
