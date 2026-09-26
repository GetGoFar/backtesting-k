// Composición real de un ETF o fondo de bolsa (sectores, regiones,
// capitalización) según los fundamentales de EODHD, y su traducción a la
// casilla de Mi cartera (Posicion.sub). Nivel 1, decisión de Pablo
// (26-sep-2026): la etiqueta de sector/región se pone sola con la composición
// real en vez de adivinarla por el nombre; el socio siempre puede corregirla.
// El motor y el semáforo no cambian: sigue siendo un activo en una casilla.
//
// SOLO SERVIDOR (usa la clave de EODHD, el catálogo y Upstash). Todo lo que no
// es el fetch es puro y está testado: parsearFundamentales y mapearSub.
//
// Reglas de mapeo (≥ 60 % domina):
//   Sectores Morningstar → staples = Consumer Defensive, salud = Healthcare,
//   tecnologia = Technology, energia = Energy, inmobiliario = Real Estate,
//   utilities = Utilities; todo lo demás suma en otro-sector. El sector
//   dominante es el de mayor % si llega al 60 %; si ninguno llega, no hay
//   sector (es un ETF amplio).
//   Regiones → eeuu = North America; europa = United Kingdom + Europe
//   Developed + Europe Emerging; asia = Japan + Australasia + Asia Developed;
//   emergentes = Asia Emerging + Latin America + Africa/Middle East. Dominante
//   si ≥ 60 %; si ninguna domina, "global". smallcaps si Small + Micro ≥ 60 %.
//   Estrategia: sectorial → sector; geografica → región; mixta → sector si
//   domina uno, si no región.

import { getFundByIsin } from "@/lib/fund-database";
import { buscarMercado } from "@/lib/eodhd-search";
import { REGIONES, SECTORES, type EstrategiaRV, type Region, type Sector, type SubRV } from "./cartera";

export type Composicion = {
  isin: string;
  /** Listing de EODHD que respondió (p. ej. "SXR8.XETRA"). */
  ticker: string;
  /** Por sector Morningstar, % 0-100 de la parte de bolsa. */
  sectores: Record<string, number>;
  /** Por región del mundo (nombres de EODHD), % 0-100. */
  regiones: Record<string, number>;
  capitalizacion?: { grande: number; media: number; pequena: number; micro: number };
  divisa?: string;
  /** Número de posiciones del fondo. */
  posiciones?: number;
  /** ISO: cuándo se obtuvo. */
  fecha: string;
};

export type Mapeo = {
  /** Sector dominante (≥ 60 %). */
  sector?: { id: Sector; pct: number };
  /** Región dominante (≥ 60 %), smallcaps si Small + Micro ≥ 60 %, o global si ninguna domina. */
  region?: { id: Region; pct: number };
  /** Casilla que corresponde a la estrategia del plan. */
  sub: SubRV | undefined;
  motivo: string;
};

export const UMBRAL_DOMINANTE = 60;

// ---------------------------------------------------------------------------
// Parseo defensivo de los fundamentales de EODHD

const redondear1 = (x: number) => Math.round(x * 10) / 10;

/** Número de un valor que puede venir como número, "45.1", "45.1%" o basura. Ausente = 0. */
function numero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace("%", "").replace(",", ".").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const CAMPOS_PESO = ["Equity_%", "Net_Assets_%", "Amount_%", "Stocks_%", "Portfolio_%", "Net_%", "Fund_%", "Long_%"];
const CAMPOS_NOMBRE = ["Name", "Type", "Size"];

/** Peso de una entrada: número directo, string numérico u objeto con uno de los campos de peso. */
function pesoDe(v: unknown): number | undefined {
  if (typeof v === "number" || typeof v === "string") return numero(v);
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  for (const c of CAMPOS_PESO) if (c in o) return numero(o[c]);
  return undefined;
}

/**
 * Bloque de pesos de EODHD → { nombre: % }. Admite el formato plano de los ETFs
 * ({"Technology": {"Equity_%": "45.1"}}) y el anidado de los fondos
 * ({"0": {"Name": "Technology", "Amount_%": "45.1"}}), y valores sueltos.
 */
export function parsearPesos(bloque: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!bloque || typeof bloque !== "object") return out;
  for (const [clave, valor] of Object.entries(bloque as Record<string, unknown>)) {
    if (/^\d+$/.test(clave) && valor && typeof valor === "object") {
      const hijo = valor as Record<string, unknown>;
      const nombre = CAMPOS_NOMBRE.map((c) => hijo[c]).find((x) => typeof x === "string" && x.trim() !== "");
      const peso = pesoDe(hijo);
      if (typeof nombre === "string" && peso !== undefined) out[nombre.trim()] = redondear1(peso);
      continue;
    }
    const peso = pesoDe(valor);
    if (peso !== undefined) out[clave.trim()] = redondear1(peso);
  }
  return out;
}

function capitalizacionDe(bloque: unknown): Composicion["capitalizacion"] | undefined {
  const pesos = parsearPesos(bloque);
  const claves = Object.keys(pesos);
  if (claves.length === 0) return undefined;
  const cap = { grande: 0, media: 0, pequena: 0, micro: 0 };
  for (const [k, v] of Object.entries(pesos)) {
    const n = k.toLowerCase();
    if (/micro/.test(n)) cap.micro += v;
    else if (/small/.test(n)) cap.pequena += v;
    else if (/medium|\bmid\b/.test(n)) cap.media += v;
    else if (/giant|big|large|mega/.test(n)) cap.grande += v;
  }
  return { grande: redondear1(cap.grande), media: redondear1(cap.media), pequena: redondear1(cap.pequena), micro: redondear1(cap.micro) };
}

/**
 * JSON de EODHD /fundamentals → Composicion, o null si no trae ETF_Data ni
 * MutualFund_Data con sectores o regiones. `ref` completa isin/ticker cuando
 * el JSON no los trae.
 */
export function parsearFundamentales(json: unknown, ref: { isin?: string; ticker?: string; fecha?: string } = {}): Composicion | null {
  if (!json || typeof json !== "object") return null;
  const raiz = json as Record<string, unknown>;
  const bloque = (raiz.ETF_Data ?? raiz.MutualFund_Data) as Record<string, unknown> | undefined;
  if (!bloque || typeof bloque !== "object") return null;
  const general = (raiz.General ?? {}) as Record<string, unknown>;

  const sectores = parsearPesos(bloque.Sector_Weights);
  const regiones = parsearPesos(bloque.World_Regions);
  if (Object.keys(sectores).length === 0 && Object.keys(regiones).length === 0) return null;

  const isin = (ref.isin ?? (typeof bloque.ISIN === "string" ? bloque.ISIN : typeof general.ISIN === "string" ? general.ISIN : "")).toUpperCase();
  const codigo = typeof general.Code === "string" ? general.Code : "";
  const bolsa = typeof general.Exchange === "string" ? general.Exchange : "";
  const ticker = ref.ticker ?? (codigo && bolsa ? `${codigo}.${bolsa}` : codigo);
  const divisa = typeof general.CurrencyCode === "string" ? general.CurrencyCode : typeof bloque.Currency === "string" ? bloque.Currency : undefined;
  const posiciones = numero(bloque.Holdings_Count);

  const comp: Composicion = { isin, ticker, sectores, regiones, fecha: ref.fecha ?? new Date().toISOString() };
  const cap = capitalizacionDe(bloque.Market_Capitalization ?? bloque.Market_Capitalisation);
  if (cap) comp.capitalizacion = cap;
  if (divisa) comp.divisa = divisa;
  if (posiciones > 0) comp.posiciones = Math.round(posiciones);
  return comp;
}

// ---------------------------------------------------------------------------
// De la composición a las casillas de Mi cartera

function sectorDe(nombre: string): Sector {
  const n = nombre.toLowerCase();
  if (/consumer defensive|consumer staples|staples/.test(n)) return "staples";
  if (/health/.test(n)) return "salud";
  if (/technology/.test(n)) return "tecnologia";
  if (/^energy\b/.test(n)) return "energia";
  if (/real estate/.test(n)) return "inmobiliario";
  if (/utilit/.test(n)) return "utilities";
  return "otro-sector";
}

/** Región de Mi cartera de una región de EODHD; undefined si no se reconoce. */
function regionDe(nombre: string): Exclude<Region, "global" | "smallcaps"> | undefined {
  const n = nombre.toLowerCase();
  if (/europe|united kingdom|eurozone/.test(n)) return "europa";
  if (/emerging|latin america|africa|middle east/.test(n)) return "emergentes";
  if (/japan|australasia|asia|pacific|australia/.test(n)) return "asia";
  if (/north america|united states|\busa?\b|canada/.test(n)) return "eeuu";
  return undefined;
}

/**
 * Porcentaje de cada casilla (regiones y sectores) según la composición:
 * las casillas de sector suman los sectores Morningstar que les tocan,
 * las de región suman las regiones de EODHD, smallcaps = Small + Micro.
 * "global" no tiene porcentaje (es la ausencia de región dominante).
 */
export function casillasDe(comp: Composicion): Partial<Record<SubRV, number>> {
  const out: Partial<Record<SubRV, number>> = {};
  const suma = (id: SubRV, v: number) => {
    out[id] = redondear1((out[id] ?? 0) + v);
  };
  for (const [nombre, pct] of Object.entries(comp.sectores)) suma(sectorDe(nombre), pct);
  for (const [nombre, pct] of Object.entries(comp.regiones)) {
    const r = regionDe(nombre);
    if (r) suma(r, pct);
  }
  if (comp.capitalizacion) {
    const s = comp.capitalizacion.pequena + comp.capitalizacion.micro;
    if (s > 0) out.smallcaps = redondear1(s);
  }
  return out;
}

function mayor<T extends SubRV>(casillas: Partial<Record<SubRV, number>>, ids: T[]): { id: T; pct: number } | undefined {
  let mejor: { id: T; pct: number } | undefined;
  for (const id of ids) {
    const pct = casillas[id];
    if (pct === undefined) continue;
    if (!mejor || pct > mejor.pct) mejor = { id, pct };
  }
  return mejor;
}

const IDS_SECTOR = SECTORES.map((s) => s.id);
const IDS_REGION = REGIONES.map((r) => r.id).filter((r): r is Exclude<Region, "global" | "smallcaps"> => r !== "global" && r !== "smallcaps");

/** Casilla que corresponde a una composición según la estrategia del plan. */
export function mapearSub(comp: Composicion, estrategia: EstrategiaRV | undefined): Mapeo {
  const casillas = casillasDe(comp);

  const topSector = mayor(casillas, IDS_SECTOR);
  const sector = topSector && topSector.pct >= UMBRAL_DOMINANTE ? topSector : undefined;

  let region: Mapeo["region"];
  const smallcaps = casillas.smallcaps ?? 0;
  const topRegion = mayor(casillas, IDS_REGION);
  if (smallcaps >= UMBRAL_DOMINANTE) region = { id: "smallcaps", pct: smallcaps };
  else if (topRegion && topRegion.pct >= UMBRAL_DOMINANTE) region = topRegion;
  else if (topRegion) region = { id: "global", pct: topRegion.pct };

  const motivoSector = sector ? `${sector.id} ${sector.pct} %` : topSector ? "sin sector dominante" : "sin datos de sectores";
  const motivoRegion = region ? (region.id === "global" ? "sin región dominante" : `${region.id} ${region.pct} %`) : "sin datos de regiones";

  if (estrategia === "sectorial") return { sector, region, sub: sector?.id, motivo: motivoSector };
  if (estrategia === "geografica") return { sector, region, sub: region?.id, motivo: motivoRegion };
  // Mixta (o sin estrategia): sector si domina uno, si no región.
  if (sector) return { sector, region, sub: sector.id, motivo: motivoSector };
  return { sector, region, sub: region?.id, motivo: `${motivoSector}; ${motivoRegion}` };
}

/** Lo que devuelve /api/cartera/composicion junto a la composición. */
export type Sugerencia = {
  sectorial?: SubRV;
  geografica?: SubRV;
  mixta?: SubRV;
  /** Sector dominante (≥ 60 %). */
  sector?: { id: Sector; pct: number };
  /** Región dominante, smallcaps, o global si ninguna domina. */
  region?: { id: Region; pct: number };
  /** Porcentaje de cada casilla (para enseñar el % de la que elija el socio). */
  casillas: Partial<Record<SubRV, number>>;
};

export type RespuestaComposicion = { composicion: Composicion | null; sugerencia: Sugerencia };

/** La casilla para cada estrategia, más los porcentajes por casilla. Sin composición, vacío. */
export function sugerenciaDe(comp: Composicion | null): Sugerencia {
  if (!comp) return { casillas: {} };
  const sectorial = mapearSub(comp, "sectorial");
  const geografica = mapearSub(comp, "geografica");
  const mixta = mapearSub(comp, "mixta");
  const s: Sugerencia = { casillas: casillasDe(comp) };
  if (sectorial.sub) s.sectorial = sectorial.sub;
  if (geografica.sub) s.geografica = geografica.sub;
  if (mixta.sub) s.mixta = mixta.sub;
  if (mixta.sector) s.sector = mixta.sector;
  if (mixta.region) s.region = mixta.region;
  return s;
}

// ---------------------------------------------------------------------------
// Obtener la composición: catálogo/EODHD con caché en Upstash y en memoria

const ES_ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const EODHD_BASE_URL = "https://eodhd.com/api";
const PREFIJO_CACHE = "composicion:v1:";
const TTL_OK_S = 30 * 24 * 3600;
const TTL_NULO_S = 24 * 3600;
const TIMEOUT_FETCH_MS = 8000;
/** Presupuesto total por llamada (la ruta tiene 20 s en Vercel). */
const PRESUPUESTO_MS = 16_000;
const MAX_CANDIDATOS = 4;

type Cacheado = Composicion | { nulo: true };
const memoria = new Map<string, { valor: Composicion | null; hasta: number }>();

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

async function leerRedis(isin: string): Promise<{ valor: Composicion | null } | undefined> {
  try {
    const redis = await getRedis();
    if (!redis) return undefined;
    const raw = await redis.get<Cacheado | string>(PREFIJO_CACHE + isin);
    if (raw === null || raw === undefined) return undefined;
    const v = typeof raw === "string" ? (JSON.parse(raw) as Cacheado) : raw;
    if (v && typeof v === "object" && "nulo" in v) return { valor: null };
    if (v && typeof v === "object" && "sectores" in v) return { valor: v };
    return undefined;
  } catch (e) {
    console.warn("[Composicion] No se pudo leer la caché:", e);
    return undefined;
  }
}

async function guardarRedis(isin: string, valor: Composicion | null): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;
    const v: Cacheado = valor ?? { nulo: true };
    await redis.set(PREFIJO_CACHE + isin, JSON.stringify(v), { ex: valor ? TTL_OK_S : TTL_NULO_S });
  } catch (e) {
    console.warn("[Composicion] No se pudo guardar la caché:", e);
  }
}

/**
 * Variantes EODHD de un ticker "SÍMBOLO.BOLSA" de la app: EODHD usa .XETRA
 * (o .F) donde la app usa .DE, y .LSE donde la app usa .L.
 */
export function variantesEodhd(ticker: string): string[] {
  const t = ticker.trim().toUpperCase();
  if (!t) return [];
  const i = t.lastIndexOf(".");
  if (i <= 0) return [t];
  const base = t.slice(0, i);
  const sufijo = t.slice(i + 1);
  const mapa: Record<string, string[]> = { DE: ["XETRA", "F"], L: ["LSE"] };
  const alts = mapa[sufijo];
  if (!alts) return [t];
  return [...alts.map((a) => `${base}.${a}`), t];
}

/** Candidatos de EODHD a probar, en orden: catálogo, ticker sugerido, búsqueda por ISIN y, para fondos, ISIN.EUFUND. */
async function candidatosDe(isin: string, tickerSugerido: string | undefined, restanteMs: () => number): Promise<string[]> {
  const out: string[] = [];
  const catalogo = getFundByIsin(isin)?.ticker;
  if (catalogo) out.push(...variantesEodhd(catalogo));
  if (tickerSugerido) out.push(...variantesEodhd(tickerSugerido));
  if (out.length === 0 && restanteMs() > 2000) {
    try {
      const mercado = await buscarMercado(isin, { signal: AbortSignal.timeout(Math.min(TIMEOUT_FETCH_MS, restanteMs())) });
      const propios = mercado.filter((r) => (r.isin ?? "").toUpperCase() === isin && r.symbol && !r.isCurrency && !r.isStock);
      for (const r of propios) out.push(...variantesEodhd(r.symbol));
    } catch {
      /* sin mercado */
    }
  }
  out.push(`${isin}.EUFUND`);
  return Array.from(new Set(out)).slice(0, MAX_CANDIDATOS);
}

async function fetchFundamentales(ticker: string, timeoutMs: number): Promise<unknown | null> {
  const token = process.env.EODHD_API_TOKEN || "";
  if (!token || token === "demo") return null;
  try {
    const url = `${EODHD_BASE_URL}/fundamentals/${encodeURIComponent(ticker)}?fmt=json&api_token=${token}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(Math.max(500, timeoutMs)) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Composición de un ISIN: memoria → Upstash ("composicion:v1:<ISIN>", 30 días;
 * un null se guarda 1 día para no insistir) → EODHD /fundamentals con el
 * ticker del catálogo, el sugerido o el que dé la búsqueda por ISIN. Devuelve
 * null si no hay datos (sin clave, fondo sin composición, red caída). Nunca lanza.
 */
export async function obtenerComposicion(isinBruto: string, tickerSugerido?: string): Promise<Composicion | null> {
  try {
    const isin = String(isinBruto ?? "").trim().toUpperCase();
    if (!ES_ISIN.test(isin)) return null;

    const enMemoria = memoria.get(isin);
    if (enMemoria && enMemoria.hasta > Date.now()) return enMemoria.valor;

    const enRedis = await leerRedis(isin);
    if (enRedis) {
      memoria.set(isin, { valor: enRedis.valor, hasta: Date.now() + (enRedis.valor ? TTL_OK_S : TTL_NULO_S) * 1000 });
      return enRedis.valor;
    }

    const token = process.env.EODHD_API_TOKEN || "";
    if (!token || token === "demo") return null; // sin clave no se cachea: en cuanto haya clave, funciona

    const inicio = Date.now();
    const restante = () => PRESUPUESTO_MS - (Date.now() - inicio);
    const candidatos = await candidatosDe(isin, tickerSugerido, restante);

    let comp: Composicion | null = null;
    for (const ticker of candidatos) {
      if (restante() < 1000) break;
      const json = await fetchFundamentales(ticker, Math.min(TIMEOUT_FETCH_MS, restante()));
      if (!json) continue;
      comp = parsearFundamentales(json, { isin, ticker });
      if (comp) break;
    }

    memoria.set(isin, { valor: comp, hasta: Date.now() + (comp ? TTL_OK_S : TTL_NULO_S) * 1000 });
    await guardarRedis(isin, comp);
    return comp;
  } catch (e) {
    console.warn("[Composicion] Error obteniendo la composición:", e);
    return null;
  }
}
