// =============================================================================
// API ROUTE: /api/search — Buscar fondos / ETFs / acciones por nombre o ISIN
// =============================================================================
//
// Fuente única: EODHD /search/{query}. Enriquecemos con TER real consultando
// Morningstar best-effort (no es bloqueante; si falla devolvemos TER null).
//
// El componente FundSearch llama a este endpoint cuando el usuario quiere
// añadir un activo que no está en la base de datos local.
//
// La lógica (búsqueda en EODHD, ticker, normalización de la consulta, TER por
// capas) vive en src/lib/eodhd-search.ts para que Mi cartera la use en
// proceso; aquí solo quedan el parseo de la petición, el modo campus y la
// forma de la respuesta. El comportamiento es el de siempre.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { isInCampusWhitelist, isCampusRequest } from "@/lib/campus-whitelist";
import {
  normalizeSearchQuery,
  searchEODHD,
  mapSearchResult,
  enrichSearchResults,
} from "@/lib/eodhd-search";

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

    const query = normalizeSearchQuery(rawQuery);
    const campus = isCampusRequest(searchParams);
    const eodhResults = await searchEODHD(query);

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

    const mapped = visibleResults.map(mapSearchResult);
    const enriched = await enrichSearchResults(mapped, query);

    return NextResponse.json({ results: enriched });
  } catch (error) {
    console.error("[Search] Error:", error);
    return NextResponse.json({ results: [] });
  }
}
