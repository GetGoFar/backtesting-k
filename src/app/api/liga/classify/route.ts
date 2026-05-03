// =============================================================================
// API: GET /api/liga/classify?isin=ES0XXX
// =============================================================================
//
// Clasifica un fondo arbitrario sobre la liga: si está, devuelve su posición;
// si no, busca en Morningstar (vía proxy WP), infiere benchmark, calcula alfa
// y posición teórica.
//
// Cache: resultado por ISIN cacheado 24h en Redis (key: liga-classify:<isin>).
// Las consultas EODHD para el mismo fondo están limitadas a ~1/día/fondo, lo
// que mantiene el coste de la API muy por debajo de cualquier umbral relevante.
//
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { classifyFund, type ClassifyResult } from "@/lib/liga-classify";
import { leerSnapshot } from "@/lib/liga-storage";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const isinRaw = (url.searchParams.get("isin") || "").trim().toUpperCase();
  if (!isinRaw) {
    return NextResponse.json(
      { error: "Falta query param 'isin'" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // 1) Cache lookup
  const cached = await leerCache(isinRaw);
  if (cached) {
    return jsonResponse(cached, true);
  }

  // 2) Necesitamos el snapshot actual para el lookup rápido y el ranking
  const snapshot = await leerSnapshot();
  if (!snapshot) {
    return NextResponse.json(
      { error: "Snapshot de la liga no disponible. Reintenta más tarde." },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  // 3) Calcular
  const apiToken = process.env.EODHD_API_TOKEN;
  if (!apiToken) {
    return NextResponse.json(
      { error: "EODHD_API_TOKEN no configurado en el servidor" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
  const wordpressUrl = process.env.WORDPRESS_URL || "https://elproyectok.com";

  const resultado = await classifyFund(isinRaw, {
    apiToken,
    wordpressUrl,
    snapshot,
  });

  // 4) Cachear (incluso resultados con error: evita martillear EODHD/Morningstar
  // por ISINs problemáticos. TTL más corto para errores: 1h.)
  const ttl = resultado.error ? 60 * 60 : CACHE_TTL_SECONDS;
  await escribirCache(isinRaw, resultado, ttl);

  return jsonResponse(resultado, false);
}

function jsonResponse(payload: ClassifyResult, fromCache: boolean): NextResponse {
  return NextResponse.json(payload, {
    status: payload.error ? 200 : 200, // siempre 200; el error va en el body
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
      "X-Liga-Cache": fromCache ? "HIT" : "MISS",
    },
  });
}

// -----------------------------------------------------------------------------
// Cache (Redis, sin fichero — el classify se reconstruye on-demand sin coste alto)
// -----------------------------------------------------------------------------

async function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url, token });
}

function cacheKey(isin: string): string {
  return `liga-classify:${isin}`;
}

async function leerCache(isin: string): Promise<ClassifyResult | null> {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    return await redis.get<ClassifyResult>(cacheKey(isin));
  } catch (err) {
    console.warn("[liga/classify] redis read error:", err);
    return null;
  }
}

async function escribirCache(
  isin: string,
  payload: ClassifyResult,
  ttlSeconds: number,
): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;
    await redis.set(cacheKey(isin), payload, { ex: ttlSeconds });
  } catch (err) {
    console.warn("[liga/classify] redis write error:", err);
  }
}
