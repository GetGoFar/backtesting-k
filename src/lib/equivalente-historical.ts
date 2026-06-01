// =============================================================================
// EQUIVALENTE HISTORICAL — Comparativa histórica REAL entre dos fondos
// =============================================================================
//
// Carga los NAVs mensuales de ambos fondos (activo + ETF indexado), encuentra
// el rango común disponible y normaliza al mismo punto de partida (100€).
//
// Esto permite responder dos preguntas con datos REALES en vez de simulación:
//   1. ¿Qué rentabilidad obtuvo cada fondo en el periodo cubierto?
//   2. Si hubieras invertido X€ al inicio del periodo, ¿cuánto tendrías hoy
//      en cada uno?
//
// =============================================================================

import { getMonthlyPrices } from "./data-fetcher";

export interface HistoricalPoint {
  date: string;            // YYYY-MM
  activeValue: number;     // EUR (normalizado al capital inicial al inicio)
  indexedValue: number;
}

export interface HistoricalComparison {
  /** Primer mes con datos en AMBOS fondos (YYYY-MM). */
  startMonth: string;
  /** Último mes con datos en AMBOS fondos (YYYY-MM). */
  endMonth: string;
  /** Años cubiertos por el periodo común (decimal). */
  years: number;
  /** Rentabilidad total acumulada del fondo activo (%). */
  activeTotalReturn: number;
  /** Rentabilidad anualizada (CAGR) del fondo activo (%). */
  activeCagr: number;
  /** Rentabilidad total acumulada del ETF indexado (%). */
  indexedTotalReturn: number;
  /** Rentabilidad anualizada (CAGR) del ETF indexado (%). */
  indexedCagr: number;
  /** Valor final del capital inicial invertido en el activo (EUR). */
  finalActive: number;
  /** Valor final del capital inicial invertido en el indexado (EUR). */
  finalIndexed: number;
  /** Diferencia de patrimonio final = indexado − activo (EUR). */
  realSavings: number;
  /** Serie temporal con ambos NAVs reescalados al capital inicial. */
  timeSeries: HistoricalPoint[];
}

/**
 * Calcula la comparativa histórica real entre dos fondos a partir de sus NAVs.
 *
 * @param activeFundId    ID del fondo de gestión activa
 * @param indexedFundId   ID del ETF indexado equivalente
 * @param initialCapital  Capital inicial a normalizar (default 100 EUR para
 *                        respuesta porcentual; pasa 100000 para EUR reales)
 */
export async function buildHistoricalComparison(
  activeFundId: string,
  indexedFundId: string,
  initialCapital: number = 100
): Promise<HistoricalComparison | null> {
  // Cargar NAVs mensuales de ambos fondos en paralelo
  const [activeRes, indexedRes] = await Promise.all([
    getMonthlyPrices(activeFundId).catch(() => null),
    getMonthlyPrices(indexedFundId).catch(() => null),
  ]);

  if (!activeRes || !indexedRes) return null;
  if (activeRes.prices.size === 0 || indexedRes.prices.size === 0) return null;

  // Encontrar rango común — máximo de los inicios, mínimo de los finales
  const activeMonths = Array.from(activeRes.prices.keys()).sort();
  const indexedMonths = Array.from(indexedRes.prices.keys()).sort();
  const activeFirst = activeMonths[0]!;
  const activeLast = activeMonths[activeMonths.length - 1]!;
  const indexedFirst = indexedMonths[0]!;
  const indexedLast = indexedMonths[indexedMonths.length - 1]!;

  const startMonth = activeFirst > indexedFirst ? activeFirst : indexedFirst;
  const endMonth = activeLast < indexedLast ? activeLast : indexedLast;

  if (startMonth >= endMonth) return null; // sin solapamiento

  // Filtrar meses comunes y mantener sólo los que existen en AMBOS
  const commonMonths: string[] = [];
  for (const m of activeMonths) {
    if (m < startMonth || m > endMonth) continue;
    if (!indexedRes.prices.has(m)) continue;
    commonMonths.push(m);
  }

  if (commonMonths.length < 2) return null;

  const firstM = commonMonths[0]!;
  const lastM = commonMonths[commonMonths.length - 1]!;
  const activeStart = activeRes.prices.get(firstM)!;
  const indexedStart = indexedRes.prices.get(firstM)!;
  const activeEnd = activeRes.prices.get(lastM)!;
  const indexedEnd = indexedRes.prices.get(lastM)!;

  if (activeStart <= 0 || indexedStart <= 0) return null;

  // Construir serie temporal normalizada al capital inicial
  const timeSeries: HistoricalPoint[] = commonMonths.map((m) => ({
    date: m,
    activeValue: (activeRes.prices.get(m)! / activeStart) * initialCapital,
    indexedValue: (indexedRes.prices.get(m)! / indexedStart) * initialCapital,
  }));

  // Métricas
  const activeTotalReturn = ((activeEnd / activeStart) - 1) * 100;
  const indexedTotalReturn = ((indexedEnd / indexedStart) - 1) * 100;

  // Años cubiertos — diferencia entre YYYY-MM en años decimales
  const years = monthsBetween(firstM, lastM) / 12;
  const activeCagr = years > 0
    ? (Math.pow(activeEnd / activeStart, 1 / years) - 1) * 100
    : 0;
  const indexedCagr = years > 0
    ? (Math.pow(indexedEnd / indexedStart, 1 / years) - 1) * 100
    : 0;

  const finalActive = (activeEnd / activeStart) * initialCapital;
  const finalIndexed = (indexedEnd / indexedStart) * initialCapital;

  return {
    startMonth: firstM,
    endMonth: lastM,
    years,
    activeTotalReturn,
    activeCagr,
    indexedTotalReturn,
    indexedCagr,
    finalActive,
    finalIndexed,
    realSavings: finalIndexed - finalActive,
    timeSeries,
  };
}

/** Diferencia en meses entre dos cadenas YYYY-MM (inclusive). */
function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number) as [number, number];
  const [ey, em] = end.split("-").map(Number) as [number, number];
  return (ey - sy) * 12 + (em - sm);
}
