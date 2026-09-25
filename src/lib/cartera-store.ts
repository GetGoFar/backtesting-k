// =============================================================================
// CARTERA-STORE — Mi cartera de cada socio, guardada en Upstash Redis
// =============================================================================
//
// Una clave por identidad: `cartera:<id>`, con el estado que el cliente
// (lib/mi-cartera/store.tsx) serializa tal cual (JSON, version 2). El id es el
// de la cookie `epk-socio` (el hash anónimo del portal de Ataraxia o "pablo");
// ninguna ruta lo acepta de la query ni del cuerpo. Sin caducidad: la cartera
// es del socio y tiene que sobrevivir al navegador.
//
// Mismo patrón que access-log.ts: cliente perezoso, credenciales en
// KV_REST_API_URL || UPSTASH_REDIS_REST_URL y KV_REST_API_TOKEN ||
// UPSTASH_REDIS_REST_TOKEN, y NUNCA lanza. Sin credenciales o con Redis
// caído, leer devuelve { ok: false } (no se sabe qué hay: nunca se confunde
// con "vacío", para que el cliente no machaque una cartera guardada), existe
// devuelve false y guardar devuelve false: la app sigue viva en el navegador.
//
// Solo servidor (runtime nodejs): no importar desde componentes ni desde el
// middleware.
// =============================================================================

import { idValido } from "@/lib/lab-auth";

const PREFIJO = "cartera:";

/** Tope del estado serializado. Una cartera real ocupa unos pocos KB; 200 KB
 *  deja sitio de sobra y corta cualquier cuerpo desmesurado. */
export const CARTERA_MAX_BYTES = 200 * 1024;

// --- Cliente Upstash (lazy, mismo patrón que access-log.ts) ---
let redisClient: import("@upstash/redis").Redis | null = null;
let redisUnavailable = false;

async function getRedis(): Promise<import("@upstash/redis").Redis | null> {
  if (redisUnavailable) return null;
  if (redisClient) return redisClient;
  try {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      redisUnavailable = true;
      return null;
    }
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    redisUnavailable = true;
    return null;
  }
}

/** Clave Redis de una identidad, o null si el id no tiene la forma esperada. */
function clave(id: string): string | null {
  return idValido(id) ? PREFIJO + id : null;
}

/** Bytes UTF-8 de un JSON ya serializado (para el tope de tamaño). */
export function tamanoSerializado(json: string): number {
  return new TextEncoder().encode(json).length;
}

/** ¿Hay Redis configurado? (para que las rutas distingan "no guardado" de "sin almacén"). */
export async function almacenCarterasDisponible(): Promise<boolean> {
  return (await getRedis()) !== null;
}

/** ¿Tiene este socio una cartera guardada? Nunca lanza: sin Redis o con error, false. */
export async function existeCartera(id: string): Promise<boolean> {
  try {
    const redis = await getRedis();
    const k = clave(id);
    if (!redis || !k) return false;
    return (await redis.exists(k)) > 0;
  } catch (e) {
    console.warn("[CarteraStore] No se pudo comprobar la cartera:", e);
    return false;
  }
}

/** Resultado de leer: `ok: false` cuando no se puede saber qué hay (sin Redis o con error);
 *  `datos: null` cuando el socio está identificado pero no tiene nada guardado. */
export type LecturaCartera = { ok: true; datos: unknown | null } | { ok: false };

/** El estado guardado del socio (JSON ya parseado). Distingue vacío de fallo: sin Redis
 *  configurado o con error de lectura devuelve { ok: false }; si no hay nada guardado (o lo
 *  guardado no es JSON legible), { ok: true, datos: null }. Nunca lanza. */
export async function leerCartera(id: string): Promise<LecturaCartera> {
  try {
    const redis = await getRedis();
    if (!redis) return { ok: false };
    const k = clave(id);
    // Un id sin la forma esperada no puede tener nada guardado (guardarCartera lo rechaza).
    if (!k) return { ok: true, datos: null };
    // El cliente de Upstash intenta parsear el JSON por su cuenta; si llega como texto, se parsea aquí.
    const raw = await redis.get<unknown>(k);
    if (raw === null || raw === undefined) return { ok: true, datos: null };
    if (typeof raw === "string") {
      try {
        return { ok: true, datos: JSON.parse(raw) as unknown };
      } catch {
        console.warn("[CarteraStore] Lo guardado no es JSON legible; se trata como vacío.");
        return { ok: true, datos: null };
      }
    }
    return { ok: true, datos: raw };
  } catch (e) {
    console.warn("[CarteraStore] No se pudo leer la cartera:", e);
    return { ok: false };
  }
}

/** Guarda el estado (sustituye el anterior, sin caducidad). Devuelve false si no hay Redis,
 *  el id no vale, los datos no se serializan o pesan más de CARTERA_MAX_BYTES. Nunca lanza. */
export async function guardarCartera(id: string, datos: unknown): Promise<boolean> {
  try {
    const redis = await getRedis();
    const k = clave(id);
    if (!redis || !k) return false;
    const json: unknown = JSON.stringify(datos);
    if (typeof json !== "string" || tamanoSerializado(json) > CARTERA_MAX_BYTES) return false;
    await redis.set(k, json);
    return true;
  } catch (e) {
    console.warn("[CarteraStore] No se pudo guardar la cartera:", e);
    return false;
  }
}
