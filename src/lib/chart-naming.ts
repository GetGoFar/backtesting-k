// =============================================================================
// CHART NAMING — Disambiguación de nombres de cartera para gráficos
// =============================================================================
//
// Cuando el usuario compara la MISMA cartera en los slots A y B (típico para
// probar el efecto de distintas frecuencias de rebalanceo o impuestos sobre
// la misma composición), ambos `portfolioName` son idénticos y Recharts
// colapsa las dos líneas en una porque `dataKey` colisiona.
//
// Esta utilidad calcula nombres únicos para A y B: si los originales chocan,
// se les anexa " (1)" / " (2)"; si ya son distintos, se respetan tal cual.
// Lo usamos en TODOS los charts que renderizan ambas carteras (equity, DD,
// rentabilidades anuales, rolling returns).
// =============================================================================

import type { BacktestResult } from "./types";

export function getDisambiguatedPortfolioNames(
  resultA: BacktestResult | null | undefined,
  resultB: BacktestResult | null | undefined
): { nameA: string; nameB: string; collide: boolean } {
  const collide =
    !!resultA && !!resultB && resultA.portfolioName === resultB.portfolioName;
  const nameA = resultA
    ? collide
      ? `${resultA.portfolioName} (1)`
      : resultA.portfolioName
    : "";
  const nameB = resultB
    ? collide
      ? `${resultB.portfolioName} (2)`
      : resultB.portfolioName
    : "";
  return { nameA, nameB, collide };
}
