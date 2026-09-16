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
import {
  translateSector,
  translateRegion,
  translateCountry,
  translateAssetClass,
} from "./kray-translations";
import type { KrayFicha, KrayFundamentales } from "./kray-types";
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

/** Acumulador de una media ponderada. `armonica()` para ratios de precio (PER, P/VC): es la forma
 *  correcta de agregar múltiplos de una cartera (equivale a ponderar beneficios, no PERes). */
class Ponderado {
  peso = 0;
  private suma = 0;
  private sumaInv = 0;
  add(w: number, v: number) {
    if (!(w > 0) || !Number.isFinite(v)) return;
    this.peso += w;
    this.suma += w * v;
    if (v !== 0) this.sumaInv += w / v;
  }
  media(): number | null { return this.peso > 0 ? this.suma / this.peso : null; }
  armonica(): number | null { return this.peso > 0 && this.sumaInv > 0 ? this.peso / this.sumaInv : null; }
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

  // --- Fundamentales (beta): ficha por fondo y agregados ponderados ---
  const fichas: KrayFicha[] = [];
  const ter = new Ponderado();            // TER medio (aritmética)
  const rfDur = new Ponderado(), rfYtm = new Ponderado(), rfVenc = new Ponderado(), rfCup = new Ponderado();
  const per = new Ponderado(), pb = new Ponderado(), ps = new Ponderado(), dy = new Ponderado();
  let pesoRF = 0, pesoRV = 0;

  for (const { holding, composition } of compositions) {
    const fund = getFundById(holding.fundId);
    const fundName =
      composition.name ||
      fund?.shortName ||
      fund?.name ||
      holding.fundId;

    // La ficha va antes del "continue" de abajo: un ETF puede traer ficha sin desgloses (p. ej. X57E).
    const fi = composition.ficha;
    const terFondo = fi?.ter ?? fund?.ter;
    fichas.push({
      fundId: holding.fundId, fundName, weight: holding.weight, isin: composition.isin || fund?.isin,
      conDatos: !!fi, listado: fi?.listado, ter: terFondo, aum: fi?.aum, gestora: fi?.gestora, indice: fi?.indice,
      domicilio: fi?.domicilio, lanzamiento: fi?.lanzamiento, rotacion: fi?.rotacion, estrellas: fi?.estrellas,
      sostenibilidad: fi?.sostenibilidad, categoria: fi?.categoria, rentab: fi?.rentab, vol1: fi?.vol1, vol3: fi?.vol3,
      sharpe3: fi?.sharpe3, rf: fi?.rf, valor: fi?.valor,
    });
    if (terFondo !== undefined) ter.add(holding.weight, terFondo);
    if (fi) {
      // Qué parte del fondo es bonos y qué parte bolsa, según su propio reparto de activos. Si el reparto no
      // lo dice pero la ficha trae duración (o PER), se toma el fondo entero como bonos (o como bolsa).
      const reparto = composition.assetAllocation;
      const suma = (re: RegExp) => Object.entries(reparto).filter(([k]) => re.test(k)).reduce((a, [, v]) => a + (v > 0 ? v : 0), 0);
      let bonos = suma(/bond|fixed|renta fija|obligaci/i);
      let bolsa = suma(/stock|equity|acciones|renta variable/i);
      if (!bonos && !bolsa) { bonos = fi.rf ? 100 : 0; bolsa = fi.valor ? 100 : 0; }
      const wRF = (holding.weight * Math.min(100, bonos)) / 100;
      const wRV = (holding.weight * Math.min(100, bolsa)) / 100;
      if (fi.rf && wRF > 0) {
        pesoRF += wRF;
        if (fi.rf.duracion !== undefined) rfDur.add(wRF, fi.rf.duracion);
        if (fi.rf.ytm !== undefined) rfYtm.add(wRF, fi.rf.ytm);
        if (fi.rf.vencimiento !== undefined) rfVenc.add(wRF, fi.rf.vencimiento);
        if (fi.rf.cupon !== undefined) rfCup.add(wRF, fi.rf.cupon);
      }
      if (fi.valor && wRV > 0) {
        pesoRV += wRV;
        if (fi.valor.per) per.add(wRV, fi.valor.per);
        if (fi.valor.pb) pb.add(wRV, fi.valor.pb);
        if (fi.valor.ps) ps.add(wRV, fi.valor.ps);
        if (fi.valor.dividendo !== undefined) dy.add(wRV, fi.valor.dividendo);
      }
    }

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
        sector: h.sector ? translateSector(h.sector) : h.sector,
        weight: h.assetsPercent,
      })),
    });

    const fundWeight = holding.weight; // 0-100 de la cartera

    // --- Sectors ---  (traducidos al castellano para que la UI los muestre así
    // y para deduplicar variantes "Consumer Cyclical" vs "Consumer Cyclicals")
    for (const [sector, pct] of Object.entries(composition.sectorWeights)) {
      const label = translateSector(sector);
      const contribution = (fundWeight * pct) / 100;
      addToCategory(sectorTotals, sectorContribs, label, contribution, {
        fundId: holding.fundId,
        fundName,
        fundWeight,
        weightInFund: pct,
        contribution,
      });
    }

    // --- Regions ---
    for (const [region, pct] of Object.entries(composition.worldRegions)) {
      const label = translateRegion(region);
      const contribution = (fundWeight * pct) / 100;
      addToCategory(regionTotals, regionContribs, label, contribution, {
        fundId: holding.fundId,
        fundName,
        fundWeight,
        weightInFund: pct,
        contribution,
      });
    }

    // --- Countries ---
    for (const [country, pct] of Object.entries(composition.countryWeights)) {
      const label = translateCountry(country);
      const contribution = (fundWeight * pct) / 100;
      addToCategory(countryTotals, countryContribs, label, contribution, {
        fundId: holding.fundId,
        fundName,
        fundWeight,
        weightInFund: pct,
        contribution,
      });
    }

    // --- Asset allocation ---
    for (const [klass, pct] of Object.entries(composition.assetAllocation)) {
      const label = translateAssetClass(klass);
      const contribution = (fundWeight * pct) / 100;
      addToCategory(assetTotals, assetContribs, label, contribution, {
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
      const translatedSector = h.sector ? translateSector(h.sector) : undefined;
      const translatedRegion = h.region ? translateRegion(h.region) : undefined;
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
        existing.sector = existing.sector ?? translatedSector;
        existing.region = existing.region ?? translatedRegion;
      } else {
        holdingsAgg.set(key, {
          name: h.name,
          code: h.code,
          sector: translatedSector,
          region: translatedRegion,
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

  const fundamentales: KrayFundamentales | undefined = fichas.some((f) => f.conDatos)
    ? {
        costes: { terMedio: ter.media(), pesoConTer: ter.peso },
        rentaFija: pesoRF > 0 ? { peso: pesoRF, duracion: rfDur.media(), ytm: rfYtm.media(), vencimiento: rfVenc.media(), cupon: rfCup.media() } : null,
        valoracion: pesoRV > 0 ? { peso: pesoRV, per: per.armonica(), pb: pb.armonica(), ps: ps.armonica(), dividendo: dy.media() } : null,
        fichas,
      }
    : undefined;

  return {
    portfolioName,
    fundamentales,
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
