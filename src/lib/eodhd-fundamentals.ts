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

import { getFundById } from "./fund-database";
import { getFundCompositionFromFT } from "./ft-fundamentals";

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
    Type?: string; // "ETF", "FUND", "Common Stock", "Currency", "Crypto", ...
    Sector?: string;
    Industry?: string;
    CountryName?: string;
    CountryISO?: string;
    CurrencyCode?: string;
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

/**
 * Parsea un objeto de "weights" de EODHD. EODHD usa DOS formatos distintos:
 *
 * 1) FORMATO ETF (plano): cada key es una categoría con un sub-objeto que
 *    tiene "Equity_%" o "Relative_to_Category":
 *      { "Technology": { "Equity_%": 25.4 }, ... }
 *
 * 2) FORMATO MUTUAL FUND (anidado por super-categoría): cada key superior
 *    agrupa varias entradas indexadas con "0","1","2",… donde cada entrada
 *    tiene "Name" + un campo de cantidad ("Amount_%", "Stocks_%", "Net_%"):
 *      { "Cyclical": { "0": { "Name": "Basic Materials", "Amount_%": 5.5 }, ... } }
 *
 * Nuestro parser detecta automáticamente cuál es y devuelve siempre un mapa
 * plano { categoría → peso } para que el resto del código no se entere.
 */
function parseWeights(
  obj: EodhdWeightObject | undefined
): Record<string, number> {
  if (!obj || typeof obj !== "object") return {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "number") {
      result[key] = value;
      continue;
    }
    if (typeof value === "string") {
      const num = parseFloat(value);
      if (!isNaN(num)) result[key] = num;
      continue;
    }
    if (!value || typeof value !== "object") continue;

    // ¿Formato plano ETF? Tiene "Equity_%" o "Relative_to_Category" directo.
    const v = (value as Record<string, unknown>)["Equity_%"] ??
      (value as Record<string, unknown>)["Relative_to_Category"];
    if (typeof v === "number") {
      result[key] = v;
      continue;
    }
    if (typeof v === "string") {
      const num = parseFloat(v);
      if (!isNaN(num)) result[key] = num;
      continue;
    }

    // ¿Formato anidado mutual fund? Tiene keys numéricas dentro, cada una con
    // "Name" + uno de los campos de cantidad.
    const inner = value as Record<string, unknown>;
    const numericChildren = Object.keys(inner).filter((k) => /^\d+$/.test(k));
    if (numericChildren.length === 0) continue;
    for (const childKey of numericChildren) {
      const child = inner[childKey] as Record<string, unknown> | undefined;
      if (!child || typeof child !== "object") continue;
      const name = child["Name"];
      if (typeof name !== "string" || !name) continue;
      const amountRaw =
        child["Amount_%"] ??
        child["Stocks_%"] ??
        child["Net_%"] ??
        child["Fund_%"] ??
        child["Long_%"];
      if (amountRaw === undefined || amountRaw === null) continue;
      const num =
        typeof amountRaw === "number" ? amountRaw : parseFloat(String(amountRaw));
      if (isNaN(num)) continue;
      result[name] = num;
    }
  }
  return result;
}

/**
 * Parsea Asset_Allocation cuando viene en FORMATO MUTUAL FUND (objeto con
 * keys numéricas "0","1","2"… cada uno con "Type" + "Net_%"). El campo
 * etiqueta es `Type`, no `Name`, así que es un parser específico.
 */
function parseAssetAllocationMutualFund(
  obj: EodhdWeightObject | undefined
): Record<string, number> {
  if (!obj || typeof obj !== "object") return {};
  const result: Record<string, number> = {};
  const numericChildren = Object.keys(obj).filter((k) => /^\d+$/.test(k));
  for (const childKey of numericChildren) {
    const child = (obj as Record<string, unknown>)[childKey] as
      | Record<string, unknown>
      | undefined;
    if (!child || typeof child !== "object") continue;
    const type = child["Type"];
    if (typeof type !== "string" || !type) continue;
    const amountRaw = child["Net_%"] ?? child["Long_%"];
    if (amountRaw === undefined || amountRaw === null) continue;
    const num =
      typeof amountRaw === "number" ? amountRaw : parseFloat(String(amountRaw));
    if (isNaN(num)) continue;
    if (num !== 0) result[type] = num;
  }
  return result;
}

function parseHoldings(obj: EodhdHoldingsObject | undefined): FundHolding[] {
  if (!obj || typeof obj !== "object") return [];
  const arr: FundHolding[] = [];
  for (const [key, raw] of Object.entries(obj)) {
    if (!raw || typeof raw !== "object") continue;
    // Intentamos varios campos de peso:
    //   ETF: "Assets_%" (numérico)
    //   Mutual fund: "Weight" (string tipo "14.52%")
    let pct: number = NaN;
    const assetsField = (raw as Record<string, unknown>)["Assets_%"];
    if (typeof assetsField === "number") pct = assetsField;
    else if (typeof assetsField === "string") pct = parseFloat(assetsField);

    if (isNaN(pct)) {
      const weight = (raw as Record<string, unknown>)["Weight"];
      if (typeof weight === "number") pct = weight;
      else if (typeof weight === "string") {
        // Quitar "%" y espacios antes de parsear ("14.52%" → 14.52)
        pct = parseFloat(weight.replace(/%/g, "").trim());
      }
    }
    if (isNaN(pct) || pct <= 0) continue;
    // FILTRO ANTI-RUIDO: EODHD a veces devuelve entradas corruptas en
    // Top_10_Holdings con key="." y Name=null (visto en ETFs como Invesco
    // MSCI USA IE00B60SX170 / Ossiam Shiller LU1079841273). El fallback
    // `raw.Name ?? key` daba como resultado un holding llamado "." al 100%
    // que envenenaba el top10 agregado.
    //
    // Reglas para filtrar: descartar cualquier holding cuyo nombre sea null,
    // string vacío o un carácter "no-alfanumérico" (".", "-", "--").
    const rawName =
      typeof raw.Name === "string" && raw.Name.trim().length > 0
        ? raw.Name.trim()
        : null;
    const fallbackName =
      typeof key === "string" && /[a-zA-Z0-9]/.test(key) ? key : null;
    const name = rawName ?? fallbackName;
    if (!name) continue;
    arr.push({
      name,
      code: raw.Code,
      sector: raw.Sector ?? raw.Industry,
      region: raw.Country ?? raw.Region,
      assetsPercent: pct,
    });
  }
  return arr.sort((a, b) => b.assetsPercent - a.assetsPercent);
}

/**
 * Construye el ticker EODHD a partir del fondo. Nuestra base de datos guarda
 * el `ticker` con los sufijos clásicos de bolsa (.DE para Xetra, .L para
 * London, etc.). EODHD usa códigos de exchange DISTINTOS para algunos
 * mercados:
 *
 *   .DE   (Xetra)   →  EODHD .XETRA  (también .F para Frankfurt)
 *   .L    (London)  →  EODHD .LSE
 *   .AS, .PA, .MI, .SW, .F → idénticos en EODHD (no necesitan mapeo)
 *
 * Si pasamos `XDWS.DE` a EODHD nos devuelve 404 — necesita `XDWS.XETRA`.
 *
 * La estrategia: probamos varios candidatos en orden. El primero que devuelva
 * datos válidos (no 404, no objeto vacío) gana. Para tickers ambiguos
 * (e.g. XDWS) probamos: XDWS.XETRA → XDWS.F → ISIN.EUFUND.
 */
function buildEodhdCandidates(args: {
  fundId?: string;
  ticker?: string;
  isin?: string;
}): string[] {
  const out: string[] = [];

  if (args.ticker) {
    out.push(args.ticker);

    // Mapeo de sufijos clásicos → EODHD para mercados que usan códigos
    // distintos. Si el ticker termina en alguno de estos, añadimos su
    // variante EODHD como candidato adicional ANTES del fallback de .EUFUND.
    const yt = args.ticker;
    const dotIdx = yt.lastIndexOf(".");
    if (dotIdx > 0) {
      const base = yt.substring(0, dotIdx);
      const suffix = yt.substring(dotIdx + 1).toUpperCase();
      // Mapa de sufijo clásico → suffix(es) EODHD a probar como alternativa
      const map: Record<string, string[]> = {
        DE: ["XETRA", "F"],           // .DE = Xetra; EODHD usa .XETRA o .F (Frankfurt)
        L: ["LSE"],                   // .L = London; EODHD usa .LSE
        MI: ["MI"],                   // Borsa Italiana — igual
        AS: ["AS"],                   // Amsterdam — igual
        PA: ["PA"],                   // Paris — igual
        SW: ["SW"],                   // Swiss — igual
        F: ["F"],                     // Frankfurt — igual
      };
      const alts = map[suffix];
      if (alts) {
        for (const alt of alts) {
          if (alt !== suffix) out.push(`${base}.${alt}`);
        }
      }
    }
  }

  if (args.isin) out.push(`${args.isin}.EUFUND`);
  if (args.fundId && args.fundId !== args.ticker) out.push(args.fundId);

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

/**
 * Comprueba si una respuesta de EODHD trae datos REALES de composición —
 * no sólo la cáscara con General/Technicals. Algunos listings devuelven
 * 200 OK con ETF_Data presente pero todos los breakdowns vacíos; eso
 * lo consideramos "sin datos" para que el caller intente otro listing.
 */
function hasRealComposition(raw: EodhdFundamentalsResponse | null): boolean {
  if (!raw) return false;
  const etf = raw.ETF_Data;
  const mf = raw.MutualFund_Data;
  const checkBlock = (block: typeof etf | typeof mf): boolean => {
    if (!block) return false;
    const sw = (block as { Sector_Weights?: unknown }).Sector_Weights;
    const wr = (block as { World_Regions?: unknown }).World_Regions;
    const cw = (block as { Country_Weights?: unknown }).Country_Weights;
    const aa = (block as { Asset_Allocation?: unknown }).Asset_Allocation;
    const th10 = (block as { Top_10_Holdings?: unknown }).Top_10_Holdings;
    const th = (block as { Top_Holdings?: unknown }).Top_Holdings;
    const h = (block as { Holdings?: unknown }).Holdings;
    const eh = (block as { Equity_Holdings?: unknown }).Equity_Holdings;
    const nonEmpty = (o: unknown) =>
      o && typeof o === "object" && Object.keys(o as object).length > 0;
    return Boolean(
      nonEmpty(sw) ||
        nonEmpty(wr) ||
        nonEmpty(cw) ||
        nonEmpty(aa) ||
        nonEmpty(th10) ||
        nonEmpty(th) ||
        nonEmpty(h) ||
        nonEmpty(eh)
    );
  };
  return checkBlock(etf) || checkBlock(mf);
}

/**
 * Puntúa la "riqueza" de datos en una respuesta de EODHD. Algunas listings
 * del mismo ISIN devuelven sólo sectores poblados pero los top_holdings
 * son una entrada corrupta `{".": {Name: null, Assets_%: 100}}` — si
 * elegimos ese listing nos quedamos sin top10. Otros listings del mismo
 * fondo sí tienen los holdings reales.
 *
 * El score cuenta el número de holdings VÁLIDOS (que pasen el filtro de
 * parseHoldings) + un bonus pequeño por sectores y otros breakdowns.
 * El caller probará varios listings y se quedará con el de score más alto.
 */
function scoreComposition(raw: EodhdFundamentalsResponse | null): number {
  if (!raw) return 0;
  const etf = raw.ETF_Data;
  const mf = raw.MutualFund_Data;
  // Cuenta de holdings con NOMBRE válido (no null, no ".", no "-")
  const countValidHoldings = (obj: unknown): number => {
    if (!obj || typeof obj !== "object") return 0;
    let count = 0;
    for (const [key, raw] of Object.entries(obj as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const rawName = (raw as { Name?: unknown }).Name;
      const validRawName =
        typeof rawName === "string" && rawName.trim().length > 0;
      const validFallback =
        typeof key === "string" && /[a-zA-Z0-9]/.test(key);
      if (validRawName || validFallback) count++;
    }
    return count;
  };
  const countWeights = (obj: unknown): number => {
    if (!obj || typeof obj !== "object") return 0;
    return Object.keys(obj as object).length;
  };

  const block = etf || mf;
  if (!block) return 0;
  const th =
    (block as { Top_10_Holdings?: unknown }).Top_10_Holdings ||
    (block as { Top_Holdings?: unknown }).Top_Holdings ||
    (block as { Holdings?: unknown }).Holdings ||
    (block as { Equity_Holdings?: unknown }).Equity_Holdings;
  const holdingsCount = countValidHoldings(th);
  const sectors = countWeights((block as { Sector_Weights?: unknown }).Sector_Weights);
  const regions = countWeights((block as { World_Regions?: unknown }).World_Regions);
  const countries = countWeights(
    (block as { Country_Weights?: unknown }).Country_Weights
  );
  // Holdings vale más que sector/region porque es lo que más se ve en K-Ray.
  // Cada holding suma 10 puntos. Cada otro breakdown suma 1.
  return holdingsCount * 10 + sectors + regions + countries;
}

/**
 * Cuando el lookup directo de un ticker no da suficientes datos, buscamos
 * por ISIN y probamos todos los listings devueltos, quedándonos con el de
 * MEJOR score (más holdings + breakdowns válidos). Caso típico: ETFs
 * Xtrackers donde X57E.XETRA está vacío pero DBXR.XETRA del mismo ISIN
 * tiene los datos. O Ossiam donde CAPU.PA sólo tiene la entrada corrupta
 * "." pero USCP.XETRA tiene los holdings reales.
 *
 * @param minScore Score mínimo que ya tenemos; sólo aceptamos un alt que
 *                 lo mejore. Permite detener la búsqueda antes si
 *                 encontramos algo claramente mejor.
 */
async function findAlternativeListingBestScore(
  isin: string,
  minScore: number
): Promise<{ raw: EodhdFundamentalsResponse; ticker: string; score: number } | null> {
  if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") return null;
  try {
    const searchUrl = `${EODHD_BASE_URL}/search/${encodeURIComponent(isin)}?api_token=${EODHD_API_TOKEN}&limit=20`;
    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const listings = (await res.json()) as Array<{
      Code?: string;
      Exchange?: string;
      Type?: string;
    }>;
    if (!Array.isArray(listings)) return null;
    // Sólo ETFs/FUNDs/EUFUND
    const candidates = listings
      .filter((l) => l.Code && l.Exchange)
      .filter(
        (l) =>
          l.Type === "ETF" ||
          l.Type === "FUND" ||
          l.Type === "Fund" ||
          l.Exchange === "EUFUND"
      )
      .map((l) => `${l.Code}.${l.Exchange}`);

    let best: { raw: EodhdFundamentalsResponse; ticker: string; score: number } | null = null;
    for (const ticker of candidates) {
      const raw = await fetchFromEodhd(ticker);
      if (!raw) continue;
      const score = scoreComposition(raw);
      if (score > (best?.score ?? minScore)) {
        best = { raw, ticker, score };
        if (score >= 50) break; // suficiente
      }
    }
    if (best) {
      console.log(
        `[EODHD-fundamentals] Listing alternativo con mejor score para ${isin}: ${best.ticker} (score=${best.score})`
      );
    }
    return best;
  } catch (err) {
    console.warn(
      `[EODHD-fundamentals] Error en findAlternativeListingBestScore(${isin}):`,
      err
    );
    return null;
  }
}

/**
 * Sintetiza una composición para una ACCIÓN INDIVIDUAL. EODHD no devuelve
 * ETF_Data ni MutualFund_Data para Common Stock, pero la acción ES un asset
 * class por sí misma — su sector / industry / country sí vienen en General.
 *
 * Devolvemos un FundComposition con UN único holding (la propia acción al
 * 100% de su peso) más los desgloses sectorial / regional / país coherentes.
 */
function synthesizeStockComposition(
  raw: EodhdFundamentalsResponse,
  args: { fundId: string; ticker?: string; isin?: string }
): FundComposition {
  const g = raw.General ?? {};
  const sector = g.Sector || undefined;
  const country = g.CountryName || undefined;
  return {
    isin: g.ISIN ?? args.isin ?? "",
    name: g.Name ?? args.fundId,
    type: g.Type,
    assetClass: "Equity",
    sectorWeights: sector ? { [sector]: 100 } : {},
    worldRegions: {},
    countryWeights: country ? { [country]: 100 } : {},
    assetAllocation: { Equity: 100 },
    holdings: [
      {
        name: g.Name ?? args.fundId,
        code: g.Code,
        sector,
        region: country,
        assetsPercent: 100,
      },
    ],
    available: true,
  };
}

/**
 * Sintetiza una composición para activos NO de fondos: oro / commodities /
 * cripto / forex. EODHD devuelve sólo el name y type, sin breakdown — pero
 * podemos clasificar por el ticker / nombre para que el agregado de K-Ray
 * sume correctamente este peso a su categoría correspondiente (en vez de
 * dejarlo fuera del análisis).
 */
function synthesizeCommodityComposition(
  raw: EodhdFundamentalsResponse,
  args: { fundId: string; ticker?: string; isin?: string }
): FundComposition {
  const g = raw.General ?? {};
  const name = g.Name ?? args.fundId;
  const upperCode = (g.Code ?? args.ticker ?? args.fundId).toUpperCase();
  const upperName = name.toUpperCase();

  let assetClass = "Other";
  let sector: string | undefined;
  if (
    upperCode.includes("XAU") ||
    upperName.includes("GOLD") ||
    upperName.includes("ORO")
  ) {
    assetClass = "Commodity";
    sector = "Precious Metals - Gold";
  } else if (upperCode.includes("XAG") || upperName.includes("SILVER")) {
    assetClass = "Commodity";
    sector = "Precious Metals - Silver";
  } else if (g.Type?.toLowerCase().includes("crypto") || upperName.includes("BITCOIN")) {
    assetClass = "Cryptocurrency";
    sector = name;
  } else if (g.Type?.toLowerCase().includes("currency") || g.Type?.toLowerCase().includes("forex")) {
    assetClass = "Cash & Currency";
    sector = "Currency";
  } else if (g.Type?.toLowerCase().includes("future")) {
    assetClass = "Commodity";
    sector = "Futures";
  }

  return {
    isin: g.ISIN ?? args.isin ?? "",
    name,
    type: g.Type,
    assetClass,
    sectorWeights: sector ? { [sector]: 100 } : {},
    worldRegions: {},
    countryWeights: {},
    assetAllocation: { [assetClass]: 100 },
    holdings: [
      {
        name,
        code: g.Code,
        sector,
        assetsPercent: 100,
      },
    ],
    available: true,
  };
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

/**
 * Obtiene la composición de un fondo / ETF.
 *
 * Estrategia:
 *  1) Busca en cache de memoria *  2) Si no está, prueba con los tickers candidatos (ticker, ISIN.EUFUND, fundId)
 *  3) Parsea según ETF_Data o MutualFund_Data y devuelve FundComposition
 *
 * Si EODHD no tiene datos para ese fondo, devuelve { available: false, reason }.
 * El motor de K-Ray maneja gracefully los fondos sin datos.
 */
export async function getFundComposition(args: {
  fundId: string;
  ticker?: string;
  isin?: string;
}): Promise<FundComposition> {
  const cacheIdent = args.fundId || args.isin || args.ticker || "";
  // Memoria
  const cached = memCache.get(memKey(cacheIdent));
  if (cached && Date.now() - cached.ts < MEM_TTL_MS) {
    return cached.data;
  }


  const candidates = buildEodhdCandidates(args);
  let raw: EodhdFundamentalsResponse | null = null;
  let usedTicker: string | undefined;
  let bestScore = 0;

  // PASO 1: probar tickers candidatos. Puntuamos cada uno por "riqueza"
  // (cuántos holdings válidos + cuántos sectores/regiones tiene) y nos
  // quedamos con el MEJOR — no con el primero que tenga datos. Caso típico:
  // un mismo ETF está listado como CAPU.PA (1 holding ".") y USCP.XETRA
  // (3 holdings reales + 1 "."). Antes nos quedábamos con CAPU.PA porque
  // venía primero; ahora preferimos USCP.XETRA por tener más holdings.
  let fallbackRaw: EodhdFundamentalsResponse | null = null;
  let fallbackTicker: string | undefined;
  for (const candidate of candidates) {
    const r = await fetchFromEodhd(candidate);
    if (!r) continue;
    const score = scoreComposition(r);
    if (score > bestScore) {
      bestScore = score;
      raw = r;
      usedTicker = candidate;
      // Si ya tenemos al menos 50 puntos (= 5 holdings) podemos parar.
      // Es suficiente para una radiografía decente y evitamos llamadas extra.
      if (score >= 50) break;
    } else if (
      !raw &&
      !fallbackRaw &&
      (r.ETF_Data || r.MutualFund_Data || r.General)
    ) {
      // Cáscara sin datos — guardamos por si todo lo demás falla
      fallbackRaw = r;
      fallbackTicker = candidate;
    }
  }

  // PASO 2: si los candidatos directos dieron un score bajo (<50 puntos = <5
  // holdings), buscamos por ISIN para encontrar listings alternativos y
  // probamos cada uno comparando scores. Caso típico: ETFs Xtrackers donde
  // X57E.XETRA está vacío pero DBXR.XETRA del mismo ISIN tiene los datos
  // completos. También cubre el caso de los Invesco / Ossiam.
  if (args.isin && bestScore < 50) {
    const alt = await findAlternativeListingBestScore(args.isin, bestScore);
    if (alt && alt.score > bestScore) {
      bestScore = alt.score;
      raw = alt.raw;
      usedTicker = alt.ticker;
    }
  }

  // PASO 3 (NUEVO): si EODHD no tiene datos pero el ISIN es UCITS europeo
  // (LU, IE, ES, FR, DE, …), probamos FT.com como fuente alternativa. FT
  // publica las tablas de composición de la mayoría de UCITS europeos en
  // markets.ft.com/data/funds/tearsheet/holdings. Esto cubre el gap conocido
  // de EODHD (que no tiene fundamentals para EU mutual funds).
  if (!raw && args.isin && /^[A-Z]{2}/.test(args.isin)) {
    const ftComp = await getFundCompositionFromFT(args.isin, args.fundId);
    if (ftComp) {
      memCache.set(memKey(cacheIdent), { data: ftComp, ts: Date.now() });
      console.log(
        `[EODHD-fundamentals] Fallback FT.com OK para ${args.fundId} (${args.isin})`
      );
      return ftComp;
    }
  }

  // PASO 4: si ni candidatos ni búsqueda por ISIN ni FT dieron datos pero al
  // menos tenemos la cáscara (con General.Name etc.), usamos esa para devolver
  // metadata del fondo aunque sin breakdown.
  if (!raw && fallbackRaw) {
    raw = fallbackRaw;
    usedTicker = fallbackTicker;
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

  // CASO ESPECIAL 1: ACCIÓN INDIVIDUAL (Common Stock). EODHD no devuelve
  // ETF_Data ni MutualFund_Data, pero la acción ES un asset class por sí
  // misma — sintetizamos una composición de 1 holding = la propia acción,
  // con Sector / Industry / Country que sí vienen en `General`.
  if (raw.General?.Type?.toLowerCase().includes("common stock")) {
    const synth = synthesizeStockComposition(raw, args);
    memCache.set(memKey(cacheIdent), { data: synth, ts: Date.now() });
    return synth;
  }

  // CASO ESPECIAL 2: COMMODITY / CURRENCY / CRYPTO / FUTURE. Activos que
  // NO son fondos pero TAMPOCO acciones individuales con sector. EODHD
  // los devuelve sin breakdown, pero sí podemos sintetizar una composición
  // mínima asignándolos a un asset class y sector apropiados:
  //   XAUUSD.FOREX → Commodity / Precious Metals / Gold
  //   XAGUSD.FOREX → Commodity / Precious Metals / Silver
  //   BTC-USD.CC   → Cryptocurrency / Bitcoin
  //   otros forex  → Cash & Currency
  const generalType = raw.General?.Type?.toString().toLowerCase();
  if (
    generalType &&
    (generalType.includes("currency") ||
      generalType.includes("forex") ||
      generalType.includes("future") ||
      generalType.includes("crypto") ||
      generalType.includes("commodity"))
  ) {
    const synth = synthesizeCommodityComposition(raw, args);
    memCache.set(memKey(cacheIdent), { data: synth, ts: Date.now() });
    return synth;
  }

  // Algunos fondos vienen como ETF, otros como MutualFund. Las estructuras
  // internas DIFIEREN. parseWeights y parseHoldings detectan ambos formatos
  // automáticamente, excepto Asset_Allocation que en mutual funds usa "Type"
  // como etiqueta y tiene su propio parser.
  const etf = raw.ETF_Data;
  const mf = raw.MutualFund_Data;

  const sectorWeights = parseWeights(etf?.Sector_Weights ?? mf?.Sector_Weights);
  const worldRegions = parseWeights(etf?.World_Regions ?? mf?.World_Regions);
  const countryWeights = parseWeights(etf?.Country_Weights ?? mf?.Country_Weights);
  // Asset_Allocation: ETF usa formato plano (Equity_%, etc.); MutualFund usa
  // formato numérico con Type + Net_%. Probamos ambos.
  let assetAllocation = parseWeights(etf?.Asset_Allocation);
  if (Object.keys(assetAllocation).length === 0 && mf?.Asset_Allocation) {
    assetAllocation = parseAssetAllocationMutualFund(mf.Asset_Allocation);
  }

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
    ticker: fund?.ticker,
    isin: fund?.isin,
  });
}
