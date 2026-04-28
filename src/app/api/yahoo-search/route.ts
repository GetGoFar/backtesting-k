// =============================================================================
// API ROUTE: /api/yahoo-search - Buscar fondos (EODHD + Morningstar fallback)
// =============================================================================
// Nota: Mantiene el path /api/yahoo-search por compatibilidad con el frontend
// pero usa EODHD como fuente principal de búsqueda

import { NextRequest, NextResponse } from "next/server";

const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN || "";
const EODHD_BASE_URL = "https://eodhd.com/api";

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

interface EODHDSearchResult {
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

interface YahooSearchResult {
  symbol: string;
  shortname: string;
  longname?: string;
  exchDisp: string;
  typeDisp: string;
  quoteType: string;
}

interface YahooSearchResponse {
  quotes: YahooSearchResult[];
}

interface MorningstarData {
  ter: number | null;
  isin: string | null;
}

// -----------------------------------------------------------------------------
// Morningstar TER lookup (best-effort)
// -----------------------------------------------------------------------------

async function fetchTerFromMorningstar(
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
// EODHD Exchange code → Yahoo-compatible ticker suffix
// -----------------------------------------------------------------------------

function eodhToYahooTicker(code: string, exchange: string): string {
  const exchangeMap: Record<string, string> = {
    AS: ".AS",
    PA: ".PA",
    XETRA: ".DE",
    F: ".F",
    LSE: ".L",
    MI: ".MI",
    MC: ".MC",
    BR: ".BR",
    ST: ".ST",
    US: "",
    EUFUND: ".EUFUND",
  };
  const suffix = exchangeMap[exchange] ?? `.${exchange}`;
  return `${code}${suffix}`;
}

// -----------------------------------------------------------------------------
// EODHD search
// -----------------------------------------------------------------------------

async function searchEODHD(query: string): Promise<EODHDSearchResult[]> {
  if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") {
    return [];
  }

  try {
    // Buscar ETFs y fondos
    const url = `${EODHD_BASE_URL}/search/${encodeURIComponent(query)}?api_token=${EODHD_API_TOKEN}&type=etf,fund&limit=20`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(`[EODHD Search] Error: ${response.status}`);
      return [];
    }

    const data: EODHDSearchResult[] = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("[EODHD Search] Error:", error);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Yahoo Finance search (fallback)
// -----------------------------------------------------------------------------

async function searchYahoo(query: string): Promise<YahooSearchResult[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0&listsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(`[Yahoo Search] Error: ${response.status}`);
      return [];
    }

    const data: YahooSearchResponse = await response.json();
    return (data.quotes || []).filter(
      (q) =>
        q.quoteType === "ETF" ||
        q.quoteType === "MUTUALFUND" ||
        q.typeDisp?.toLowerCase().includes("etf") ||
        q.typeDisp?.toLowerCase().includes("fund")
    );
  } catch (error) {
    console.error("[Yahoo Search] Error:", error);
    return [];
  }
}

// -----------------------------------------------------------------------------
// GET handler
// -----------------------------------------------------------------------------

/**
 * GET /api/yahoo-search?q=query
 *
 * Busca fondos/ETFs usando EODHD (principal) + Yahoo Finance (fallback)
 * Enriquece resultados con TER real de Morningstar
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Intentar EODHD primero
    const eodhResults = await searchEODHD(query);

    if (eodhResults.length > 0) {
      // Mapear resultados EODHD al formato esperado por el frontend
      const mapped = eodhResults.map((r) => ({
        symbol: eodhToYahooTicker(r.Code, r.Exchange),
        name: r.Name,
        shortName: r.Name.length > 50 ? r.Name.substring(0, 47) + "..." : r.Name,
        exchange: r.Exchange,
        type: r.Type === "ETF" ? "ETF" : r.Type === "Fund" ? "MUTUALFUND" : r.Type,
        typeDisplay: r.Type,
        isin: r.ISIN || null,
        ter: null as number | null, // Se enriquecerá con Morningstar
      }));

      // Intentar obtener TER de Morningstar para cada resultado
      const resultsWithTer = await Promise.all(
        mapped.map(async (result) => {
          // Buscar por ISIN si disponible, sino por query
          const msQuery = result.isin || query;
          const msData = await fetchTerFromMorningstar(msQuery, result.symbol);
          return {
            ...result,
            ter: msData.ter,
            isin: msData.isin || result.isin,
          };
        })
      );

      return NextResponse.json({ results: resultsWithTer });
    }

    // Fallback: Yahoo Finance search
    console.log("[Search] EODHD sin resultados, intentando Yahoo Finance");
    const yahooResults = await searchYahoo(query);

    const filtered = yahooResults.map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      shortName: q.shortname || q.symbol,
      exchange: q.exchDisp || "Unknown",
      type: q.quoteType,
      typeDisplay: q.typeDisp,
    }));

    // Enriquecer con Morningstar
    const resultsWithData = await Promise.all(
      filtered.map(async (result) => {
        const msData = await fetchTerFromMorningstar(query, result.symbol);
        return { ...result, ter: msData.ter, isin: msData.isin };
      })
    );

    return NextResponse.json({ results: resultsWithData });
  } catch (error) {
    console.error("[Search] Error:", error);
    return NextResponse.json({ results: [] });
  }
}
