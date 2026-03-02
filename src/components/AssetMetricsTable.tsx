"use client";

import type { BacktestResponse, AssetMetrics } from "@/lib/types";
import { Tooltip } from "./Tooltip";

interface AssetMetricsTableProps {
  results: BacktestResponse;
  isLoading?: boolean;
}

/**
 * Formatea un porcentaje con color según el valor
 */
function formatPercent(value: number, invert = false): { text: string; color: string } {
  const percent = (value * 100).toFixed(2);
  let color = "text-slate-600";

  if (invert) {
    // Para drawdown: más negativo es peor (rojo)
    if (value < -0.2) color = "text-red-600";
    else if (value < -0.1) color = "text-orange-500";
    else if (value < -0.05) color = "text-amber-500";
    else color = "text-emerald-600";
  } else {
    // Para retornos: más positivo es mejor (verde)
    if (value > 0.1) color = "text-emerald-600";
    else if (value > 0.05) color = "text-emerald-500";
    else if (value > 0) color = "text-slate-600";
    else if (value > -0.05) color = "text-amber-500";
    else color = "text-red-600";
  }

  return { text: `${percent}%`, color };
}

/**
 * Formatea el ratio de Sharpe con color
 */
function formatSharpe(value: number): { text: string; color: string } {
  const formatted = value.toFixed(2);
  let color = "text-slate-600";

  if (value >= 1) color = "text-emerald-600";
  else if (value >= 0.5) color = "text-emerald-500";
  else if (value >= 0) color = "text-amber-500";
  else color = "text-red-600";

  return { text: formatted, color };
}

// =============================================================================
// Índice Saqueo: TER / CAGR
// Mide qué porcentaje de tus ganancias anuales se las lleva el banco en comisiones
// =============================================================================

interface SaqueoResult {
  text: string;
  color: string;
  bgColor: string;
  label: string;
  emoji: string;
}

/**
 * Calcula y formatea el Índice Saqueo
 *
 * Fórmula: TER / (min(Volatilidad, 15%) × 0.75)
 *
 * - TER: comisión anual del fondo (%, ej: 0.20)
 * - Volatilidad: volatilidad anualizada (decimal, ej: 0.12 para 12%)
 * - 0.75: ratio rentabilidad/riesgo del S&P 500 (estimación optimista)
 * - Tope de volatilidad al 15% para no inflar artificialmente el denominador
 *
 * El resultado mide qué porcentaje de la rentabilidad esperada
 * (según el riesgo asumido) se la lleva el gestor en comisiones.
 */
function calculateSaqueo(ter: number, volatility: number): SaqueoResult {
  // Volatilidad en porcentaje, con tope del 15%
  const volPercent = Math.min(volatility * 100, 15);

  // Rentabilidad esperada = volatilidad × 0.75 (ratio rtb/riesgo del S&P 500)
  const expectedReturn = volPercent * 0.75;

  // Si la rentabilidad esperada es ~0: Saqueo Total
  if (expectedReturn <= 0.01) {
    return {
      text: "\u221E",
      color: "text-red-700",
      bgColor: "bg-red-100",
      label: "Saqueo Total: pagas comisiones sin rentabilidad esperada",
      emoji: "\uD83C\uDFF4\u200D\u2620\uFE0F",
    };
  }

  // Ratio: TER / rentabilidad esperada (como porcentaje)
  const ratio = (ter / expectedReturn) * 100;

  if (ratio <= 1) {
    return {
      text: `${ratio.toFixed(1)}%`,
      color: "text-emerald-700",
      bgColor: "bg-emerald-50",
      label: "Excelente: las comisiones apenas impactan la rentabilidad esperada",
      emoji: "\uD83D\uDE0E",
    };
  } else if (ratio <= 5) {
    return {
      text: `${ratio.toFixed(1)}%`,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      label: "Muy bien: comisiones bajas respecto a la rentabilidad esperada",
      emoji: "\uD83D\uDC4D",
    };
  } else if (ratio <= 10) {
    return {
      text: `${ratio.toFixed(1)}%`,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      label: "Aceptable: las comisiones son razonables para el riesgo asumido",
      emoji: "\uD83D\uDE42",
    };
  } else if (ratio <= 20) {
    return {
      text: `${ratio.toFixed(1)}%`,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      label: "Peligro: una parte importante de la rentabilidad esperada va a comisiones",
      emoji: "\u26A0\uFE0F",
    };
  } else {
    return {
      text: `${ratio.toFixed(1)}%`,
      color: "text-red-700",
      bgColor: "bg-red-100",
      label: "Atraco: el banco se queda con una tajada enorme de lo que podr\u00EDas ganar",
      emoji: "\uD83C\uDFF4\u200D\u2620\uFE0F",
    };
  }
}

/**
 * Construye la URL de búsqueda en Morningstar para un activo
 */
function getMorningstarSearchUrl(asset: AssetMetrics): string {
  const query = asset.isin || asset.yahooTicker || asset.name;
  return `https://www.morningstar.com/search?query=${encodeURIComponent(query)}`;
}

export function AssetMetricsTable({ results, isLoading }: AssetMetricsTableProps) {
  const metrics = results.assetMetrics;

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

  // No mostrar si no hay métricas
  if (!metrics || metrics.length === 0) {
    return null;
  }

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
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-slate-900">
              M&eacute;tricas por Activo
            </h3>
            <Tooltip content="M&eacute;tricas de rendimiento calculadas para cada activo individual durante el per&iacute;odo del backtest.">
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
            {metrics.length} activos
          </span>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Activo
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Tooltip content="Rentabilidad total acumulada durante el per&iacute;odo">
                  <span className="cursor-help">Rent. Total</span>
                </Tooltip>
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Tooltip content="Tasa de Crecimiento Anual Compuesto (CAGR)">
                  <span className="cursor-help">CAGR</span>
                </Tooltip>
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Tooltip content="Total Expense Ratio: comisi&oacute;n anual del fondo">
                  <span className="cursor-help">TER</span>
                </Tooltip>
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Tooltip content="&Iacute;ndice Saqueo = TER / (min(Vol,15%) &times; 0.75). Mide qu&eacute; porcentaje de la rentabilidad esperada (seg&uacute;n el riesgo asumido) se la lleva el banco. A menor valor, mejor para ti.">
                  <span className="cursor-help whitespace-nowrap">&Iacute;nd. Saqueo</span>
                </Tooltip>
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Tooltip content="Volatilidad anualizada (desviaci&oacute;n est&aacute;ndar de retornos mensuales &times; &radic;12)">
                  <span className="cursor-help">Volatilidad</span>
                </Tooltip>
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Tooltip content="M&aacute;xima ca&iacute;da desde un pico hasta el siguiente valle">
                  <span className="cursor-help">Max DD</span>
                </Tooltip>
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Tooltip content="Ratio de Sharpe: (CAGR - tasa libre de riesgo) / volatilidad. Valores &gt; 1 son buenos.">
                  <span className="cursor-help">Sharpe</span>
                </Tooltip>
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Tooltip content="N&uacute;mero de meses de datos disponibles">
                  <span className="cursor-help">Meses</span>
                </Tooltip>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {metrics.map((asset, index) => {
              const totalReturn = formatPercent(asset.totalReturn);
              const cagr = formatPercent(asset.cagr);
              const volatility = formatPercent(asset.volatility);
              const maxDD = formatPercent(asset.maxDrawdown, true);
              const sharpe = formatSharpe(asset.sharpe);
              const saqueo = calculateSaqueo(asset.ter, asset.volatility);

              return (
                <tr
                  key={asset.fundId}
                  className={index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <a
                        href={getMorningstarSearchUrl(asset)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline transition-colors"
                        title={`Ver en Morningstar: ${asset.name}`}
                      >
                        {asset.name}
                        <svg className="inline-block w-3 h-3 ml-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                      {asset.yahooTicker && (
                        <span className="text-xs text-slate-400">{asset.yahooTicker}{asset.isin && asset.isin !== asset.yahooTicker ? ` \u00B7 ${asset.isin}` : ''}</span>
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${totalReturn.color}`}>
                    {totalReturn.text}
                  </td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${cagr.color}`}>
                    {cagr.text}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">
                    {asset.ter.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Tooltip content={`${saqueo.emoji} ${saqueo.label}`}>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-bold cursor-help ${saqueo.color} ${saqueo.bgColor}`}>
                        {saqueo.text}
                      </span>
                    </Tooltip>
                  </td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${volatility.color}`}>
                    {volatility.text}
                  </td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${maxDD.color}`}>
                    {maxDD.text}
                  </td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${sharpe.color}`}>
                    {sharpe.text}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-500">
                    {asset.months}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Leyenda del Índice Saqueo */}
      <div className="px-4 sm:px-6 py-4 bg-slate-50 border-t border-slate-200">
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Escala del &Iacute;ndice Saqueo &mdash; TER / (min(Vol,15%) &times; 0.75)
          </h4>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
              &le;1% Excelente
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-600">
              1-5% Muy bien
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-600">
              5-10% Aceptable
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-50 text-orange-600">
              10-20% Peligro
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700">
              &gt;20% Atraco
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700">
              &infin; Saqueo Total
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          <strong>Nota:</strong> El &Iacute;ndice Saqueo estima qu&eacute; parte de la rentabilidad esperada se la lleva el gestor.
          Se usa el ratio rentabilidad/riesgo del S&amp;P 500 (0.75) como referencia optimista, y la volatilidad se limita al 15%.
          Un 10% significa que de cada euro que esperas ganar, 10 c&eacute;ntimos van al banco.
        </p>

        {/* Glosario de términos */}
        <div className="border-t border-slate-200 pt-3">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Glosario
          </h4>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-500">
            <div>
              <dt className="font-medium text-slate-600 inline">Rent. Total: </dt>
              <dd className="inline">Ganancia o p&eacute;rdida acumulada en todo el periodo analizado.</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600 inline">CAGR: </dt>
              <dd className="inline">Tasa de crecimiento anual compuesto. Rentabilidad media anualizada.</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600 inline">TER: </dt>
              <dd className="inline">Total Expense Ratio. Comisi&oacute;n anual que cobra el fondo sobre el patrimonio.</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600 inline">&Iacute;nd. Saqueo: </dt>
              <dd className="inline">Porcentaje de la rentabilidad esperada que se lleva el gestor en comisiones.</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600 inline">Volatilidad: </dt>
              <dd className="inline">Medida de la variaci&oacute;n del precio. A mayor volatilidad, mayor riesgo.</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600 inline">Max DD: </dt>
              <dd className="inline">M&aacute;ximo drawdown. La mayor ca&iacute;da desde un m&aacute;ximo hasta el siguiente m&iacute;nimo.</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600 inline">Sharpe: </dt>
              <dd className="inline">Rentabilidad obtenida por cada unidad de riesgo asumido. Mayor de 1 es bueno.</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600 inline">Meses: </dt>
              <dd className="inline">N&uacute;mero de meses con datos disponibles en el periodo seleccionado.</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
