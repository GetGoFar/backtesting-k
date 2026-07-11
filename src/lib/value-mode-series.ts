// =====================================================================
// VALUE-MODE SERIES — construcción de la serie de patrimonio según el
// modo de valoración seleccionado (bruto / neta del camino / al liquidar).
// =====================================================================
//
// El motor genera la serie "neta del camino" (valor real con impuestos
// pagados descontados en cada rebalanceo). Para "bruto" y "al liquidar"
// reconstruimos la serie POR PUNTO, no uniformemente. Así:
//   - En "bruto" el gap a "camino" CRECE escalonadamente cada vez que se
//     paga un impuesto en un rebalanceo (forma curva visible).
//   - En "liquidar" el gap a "camino" CRECE suavemente con la plusvalía
//     latente, llegando a su máximo al final.
//
// Se extrajo de PerformanceChart para poder reutilizar exactamente el mismo
// cálculo en otros componentes (p.ej. la tabla de rentabilidad por horizonte).

import type { BacktestResult } from "@/lib/types";
import type { ValueMode } from "@/components/MetricsTable";
import { computeTaxOnGain, type TaxMode } from "@/lib/tax-utils";

export function getEffectivePending(
  result: BacktestResult,
  otherResult?: BacktestResult | null
): number {
  // Impuesto DIFERIDO al liquidar (solo afecta a la serie en modo "liquidar"):
  //  - Régimen propio configurado → su pendiente real.
  //  - "Sin impuestos" (fondos con traspasos exentos): el diferimiento no
  //    elimina el impuesto. Si la cartera comparada tributa, estimamos el
  //    diferido de la plusvalía latente con ese régimen (mismo inversor →
  //    mismo IRPF). Sin esto, la cartera sin régimen "ganaría" al liquidar
  //    precisamente por no haber tributado aún. Coherente con MetricsTable
  //    (effectivePending) y marcado como hipotético en los subtextos.
  //  - Bruto y neta-del-camino NO usan esto: para carteras sin régimen son
  //    idénticas siempre.
  const ownMode = (result.fees.taxMode ?? "none") as TaxMode;
  if (ownMode !== "none") return result.fees.pendingTaxes ?? 0;
  if (otherResult) {
    const otherMode = (otherResult.fees.taxMode ?? "none") as TaxMode;
    const otherRate = otherResult.fees.taxRate ?? 0;
    if (otherMode !== "none") {
      return computeTaxOnGain(result.fees.unrealizedGain ?? 0, otherMode, otherRate);
    }
  }
  return 0;
}

/** Diferencia en meses entre dos fechas YYYY-MM o YYYY-MM-DD */
export function monthsBetween(start: string, end: string): number {
  const s = new Date(start.length === 7 ? `${start}-01` : start);
  const e = new Date(end.length === 7 ? `${end}-01` : end);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

/**
 * Construye una serie de valores según el modo seleccionado.
 * Devuelve un Map<date, value> con el valor escalado punto a punto.
 *
 * Notas de cálculo:
 * - "bruto" requiere el rebalanceLog para acumular taxes pagados hasta cada
 *   fecha. Si no hay log o no hay taxes pagados, devuelve la serie original.
 * - "liquidar" estima la plusvalía latente en cada punto como
 *   max(0, value_t − contributions_t) y le aplica una tasa efectiva derivada
 *   de los datos finales (pendingFinal / unrealizedFinal). Es una aproximación
 *   que crece naturalmente con la plusvalía.
 */
export function buildScaledSeries(
  result: BacktestResult,
  mode: ValueMode,
  otherResult: BacktestResult | null,
  monthlyContribution: number,
  initialAmount: number
): Map<string, number> {
  const series = new Map<string, number>();
  const ts = result.timeSeries;
  if (ts.length === 0) return series;

  if (mode === "camino") {
    for (const p of ts) series.set(p.date, p.value);
    return series;
  }

  if (mode === "bruto") {
    // Serie bruta EXACTA del motor (contrafactual sin salidas fiscales, con
    // el interés compuesto de los impuestos incluido). Coincide punto a punto
    // con el grossFinalValue de las métricas.
    if (result.grossTimeSeries && result.grossTimeSeries.length > 0) {
      for (const p of result.grossTimeSeries) series.set(p.date, p.value);
      return series;
    }
    // Fallback (resultados antiguos sin la serie bruta): acumular los
    // impuestos nominales pagados hasta cada fecha.
    const events = (result.rebalanceLog ?? [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    if (events.length === 0 || (result.fees.totalTaxesPaid ?? 0) === 0) {
      for (const p of ts) series.set(p.date, p.value);
      return series;
    }
    // Recorrer puntos en orden y acumular taxes pagados hasta su fecha
    let cumPaid = 0;
    let evIdx = 0;
    const sortedTs = ts.slice().sort((a, b) => a.date.localeCompare(b.date));
    for (const p of sortedTs) {
      // p.exactDate es YYYY-MM-DD, event.date también es YYYY-MM-DD
      const pDate = p.exactDate || p.date;
      while (evIdx < events.length && events[evIdx]!.date <= pDate) {
        cumPaid += events[evIdx]!.taxPaid;
        evIdx++;
      }
      series.set(p.date, p.value + cumPaid);
    }
    return series;
  }

  // liquidar
  const pendingFinal = getEffectivePending(result, otherResult);
  const unrealizedFinal = result.fees.unrealizedGain ?? Math.max(0, result.finalValue - result.totalContributions);
  if (pendingFinal <= 0 || unrealizedFinal <= 0) {
    for (const p of ts) series.set(p.date, p.value);
    return series;
  }
  // Tasa efectiva: cuánto impuesto representa cada euro de plusvalía latente
  const effectiveRate = pendingFinal / unrealizedFinal;
  const firstDate = ts[0]!.exactDate || ts[0]!.date;

  for (const p of ts) {
    const pDate = p.exactDate || p.date;
    const monthsElapsed = Math.max(0, monthsBetween(firstDate, pDate));
    // Aproximación de aportaciones acumuladas hasta el punto t
    const contribsAtT = initialAmount + monthlyContribution * monthsElapsed;
    const unrealizedAtT = Math.max(0, p.value - contribsAtT);
    const pendingAtT = unrealizedAtT * effectiveRate;
    series.set(p.date, p.value - pendingAtT);
  }
  return series;
}

// =====================================================================
// CAGR POR MODO — copia FIEL de la lógica de MetricsTable (cagrByMode).
// Se extrae aquí para que otros componentes (p.ej. la tabla de rentabilidad
// por horizonte, fila "Desde inicio") muestren EXACTAMENTE el mismo número
// que la métrica "CAGR al liquidar" de la cabecera, en los tres modos.
//
// IMPORTANTE: si cambias la fórmula del CAGR por modo en MetricsTable,
// actualiza también esta copia (y viceversa). Ambas deben coincidir.
// =====================================================================

/**
 * Impuesto pendiente efectivo al liquidar. Réplica de MetricsTable.effectivePending:
 * usa el régimen propio si lo hay; si no, hereda el de las carteras `others`
 * (para A → [B]; para B → [A]; para benchmark → [A, B]).
 */
function effectivePendingFor(result: BacktestResult, others: BacktestResult[]): number {
  const ownMode = (result.fees.taxMode ?? "none") as TaxMode;
  if (ownMode !== "none") return result.fees.pendingTaxes ?? 0;
  let inheritedMode: TaxMode = "none";
  let inheritedRate = 0;
  for (const c of others) {
    if (!c) continue;
    const mode = (c.fees.taxMode ?? "none") as TaxMode;
    if (mode !== "none") {
      inheritedMode = mode;
      inheritedRate = c.fees.taxRate ?? 0;
      break;
    }
  }
  if (inheritedMode === "none") return 0;
  return computeTaxOnGain(result.fees.unrealizedGain ?? 0, inheritedMode, inheritedRate);
}

/** Factor de escala del valor final según el modo (== MetricsTable.scaleFactor). */
function scaleFactorFor(result: BacktestResult, mode: ValueMode, others: BacktestResult[]): number {
  if (mode === "camino") return 1;
  const finalVal = result.finalValue;
  if (finalVal <= 0) return 1;
  const paid = result.fees.totalTaxesPaid ?? 0;
  const pending = effectivePendingFor(result, others);
  return mode === "bruto"
    ? (result.grossFinalValue ?? (finalVal + paid)) / finalVal
    : (finalVal - pending) / finalVal;
}

/** Años cubiertos por la serie (días exactos / 365.25) — == MetricsTable.yearsOf. */
function yearsOf(result: BacktestResult): number {
  const ts = result.timeSeries;
  if (!ts || ts.length < 2) return 1;
  const first = ts[0];
  const last = ts[ts.length - 1];
  if (!first || !last) return 1;
  const firstDate = new Date(first.exactDate || `${first.date}-01`);
  const lastDate = new Date(last.exactDate || `${last.date}-01`);
  const days = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0.01, days / 365.25);
}

/**
 * CAGR del periodo completo según el modo de valoración. Idéntico a
 * MetricsTable.cagrByMode: se ancla en el CAGR del motor (TWRR) y solo se
 * anualiza el ajuste por el factor del modo. Con factor 1 (sin efecto fiscal)
 * devuelve exactamente metrics.cagr.
 */
export function cagrByMode(
  result: BacktestResult,
  mode: ValueMode,
  others: BacktestResult[] = []
): number {
  const scale = scaleFactorFor(result, mode, others);
  if (mode === "camino" || Math.abs(scale - 1) < 1e-9) return result.metrics.cagr;
  if (scale <= 0) return -1;
  const years = yearsOf(result);
  return (1 + result.metrics.cagr) * Math.pow(scale, 1 / years) - 1;
}
