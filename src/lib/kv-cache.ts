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

import type { MonthlyPrice } from "./types";

// --- In-memory cache (tier 1) ---
const memoryCache = new Map<
  string,
  { data: MonthlyPrice[]; timestamp: number }
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

function makeKey(fundId: string): string {
  return `prices:${fundId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

// --- Public API ---

export async function getCachedPrices(
  fundId: string
): Promise<MonthlyPrice[] | null> {
  // Tier 1: memoria
  const mem = memoryCache.get(fundId);
  if (mem && Date.now() - mem.timestamp < MEMORY_TTL_MS) {
    return mem.data;
  }

  // Tier 2: Redis
  try {
    const redis = await getRedis();
    if (redis) {
      const cached = await redis.get<MonthlyPrice[]>(makeKey(fundId));
      if (cached && Array.isArray(cached) && cached.length > 0) {
        // Promover a cache de memoria
        memoryCache.set(fundId, { data: cached, timestamp: Date.now() });
        console.log(`[Cache] Redis hit: ${fundId} (${cached.length} meses)`);
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
  data: MonthlyPrice[]
): Promise<void> {
  // Siempre guardar en memoria
  memoryCache.set(fundId, { data, timestamp: Date.now() });

  // Intentar Redis
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.set(makeKey(fundId), data, { ex: REDIS_TTL_SECONDS });
      console.log(`[Cache] Redis write: ${fundId} (${data.length} meses)`);
    }
  } catch (error) {
    console.warn(`[Cache] Error escribiendo Redis para ${fundId}:`, error);
  }
}
