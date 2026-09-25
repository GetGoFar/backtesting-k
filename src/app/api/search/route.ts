// =============================================================================
// API ROUTE: /api/search — Buscar fondos / ETFs / acciones por nombre o ISIN
// =============================================================================
//
// Fuente única: EODHD /search/{query}. Enriquecemos con TER real consultando
// Morningstar best-effort (no es bloqueante; si falla devolvemos TER null).
//
// El componente FundSearch llama a este endpoint cuando el usuario quiere
// añadir un activo que no está en la base de datos local.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getFundByIsin } from "@/lib/fund-database";
import { isInCampusWhitelist, isCampusRequest } from "@/lib/campus-whitelist";
import {
  parseCurrencyPairQuery,
  describeCurrencyPair,
  quoteCurrencyOf,
  isMetalCode,
} from "@/lib/forex";
import { hayClaveEodhd, MENSAJE_SIN_CLAVE } from "@/lib/eodhd-config";
import { terminosEnIngles, normalizaTexto } from "@/lib/busqueda-es";

const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN || "";
const EODHD_BASE_URL = "https://eodhd.com/api";

/**
 * Intenta recuperar el TER de un fondo vía EODHD /fundamentals como fallback
 * cuando Morningstar no responde. Lee Net_Expense_Ratio de ETF_Data o
 * Expense_Ratio/Total_Expense_Ratio de MutualFund_Data.
 */
async function fetchTerFromEodhdFundamentals(
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
// Tipos
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
    // MUERTA desde que morningstar.es se mudó a global.morningstar.com: este
    // endpoint responde 301 con cuerpo vacío, así que la función siempre
    // devolvía {ter:null} en silencio (comprobado sep-2026). Se conserva la
    // llamada porque falla rápido y sin coste, pero NO cuentes con ella: el
    // sitio nuevo renderiza en cliente y no hay API pública sin clave.
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
function buildTicker(code: string, exchange: string): string {
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
function normalizeSearchQuery(raw: string): string {
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
function isCurrencyResult(r: EODHDSearchResult): boolean {
  return r.Type === "Currency" && r.Exchange === "FOREX";
}

// -----------------------------------------------------------------------------
// EODHD search
// -----------------------------------------------------------------------------

async function searchEODHD(query: string): Promise<EODHDSearchResult[]> {
  if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") return [];
  try {
    // No usar &type=etf,fund porque causa 422 en muchas búsquedas;
    // filtramos manualmente abajo.
    const url = `${EODHD_BASE_URL}/search/${encodeURIComponent(query)}?api_token=${EODHD_API_TOKEN}&limit=20`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
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
// GET handler
// -----------------------------------------------------------------------------

/**
 * GET /api/search?q=query
 * Busca fondos / ETFs / acciones usando EODHD. Enriquece con TER de
 * Morningstar (best-effort) sólo para fondos/ETFs.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q");
    if (!rawQuery || rawQuery.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Sin clave la búsqueda devolvería [] en silencio y parecería que el fondo
    // no existe. Se dice, para que la interfaz pueda explicarlo.
    if (!hayClaveEodhd()) {
      return NextResponse.json({ results: [], sinClave: true, aviso: MENSAJE_SIN_CLAVE });
    }

    const query = normalizeSearchQuery(rawQuery);
    const campus = isCampusRequest(searchParams);
    let eodhResults = await searchEODHD(query);

    // EODHD solo entiende inglés: "mineras de oro" daba CERO resultados y
    // "gold miners" encontraba GDX y GDXJ; "mineras" a secas solo sacaba
    // acciones mineras latinoamericanas. Cuando la consulta lleva una palabra
    // en español que sabemos traducir, se pide también la traducción y se
    // fusionan los dos listados (una llamada extra como mucho, y solo en ese
    // caso). Los resultados originales van primero.
    const traducciones = terminosEnIngles(rawQuery).filter(
      (t) => t !== normalizaTexto(rawQuery)
    );
    const enEspanol = traducciones.length > 0;
    if (enEspanol) {
      const vistos = new Set(eodhResults.map((r) => r.Code + "." + r.Exchange));
      for (const termino of traducciones) {
        const extra = await searchEODHD(termino);
        for (const r of extra) {
          const clave = r.Code + "." + r.Exchange;
          if (!vistos.has(clave)) {
            vistos.add(clave);
            eodhResults.push(r);
          }
        }
        if (eodhResults.length >= 20) break;
      }
    }

    // Si la búsqueda era en lenguaje natural ("mineras de oro"), lo que se
    // busca es un producto, no una acción suelta: los fondos y ETF van delante.
    // Con un ticker ("AAPL", "SGLN.L") se respeta el orden de EODHD.
    if (enEspanol) {
      eodhResults = [
        ...eodhResults.filter((r) => r.Type !== "Common Stock"),
        ...eodhResults.filter((r) => r.Type === "Common Stock"),
      ];
    }

    if (eodhResults.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Modo campus: solo instrumentos del Excel oficial (filtra por ISIN antes
    // de enriquecer, así no gastamos llamadas de TER en lo que se va a descartar).
    const visibleResults = campus
      ? eodhResults.filter((r) => isInCampusWhitelist(r.ISIN))
      : eodhResults;

    if (visibleResults.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const mapped = visibleResults.map((r) => {
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
          isin: null as string | null,
          ter: 0 as number | null,
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
        ter: isStock ? 0 : (null as number | null),
        currency: r.Currency || "EUR",
        isStock,
        isCurrency: false,
      };
    });

    // TER best-effort por capas (sólo para fondos/ETFs):
    //   1) BD local — si el ISIN ya está curado, ese TER es el más fiable
    //   2) Morningstar — busca por ISIN o nombre, lee ongoingCharge
    //   3) EODHD /fundamentals — ETF_Data.Net_Expense_Ratio o variantes
    // Cada uno se intenta sólo si los anteriores no han dado fruto.
    const enriched = await Promise.all(
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

    return NextResponse.json({ results: enriched });
  } catch (error) {
    console.error("[Search] Error:", error);
    return NextResponse.json({ results: [] });
  }
}
