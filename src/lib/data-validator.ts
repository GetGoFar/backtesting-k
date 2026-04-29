// =============================================================================
// VALIDACION DE DATOS - Backtesting Tool El Proyecto K
// =============================================================================

import type { DailyPrice } from "./types";

export interface DataQualityReport {
  fundId: string;
  totalDays: number;
  gaps: string[]; // Descripciones de gaps significativos
  negativeOrZeroPrices: string[]; // fechas con precios invalidos
  suspiciousJumps: Array<{
    date: string;
    changePercent: number;
  }>;
  qualityScore: number; // 0-100
  isUsable: boolean; // false si los datos son inutilizables
}

/**
 * Valida datos de precios diarios y devuelve un informe de calidad
 */
export function validatePriceData(
  fundId: string,
  prices: DailyPrice[]
): DataQualityReport {
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));

  const gaps: string[] = [];
  const negativeOrZeroPrices: string[] = [];
  const suspiciousJumps: Array<{ date: string; changePercent: number }> = [];

  // Precios no positivos
  for (const p of sorted) {
    if (p.closePrice <= 0) {
      negativeOrZeroPrices.push(p.date);
    }
  }

  // Gaps y saltos sospechosos
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;

    // Gaps: más de 35 días calendario sin datos
    // Umbral 35 (no 10) para tolerar fondos EUFUND que tienen datos mensuales en su histórico temprano
    const prevDate = new Date(prev.date);
    const currDate = new Date(curr.date);
    const calendarDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (calendarDays > 35) {
      gaps.push(`${prev.date} → ${curr.date} (${calendarDays} días)`);
    }

    // Saltos sospechosos: >30% cambio diario (muy inusual para ETFs/fondos)
    if (prev.closePrice > 0 && curr.closePrice > 0) {
      const change = Math.abs(curr.closePrice / prev.closePrice - 1) * 100;
      if (change > 30) {
        suspiciousJumps.push({ date: curr.date, changePercent: Math.round(change) });
      }
    }
  }

  // Quality score (0-100)
  let score = 100;
  score -= gaps.length * 3; // -3 por gap significativo
  score -= negativeOrZeroPrices.length * 20; // -20 por precio invalido
  score -= suspiciousJumps.length * 15; // -15 por salto sospechoso
  score = Math.max(0, Math.min(100, score));

  const isUsable =
    sorted.length >= 10 &&
    negativeOrZeroPrices.length === 0 &&
    score >= 30;

  return {
    fundId,
    totalDays: sorted.length,
    gaps,
    negativeOrZeroPrices,
    suspiciousJumps,
    qualityScore: score,
    isUsable,
  };
}

/**
 * Filtra precios invalidos (<=0) de un array de precios diarios
 */
export function cleanPriceData(prices: DailyPrice[]): DailyPrice[] {
  return prices.filter((p) => p.closePrice > 0);
}
