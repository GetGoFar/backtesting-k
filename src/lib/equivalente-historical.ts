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

/**
 * Especifica un fondo para la comparativa. Acepta:
 *   - fondos de la BD local (sólo `id` necesario; data-fetcher resuelve)
 *   - fondos dinámicos encontrados vía EODHD search (necesita ticker/ISIN)
 */
export interface FundRef {
  id: string;
  ticker?: string;
  isin?: string;
}

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
  /** Correlación de Pearson entre los retornos mensuales de ambos fondos
   *  (rango −1 … +1). Valida si el benchmark elegido es comparable:
   *    > 0.90 → muy alta (mismo universo de inversión)
   *    0.70-0.90 → alta (similar pero con sesgos)
   *    0.50-0.70 → moderada (relacionados, distinta concentración)
   *    < 0.50 → baja (probablemente no es un buen benchmark) */
  correlation: number;
  /** Tracking difference anualizado: indexedCagr − activeCagr (puntos %). */
  trackingDifference: number;
  /** Serie temporal con ambos NAVs reescalados al capital inicial. */
  timeSeries: HistoricalPoint[];
}

/** Calcula la correlación de Pearson entre dos series de retornos. */
function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return num / den;
}

/**
 * Calcula la comparativa histórica real entre dos fondos a partir de sus NAVs.
 *
 * Acepta tanto fondos de la BD local (sólo necesita ID) como fondos dinámicos
 * encontrados vía EODHD search (necesita ticker/ISIN explícitos para que el
 * data-fetcher sepa cómo localizarlos).
 *
 * @param active          Fondo activo a comparar (ID + ticker/ISIN si es dinámico)
 * @param indexed         ETF indexado equivalente
 * @param initialCapital  Capital inicial a normalizar (default 100 EUR para
 *                        respuesta porcentual; pasa 100000 para EUR reales)
 */
export async function buildHistoricalComparison(
  active: FundRef,
  indexed: FundRef,
  initialCapital: number = 100
): Promise<HistoricalComparison | null> {
  // Cargar NAVs mensuales de ambos fondos en paralelo
  const [activeRes, indexedRes] = await Promise.all([
    getMonthlyPrices(active.id, active.ticker, active.isin).catch(() => null),
    getMonthlyPrices(indexed.id, indexed.ticker, indexed.isin).catch(() => null),
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

  // Retornos mensuales para calcular correlación.
  // ret_i = (price_i / price_{i-1}) − 1, sólo entre meses consecutivos.
  const activeReturns: number[] = [];
  const indexedReturns: number[] = [];
  for (let i = 1; i < commonMonths.length; i++) {
    const prev = commonMonths[i - 1]!;
    const curr = commonMonths[i]!;
    const aPrev = activeRes.prices.get(prev)!;
    const aCurr = activeRes.prices.get(curr)!;
    const iPrev = indexedRes.prices.get(prev)!;
    const iCurr = indexedRes.prices.get(curr)!;
    if (aPrev > 0 && iPrev > 0) {
      activeReturns.push(aCurr / aPrev - 1);
      indexedReturns.push(iCurr / iPrev - 1);
    }
  }
  const correlation = pearsonCorrelation(activeReturns, indexedReturns);

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
    correlation,
    trackingDifference: indexedCagr - activeCagr,
    timeSeries,
  };
}

/** Diferencia en meses entre dos cadenas YYYY-MM (inclusive). */
function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number) as [number, number];
  const [ey, em] = end.split("-").map(Number) as [number, number];
  return (ey - sy) * 12 + (em - sm);
}
