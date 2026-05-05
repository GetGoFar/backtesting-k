// =============================================================================
// API: GET /api/fund-name?isin=...
// =============================================================================
//
// Auto-relleno del nombre de un fondo a partir de su ISIN, usado por la
// calculadora "Dinero Quemado" del widget de la Liga de Fondos Basura.
//
// Lookup en cascada (rápido → lento):
//   1. fund-database curado (~50 ETFs/fondos del backtester)
//   2. Snapshot LIGA_ISIN (los 100 fondos del ranking)
//   3. EODHD search por ISIN
//
// CORS abierto porque el HTML que llama a este endpoint se sirve desde dos
// orígenes distintos: Vercel (/liga-preview) y WordPress (elproyectok.com).
//
// =============================================================================
//
// Respuestas:
//   200 { ok: true,  name: "...", type: "..." }
//   200 { ok: false }            <- ISIN no encontrado en ninguna fuente
//   400 { ok: false, error }     <- ISIN ausente o malformado
//
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getFundByIsin } from "@/lib/fund-database";
import { leerSnapshot } from "@/lib/liga-storage";

const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN || "";
const EODHD_BASE_URL = "https://eodhd.com/api";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Cachear 24h en CDN — el nombre de un fondo no cambia.
const CACHE_HEADER = "public, s-maxage=86400, stale-while-revalidate=604800";

interface EODHDSearchResult {
  Code: string;
  Exchange: string;
  Name: string;
  Type: string;
  ISIN?: string;
}

async function searchEODHDByIsin(isin: string): Promise<{ name: string; type: string } | null> {
  if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") return null;

  try {
    const url = `${EODHD_BASE_URL}/search/${encodeURIComponent(isin)}?api_token=${EODHD_API_TOKEN}&limit=10`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const data: EODHDSearchResult[] = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    // Preferir match exacto por ISIN, luego ETF/Fund.
    const exact = data.find((r) => r.ISIN === isin);
    const candidate =
      exact ??
      data.find((r) => r.Type === "ETF" || r.Type === "Fund" || r.Type === "FUND") ??
      data[0];

    if (!candidate?.Name) return null;
    return { name: candidate.Name, type: candidate.Type || "" };
  } catch {
    return null;
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const raw = url.searchParams.get("isin");
  const isin = (raw || "").trim().toUpperCase();

  if (!isin || isin.length !== 12 || !/^[A-Z0-9]{12}$/.test(isin)) {
    return NextResponse.json(
      { ok: false, error: "ISIN inválido (12 alfanuméricos)" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // 1) Curado local
  const curated = getFundByIsin(isin);
  if (curated) {
    return NextResponse.json(
      { ok: true, name: curated.name, type: curated.category },
      { headers: { ...CORS_HEADERS, "Cache-Control": CACHE_HEADER } },
    );
  }

  // 2) Snapshot Liga
  try {
    const snap = await leerSnapshot();
    const hit = snap?.fondos.find((f) => f.isin === isin);
    if (hit) {
      return NextResponse.json(
        { ok: true, name: hit.nombre, type: hit.tipo || hit.categoria },
        { headers: { ...CORS_HEADERS, "Cache-Control": CACHE_HEADER } },
      );
    }
  } catch {
    // snapshot no disponible: seguimos al fallback EODHD
  }

  // 3) EODHD
  const eodh = await searchEODHDByIsin(isin);
  if (eodh) {
    return NextResponse.json(
      { ok: true, name: eodh.name, type: eodh.type },
      { headers: { ...CORS_HEADERS, "Cache-Control": CACHE_HEADER } },
    );
  }

  return NextResponse.json(
    { ok: false },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, s-maxage=300" } },
  );
}
