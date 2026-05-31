// =============================================================================
// K-RAY ENGINE — Agrega composición de varios fondos en una sola "radiografía"
// =============================================================================
//
// Para cada fondo de la cartera:
//   1. Obtiene su composición vía EODHD /fundamentals
//   2. Pondera (peso del fondo en la cartera × peso del componente en el fondo)
//   3. Suma globalmente por sector, región, país, asset class
//   4. Detecta los stocks individuales que aparecen en 2+ fondos
//
// Si un fondo no tiene datos en EODHD, se ignora pero el peso "sin cubrir"
// queda registrado en el resultado para que la UI lo avise.
// =============================================================================

import {
  getFundCompositionById,
  getFundComposition,
} from "./eodhd-fundamentals";
import { getFundById } from "./fund-database";
import type {
  KrayInput,
  KrayResult,
  KraySlice,
  KrayHolding,
  KrayDuplicate,
  KrayWarning,
} from "./kray-types";

/**
 * Normaliza el nombre de un holding para detectar duplicidades. EODHD a veces
 * devuelve el mismo stock con ligeras variaciones de capitalización o sufijo
 * (e.g. "APPLE INC" vs "Apple Inc."). Hacemos un mapeo robusto:
 *   - Si hay Code (ticker), lo usamos como clave canónica
 *   - Si no, usamos el nombre en mayúsculas sin sufijos comunes (INC, CORP, ...)
 */
function canonicalKey(name: string, code?: string): string {
  if (code) return code.toUpperCase().trim();
  return name
    .toUpperCase()
    .trim()
    .replace(/[.,]/g, "")
    .replace(/\s+(INC|CORP|LTD|LLC|PLC|SA|AG|NV|SE|CO|HOLDINGS?|GROUP|GMBH)$/i, "")
    .replace(/\s+/g, " ");
}

/**
 * Convierte un mapa { categoría → peso_AGREGADO } a una lista ordenada de slices,
 * adjuntando los contribuyentes (fondos) por categoría.
 */
function mapToSlices(
  totals: Map<string, number>,
  contributors: Map<
    string,
    Array<{
      fundId: string;
      fundName: string;
      fundWeight: number;
      weightInFund: number;
      contribution: number;
    }>
  >
): KraySlice[] {
  const slices: KraySlice[] = [];
  for (const [label, weight] of totals) {
    slices.push({
      label,
      weight,
      contributors: contributors.get(label) ?? [],
    });
  }
  // Ordenamos descendente por peso para que el primero sea el más grande.
  return slices.sort((a, b) => b.weight - a.weight);
}

export async function runKray(input: KrayInput): Promise<KrayResult> {
  const portfolioName = input.name ?? "Cartera";
  const holdings = input.holdings.filter((h) => h.weight > 0);

  const warnings: KrayWarning[] = [];
  const funds: KrayResult["funds"] = [];

  // Agregadores. Cada Map<string, number> guarda el peso TOTAL acumulado de
  // esa categoría. El segundo Map guarda los contribuyentes (fondos) para
  // poder explicar al usuario de dónde viene cada porcentaje.
  const sectorTotals = new Map<string, number>();
  const sectorContribs = new Map<string, KraySlice["contributors"]>();
  const regionTotals = new Map<string, number>();
  const regionContribs = new Map<string, KraySlice["contributors"]>();
  const countryTotals = new Map<string, number>();
  const countryContribs = new Map<string, KraySlice["contributors"]>();
  const assetTotals = new Map<string, number>();
  const assetContribs = new Map<string, KraySlice["contributors"]>();

  // Para holdings individuales, agregamos por clave canónica
  type HoldingAgg = {
    name: string;
    code?: string;
    sector?: string;
    region?: string;
    totalWeight: number;
    inFunds: KrayHolding["inFunds"];
  };
  const holdingsAgg = new Map<string, HoldingAgg>();

  function addToCategory(
    totals: Map<string, number>,
    contribs: Map<string, KraySlice["contributors"]>,
    label: string,
    contribution: number,
    contributorEntry: KraySlice["contributors"][0]
  ) {
    if (!label || contribution === 0) return;
    totals.set(label, (totals.get(label) ?? 0) + contribution);
    const arr = contribs.get(label) ?? [];
    arr.push(contributorEntry);
    contribs.set(label, arr);
  }

  // Procesar cada fondo en paralelo. Para holdings dinámicos (fundId con
  // prefijo `eodhd-` o `yahoo-`) usamos el snapshot del Fund que viene en
  // el holding para resolver ticker/ISIN; sin él getFundCompositionById no
  // podría encontrar el activo (no está en fund-database).
  const compositions = await Promise.all(
    holdings.map(async (h) => {
      let composition;
      if (h.fund && (h.fund.ticker || h.fund.isin)) {
        // Holding dinámico — usar el snapshot
        composition = await getFundComposition({
          fundId: h.fundId,
          ticker: h.fund.ticker,
          isin: h.fund.isin,
        });
      } else {
        // Holding de la base de datos
        composition = await getFundCompositionById(h.fundId);
      }
      return { holding: h, composition };
    })
  );

  let totalCoverage = 0;

  for (const { holding, composition } of compositions) {
    const fund = getFundById(holding.fundId);
    const fundName =
      composition.name ||
      fund?.shortName ||
      fund?.name ||
      holding.fundId;

    if (!composition.available) {
      warnings.push({
        fundId: holding.fundId,
        fundName,
        message:
          composition.reason ??
          "EODHD no tiene datos de composición para este fondo",
      });
      funds.push({
        fundId: holding.fundId,
        fundName,
        weight: holding.weight,
        isin: composition.isin || fund?.isin,
        available: false,
        topHoldings: [],
      });
      continue;
    }

    totalCoverage += holding.weight;

    funds.push({
      fundId: holding.fundId,
      fundName,
      weight: holding.weight,
      isin: composition.isin || fund?.isin,
      available: true,
      topHoldings: composition.holdings.slice(0, 10).map((h) => ({
        name: h.name,
        code: h.code,
        sector: h.sector,
        weight: h.assetsPercent,
      })),
    });

    const fundWeight = holding.weight; // 0-100 de la cartera

    // --- Sectors ---
    for (const [sector, pct] of Object.entries(composition.sectorWeights)) {
      const contribution = (fundWeight * pct) / 100;
      addToCategory(sectorTotals, sectorContribs, sector, contribution, {
        fundId: holding.fundId,
        fundName,
        fundWeight,
        weightInFund: pct,
        contribution,
      });
    }

    // --- Regions ---
    for (const [region, pct] of Object.entries(composition.worldRegions)) {
      const contribution = (fundWeight * pct) / 100;
      addToCategory(regionTotals, regionContribs, region, contribution, {
        fundId: holding.fundId,
        fundName,
        fundWeight,
        weightInFund: pct,
        contribution,
      });
    }

    // --- Countries ---
    for (const [country, pct] of Object.entries(composition.countryWeights)) {
      const contribution = (fundWeight * pct) / 100;
      addToCategory(countryTotals, countryContribs, country, contribution, {
        fundId: holding.fundId,
        fundName,
        fundWeight,
        weightInFund: pct,
        contribution,
      });
    }

    // --- Asset allocation ---
    for (const [klass, pct] of Object.entries(composition.assetAllocation)) {
      const contribution = (fundWeight * pct) / 100;
      addToCategory(assetTotals, assetContribs, klass, contribution, {
        fundId: holding.fundId,
        fundName,
        fundWeight,
        weightInFund: pct,
        contribution,
      });
    }

    // --- Holdings individuales ---
    for (const h of composition.holdings) {
      const key = canonicalKey(h.name, h.code);
      const contribution = (fundWeight * h.assetsPercent) / 100;
      const existing = holdingsAgg.get(key);
      const entry = {
        fundId: holding.fundId,
        fundName,
        fundWeight,
        weightInFund: h.assetsPercent,
        contribution,
      };
      if (existing) {
        existing.totalWeight += contribution;
        existing.inFunds.push(entry);
        // Preferimos el nombre más legible (largo > corto)
        if (h.name.length > existing.name.length) existing.name = h.name;
        existing.sector = existing.sector ?? h.sector;
        existing.region = existing.region ?? h.region;
      } else {
        holdingsAgg.set(key, {
          name: h.name,
          code: h.code,
          sector: h.sector,
          region: h.region,
          totalWeight: contribution,
          inFunds: [entry],
        });
      }
    }
  }

  const uncoveredWeight = Math.max(
    0,
    holdings.reduce((s, h) => s + h.weight, 0) - totalCoverage
  );

  // Construir top holdings + duplicados a partir del aggregator
  const allHoldings: KrayHolding[] = Array.from(holdingsAgg.values())
    .map((agg) => ({
      name: agg.name,
      code: agg.code,
      sector: agg.sector,
      region: agg.region,
      totalWeight: agg.totalWeight,
      inFunds: agg.inFunds.sort((a, b) => b.contribution - a.contribution),
    }))
    .sort((a, b) => b.totalWeight - a.totalWeight);

  const topHoldings = allHoldings.slice(0, 10);
  const duplicates: KrayDuplicate[] = allHoldings
    .filter((h) => h.inFunds.length >= 2)
    .map((h) => ({ ...h, fundCount: h.inFunds.length }));

  return {
    portfolioName,
    totalCoverage,
    uncoveredWeight,
    funds,
    byAssetClass: mapToSlices(assetTotals, assetContribs),
    bySector: mapToSlices(sectorTotals, sectorContribs),
    byRegion: mapToSlices(regionTotals, regionContribs),
    byCountry: mapToSlices(countryTotals, countryContribs),
    topHoldings,
    duplicates,
    warnings,
  };
}
