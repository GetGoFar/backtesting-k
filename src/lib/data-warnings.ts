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
  /** Fondos cuyo TER salió de FT/EODHD: son gastos corrientes, no coste total. */
  const automaticos: string[] = [];

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
      continue;
    }

    // Solo los que vienen de FT, que es nuestro respaldo para FONDOS europeos:
    // ahí la cifra son gastos corrientes y deja fuera los costes de
    // transacción, que en gestión activa no son menores (Unicaja RV USA A:
    // 1,58 % frente a 2,21 % de coste total PRIIPS).
    //
    // Los de EODHD NO llevan aviso a propósito: son el expense ratio de un ETF
    // (o de un fondo estadounidense), que ya es el coste anual total del
    // producto. Un ETF indexado apenas rota cartera, y los de EEUU ni siquiera
    // publican KID PRIIPS. Avisar ahí sería ruido.
    if (fund.terSource === "ft") {
      automaticos.push(fund.shortName || fund.name);
    }
  }

  if (automaticos.length > 0) {
    const muestra = automaticos.slice(0, 3).join(", ");
    const resto = automaticos.length - 3;
    warnings.push({
      type: "ter_estimated",
      severity: "warning",
      message:
        `El TER de ${muestra}${resto > 0 ? ` y ${resto} fondo${resto > 1 ? "s" : ""} más` : ""} ` +
        `son GASTOS CORRIENTES traídos automáticamente: no incluyen los costes de transacción ` +
        `del fondo, así que el coste real es MAYOR. Si la cifra importa para tu decisión, ` +
        `consulta el "coste total (PRIIPS)" en Morningstar o en el DFI del fondo y corrígelo a mano.`,
    });
  }

  return warnings;
}
