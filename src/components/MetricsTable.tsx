"use client";

import { useState } from "react";
import type { BacktestResponse, BacktestResult, DisplayGranularity } from "@/lib/types";
import { formatEUR, formatPct, formatPctNoSign, formatRatio } from "@/lib/formatters";
import { Tooltip } from "./Tooltip";
import { computeTaxOnGain, type TaxMode } from "@/lib/tax-utils";

// Modo de visualización del valor final. Hereda al impuestos pendientes:
//   - "bruto": antes de cualquier impuesto (la cifra del folleto)
//   - "camino": ya descontados los impuestos pagados en rebalanceos (lo que
//     ves en la app del broker)
//   - "liquidar": descontando también los pendientes (lo que de verdad te llevas)
export type ValueMode = "bruto" | "camino" | "liquidar";

// ============================================================================
// HELPERS DE INTERPRETACIÓN — texto explicativo según el valor concreto
// ============================================================================

// Umbrales de Bulmer (1979), estándar en la literatura estadística:
//   |skew| < 0.5   → aproximadamente simétrica
//   0.5 ≤ |skew| < 1 → moderadamente asimétrica
//   |skew| ≥ 1     → muy asimétrica
function interpretSkewness(value: number): string {
  const abs = Math.abs(value);
  if (abs < 0.5) return "Aproximadamente simétrica — distribución similar a una normal.";
  if (abs < 1) {
    return value < 0
      ? "Moderadamente asimétrica negativa — cola izquierda algo más pesada que la derecha."
      : "Moderadamente asimétrica positiva — cola derecha algo más pesada que la izquierda.";
  }
  return value < 0
    ? "Muy asimétrica negativa — pérdidas extremas pesan claramente más que las ganancias extremas en la distribución."
    : "Muy asimétrica positiva — ganancias extremas pesan claramente más que las pérdidas en la distribución.";
}

// Umbrales para curtosis en exceso (kurtosis - 3):
//   |EK| < 0.5  → mesocúrtica (≈ normal)
//   0.5 ≤ |EK| < 1 → ligeramente leptocúrtica/platocúrtica
//   1 ≤ |EK| < 3   → moderadamente leptocúrtica (colas gordas)
//   |EK| ≥ 3    → muy leptocúrtica (colas extremadamente gordas)
function interpretKurtosis(value: number): string {
  const abs = Math.abs(value);
  if (abs < 0.5) return "≈ normal — eventos extremos como predice una distribución gaussiana.";
  if (abs < 1) {
    return value > 0
      ? "Ligeramente leptocúrtica — eventos extremos un poco más frecuentes que en una normal."
      : "Ligeramente platocúrtica — eventos extremos un poco menos frecuentes que en una normal.";
  }
  if (abs < 3) {
    return value > 0
      ? "Moderadamente leptocúrtica — colas gordas; los eventos extremos son notablemente más frecuentes que en una normal."
      : "Moderadamente platocúrtica — colas finas; los eventos extremos son poco frecuentes.";
  }
  return value > 0
    ? "Muy leptocúrtica — colas extremadamente gordas. Cisnes negros mucho más probables que en una normal; la volatilidad subestima el riesgo de tail."
    : "Muy platocúrtica — distribución casi sin colas, prácticamente todos los retornos cerca de la media.";
}

function interpretCalmar(value: number): string {
  if (value < 0) return "Negativo — la cartera pierde dinero en media.";
  if (value < 0.3) return "Bajo — rentabilidad escasa por unidad de pérdida máxima sufrida.";
  if (value < 0.5) return "Moderado — aceptable para carteras conservadoras.";
  if (value < 1) return "Bueno — buena recompensa por el riesgo de drawdown.";
  return "Excelente — alta rentabilidad relativa a la peor caída.";
}

interface MetricsTableProps {
  results: BacktestResponse;
  isLoading: boolean;
  /** Modo de visualización del valor (controlado desde el padre) */
  valueMode: ValueMode;
  /** Callback para cambiar el modo */
  onValueModeChange: (mode: ValueMode) => void;
}

// Mapeo de granularidad a etiquetas
const GRANULARITY_LABELS: Record<DisplayGranularity, { singular: string; plural: string }> = {
  daily: { singular: "día", plural: "días" },
  monthly: { singular: "mes", plural: "meses" },
  quarterly: { singular: "trimestre", plural: "trimestres" },
};

// Tooltips en español para cada métrica
function buildTooltips(granularity: DisplayGranularity) {
  const { singular, plural } = GRANULARITY_LABELS[granularity];
  return {
    finalValue:
      "Valor según el modo elegido en el selector de arriba:\n\n• Bruto: antes de descontar ningún impuesto (la cifra que aparece en los folletos comerciales). Siempre descuenta TER y comisión de gestión.\n\n• Neta del camino: lo que ves hoy en la app de tu broker. Descuenta los impuestos ya pagados en cada rebalanceo (si configuraste un régimen fiscal en tu cartera).\n\n• Al liquidar: lo que de verdad te llevas al bolsillo si vendieras todo hoy. Descuenta también los impuestos pendientes sobre la plusvalía latente.\n\nIMPORTANTE: los tres modos solo dan números distintos si en tu cartera configuraste fiscalidad (IRPF España, tasa fija…). Si dejaste la fiscalidad en 'Sin impuestos', los tres valores coinciden porque nunca se han descontado ni se descontarán impuestos en la simulación.",
    totalReturn:
      "Rentabilidad total acumulada (TWRR). Encadena los retornos diarios eliminando el efecto de las aportaciones, así que mide únicamente lo que ha rentado la cartera — no el dinero que tú has metido. Es la métrica estándar de los fondos y la única comparable con un benchmark.",
    cagr:
      "Rentabilidad media anual compuesta, derivada del TWRR. NO incluye el efecto de las aportaciones — refleja solo lo que la cartera ha rentado, no el dinero aportado por ti. Si meterías 1.000€/mes y el valor final fuera la suma exacta de tus aportaciones, el CAGR sería 0% (no la suma de aportaciones convertida en 'rentabilidad ficticia').",
    volatility:
      `Desviación estándar anualizada de los retornos ${plural === "días" ? "diarios" : plural === "meses" ? "mensuales" : "trimestrales"}. Mide cuánto fluctúa el valor de tu cartera durante el periodo seleccionado.`,
    sharpe:
      "Rentabilidad ajustada al riesgo. Mayor de 1 es bueno, mayor de 2 es excelente. Considera la tasa libre de riesgo del 1%.",
    sortino:
      "Similar al Sharpe, pero solo penaliza la volatilidad negativa (caídas). Más relevante si te preocupan las pérdidas.",
    maxDrawdown:
      "La peor caída desde un máximo histórico. Mide cuánto podrías haber perdido si hubieras invertido en el peor momento posible.",
    bestMonth:
      `El mejor ${singular} del periodo. Muestra el potencial alcista de la cartera.`,
    worstMonth:
      `El peor ${singular} del periodo. Muestra el riesgo de pérdida en un mal ${singular}.`,
    positiveMonthsRatio:
      `Porcentaje de ${plural} con rentabilidad positiva. Mayor porcentaje indica más consistencia.`,
    totalFees:
      "Coste total acumulado real: TER + comisión de gestión + impuestos adelantados (plusvalías ya realizadas en rebalanceos) + impuestos pendientes (lo que tributaría la plusvalía latente si liquidaras al final). Es la métrica más conservadora porque asume que algún día venderás la cartera.",
    calmar:
      "Calmar Ratio = CAGR / |Máximo Drawdown|. Mide cuánta rentabilidad anual obtienes por cada 1% de la peor caída sufrida. >0.5 es bueno, >1 es excelente. Más intuitivo que el Sharpe para inversores que temen las pérdidas grandes.",
    skewness:
      `Asimetría de la distribución de retornos ${plural === "meses" ? "mensuales" : plural === "días" ? "diarios" : "trimestrales"}. 0 = simétrica como una distribución normal. Negativa = cola izquierda más larga (pérdidas extremas más frecuentes que ganancias extremas — típico en banca privada y fondos de seguros que venden cisnes negros). Positiva = cola derecha más larga (loterías, momentum).`,
    excessKurtosis:
      "Curtosis en exceso = kurtosis - 3. Mide la probabilidad de eventos extremos vs una distribución normal. 0 = normal. >0 = colas gordas (cisnes negros más probables de lo que sugiere la volatilidad). Una cartera con baja vol pero alta kurtosis ESCONDE riesgo de cola.",
    varHistorical:
      `Value at Risk al 5%: el peor retorno del 5% de los peores ${plural}. Ejemplo: VaR -8% significa que en el 5% de los peores ${plural}, la cartera perdió al menos 8%. Probabilidad esperada de empeorar este valor: 5%.`,
    cvar:
      `Conditional VaR / Expected Shortfall al 5%: la pérdida MEDIA en el peor 5% de los ${plural} (no el umbral, sino la media de la cola). Métrica más conservadora que VaR — captura cuánto pierdes EN MEDIA cuando ocurre un mal escenario, no solo el límite. Estándar regulatorio Basel III.`,
  };
}

// Definición de métricas con dirección
interface MetricConfig {
  key: string;
  label: string;
  getValue: (result: BacktestResult) => number;
  format: (value: number) => string;
  higherIsBetter: boolean;
  tooltip: string;
  isHero?: boolean; // Métricas destacadas en cards grandes
  /** Función opcional que devuelve un texto interpretando el valor concreto */
  interpret?: (value: number) => string;
  /** Sub-texto opcional (línea pequeña bajo el valor en hero cards), útil para
   *  contextualizar (ej: valor tras liquidar, etc.) */
  getSubText?: (result: BacktestResult) => string | null;
}

function buildMetricsConfig(
  granularity: DisplayGranularity,
  valueMode: ValueMode,
  effectivePending: (r: BacktestResult) => number
): MetricConfig[] {
  const tooltips = buildTooltips(granularity);
  const { singular, plural } = GRANULARITY_LABELS[granularity];
  const pluralCap = plural.charAt(0).toUpperCase() + plural.slice(1);

  // Helpers que aplican el modo de visualización elegido. La hero card de
  // "Valor final" cambia su VALOR PRINCIPAL según el modo. Los sub-textos
  // muestran las otras dos variantes para que el alumno tenga contexto.
  const finalValueLabel: Record<ValueMode, string> = {
    bruto: "Valor bruto",
    camino: "Valor neto camino",
    liquidar: "Valor al liquidar",
  };
  const valueByMode = (r: BacktestResult, mode: ValueMode): number => {
    const paid = r.fees.totalTaxesPaid ?? 0;
    const pending = effectivePending(r);
    if (mode === "bruto") return r.finalValue + paid;
    if (mode === "camino") return r.finalValue;
    return r.finalValue - pending; // "liquidar"
  };

  // Factor de escalado del cumulative TWRR según el modo. Permite re-derivar
  // CAGR, totalReturn, Sharpe, Sortino y Calmar de manera coherente al modo
  // elegido. La aproximación asume que el "drag" fiscal (modo bruto) o el
  // pago al liquidar (modo liquidar) impactan el factor multiplicativo final.
  //   - "camino"  → factor 1 (TWRR tal cual lo calcula el motor)
  //   - "bruto"   → escalar al alza por (1 + paid/final)
  //   - "liquidar"→ escalar a la baja por (1 − pending/final)
  // Es una aproximación pedagógicamente útil — los números son coherentes
  // con el valor mostrado en la card "Valor".
  const scaleFactor = (r: BacktestResult, mode: ValueMode): number => {
    if (mode === "camino") return 1;
    const finalVal = r.finalValue;
    if (finalVal <= 0) return 1;
    const paid = r.fees.totalTaxesPaid ?? 0;
    const pending = effectivePending(r);
    return mode === "bruto"
      ? (finalVal + paid) / finalVal
      : (finalVal - pending) / finalVal;
  };

  // Calcula los años cubiertos por la timeSeries (precisión suficiente para
  // re-derivar CAGR sin requerir storage adicional).
  const yearsOf = (r: BacktestResult): number => {
    const ts = r.timeSeries;
    if (!ts || ts.length < 2) return 1;
    const first = ts[0];
    const last = ts[ts.length - 1];
    if (!first || !last) return 1;
    const firstDate = new Date(first.exactDate || `${first.date}-01`);
    const lastDate = new Date(last.exactDate || `${last.date}-01`);
    const days = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0.01, days / 365.25);
  };

  // TotalReturn escalado al modo: (1 + TWRR) × factor − 1
  const totalReturnByMode = (r: BacktestResult, mode: ValueMode): number => {
    const scale = scaleFactor(r, mode);
    return (1 + r.metrics.totalReturn) * scale - 1;
  };

  // CAGR escalado al modo (anualizado a partir del cumulative escalado)
  const cagrByMode = (r: BacktestResult, mode: ValueMode): number => {
    if (mode === "camino") return r.metrics.cagr;
    const scale = scaleFactor(r, mode);
    const newCum = (1 + r.metrics.totalReturn) * scale;
    if (newCum <= 0) return -1;
    const years = yearsOf(r);
    return Math.pow(newCum, 1 / years) - 1;
  };

  // Sharpe / Sortino / Calmar derivan del CAGR escalado. Usamos la tasa libre
  // de riesgo del motor (1%) y la volatilidad / drawdown originales (no varían
  // con el modo fiscal — son la experiencia real de la cartera durante el camino).
  const RISK_FREE_RATE = 0.01;
  const sharpeByMode = (r: BacktestResult, mode: ValueMode): number => {
    if (mode === "camino") return r.metrics.sharpe;
    const vol = r.metrics.volatility;
    if (vol <= 0) return 0;
    return (cagrByMode(r, mode) - RISK_FREE_RATE) / vol;
  };
  const sortinoByMode = (r: BacktestResult, mode: ValueMode): number => {
    if (mode === "camino") return r.metrics.sortino;
    // Reconstruir downside deviation desde el Sortino y CAGR originales
    const camCagr = r.metrics.cagr;
    const camSortino = r.metrics.sortino;
    if (camSortino === 0) return 0;
    const downsideDev = (camCagr - RISK_FREE_RATE) / camSortino;
    if (downsideDev <= 0) return 0;
    return (cagrByMode(r, mode) - RISK_FREE_RATE) / downsideDev;
  };
  const calmarByMode = (r: BacktestResult, mode: ValueMode): number => {
    if (mode === "camino") return r.metrics.calmar;
    const dd = r.metrics.maxDrawdown;
    if (dd >= 0) return 0;
    return cagrByMode(r, mode) / Math.abs(dd);
  };

  return [
  {
    key: "finalValue",
    label: finalValueLabel[valueMode],
    getValue: (r) => valueByMode(r, valueMode),
    format: formatEUR,
    higherIsBetter: true,
    tooltip: tooltips.finalValue,
    isHero: true,
    getSubText: (r) => {
      const bruto = valueByMode(r, "bruto");
      const camino = valueByMode(r, "camino");
      const liquidar = valueByMode(r, "liquidar");
      const paid = r.fees.totalTaxesPaid ?? 0;
      const pending = effectivePending(r);
      // Mostrar las DOS variantes que NO son la principal, para dar contexto
      if (valueMode === "liquidar") {
        if (paid === 0 && pending === 0) return null;
        return `Bruto: ${formatEUR(bruto)} · Camino: ${formatEUR(camino)}`;
      }
      if (valueMode === "camino") {
        if (paid === 0 && pending === 0) return null;
        return `Bruto: ${formatEUR(bruto)} · Liquidar: ${formatEUR(liquidar)}`;
      }
      // bruto
      if (paid === 0 && pending === 0) return null;
      return `Camino: ${formatEUR(camino)} · Liquidar: ${formatEUR(liquidar)}`;
    },
  },
  {
    key: "cagr",
    label: valueMode === "liquidar" ? "CAGR al liquidar"
      : valueMode === "bruto" ? "CAGR bruto"
      : "CAGR",
    getValue: (r) => cagrByMode(r, valueMode),
    format: (v) => formatPct(v),
    higherIsBetter: true,
    tooltip: tooltips.cagr,
    isHero: true,
  },
  {
    key: "volatility",
    label: "Volatilidad",
    getValue: (r) => r.metrics.volatility,
    format: (v) => formatPctNoSign(v),
    higherIsBetter: false,
    tooltip: tooltips.volatility,
    isHero: true,
  },
  {
    key: "maxDrawdown",
    label: "Max Drawdown",
    getValue: (r) => r.metrics.maxDrawdown,
    format: (v) => formatPct(v, 1),
    higherIsBetter: true,
    tooltip: tooltips.maxDrawdown,
    isHero: true,
  },
  {
    key: "totalReturn",
    label: "Rentabilidad total",
    getValue: (r) => totalReturnByMode(r, valueMode),
    format: (v) => formatPct(v),
    higherIsBetter: true,
    tooltip: tooltips.totalReturn,
  },
  {
    key: "sharpe",
    label: "Ratio Sharpe",
    getValue: (r) => sharpeByMode(r, valueMode),
    format: formatRatio,
    higherIsBetter: true,
    tooltip: tooltips.sharpe,
  },
  {
    key: "sortino",
    label: "Ratio Sortino",
    getValue: (r) => sortinoByMode(r, valueMode),
    format: formatRatio,
    higherIsBetter: true,
    tooltip: tooltips.sortino,
  },
  {
    key: "calmar",
    label: "Ratio Calmar",
    getValue: (r) => calmarByMode(r, valueMode),
    format: formatRatio,
    higherIsBetter: true,
    tooltip: tooltips.calmar,
    interpret: interpretCalmar,
  },
  {
    key: "varHistorical",
    label: "VaR (5%)",
    getValue: (r) => r.metrics.varHistorical,
    format: (v) => formatPct(v, 2),
    higherIsBetter: true,
    tooltip: tooltips.varHistorical,
  },
  {
    key: "cvar",
    label: "CVaR / Expected Shortfall (5%)",
    getValue: (r) => r.metrics.cvar,
    format: (v) => formatPct(v, 2),
    higherIsBetter: true,
    tooltip: tooltips.cvar,
  },
  {
    key: "skewness",
    label: "Asimetría (Skewness)",
    getValue: (r) => r.metrics.skewness,
    format: (v) => v.toFixed(2),
    higherIsBetter: true,
    tooltip: tooltips.skewness,
    interpret: interpretSkewness,
  },
  {
    key: "excessKurtosis",
    label: "Curtosis en exceso",
    getValue: (r) => r.metrics.excessKurtosis,
    format: (v) => v.toFixed(2),
    higherIsBetter: false,
    tooltip: tooltips.excessKurtosis,
    interpret: interpretKurtosis,
  },
  {
    key: "bestMonth",
    label: `Mejor ${singular}`,
    getValue: (r) => r.metrics.bestMonth,
    format: (v) => formatPct(v, 1),
    higherIsBetter: true,
    tooltip: tooltips.bestMonth,
  },
  {
    key: "worstMonth",
    label: `Peor ${singular}`,
    getValue: (r) => r.metrics.worstMonth,
    format: (v) => formatPct(v, 1),
    higherIsBetter: true,
    tooltip: tooltips.worstMonth,
  },
  {
    key: "positiveMonthsRatio",
    label: `% ${pluralCap} positivos`,
    getValue: (r) => r.metrics.positiveMonthsRatio,
    format: (v) => formatPctNoSign(v),
    higherIsBetter: true,
    tooltip: tooltips.positiveMonthsRatio,
  },
  {
    key: "totalFees",
    label: "Coste total (TER + gestión + impuestos)",
    // Usa los pendientes EFECTIVOS (propios o hipotéticos heredados), para
    // que dos carteras con regímenes fiscales distintos se comparen de forma
    // justa al asumir liquidación al final.
    getValue: (r) => r.fees.totalFees + (r.fees.managementFeePaid || 0) +
                     (r.fees.totalTaxesPaid || 0) + effectivePending(r),
    format: formatEUR,
    higherIsBetter: false,
    tooltip: tooltips.totalFees,
  },
  ];
}

// Determinar el ganador
function getWinner(
  valueA: number,
  valueB: number,
  higherIsBetter: boolean
): "a" | "b" | "tie" {
  if (!isFinite(valueA) || !isFinite(valueB)) return "tie";
  if (Math.abs(valueA - valueB) < 0.0001) return "tie";

  if (higherIsBetter) {
    return valueA > valueB ? "a" : "b";
  } else {
    return valueA < valueB ? "a" : "b";
  }
}

// ============================================================================
// HERO STAT CARD — números gigantes
// ============================================================================

function HeroStatCard({
  label,
  valueA,
  valueB,
  valueBenchmark,
  subTextA,
  subTextB,
  subTextBenchmark,
  format,
  higherIsBetter,
  tooltip,
  nameA,
  nameB,
  nameBenchmark,
}: {
  label: string;
  valueA?: number;
  valueB?: number;
  valueBenchmark?: number;
  subTextA?: string | null;
  subTextB?: string | null;
  subTextBenchmark?: string | null;
  format: (v: number) => string;
  higherIsBetter: boolean;
  tooltip: string;
  nameA?: string;
  nameB?: string;
  nameBenchmark?: string;
}) {
  const hasTwo = valueA !== undefined && valueB !== undefined;
  const winner = hasTwo ? getWinner(valueA!, valueB!, higherIsBetter) : "tie";
  const hasBenchmark = valueBenchmark !== undefined && nameBenchmark;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-7 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium text-brand-tertiary uppercase tracking-wide">
          {label}
        </span>
        <Tooltip content={tooltip}>
          <svg className="w-4 h-4 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
          </svg>
        </Tooltip>
      </div>

      {/* Valores */}
      {hasTwo && hasBenchmark ? (
        // Layout en rejilla coordinada: A, B y benchmark en 3 columnas. El badge
        // "MEJOR" (✓ de ganador) SOLO compite entre A y B; el benchmark es
        // referencia y nunca gana. Fuentes algo más pequeñas para que quepan 3.
        <div>
          <div className="grid grid-cols-3 gap-2">
            {/* Cartera A (azul) */}
            <div>
              <div className="flex items-baseline gap-1">
                <span className={`text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight font-serif ${
                  winner === "a" ? "text-brand-navy" : "text-slate-400"
                }`} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {format(valueA!)}
                </span>
                {winner === "a" && (
                  <span className="text-[9px] font-semibold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">MEJOR</span>
                )}
              </div>
              {subTextA && (
                <p className="text-[10px] text-brand-tertiary italic mt-0.5">{subTextA}</p>
              )}
            </div>
            {/* Cartera B (rojo) */}
            <div>
              <div className="flex items-baseline gap-1">
                <span className={`text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight font-serif ${
                  winner === "b" ? "text-brand-navy" : "text-slate-400"
                }`} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {format(valueB!)}
                </span>
                {winner === "b" && (
                  <span className="text-[9px] font-semibold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">MEJOR</span>
                )}
              </div>
              {subTextB && (
                <p className="text-[10px] text-brand-tertiary italic mt-0.5">{subTextB}</p>
              )}
            </div>
            {/* Benchmark (púrpura, referencia, no compite) */}
            <div>
              <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight font-serif text-purple-600/80 italic" style={{ fontVariantNumeric: "tabular-nums" }}>
                {format(valueBenchmark)}
              </span>
              {subTextBenchmark && (
                <p className="text-[10px] text-purple-600/60 italic mt-0.5">{subTextBenchmark}</p>
              )}
            </div>
          </div>
          {/* Fila de etiquetas alineada con las 3 columnas */}
          <div className="grid grid-cols-3 gap-2 pt-2 mt-2 border-t border-slate-100">
            <span className="text-xs text-blue-600 font-medium truncate">{nameA}</span>
            <span className="text-xs text-rose-600 font-medium truncate">{nameB}</span>
            <span className="text-xs text-purple-600 font-medium truncate">{nameBenchmark}</span>
          </div>
        </div>
      ) : hasTwo ? (
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between">
              <span className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight font-serif ${
                winner === "a" ? "text-brand-navy" : "text-slate-400"
              }`} style={{ fontVariantNumeric: "tabular-nums" }}>
                {format(valueA!)}
              </span>
              {winner === "a" && (
                <span className="text-xs font-semibold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">MEJOR</span>
              )}
            </div>
            {subTextA && (
              <p className="text-[10px] text-brand-tertiary italic mt-0.5">{subTextA}</p>
            )}
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight font-serif ${
                winner === "b" ? "text-brand-navy" : "text-slate-400"
              }`} style={{ fontVariantNumeric: "tabular-nums" }}>
                {format(valueB!)}
              </span>
              {winner === "b" && (
                <span className="text-xs font-semibold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">MEJOR</span>
              )}
            </div>
            {subTextB && (
              <p className="text-[10px] text-brand-tertiary italic mt-0.5">{subTextB}</p>
            )}
          </div>
          {/* Sin benchmark: solo etiquetas A / B. El caso A+B+benchmark se
              renderiza arriba en la rejilla coordinada de 3 columnas. */}
          <div className="flex justify-between pt-2 border-t border-slate-100">
            <span className="text-xs text-blue-600 font-medium">{nameA}</span>
            <span className="text-xs text-rose-600 font-medium">{nameB}</span>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-4xl sm:text-5xl lg:text-6xl font-bold text-brand-navy tracking-tight font-serif" style={{ fontVariantNumeric: "tabular-nums" }}>
            {format(valueA ?? valueB ?? 0)}
          </div>
          {(subTextA ?? subTextB) && (
            <p className="text-xs text-brand-tertiary italic mt-1">{subTextA ?? subTextB}</p>
          )}
          {hasBenchmark && (
            <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-slate-100">
              <span className="text-xs text-purple-600 font-medium">{nameBenchmark}</span>
              <span className="text-base font-semibold text-purple-600/80 italic tabular-nums">
                {format(valueBenchmark)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MetricsTable({ results, isLoading, valueMode, onValueModeChange }: MetricsTableProps) {
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <div className="h-64 flex items-center justify-center">
          <div className="w-10 h-10 border-3 border-brand-coral/30 border-t-brand-coral rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const { resultA, resultB, correlation } = results;

  if (!resultA && !resultB) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
        <p className="text-brand-tertiary text-lg">No hay datos suficientes para mostrar métricas.</p>
      </div>
    );
  }

  const granularity: DisplayGranularity = results.displayGranularity ?? "monthly";
  const isSinglePortfolio = !resultA || !resultB;
  const singleResult = resultA || resultB;

  // Si hay benchmark configurado, construir un "resultado virtual" del benchmark
  // para reutilizar las getValue() de las métricas sin duplicar lógica.
  const benchmark = resultA?.benchmark ?? resultB?.benchmark;
  const benchmarkResult: BacktestResult | null =
    benchmark && benchmark.benchmarkMetrics && benchmark.benchmarkFees && benchmark.benchmarkFinalValue !== undefined
      ? {
          portfolioName: benchmark.benchmarkName,
          portfolioType: "index",
          timeSeries: benchmark.benchmarkTimeSeries,
          metrics: benchmark.benchmarkMetrics,
          annualReturns: [],
          drawdowns: [],
          topDrawdowns: [],
          stressPeriods: benchmark.benchmarkStressPeriods ?? [],
          rebalanceLog: [],
          rollingReturns: { oneYear: [], threeYear: [], fiveYear: [] },
          rollingStats: {
            oneYear: { label: "1 año", years: 1, count: 0, bestCagr: 0, bestEndDate: null, worstCagr: 0, worstEndDate: null, avgCagr: 0, medianCagr: 0, positiveRatio: 0 },
            threeYear: { label: "3 años", years: 3, count: 0, bestCagr: 0, bestEndDate: null, worstCagr: 0, worstEndDate: null, avgCagr: 0, medianCagr: 0, positiveRatio: 0 },
            fiveYear: { label: "5 años", years: 5, count: 0, bestCagr: 0, bestEndDate: null, worstCagr: 0, worstEndDate: null, avgCagr: 0, medianCagr: 0, positiveRatio: 0 },
            tenYear: { label: "10 años", years: 10, count: 0, bestCagr: 0, bestEndDate: null, worstCagr: 0, worstEndDate: null, avgCagr: 0, medianCagr: 0, positiveRatio: 0 },
          },
          returnsHistogram: { periodLabel: "mes", bins: [], mean: 0, stdDev: 0, totalCount: 0 },
          allocation: { byCategory: [], byAssetClass: [], byManagement: [] },
          fees: benchmark.benchmarkFees,
          totalContributions: benchmark.benchmarkTotalContributions ?? 0,
          finalValue: benchmark.benchmarkFinalValue,
        }
      : null;

  // ---------------------------------------------------------------------------
  // Helper: impuesto pendiente EFECTIVO de una cartera/benchmark
  // ---------------------------------------------------------------------------
  // Si la entidad tiene su propio régimen fiscal (taxMode != "none"), usa su
  // pendingTaxes propio. Si no, hereda el régimen de la OTRA cartera (en
  // comparaciones) o de la cartera principal (para el benchmark) para calcular
  // el pendiente hipotético al liquidar. Esta es la misma lógica que usa
  // TaxImpactCard, y sin ella la card "Valor al liquidar" mostraba el bruto en
  // la cartera sin tax y en el benchmark.
  const effectivePending = (result: BacktestResult): number => {
    const ownMode = (result.fees.taxMode ?? "none") as TaxMode;
    if (ownMode !== "none") return result.fees.pendingTaxes ?? 0;
    // Buscar un modo a heredar: primero la otra cartera, luego el "compañero"
    // de la cartera principal (para el caso del benchmark virtual).
    let inheritedMode: TaxMode = "none";
    let inheritedRate = 0;
    const candidates: (BacktestResult | null)[] = result === resultA
      ? [resultB ?? null]
      : result === resultB
      ? [resultA ?? null]
      : [resultA ?? null, resultB ?? null]; // benchmark: A primero, luego B
    for (const c of candidates) {
      if (!c) continue;
      const mode = (c.fees.taxMode ?? "none") as TaxMode;
      if (mode !== "none") {
        inheritedMode = mode;
        inheritedRate = c.fees.taxRate ?? 0;
        break;
      }
    }
    if (inheritedMode === "none") return 0;
    const ug = result.fees.unrealizedGain ?? 0;
    return computeTaxOnGain(ug, inheritedMode, inheritedRate);
  };

  const metricsConfig = buildMetricsConfig(granularity, valueMode, effectivePending);
  const heroMetrics = metricsConfig.filter((m) => m.isHero);
  const tableMetrics = metricsConfig.filter((m) => !m.isHero);

  // Banner de capital aportado: cuando hay aportaciones mensuales, conviene
  // mostrar EXPLÍCITAMENTE el dinero aportado para que el alumno entienda que
  // el valor final NO es todo rentabilidad. El TWRR ya excluye el efecto de
  // las aportaciones, pero el contraste visual es clave para evitar confusión.
  const totalContributed = (resultA ?? resultB)?.totalContributions ?? 0;
  const initialAmount = results.config.initialAmount;
  const monthly = results.config.monthlyContribution ?? 0;
  const hasContributions = monthly > 0;
  const totalMonthsContributed = hasContributions && monthly > 0
    ? Math.round((totalContributed - initialAmount) / monthly)
    : 0;

  return (
    <div className="space-y-6">
      {/* Banner de capital aportado (solo si hay aportaciones mensuales) */}
      {hasContributions && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center flex-shrink-0 text-base font-bold">
            💼
          </div>
          <div className="flex-1 text-sm leading-snug">
            <p className="font-semibold text-amber-900">
              Has aportado en total <span className="tabular-nums">{formatEUR(totalContributed)}</span>{" "}
              <span className="text-amber-700 font-normal">
                ({formatEUR(initialAmount)} inicial + {formatEUR(monthly)} × {totalMonthsContributed} meses)
              </span>
            </p>
            <p className="text-xs text-amber-800/80 mt-1">
              <strong>Importante:</strong> las métricas de rentabilidad (CAGR, total)
              están calculadas como <strong>TWRR</strong> — encadenan los retornos diarios
              y NO tratan tus aportaciones como ganancia. Reflejan únicamente lo que ha
              rentado la cartera, lo que es comparable con un benchmark.
            </p>
          </div>
        </div>
      )}

      {/* El selector de modo de valor (Bruto / Camino / Al liquidar) está
          ahora en la página, encima del gráfico, para que controle tanto las
          curvas como las hero stats con un solo click. */}

      {/* === HERO STATS GRID === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {heroMetrics.map((metric) => (
          <HeroStatCard
            key={metric.key}
            label={metric.label}
            valueA={resultA ? metric.getValue(resultA) : undefined}
            valueB={resultB ? metric.getValue(resultB) : undefined}
            valueBenchmark={benchmarkResult ? metric.getValue(benchmarkResult) : undefined}
            subTextA={resultA && metric.getSubText ? metric.getSubText(resultA) : null}
            subTextB={resultB && metric.getSubText ? metric.getSubText(resultB) : null}
            subTextBenchmark={benchmarkResult && metric.getSubText ? metric.getSubText(benchmarkResult) : null}
            format={metric.format}
            higherIsBetter={metric.higherIsBetter}
            tooltip={metric.tooltip}
            nameA={resultA?.portfolioName}
            nameB={resultB?.portfolioName}
            nameBenchmark={benchmarkResult?.portfolioName}
          />
        ))}
      </div>

      {/* === CORRELACIÓN BADGE === */}
      {correlation !== undefined && !isSinglePortfolio && (
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-white rounded-full border border-slate-100 shadow-sm">
            <span className="text-sm font-medium text-brand-secondary">Correlación entre carteras</span>
            <span className={`text-2xl sm:text-3xl font-bold font-serif ${
              Math.abs(correlation) > 0.7 ? "text-amber-600" :
              Math.abs(correlation) > 0.3 ? "text-blue-600" :
              "text-emerald-600"
            }`}>
              {(correlation * 100).toFixed(0)}%
            </span>
            <Tooltip content="Correlación de Pearson entre los retornos mensuales de ambas carteras. Cerca de 100% = se mueven igual. Cerca de 0% = independientes.">
              <svg className="w-4 h-4 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
            </Tooltip>
          </div>
        </div>
      )}

      {/* === TABLA DETALLADA === */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowAllMetrics(!showAllMetrics)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
        >
          <h3 className="text-base font-semibold text-brand-navy">
            {showAllMetrics ? "Todas las métricas" : "Ver todas las métricas"}
          </h3>
          <svg className={`w-5 h-5 text-brand-tertiary transition-transform ${showAllMetrics ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAllMetrics && (
          <div className="px-6 pb-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-100">
                    <th className="py-3 px-3 text-left text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                      Métrica
                    </th>
                    {resultA && (
                      <th className="py-3 px-3 text-right text-xs font-semibold text-blue-600 uppercase tracking-wider">
                        {resultA.portfolioName}
                      </th>
                    )}
                    {resultB && (
                      <th className="py-3 px-3 text-right text-xs font-semibold text-rose-600 uppercase tracking-wider">
                        {resultB.portfolioName}
                      </th>
                    )}
                    {benchmarkResult && (
                      <th className="py-3 px-3 text-right text-xs font-semibold text-purple-600 uppercase tracking-wider">
                        {benchmarkResult.portfolioName}
                        <Tooltip content="Benchmark de referencia. Las marcas ✓ de 'mejor' solo se calculan entre Cartera A y Cartera B; esta columna se muestra para contexto.">
                          <span className="ml-1 text-purple-300 cursor-help">ⓘ</span>
                        </Tooltip>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tableMetrics.map((metric) => {
                    const valA = resultA ? metric.getValue(resultA) : undefined;
                    const valB = resultB ? metric.getValue(resultB) : undefined;
                    const valBench = benchmarkResult ? metric.getValue(benchmarkResult) : undefined;
                    const winner =
                      valA !== undefined && valB !== undefined
                        ? getWinner(valA, valB, metric.higherIsBetter)
                        : "tie";

                    return (
                      <tr key={metric.key} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-brand-navy">
                              {metric.label}
                            </span>
                            <Tooltip content={metric.tooltip}>
                              <svg className="w-3.5 h-3.5 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                              </svg>
                            </Tooltip>
                          </div>
                        </td>
                        {valA !== undefined && (
                          <td className={`py-4 px-3 text-right text-base font-semibold ${
                            winner === "a" ? "text-emerald-600" : "text-brand-navy"
                          }`}>
                            <div>
                              {metric.format(valA)}
                              {winner === "a" && <span className="ml-1.5 text-emerald-500">&#10003;</span>}
                            </div>
                            {metric.interpret && (
                              <div className="text-xs font-normal text-brand-tertiary italic mt-1 max-w-xs ml-auto leading-snug">
                                {metric.interpret(valA)}
                              </div>
                            )}
                          </td>
                        )}
                        {valB !== undefined && (
                          <td className={`py-4 px-3 text-right text-base font-semibold ${
                            winner === "b" ? "text-emerald-600" : "text-brand-navy"
                          }`}>
                            <div>
                              {metric.format(valB)}
                              {winner === "b" && <span className="ml-1.5 text-emerald-500">&#10003;</span>}
                            </div>
                            {metric.interpret && (
                              <div className="text-xs font-normal text-brand-tertiary italic mt-1 max-w-xs ml-auto leading-snug">
                                {metric.interpret(valB)}
                              </div>
                            )}
                          </td>
                        )}
                        {valBench !== undefined && (
                          <td className="py-4 px-3 text-right text-base font-medium text-purple-600/80 italic">
                            <div>{metric.format(valBench)}</div>
                            {metric.interpret && (
                              <div className="text-xs font-normal text-brand-tertiary italic mt-1 max-w-xs ml-auto leading-snug not-italic">
                                {metric.interpret(valBench)}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
