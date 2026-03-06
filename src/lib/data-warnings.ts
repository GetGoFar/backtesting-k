// =============================================================================
// GENERADOR DE WARNINGS - Backtesting Tool El Proyecto K
// =============================================================================

import type { BacktestWarning, PortfolioHolding } from "./types";
import { getFundById } from "./fund-database";

/**
 * Genera warnings para activos excluidos de la correlacion o metricas
 */
export function getExcludedAssetWarnings(
  holdings: PortfolioHolding[],
  includedFundIds: Set<string>,
  reason: "correlation" | "metrics"
): BacktestWarning[] {
  const warnings: BacktestWarning[] = [];
  for (const h of holdings) {
    if (!includedFundIds.has(h.fundId)) {
      const fund = getFundById(h.fundId) || h.fund;
      const name = fund?.shortName || fund?.name || h.fundId;
      const label =
        reason === "correlation"
          ? "la matriz de correlaciones"
          : "las metricas individuales";
      warnings.push({
        type: "asset_excluded",
        severity: "warning",
        message: `${name} excluido de ${label} por tener menos de 3 meses de datos en el rango seleccionado.`,
        fundId: h.fundId,
      });
    }
  }
  return warnings;
}

/**
 * Genera warnings para TER no confirmados
 */
export function getTerWarnings(
  holdings: PortfolioHolding[]
): BacktestWarning[] {
  const warnings: BacktestWarning[] = [];
  const seen = new Set<string>();

  for (const h of holdings) {
    if (seen.has(h.fundId)) continue;
    seen.add(h.fundId);

    const fund = getFundById(h.fundId) || h.fund;
    if (!fund) continue;

    if (fund.terConfirmed === false) {
      const terText =
        fund.ter === 0 ? "desconocido" : `estimado: ${fund.ter}%`;
      warnings.push({
        type: "ter_unknown",
        severity: "warning",
        message: `El TER de ${fund.shortName || fund.name} no esta confirmado (${terText}). Editalo en el constructor de carteras.`,
        fundId: h.fundId,
      });
    }
  }
  return warnings;
}
