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
  /** Algunas respuestas de Yahoo incluyen el currency directamente */
  currency?: string;
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
    // NOTA: No usar &type=etf,fund porque causa 422 en muchas búsquedas.
    // Filtramos los resultados manualmente después.
    const url = `${EODHD_BASE_URL}/search/${encodeURIComponent(query)}?api_token=${EODHD_API_TOKEN}&limit=20`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(`[EODHD Search] Error: ${response.status}`);
      return [];
    }

    const data: EODHDSearchResult[] = await response.json();
    if (!Array.isArray(data)) return [];

    // Filtrar ETFs, fondos y acciones (Common Stock).
    // El filtro server-side de EODHD (&type=) causa 422 con ciertas búsquedas,
    // así que filtramos manualmente aquí.
    return data.filter(
      (r) =>
        r.Type === "ETF" ||
        r.Type === "Fund" ||
        r.Type === "FUND" ||
        r.Type === "Common Stock" ||
        r.Exchange === "EUFUND"
    );
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
        q.quoteType === "EQUITY" ||
        q.typeDisp?.toLowerCase().includes("etf") ||
        q.typeDisp?.toLowerCase().includes("fund") ||
        q.typeDisp?.toLowerCase().includes("equity")
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
/**
 * Limpia la query antes de buscar. Acepta formatos comunes que el usuario
 * puede teclear (NVDA, NVDA.US, NVDA.NASDAQ, etc.) y devuelve el símbolo "core"
 * que tanto Yahoo como EODHD reconocen mejor.
 *
 * Reglas:
 *   - Si parece un ticker (todo mayúsculas + opcional sufijo .XX), nos quedamos
 *     solo con el símbolo principal.
 *   - Si parece nombre/búsqueda libre, lo dejamos tal cual.
 */
function normalizeSearchQuery(raw: string): string {
  const q = raw.trim();
  // Patrón ticker con sufijo: "NVDA.US", "BTC.US", "AAPL.NASDAQ", "TSLA.O"
  const tickerWithSuffix = /^([A-Z0-9\-]+)\.([A-Z]+)$/i;
  const m = q.match(tickerWithSuffix);
  if (m && m[1]) return m[1].toUpperCase();
  // Si toda la query parece un ticker simple (mayúsculas, sin espacios), uppercase
  if (/^[A-Z0-9\-]+$/i.test(q) && q.length <= 10) return q.toUpperCase();
  return q;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q");

    if (!rawQuery || rawQuery.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Normalizar: el usuario puede teclear "NVDA.US" (formato EODHD) pero
    // Yahoo Finance espera solo "NVDA". Quitamos sufijos típicos de bolsa.
    const query = normalizeSearchQuery(rawQuery);

    // Intentar EODHD primero
    const eodhResults = await searchEODHD(query);

    if (eodhResults.length > 0) {
      // Mapear resultados EODHD al formato esperado por el frontend.
      // El tipo "STOCK" identifica las acciones individuales (sin TER, sin
      // Morningstar lookup). Currency se preserva para mostrar el aviso de
      // divisa en el front (USD, GBP, etc.).
      const mapped = eodhResults.map((r) => {
        const isStock = r.Type === "Common Stock";
        return {
          symbol: eodhToYahooTicker(r.Code, r.Exchange),
          name: r.Name,
          shortName: r.Name.length > 50 ? r.Name.substring(0, 47) + "..." : r.Name,
          exchange: r.Exchange,
          type: isStock
            ? "STOCK"
            : r.Type === "ETF"
            ? "ETF"
            : (r.Type === "Fund" || r.Type === "FUND")
            ? "MUTUALFUND"
            : r.Type,
          typeDisplay: isStock ? "Acción" : r.Type,
          isin: r.ISIN || null,
          ter: isStock ? 0 : (null as number | null),
          currency: r.Currency || "EUR",
          isStock,
        };
      });

      // Solo buscar TER en Morningstar para fondos/ETFs (no para acciones)
      const resultsWithTer = await Promise.all(
        mapped.map(async (result) => {
          if (result.isStock) return result;
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

    const filtered = yahooResults.map((q) => {
      const isStock = q.quoteType === "EQUITY";
      // Inferir divisa: si Yahoo la da, usarla; si no, deducir por sufijo del
      // ticker (sin sufijo + EQUITY → US/USD, sufijos europeos → EUR, etc.)
      const sym = q.symbol || "";
      const inferredCurrency = q.currency
        || (isStock && !sym.includes(".") ? "USD"
        : sym.endsWith(".L") ? "GBP"
        : "EUR");
      return {
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        shortName: q.shortname || q.symbol,
        exchange: q.exchDisp || "Unknown",
        type: isStock ? "STOCK" : q.quoteType,
        typeDisplay: isStock ? "Acción" : q.typeDisp,
        currency: inferredCurrency,
        isStock,
      };
    });

    // Enriquecer con Morningstar solo para fondos/ETFs
    const resultsWithData = await Promise.all(
      filtered.map(async (result) => {
        if (result.isStock) {
          return { ...result, ter: 0, isin: null };
        }
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
