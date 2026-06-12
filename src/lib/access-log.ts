// =============================================================================
// ACCESS LOG — registro de accesos a la app en Upstash Redis
// =============================================================================
//
// Guarda cada intento de login en /api/acceso (correctos e incorrectos) en
// una lista Redis acotada (LPUSH + LTRIM). Mismo Upstash que usa kv-cache.ts
// para los precios; si Redis no está configurado, el log es un no-op
// silencioso (el login NUNCA debe fallar por culpa del registro).
//
// Lectura: /api/acceso/log?key=<CRON_SECRET> — tabla HTML con los últimos
// accesos (etiqueta del código, ciudad/país de Vercel, IP truncada, navegador).

const LOG_KEY = "acceso:log";
const MAX_ENTRIES = 500;

export interface AccessLogEntry {
  /** ISO timestamp */
  ts: string;
  /** "ok" si el código era válido, "fail" si no */
  result: "ok" | "fail";
  /** Etiqueta del código usado (p.ej. "pablo", "general", "taller").
   *  En fallos: pista enmascarada del texto introducido. */
  label: string;
  /** Ciudad y país según headers de geolocalización de Vercel */
  city?: string;
  country?: string;
  /** IP truncada (último octeto a 0) — suficiente para distinguir orígenes
   *  sin almacenar la IP completa */
  ip?: string;
  /** Navegador/SO simplificado */
  ua?: string;
}

// --- Cliente Upstash (lazy, mismo patrón que kv-cache.ts) ---
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

/** ¿Está Redis configurado? (para que el visor pueda informar con claridad) */
export async function isLogStoreAvailable(): Promise<boolean> {
  return (await getRedis()) !== null;
}

/** Registra un acceso. Nunca lanza: el login no debe romperse por el log. */
export async function logAccess(entry: AccessLogEntry): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;
    await redis.lpush(LOG_KEY, JSON.stringify(entry));
    await redis.ltrim(LOG_KEY, 0, MAX_ENTRIES - 1);
  } catch (e) {
    console.warn("[AccessLog] No se pudo registrar el acceso:", e);
  }
}

/** Devuelve los últimos `n` accesos (más recientes primero). */
export async function getRecentAccesses(n: number = 200): Promise<AccessLogEntry[]> {
  try {
    const redis = await getRedis();
    if (!redis) return [];
    const raw = await redis.lrange(LOG_KEY, 0, n - 1);
    return raw
      .map((r) => {
        try {
          return typeof r === "string" ? (JSON.parse(r) as AccessLogEntry) : (r as AccessLogEntry);
        } catch {
          return null;
        }
      })
      .filter((e): e is AccessLogEntry => e !== null);
  } catch (e) {
    console.warn("[AccessLog] No se pudo leer el registro:", e);
    return [];
  }
}

/** Simplifica un user-agent a "Navegador · SO" legible. */
export function simplifyUserAgent(ua: string | null): string {
  if (!ua) return "desconocido";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) && /Version\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : /bot|crawl|spider/i.test(ua) ? "Bot"
    : "Otro";
  const os =
    /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) ? "macOS"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Linux/.test(ua) ? "Linux"
    : "?";
  return `${browser} · ${os}`;
}

/** Trunca una IP (v4: último octeto a 0; v6: conserva el prefijo). */
export function truncateIp(ip: string | null): string | undefined {
  if (!ip) return undefined;
  const first = ip.split(",")[0]?.trim() ?? "";
  if (first.includes(".")) {
    const parts = first.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (first.includes(":")) return first.split(":").slice(0, 4).join(":") + "::";
  return undefined;
}
