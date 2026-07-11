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
