// =============================================================================
// CACHE PERSISTENTE - Upstash Redis + fallback a memoria
// =============================================================================
//
// Estrategia de 3 niveles:
// 1. Memoria (Map) -- vive durante una invocacion serverless (~10s-5min)
// 2. Upstash Redis -- persiste entre invocaciones (Redis en la nube)
// 3. Origen (Yahoo Finance / CSV)
//
// Upstash free tier: 10K comandos/dia
// Con ~30 fondos y TTL de 30 dias, uso estimado: ~100 comandos/dia

import type { DailyPrice } from "./types";

// --- In-memory cache (tier 1) ---
// Clave incluye versión para invalidar datos viejos (ej: Yahoo → EODHD)
const memoryCache = new Map<
  string,
  { data: DailyPrice[]; timestamp: number }
>();
const MEMORY_TTL_MS = 30 * 60 * 1000; // 30 minutos

// --- Redis TTL ---
const REDIS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dias

// --- Redis client (lazy loaded) ---
let redisClient: import("@upstash/redis").Redis | null = null;
let redisUnavailable = false;

async function getRedis(): Promise<import("@upstash/redis").Redis | null> {
  if (redisUnavailable) return null;
  if (redisClient) return redisClient;

  try {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      console.warn("[Cache] Redis no configurado (sin env vars). Usando solo memoria.");
      redisUnavailable = true;
      return null;
    }

    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    console.warn("[Cache] Upstash Redis no disponible. Usando solo memoria.");
    redisUnavailable = true;
    return null;
  }
}

// Versión de cache: cambiar al migrar de fuente de datos para invalidar entradas viejas
// v2 = migración de Yahoo Finance a EODHD (abril 2026)
// v3 = migración de datos mensuales a diarios (abril 2026)
// v4 = usar close en vez de adjusted_close (corrige datos incorrectos de SGLD.AS etc.)
// v5 = volver a adjusted_close (SGLD.AS reemplazado por 8PSG.DE; ETFs con splits reales necesitan adjusted_close)
// v6 = close + splits manuales (adjusted_close incluye dividendos incorrectos para ETFs acumulativos)
// v7 = close + splits para acumulativos, adjusted_close para distributing (captura dividendos correctamente)
// v8 = migración distributing → acumulación (VUSA→VUAA, VETY→DBXN, IBCI→XEIN)
// v9 = IMEU.AS→IMAE.AS (iShares Europe distribución → acumulación)
// v10 = XDJP.DE→DBXJ.DE (Japan: era Nikkei 225 1D, ahora MSCI Japan 1C acc)
// v11 = BGF/Franklin/PIMCO: eliminar yahooTicker .F → usar ISIN.EUFUND directo
const CACHE_VERSION = "v11";

function makeKey(fundId: string): string {
  return `${CACHE_VERSION}:prices:${fundId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

// --- Public API ---

export async function getCachedPrices(
  fundId: string
): Promise<DailyPrice[] | null> {
  // Tier 1: memoria (clave incluye versión para invalidar datos viejos)
  const memKey = `${CACHE_VERSION}:${fundId}`;
  const mem = memoryCache.get(memKey);
  if (mem && Date.now() - mem.timestamp < MEMORY_TTL_MS) {
    return mem.data;
  }

  // Tier 2: Redis
  try {
    const redis = await getRedis();
    if (redis) {
      const cached = await redis.get<DailyPrice[]>(makeKey(fundId));
      if (cached && Array.isArray(cached) && cached.length > 0) {
        // Promover a cache de memoria
        memoryCache.set(memKey, { data: cached, timestamp: Date.now() });
        console.log(`[Cache] Redis hit: ${fundId} (${cached.length} días)`);
        return cached;
      }
    }
  } catch (error) {
    console.warn(`[Cache] Error leyendo Redis para ${fundId}:`, error);
  }

  return null;
}

export async function setCachedPrices(
  fundId: string,
  data: DailyPrice[]
): Promise<void> {
  // Siempre guardar en memoria (con clave versionada)
  const memKey = `${CACHE_VERSION}:${fundId}`;
  memoryCache.set(memKey, { data, timestamp: Date.now() });

  // Intentar Redis
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.set(makeKey(fundId), data, { ex: REDIS_TTL_SECONDS });
      console.log(`[Cache] Redis write: ${fundId} (${data.length} días)`);
    }
  } catch (error) {
    console.warn(`[Cache] Error escribiendo Redis para ${fundId}:`, error);
  }
}

/**
 * Limpia toda la caché en memoria (fuerza re-descarga de datos)
 */
export function clearMemoryCache(): number {
  const count = memoryCache.size;
  memoryCache.clear();
  console.log(`[Cache] Memoria limpiada: ${count} entradas eliminadas`);
  return count;
}
