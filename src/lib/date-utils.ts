// =============================================================================
// UTILIDADES DE FECHAS - Backtesting Tool El Proyecto K
// =============================================================================
// Funciones para agregar datos diarios a granularidades mensuales/trimestrales.

import type { DisplayGranularity } from "./types";

/**
 * Extrae YYYY-MM de una fecha YYYY-MM-DD
 */
export function getMonthFromDate(date: string): string {
  return date.substring(0, 7); // "2025-04-30" → "2025-04"
}

/**
 * Extrae el trimestre de una fecha YYYY-MM-DD → "YYYY-Q1"..."YYYY-Q4"
 */
export function getQuarterFromDate(date: string): string {
  const year = date.substring(0, 4);
  const month = parseInt(date.substring(5, 7), 10);
  const quarter = Math.ceil(month / 3);
  return `${year}-Q${quarter}`;
}

/**
 * Devuelve el último elemento de cada grupo según la granularidad.
 * Asume que `dates` ya está ordenado ascendentemente.
 *
 * - "daily": devuelve todas las fechas tal cual
 * - "monthly": devuelve el último día hábil de cada mes
 * - "quarterly": devuelve el último día hábil de cada trimestre
 */
export function getLastDatePerPeriod(
  dates: string[],
  granularity: DisplayGranularity
): string[] {
  if (dates.length === 0) return [];
  if (granularity === "daily") return [...dates];

  const groupFn = granularity === "monthly" ? getMonthFromDate : getQuarterFromDate;
  const result: string[] = [];
  let currentGroup = groupFn(dates[0]!);

  for (let i = 0; i < dates.length; i++) {
    const nextDate = dates[i + 1];
    const group = groupFn(dates[i]!);

    // Si es el último en su grupo (siguiente fecha es otro grupo o no existe)
    if (!nextDate || groupFn(nextDate) !== group) {
      result.push(dates[i]!);
      if (nextDate) {
        currentGroup = groupFn(nextDate);
      }
    }
  }

  return result;
}

/**
 * Detecta si estamos en un nuevo mes comparando dos fechas YYYY-MM-DD
 */
export function isNewMonth(currentDate: string, previousDate: string): boolean {
  return getMonthFromDate(currentDate) !== getMonthFromDate(previousDate);
}

/**
 * Detecta si estamos en un nuevo trimestre
 */
export function isNewQuarter(currentDate: string, previousDate: string): boolean {
  return getQuarterFromDate(currentDate) !== getQuarterFromDate(previousDate);
}

/**
 * Detecta si estamos en un nuevo año
 */
export function isNewYear(currentDate: string, previousDate: string): boolean {
  return currentDate.substring(0, 4) !== previousDate.substring(0, 4);
}

/**
 * Determina si toca rebalancear basado en las fechas reales.
 * - monthly: primer día hábil de cada nuevo mes
 * - quarterly: primer día hábil de cada nuevo trimestre
 * - annual: primer día hábil de cada nuevo año
 */
export function shouldRebalanceByDate(
  currentDate: string,
  previousDate: string,
  frequency: "monthly" | "quarterly" | "annual" | "none"
): boolean {
  if (frequency === "none") return false;

  switch (frequency) {
    case "monthly":
      return isNewMonth(currentDate, previousDate);
    case "quarterly":
      return isNewQuarter(currentDate, previousDate);
    case "annual":
      return isNewYear(currentDate, previousDate);
    default:
      return false;
  }
}

/**
 * Agrupa retornos diarios en retornos del periodo según granularidad.
 * Compound: retorno_periodo = prod(1 + r_diario) - 1
 */
export function aggregateDailyReturns(
  dailyReturns: Array<{ date: string; returnValue: number }>,
  granularity: DisplayGranularity
): Array<{ period: string; returnValue: number }> {
  if (dailyReturns.length === 0) return [];
  if (granularity === "daily") {
    return dailyReturns.map((r) => ({ period: r.date, returnValue: r.returnValue }));
  }

  const groupFn = granularity === "monthly" ? getMonthFromDate : getQuarterFromDate;
  const groups = new Map<string, number>(); // period → compounded return factor

  for (const { date, returnValue } of dailyReturns) {
    const period = groupFn(date);
    const existing = groups.get(period) ?? 1;
    groups.set(period, existing * (1 + returnValue));
  }

  const result: Array<{ period: string; returnValue: number }> = [];
  for (const [period, factor] of groups) {
    result.push({ period, returnValue: factor - 1 });
  }

  return result.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Convierte un periodo (YYYY-MM-DD, YYYY-MM, or YYYY-QN) a una etiqueta legible
 */
export function formatPeriodLabel(period: string): string {
  // YYYY-MM-DD → "30 abr 2025"
  if (period.length === 10) {
    const [year, month, day] = period.split("-");
    const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const idx = parseInt(month!, 10) - 1;
    return `${parseInt(day!, 10)} ${monthNames[idx]} ${year}`;
  }
  // YYYY-QN → "Q1 2025"
  if (period.includes("-Q")) {
    const [year, q] = period.split("-");
    return `${q} ${year}`;
  }
  // YYYY-MM → "abr 2025"
  if (period.length === 7) {
    const [year, month] = period.split("-");
    const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const idx = parseInt(month!, 10) - 1;
    return `${monthNames[idx]} ${year}`;
  }
  return period;
}
