// =============================================================================
// VALIDACION DE DATOS - Backtesting Tool El Proyecto K
// =============================================================================

import type { MonthlyPrice } from "./types";

export interface DataQualityReport {
  fundId: string;
  totalMonths: number;
  gaps: string[]; // YYYY-MM meses faltantes
  negativeOrZeroPrices: string[]; // meses con precios invalidos
  suspiciousJumps: Array<{
    month: string;
    changePercent: number;
  }>;
  qualityScore: number; // 0-100
  isUsable: boolean; // false si los datos son inutilizables
}

/**
 * Valida datos de precios mensuales y devuelve un informe de calidad
 */
export function validatePriceData(
  fundId: string,
  prices: MonthlyPrice[]
): DataQualityReport {
  const sorted = [...prices].sort((a, b) => a.month.localeCompare(b.month));

  const gaps: string[] = [];
  const negativeOrZeroPrices: string[] = [];
  const suspiciousJumps: Array<{ month: string; changePercent: number }> = [];

  // Precios no positivos
  for (const p of sorted) {
    if (p.closePrice <= 0) {
      negativeOrZeroPrices.push(p.month);
    }
  }

  // Gaps y saltos sospechosos
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;

    // Gaps (meses faltantes)
    const expectedNext = getNextMonth(prev.month);
    if (curr.month !== expectedNext) {
      let gapMonth = expectedNext;
      while (gapMonth < curr.month) {
        gaps.push(gapMonth);
        gapMonth = getNextMonth(gapMonth);
      }
    }

    // Saltos sospechosos (>200% cambio mensual)
    if (prev.closePrice > 0 && curr.closePrice > 0) {
      const change = Math.abs(curr.closePrice / prev.closePrice - 1) * 100;
      if (change > 200) {
        suspiciousJumps.push({ month: curr.month, changePercent: Math.round(change) });
      }
    }
  }

  // Quality score (0-100)
  let score = 100;
  score -= gaps.length * 5; // -5 por gap
  score -= negativeOrZeroPrices.length * 20; // -20 por precio invalido
  score -= suspiciousJumps.length * 15; // -15 por salto sospechoso
  score = Math.max(0, Math.min(100, score));

  const isUsable =
    sorted.length >= 3 &&
    negativeOrZeroPrices.length === 0 &&
    score >= 30;

  return {
    fundId,
    totalMonths: sorted.length,
    gaps,
    negativeOrZeroPrices,
    suspiciousJumps,
    qualityScore: score,
    isUsable,
  };
}

/**
 * Filtra precios invalidos (<=0) de un array de precios
 */
export function cleanPriceData(prices: MonthlyPrice[]): MonthlyPrice[] {
  return prices.filter((p) => p.closePrice > 0);
}

function getNextMonth(yyyyMM: string): string {
  const parts = yyyyMM.split("-");
  let year = parseInt(parts[0]!, 10);
  let month = parseInt(parts[1]!, 10) + 1;
  if (month > 12) {
    month = 1;
    year++;
  }
  return `${year}-${month.toString().padStart(2, "0")}`;
}
