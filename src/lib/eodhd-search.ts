// =============================================================================
// EODHD SEARCH — buscar fondos / ETFs / acciones por nombre o ISIN
// =============================================================================
//
// Fuente única: EODHD /search/{query}. El TER se enriquece best-effort por
// capas (BD local → Morningstar → EODHD /fundamentals); si nada responde, null.
//
// Antes todo esto vivía dentro de src/app/api/search/route.ts. Ahora es un
// módulo de servidor para que esa ruta y Mi cartera (buscar, riesgo, importar)
// lo usen en proceso, sin pasar por HTTP ni por un dominio fijo. Solo desde
// servidor: usa la clave de EODHD.
// =============================================================================

import { getFundByIsin } from "@/lib/fund-database";
import {
  parseCurrencyPairQuery,
  describeCurrencyPair,
  quoteCurrencyOf,
  isMetalCode,
} from "@/lib/forex";

const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN || "";
const EODHD_BASE_URL = "https://eodhd.com/api";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

/** Una fila tal como la devuelve EODHD /search. */
export interface EODHDSearchResult {
  Code: string;
  Exchange: string;
  Name: string;
  Type: string;
  Country: string;
  Currency: string;
  ISIN: string;
  previousClose: number;
  previousCloseDate: string;
}

export interface MorningstarData {
  ter: number | null;
  isin: string | null;
}

/** Un resultado ya en la forma que devuelve /api/search (campo `results`). */
export type ResultadoBusqueda = {
  symbol: string;
  name: string;
  shortName: string;
  exchange: string;
  type: string;
  typeDisplay: string;
  isin: string | null;
  ter: number | null;
  currency: string;
  isStock: boolean;
  isCurrency: boolean;
};

// -----------------------------------------------------------------------------
// TER: EODHD /fundamentals (último recurso)
// -----------------------------------------------------------------------------

/**
 * Intenta recuperar el TER de un fondo vía EODHD /fundamentals como fallback
 * cuando Morningstar no responde. Lee Net_Expense_Ratio de ETF_Data o
 * Expense_Ratio/Total_Expense_Ratio de MutualFund_Data.
 */
export async function fetchTerFromEodhdFundamentals(
  ticker: string
): Promise<number | null> {
  if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") return null;
  try {
    const url = `${EODHD_BASE_URL}/fundamentals/${encodeURIComponent(ticker)}?fmt=json&api_token=${EODHD_API_TOKEN}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    // ETF_Data.Net_Expense_Ratio suele venir como número directo (e.g. 0.07)
    // o como string ("0.07%"). Probamos varias variantes.
    const candidates = [
      data?.ETF_Data?.Net_Expense_Ratio,
      data?.ETF_Data?.Total_Expense_Ratio,
      data?.MutualFund_Data?.Expense_Ratio,
      data?.MutualFund_Data?.Net_Expense_Ratio,
      data?.MutualFund_Data?.Total_Expense_Ratio,
    ];
    for (const c of candidates) {
      if (typeof c === "number" && c > 0 && c < 10) return c;
      if (typeof c === "string") {
        const n = parseFloat(c.replace("%", "").trim());
        if (!isNaN(n) && n > 0 && n < 10) return n;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// TER: Morningstar (best-effort)
// -----------------------------------------------------------------------------

export async function fetchTerFromMorningstar(
  searchQuery: string,
  symbol: string
): Promise<MorningstarData> {
  try {
    const searchUrl = `https://www.morningstar.es/es/util/SecuritySearch.ashx?q=${encodeURIComponent(searchQuery)}&limit=5`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(3000),
    });
    const searchText = await searchRes.text();
    if (!searchText || searchText.length < 5) return { ter: null, isin: null };

    const piMatch = searchText.match(/"pi":"([^"]+)"/);
    if (!piMatch) return { ter: null, isin: null };
    const performanceId = piMatch[1];

    const screenUrl = `https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener?outputType=json&securityDataPoints=SecId|Name|ISIN|ongoingCharge&term=${performanceId}`;
    const screenRes = await fetch(screenUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(3000),
    });
    const screenData = await screenRes.json();

    const row = screenData?.rows?.[0];
    const ongoingCharge = row?.ongoingCharge;
    const isin = row?.ISIN || null;
    if (typeof ongoingCharge === "number" && ongoingCharge > 0) {
      console.log(`[Morningstar] TER para ${symbol}: ${ongoingCharge}%, ISIN: ${isin}`);
      return { ter: ongoingCharge, isin };
    }
    return { ter: null, isin };
  } catch (error) {
    console.warn(`[Morningstar] No se pudo obtener TER: ${error}`);
    return { ter: null, isin: null };
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Mapea código EODHD (CODE + Exchange) al ticker "base" estándar usado en la
 *  app, con el sufijo del mercado. */
export function buildTicker(code: string, exchange: string): string {
  const map: Record<string, string> = {
    AS: ".AS",       // Amsterdam
    PA: ".PA",       // París
    XETRA: ".DE",    // Xetra (en la app usamos .DE como sufijo base)
    F: ".F",         // Frankfurt
    LSE: ".L",       // London
    MI: ".MI",       // Milán
    MC: ".MC",       // Madrid
    BR: ".BR",       // Bruselas
    ST: ".ST",       // Estocolmo
    US: "",          // Bolsas USA sin sufijo
    EUFUND: ".EUFUND",
  };
  const suffix = map[exchange] ?? `.${exchange}`;
  return `${code}${suffix}`;
}

/** Normaliza la query del usuario: si parece un ticker (NVDA, NVDA.US), nos
 *  quedamos con el símbolo principal. Si parece búsqueda libre, lo dejamos. */
export function normalizeSearchQuery(raw: string): string {
  const q = raw.trim();
  // Par de divisas en cualquier formato ("EUR/USD", "EUR USD", "EURUSD=X",
  // "EURUSD.FOREX") → código canónico que EODHD sí encuentra ("EURUSD").
  // Con la barra sin normalizar, /search devolvía HTML (no JSON) y nada salía.
  const pair = parseCurrencyPairQuery(q);
  if (pair) return pair;
  const tickerWithSuffix = /^([A-Z0-9\-]+)\.([A-Z]+)$/i;
  const m = q.match(tickerWithSuffix);
  if (m && m[1]) return m[1].toUpperCase();
  if (/^[A-Z0-9\-]+$/i.test(q) && q.length <= 10) return q.toUpperCase();
  return q;
}

/** Par de divisas (o metal spot) del exchange FOREX de EODHD. */
export function isCurrencyResult(r: EODHDSearchResult): boolean {
  return r.Type === "Currency" && r.Exchange === "FOREX";
}

// -----------------------------------------------------------------------------
// EODHD search
// -----------------------------------------------------------------------------

/**
 * Consulta EODHD /search y se queda con ETFs, fondos, acciones, el exchange
 * EUFUND y los pares de divisas. Sin clave (o con "demo") devuelve [].
 * `signal` permite acortar el tiempo de espera (por defecto 8 s).
 */
export async function searchEODHD(
  query: string,
  opts?: { signal?: AbortSignal }
): Promise<EODHDSearchResult[]> {
  if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") return [];
  try {
    // No usar &type=etf,fund porque causa 422 en muchas búsquedas;
    // filtramos manualmente abajo.
    const url = `${EODHD_BASE_URL}/search/${encodeURIComponent(query)}?api_token=${EODHD_API_TOKEN}&limit=20`;
    const response = await fetch(url, { signal: opts?.signal ?? AbortSignal.timeout(8000) });
    if (!response.ok) {
      console.error(`[EODHD Search] Error: ${response.status}`);
      return [];
    }
    const data: EODHDSearchResult[] = await response.json();
    if (!Array.isArray(data)) return [];
    // Divisas: EODHD las devuelve con Type "Currency" en el exchange FOREX;
    // antes este filtro las descartaba y ningún par salía en el buscador.
    return data.filter(
      (r) =>
        r.Type === "ETF" ||
        r.Type === "Fund" ||
        r.Type === "FUND" ||
        r.Type === "Common Stock" ||
        r.Exchange === "EUFUND" ||
        isCurrencyResult(r)
    );
  } catch (error) {
    console.error("[EODHD Search] Error:", error);
    return [];
  }
}

// -----------------------------------------------------------------------------
// De la fila de EODHD al resultado que ve la app
// -----------------------------------------------------------------------------

/** Una fila de EODHD → resultado de /api/search, todavía sin enriquecer el TER. */
export function mapSearchResult(r: EODHDSearchResult): ResultadoBusqueda {
  const isStock = r.Type === "Common Stock";
  const isCurrency = isCurrencyResult(r);
  if (isCurrency) {
    // Par de divisas: es un tipo de cambio, no un producto. Sin TER, sin
    // ISIN. `currency` = divisa cotizada (EURUSD → USD). NUNCA se devuelve
    // previousClose ni ningún precio (licencia Internal Use de EODHD).
    const code = r.Code.toUpperCase();
    // Los metales spot (XAUUSD, XAGUSD…) cuelgan del mismo exchange pero
    // no son pares: se etiquetan aparte y el front los categoriza como oro.
    const isMetal = isMetalCode(code);
    const name = (isMetal ? null : describeCurrencyPair(code)) ?? r.Name;
    return {
      symbol: buildTicker(r.Code, r.Exchange),
      name,
      shortName: name.length > 50 ? name.substring(0, 47) + "..." : name,
      exchange: r.Exchange,
      type: "CURRENCY",
      typeDisplay: isMetal ? "Metal spot" : "Divisa",
      isin: null,
      ter: 0,
      currency: code.length === 6 ? quoteCurrencyOf(code) : r.Currency || "USD",
      isStock: false,
      isCurrency: true,
    };
  }
  return {
    symbol: buildTicker(r.Code, r.Exchange),
    name: r.Name,
    shortName: r.Name.length > 50 ? r.Name.substring(0, 47) + "..." : r.Name,
    exchange: r.Exchange,
    type: isStock
      ? "STOCK"
      : r.Type === "ETF"
      ? "ETF"
      : r.Type === "Fund" || r.Type === "FUND"
      ? "MUTUALFUND"
      : r.Type,
    typeDisplay: isStock ? "Acción" : r.Type,
    isin: r.ISIN || null,
    ter: isStock ? 0 : null,
    currency: r.Currency || "EUR",
    isStock,
    isCurrency: false,
  };
}

/**
 * TER best-effort por capas (sólo para fondos/ETFs):
 *   1) BD local — si el ISIN ya está curado, ese TER es el más fiable
 *   2) Morningstar — busca por ISIN o nombre, lee ongoingCharge
 *   3) EODHD /fundamentals — ETF_Data.Net_Expense_Ratio o variantes
 * Cada uno se intenta sólo si los anteriores no han dado fruto. `query` es la
 * consulta normalizada, que hace de respaldo cuando el resultado no trae ISIN.
 */
export async function enrichSearchResults(
  mapped: ResultadoBusqueda[],
  query: string
): Promise<ResultadoBusqueda[]> {
  return Promise.all(
    mapped.map(async (result) => {
      if (result.isStock || result.isCurrency) return result;

      // 1) Lookup en BD local por ISIN (instantáneo, sin red)
      if (result.isin) {
        const local = getFundByIsin(result.isin);
        if (local && local.ter > 0) {
          return { ...result, ter: local.ter, isin: result.isin };
        }
      }

      // 2) Morningstar
      const msQuery = result.isin || query;
      const msData = await fetchTerFromMorningstar(msQuery, result.symbol);
      const finalIsin = msData.isin || result.isin;
      if (msData.ter != null && msData.ter > 0) {
        return { ...result, ter: msData.ter, isin: finalIsin };
      }

      // 2.b) Re-intentar BD local con el ISIN devuelto por Morningstar
      //      (a veces Morningstar normaliza el ISIN aunque no devuelva TER)
      if (finalIsin && finalIsin !== result.isin) {
        const local = getFundByIsin(finalIsin);
        if (local && local.ter > 0) {
          return { ...result, ter: local.ter, isin: finalIsin };
        }
      }

      // 3) EODHD /fundamentals
      const eodhTer = await fetchTerFromEodhdFundamentals(result.symbol);
      if (eodhTer != null && eodhTer > 0) {
        return { ...result, ter: eodhTer, isin: finalIsin };
      }

      // Nada — devolvemos null para que el frontend sepa que hay que editar
      return { ...result, ter: null, isin: finalIsin };
    })
  );
}

/**
 * Búsqueda de mercado para Mi cartera: misma normalización y mismo filtro de
 * tipos que /api/search, pero sin enriquecer el TER (Mi cartera no lo usa y
 * así no gasta llamadas a Morningstar) y sin el ISIN "normalizado" por
 * Morningstar: aquí solo vale el ISIN que da EODHD, o ninguno. Devuelve []
 * con consultas de menos de 2 caracteres o si EODHD no responde.
 */
export async function buscarMercado(
  rawQuery: string,
  opts?: { signal?: AbortSignal }
): Promise<ResultadoBusqueda[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const filas = await searchEODHD(normalizeSearchQuery(q), opts);
  return filas.map(mapSearchResult);
}
