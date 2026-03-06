"use client";

import { useMemo } from "react";
import type { BacktestResponse } from "@/lib/types";
import { Tooltip } from "./Tooltip";

interface CorrelationMatrixProps {
  results: BacktestResponse;
  isLoading?: boolean;
}

/**
 * Obtiene el color de fondo según el valor de correlación
 * - Verde: correlación baja (buena diversificación)
 * - Amarillo: correlación media
 * - Rojo: correlación alta (poca diversificación)
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
 * Componente principal de la matriz de correlaciones
 */
export function CorrelationMatrix({ results, isLoading }: CorrelationMatrixProps) {
  const matrix = results.correlationMatrix;

  // Filtrar warnings de activos excluidos de la correlación
  const excludedWarnings = useMemo(() => {
    return (results.warnings || []).filter(
      (w) => w.type === "asset_excluded" && w.message.includes("correlaciones")
    );
  }, [results.warnings]);

  // Calcular la correlación promedio (excluyendo diagonal)
  const avgCorrelation = useMemo(() => {
    if (!matrix || matrix.entries.length === 0) return 0;
    const sum = matrix.entries.reduce((acc, e) => acc + e.correlation, 0);
    return sum / matrix.entries.length;
  }, [matrix]);

  // Encontrar pares con menor y mayor correlación
  const { minPair, maxPair } = useMemo(() => {
    if (!matrix || matrix.entries.length === 0) {
      return { minPair: null, maxPair: null };
    }

    let min = matrix.entries[0]!;
    let max = matrix.entries[0]!;

    for (const entry of matrix.entries) {
      if (entry.correlation < min.correlation) min = entry;
      if (entry.correlation > max.correlation) max = entry;
    }

    return { minPair: min, maxPair: max };
  }, [matrix]);

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

  // No mostrar si no hay matriz o tiene menos de 2 activos
  if (!matrix || matrix.fundIds.length < 2) {
    return null;
  }

  const n = matrix.fundIds.length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
            {n} activos analizados
          </span>
        </div>
      </div>

      {/* Matriz */}
      <div className="p-4 sm:p-6 overflow-x-auto">
        <table className="border-collapse border border-slate-300">
          <thead>
            <tr>
              {/* Celda vacía esquina superior izquierda */}
              <th className="min-w-[160px] sm:min-w-[220px] border border-slate-300 bg-slate-50"></th>
              {/* Headers de columnas */}
              {matrix.fundNames.map((name, i) => (
                <th
                  key={`col-${i}`}
                  className="border border-slate-300 bg-slate-50 p-1 align-bottom"
                  style={{ minWidth: "56px", width: "56px", height: "100px" }}
                >
                  <Tooltip content={name}>
                    <div
                      className="text-xs font-medium text-slate-600 cursor-help text-center leading-tight"
                      style={{
                        writingMode: "vertical-rl",
                        textOrientation: "mixed",
                        transform: "rotate(180deg)",
                        maxHeight: "92px",
                        overflow: "hidden"
                      }}
                    >
                      {name.length > 25 ? `${name.substring(0, 25)}...` : name}
                    </div>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.fundNames.map((rowName, i) => (
              <tr key={`row-${i}`}>
                {/* Header de fila - nombre completo alineado a la derecha */}
                <td className="p-2 pr-3 text-right border border-slate-300 bg-slate-50">
                  <Tooltip content={rowName}>
                    <span className="text-xs font-medium text-slate-600 cursor-help whitespace-nowrap">
                      {rowName.length > 30 ? `${rowName.substring(0, 30)}...` : rowName}
                    </span>
                  </Tooltip>
                </td>
                {/* Celdas de correlación */}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {/* Correlación promedio */}
          <div className="flex flex-col">
            <span className="text-slate-500">Correlación promedio</span>
            <span className={`font-semibold ${avgCorrelation > 0.7 ? "text-red-600" : avgCorrelation > 0.5 ? "text-amber-600" : "text-emerald-600"}`}>
              {avgCorrelation.toFixed(2)}
            </span>
          </div>

          {/* Par con menor correlación */}
          {minPair && (
            <div className="flex flex-col">
              <span className="text-slate-500">Menor correlación</span>
              <span className="font-semibold text-emerald-600">
                {minPair.correlation.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400 truncate" title={`${minPair.name1} / ${minPair.name2}`}>
                {minPair.name1} / {minPair.name2}
              </span>
            </div>
          )}

          {/* Par con mayor correlación */}
          {maxPair && (
            <div className="flex flex-col">
              <span className="text-slate-500">Mayor correlación</span>
              <span className={`font-semibold ${maxPair.correlation > 0.8 ? "text-red-600" : "text-amber-600"}`}>
                {maxPair.correlation.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400 truncate" title={`${maxPair.name1} / ${maxPair.name2}`}>
                {maxPair.name1} / {maxPair.name2}
              </span>
            </div>
          )}
        </div>

        {/* Avisos de activos excluidos */}
        {excludedWarnings.length > 0 && (
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
