// =============================================================================
// EODHD FUNDAMENTALS - Composición de ETFs y fondos (sectores, países, holdings)
// =============================================================================
//
// Llama al endpoint /fundamentals de EODHD para obtener:
//   - Sector_Weights:  desglose sectorial del fondo (Technology, Financials, ...)
//   - World_Regions:   desglose por región / continente
//   - Country_Weights: desglose por país
//   - Top_10_Holdings: top 10 posiciones individuales (acciones / bonos)
//   - Asset_Allocation: equity vs bond vs cash
//
// Cacheamos a Redis (Upstash) con TTL largo (90 días) porque la composición
// de un fondo no cambia con frecuencia.
// =============================================================================

import { getRequestContext } from "./request-context";
import { getFundById } from "./fund-database";

const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN || "";
const EODHD_BASE_URL = "https://eodhd.com/api";

// Versión de cache — bump cuando cambiemos parseo o queramos invalidar
const FUNDAMENTALS_CACHE_VERSION = "f-v1";
const FUNDAMENTALS_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 días

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface FundHolding {
  /** Nombre legible del activo (e.g. "APPLE INC", "MICROSOFT CORP"). */
  name: string;
  /** Ticker / código si EODHD lo provee. */
  code?: string;
  /** Sector si EODHD lo provee. */
  sector?: string;
  /** País / región si EODHD lo provee. */
  region?: string;
  /** Peso en % del fondo (0-100). */
  assetsPercent: number;
}

export interface FundComposition {
  /** ISIN del fondo / ETF. */
  isin: string;
  /** Nombre completo. */
  name: string;
  /** Tipo: "ETF" | "FUND" | otros. */
  type?: string;
  /** Asset class principal: "Equity" | "Fixed Income" | "Mixed" | ... */
  assetClass?: string;
  /** TER del fondo, si EODHD lo trae (en %). */
  ter?: number;
  /** Desglose por sectores: { "Technology": 25.4, ... } — valores en %. */
  sectorWeights: Record<string, number>;
  /** Desglose por regiones del mundo (continente o broad region). */
  worldRegions: Record<string, number>;
  /** Desglose por país. */
  countryWeights: Record<string, number>;
  /** Asset allocation: { "Equity": 95, "Bond": 0, "Cash": 5, ... }. */
  assetAllocation: Record<string, number>;
  /** Top 10 (o más, hasta 50) holdings individuales. */
  holdings: FundHolding[];
  /** Fecha "as of" que reporta EODHD (puede no ser muy reciente). */
  asOfDate?: string;
  /** Si EODHD NO encontró datos de composición, lo marcamos. */
  available: boolean;
  /** Mensaje de error / aviso si available=false. */
  reason?: string;
}

// -----------------------------------------------------------------------------
// Cache helpers
// -----------------------------------------------------------------------------

// Cache en memoria del proceso. La capa de Redis vive en kv-cache pero ese
// módulo asume DailyPrice[] como valor. Hacemos un cache simple aquí (memory
// only por ahora — el endpoint /fundamentals es relativamente barato y los
// resultados son pequeños).
const memCache = new Map<string, { data: FundComposition; ts: number }>();
const MEM_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

function memKey(ident: string): string {
  return `${FUNDAMENTALS_CACHE_VERSION}:${ident}`;
}

// -----------------------------------------------------------------------------
// Llamada a EODHD
// -----------------------------------------------------------------------------

interface EodhdHoldingsObject {
  [name: string]: {
    Code?: string;
    Name?: string;
    Sector?: string;
    Country?: string;
    Region?: string;
    Industry?: string;
    "Assets_%"?: number | string;
  };
}

interface EodhdWeightObject {
  [key: string]: {
    "Equity_%"?: number | string;
    "Relative_to_Category"?: number | string;
  } | number | string;
}

interface EodhdFundamentalsResponse {
  General?: {
    Code?: string;
    Name?: string;
    ISIN?: string;
    Type?: string; // "ETF", "FUND", ...
  };
  ETF_Data?: {
    ISIN?: string;
    Name?: string;
    Asset_Class?: string;
    Net_Expense_Ratio?: number | string;
    Holdings?: EodhdHoldingsObject;
    Top_10_Holdings?: EodhdHoldingsObject;
    Sector_Weights?: EodhdWeightObject;
    World_Regions?: EodhdWeightObject;
    Country_Weights?: EodhdWeightObject;
    Asset_Allocation?: EodhdWeightObject;
    HoldingsTopDate?: string;
  };
  MutualFund_Data?: {
    Asset_Allocation?: EodhdWeightObject;
    Equity_Holdings?: EodhdHoldingsObject;
    Bond_Holdings?: EodhdHoldingsObject;
    Top_Holdings?: EodhdHoldingsObject;
    Sector_Weights?: EodhdWeightObject;
    World_Regions?: EodhdWeightObject;
    Country_Weights?: EodhdWeightObject;
  };
}

/** Parsea un objeto de "weights" donde el valor puede ser número plano o
 *  un sub-objeto con "Equity_%" — formato típico de EODHD según el endpoint. */
function parseWeights(obj: EodhdWeightObject | undefined): Record<string, number> {
  if (!obj || typeof obj !== "object") return {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "number") {
      result[key] = value;
    } else if (typeof value === "string") {
      const num = parseFloat(value);
      if (!isNaN(num)) result[key] = num;
    } else if (value && typeof value === "object") {
      const v = value["Equity_%"] ?? value["Relative_to_Category"];
      if (typeof v === "number") result[key] = v;
      else if (typeof v === "string") {
        const num = parseFloat(v);
        if (!isNaN(num)) result[key] = num;
      }
    }
  }
  return result;
}

function parseHoldings(obj: EodhdHoldingsObject | undefined): FundHolding[] {
  if (!obj || typeof obj !== "object") return [];
  const arr: FundHolding[] = [];
  for (const [key, raw] of Object.entries(obj)) {
    const pct =
      typeof raw["Assets_%"] === "number"
        ? raw["Assets_%"]
        : typeof raw["Assets_%"] === "string"
        ? parseFloat(raw["Assets_%"])
        : NaN;
    if (isNaN(pct) || pct <= 0) continue;
    arr.push({
      name: raw.Name ?? key,
      code: raw.Code,
      sector: raw.Sector ?? raw.Industry,
      region: raw.Country ?? raw.Region,
      assetsPercent: pct,
    });
  }
  return arr.sort((a, b) => b.assetsPercent - a.assetsPercent);
}

/**
 * Construye el ticker EODHD a partir del fondo. Para ETFs UCITS suele ser
 * <yahooTicker> directamente. Para fondos mutuos europeos EODHD usa el
 * sufijo ".EUFUND" sobre el ISIN.
 *
 * Devolvemos una lista de candidatos para probar en orden.
 */
function buildEodhdCandidates(args: {
  fundId?: string;
  yahooTicker?: string;
  isin?: string;
}): string[] {
  const out: string[] = [];
  if (args.yahooTicker) out.push(args.yahooTicker);
  if (args.isin) out.push(`${args.isin}.EUFUND`);
  if (args.fundId && args.fundId !== args.yahooTicker) out.push(args.fundId);
  return Array.from(new Set(out)); // dedupe
}

async function fetchFromEodhd(ticker: string): Promise<EodhdFundamentalsResponse | null> {
  if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") return null;
  const url = `${EODHD_BASE_URL}/fundamentals/${encodeURIComponent(ticker)}?fmt=json&api_token=${EODHD_API_TOKEN}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // EODHD a veces tarda — timeout razonable
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[EODHD-fundamentals] HTTP ${res.status} para ${ticker}`);
      return null;
    }
    const json = (await res.json()) as EodhdFundamentalsResponse;
    return json;
  } catch (err) {
    console.warn(`[EODHD-fundamentals] Error fetching ${ticker}:`, err);
    return null;
  }
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

/**
 * Obtiene la composición de un fondo / ETF.
 *
 * Estrategia:
 *  1) Busca en cache de memoria
 *  2) Si no está, prueba con los tickers candidatos (yahoo, ISIN.EUFUND, fundId)
 *  3) Parsea según ETF_Data o MutualFund_Data y devuelve FundComposition
 *
 * Si EODHD no tiene datos para ese fondo, devuelve { available: false, reason }.
 * El motor de K-Ray maneja gracefully los fondos sin datos.
 */
export async function getFundComposition(args: {
  fundId: string;
  yahooTicker?: string;
  isin?: string;
}): Promise<FundComposition> {
  const cacheIdent = args.fundId || args.isin || args.yahooTicker || "";
  // Memoria
  const cached = memCache.get(memKey(cacheIdent));
  if (cached && Date.now() - cached.ts < MEM_TTL_MS) {
    return cached.data;
  }

  // Si el contexto pide forzar Yahoo, EODHD fundamentals no tiene equivalente
  // — devolvemos no disponible. (Yahoo no expone esto vía API pública).
  const ctx = getRequestContext();
  if (ctx?.dataSource === "yahoo") {
    const empty: FundComposition = {
      isin: args.isin ?? "",
      name: args.fundId,
      sectorWeights: {},
      worldRegions: {},
      countryWeights: {},
      assetAllocation: {},
      holdings: [],
      available: false,
      reason: "Composición no disponible en fuente Yahoo — usa EODHD",
    };
    return empty;
  }

  const candidates = buildEodhdCandidates(args);
  let raw: EodhdFundamentalsResponse | null = null;
  let usedTicker: string | undefined;
  for (const candidate of candidates) {
    raw = await fetchFromEodhd(candidate);
    if (
      raw &&
      (raw.ETF_Data || raw.MutualFund_Data || raw.General)
    ) {
      usedTicker = candidate;
      break;
    }
  }

  if (!raw) {
    const empty: FundComposition = {
      isin: args.isin ?? "",
      name: args.fundId,
      sectorWeights: {},
      worldRegions: {},
      countryWeights: {},
      assetAllocation: {},
      holdings: [],
      available: false,
      reason: `EODHD no tiene datos de composición para ${args.fundId}`,
    };
    memCache.set(memKey(cacheIdent), { data: empty, ts: Date.now() });
    return empty;
  }

  // Algunos fondos vienen como ETF, otros como MutualFund. Probamos primero
  // ETF (datos más completos) y fallback a MutualFund.
  const etf = raw.ETF_Data;
  const mf = raw.MutualFund_Data;

  const sectorWeights = parseWeights(etf?.Sector_Weights ?? mf?.Sector_Weights);
  const worldRegions = parseWeights(etf?.World_Regions ?? mf?.World_Regions);
  const countryWeights = parseWeights(etf?.Country_Weights ?? mf?.Country_Weights);
  const assetAllocation = parseWeights(
    etf?.Asset_Allocation ?? mf?.Asset_Allocation
  );

  // Top holdings: ETF.Top_10_Holdings es el más típico. Si no existe pero hay
  // ETF.Holdings (más completo), lo usamos y nos quedamos con los 10 primeros.
  let holdings: FundHolding[] = [];
  if (etf?.Top_10_Holdings) {
    holdings = parseHoldings(etf.Top_10_Holdings);
  } else if (etf?.Holdings) {
    holdings = parseHoldings(etf.Holdings).slice(0, 10);
  } else if (mf?.Top_Holdings) {
    holdings = parseHoldings(mf.Top_Holdings);
  } else if (mf?.Equity_Holdings) {
    holdings = parseHoldings(mf.Equity_Holdings).slice(0, 10);
  }

  const composition: FundComposition = {
    isin: raw.General?.ISIN ?? args.isin ?? "",
    name: etf?.Name ?? raw.General?.Name ?? args.fundId,
    type: raw.General?.Type ?? (etf ? "ETF" : mf ? "FUND" : undefined),
    assetClass: etf?.Asset_Class,
    ter:
      typeof etf?.Net_Expense_Ratio === "number"
        ? etf.Net_Expense_Ratio
        : typeof etf?.Net_Expense_Ratio === "string"
        ? parseFloat(etf.Net_Expense_Ratio)
        : undefined,
    sectorWeights,
    worldRegions,
    countryWeights,
    assetAllocation,
    holdings,
    asOfDate: etf?.HoldingsTopDate,
    // Si todo está vacío, marcamos como no disponible aunque EODHD haya
    // devuelto algún metadato general.
    available:
      Object.keys(sectorWeights).length > 0 ||
      Object.keys(worldRegions).length > 0 ||
      Object.keys(countryWeights).length > 0 ||
      holdings.length > 0,
    reason:
      Object.keys(sectorWeights).length === 0 &&
      holdings.length === 0
        ? `EODHD respondió pero sin breakdown ni holdings (ticker ${usedTicker})`
        : undefined,
  };

  memCache.set(memKey(cacheIdent), { data: composition, ts: Date.now() });
  return composition;
}

/**
 * Helper: dado un fundId de nuestra base, resuelve y obtiene su composición.
 * Si el fondo no existe en fund-database, intenta usar el fundId directamente.
 */
export async function getFundCompositionById(
  fundId: string
): Promise<FundComposition> {
  const fund = getFundById(fundId);
  return getFundComposition({
    fundId,
    yahooTicker: fund?.yahooTicker,
    isin: fund?.isin,
  });
}
