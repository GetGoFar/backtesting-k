// =============================================================================
// API ROUTE: /api/yahoo-search - Buscar fondos en Yahoo Finance
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

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

/**
 * Busca el TER (ongoing charge) de un fondo en Morningstar
 * Usa el ISIN o nombre para buscar, luego obtiene el ongoingCharge del screener
 */
async function fetchTerFromMorningstar(
  searchQuery: string,
  yahooSymbol: string
): Promise<number | null> {
  try {
    // Paso 1: Buscar en Morningstar para obtener el SecId y Performance ID
    const searchUrl = `https://www.morningstar.es/es/util/SecuritySearch.ashx?q=${encodeURIComponent(searchQuery)}&limit=5`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(3000),
    });
    const searchText = await searchRes.text();

    if (!searchText || searchText.length < 5) return null;

    // Extraer el Performance ID del primer resultado
    const piMatch = searchText.match(/"pi":"([^"]+)"/);
    if (!piMatch) return null;
    const performanceId = piMatch[1];

    // Paso 2: Obtener ongoingCharge del screener de Morningstar
    const screenUrl = `https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener?outputType=json&securityDataPoints=SecId|Name|ongoingCharge&term=${performanceId}`;
    const screenRes = await fetch(screenUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(3000),
    });
    const screenData = await screenRes.json();

    const ongoingCharge = screenData?.rows?.[0]?.ongoingCharge;
    if (typeof ongoingCharge === "number" && ongoingCharge > 0) {
      console.log(
        `[Morningstar] TER para ${yahooSymbol}: ${ongoingCharge}%`
      );
      return ongoingCharge;
    }

    return null;
  } catch (error) {
    // Morningstar es best-effort, no bloquear si falla
    console.warn(`[Morningstar] No se pudo obtener TER: ${error}`);
    return null;
  }
}

/**
 * GET /api/yahoo-search?q=query
 *
 * Busca fondos/ETFs en Yahoo Finance
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0&listsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.error(`[Yahoo Search] Error: ${response.status}`);
      return NextResponse.json({ results: [] });
    }

    const data: YahooSearchResponse = await response.json();

    // Filtrar solo ETFs y fondos mutuos
    const filtered = (data.quotes || [])
      .filter((q) =>
        q.quoteType === "ETF" ||
        q.quoteType === "MUTUALFUND" ||
        q.typeDisp?.toLowerCase().includes("etf") ||
        q.typeDisp?.toLowerCase().includes("fund")
      )
      .map((q) => ({
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        shortName: q.shortname || q.symbol,
        exchange: q.exchDisp || "Unknown",
        type: q.quoteType,
        typeDisplay: q.typeDisp,
      }));

    // Intentar obtener TER real de Morningstar para cada resultado
    const resultsWithTer = await Promise.all(
      filtered.map(async (result) => {
        const ter = await fetchTerFromMorningstar(query, result.symbol);
        return { ...result, ter };
      })
    );

    return NextResponse.json({ results: resultsWithTer });
  } catch (error) {
    console.error("[Yahoo Search] Error:", error);
    return NextResponse.json({ results: [] });
  }
}
