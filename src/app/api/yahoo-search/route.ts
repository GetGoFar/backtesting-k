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

    return NextResponse.json({ results: filtered });
  } catch (error) {
    console.error("[Yahoo Search] Error:", error);
    return NextResponse.json({ results: [] });
  }
}
