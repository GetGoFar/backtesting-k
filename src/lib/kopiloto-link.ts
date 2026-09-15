// =============================================================================
// ENLACE PROFUNDO DESDE EL KOPILOTO — `/?k=<base64url(JSON)>`
// =============================================================================
//
// El copiloto de ATARAXIA (ataraxia-bot.vercel.app) traduce una petición en
// lenguaje natural ("compara 60 % MSCI World y 40 % bonos euro contra el
// All-World, 10.000 € y 300 €/mes") a este payload y enlaza al comparador con
// él en la URL. La página principal lo lee al montar, precarga las carteras y
// los parámetros, y opcionalmente lanza el backtest.
//
// El contrato es deliberadamente pequeño y versionado (`v: 1`). El copiloto
// solo conoce IDs de fondos del catálogo local y de presets; aquí se VALIDA
// todo (pesos, IDs, fechas) y se descarta lo que no cuadre, en vez de fiarse.
// =============================================================================

import type { PortfolioHolding, RebalanceFrequency } from "./types";
import { getFundById } from "./fund-database";
import { getPresetById } from "./portfolio-presets";
import { getAllBenchmarks } from "./benchmarks";

/** Nombre del parámetro de la URL. */
export const KOPILOTO_PARAM = "k";

/** Una cartera tal y como la envía el copiloto: o un preset, o posiciones sueltas. */
export interface KopilotoPortfolioSpec {
  name?: string;
  /** ID de un preset (p.ej. "k-geografica-ucit-6"). Tiene prioridad sobre holdings. */
  preset?: string;
  holdings?: { fundId: string; weight: number }[];
  rebalance?: RebalanceFrequency;
  /** Comisión de gestión extra anual en % (p.ej. 0.4). */
  fee?: number;
}

/** Payload completo del enlace. Todo es opcional salvo la versión. */
export interface KopilotoLink {
  v: 1;
  a?: KopilotoPortfolioSpec;
  b?: KopilotoPortfolioSpec;
  /** Importe inicial en EUR. */
  initial?: number;
  /** Aportación mensual en EUR. */
  monthly?: number;
  /** "YYYY-MM" */
  start?: string;
  /** "YYYY-MM" */
  end?: string;
  /** "bm:<id>" (índice predefinido) o "preset:<id>". */
  benchmark?: string;
  /** Lanzar el backtest nada más cargar. */
  run?: boolean;
}

/** Cartera ya resuelta y validada, lista para inyectar en el PortfolioBuilder. */
export interface ResolvedPortfolio {
  name: string;
  holdings: PortfolioHolding[];
  rebalanceFrequency: RebalanceFrequency;
  managementFee: number;
}

export interface ResolvedKopilotoLink {
  a: ResolvedPortfolio | null;
  b: ResolvedPortfolio | null;
  initial?: number;
  monthly?: number;
  start?: string;
  end?: string;
  benchmark?: string;
  run: boolean;
  /** Cosas que se han descartado por no validar (para avisar sin romper). */
  warnings: string[];
}

const REBALANCE_VALUES: RebalanceFrequency[] = ["monthly", "quarterly", "annual", "none"];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// -----------------------------------------------------------------------------
// Codificación base64url (segura en URL, sin `+` `/` `=`)
// -----------------------------------------------------------------------------

function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Serializa un enlace (lo usa el copiloto; aquí sirve para tests y para
 *  generar enlaces desde la propia app). */
export function encodeKopilotoLink(link: KopilotoLink): string {
  return utf8ToBase64Url(JSON.stringify(link));
}

/** Lee el payload crudo del query string. `null` si no hay parámetro o no es JSON. */
export function parseKopilotoParam(search: string): KopilotoLink | null {
  try {
    const raw = new URLSearchParams(search).get(KOPILOTO_PARAM);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(base64UrlToUtf8(raw));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as KopilotoLink;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Resolución y validación
// -----------------------------------------------------------------------------

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function resolvePortfolio(
  spec: KopilotoPortfolioSpec | undefined,
  fallbackName: string,
  warnings: string[]
): ResolvedPortfolio | null {
  if (!spec || typeof spec !== "object") return null;

  let holdings: PortfolioHolding[] = [];
  let name = typeof spec.name === "string" && spec.name.trim() ? spec.name.trim().slice(0, 60) : "";

  if (typeof spec.preset === "string" && spec.preset) {
    const preset = getPresetById(spec.preset);
    if (!preset) {
      warnings.push(`No existe la cartera predefinida "${spec.preset}".`);
      return null;
    }
    holdings = preset.holdings.map((h) => ({ fundId: h.fundId, weight: h.weight, fund: h.fund }));
    if (!name) name = preset.name;
  } else if (Array.isArray(spec.holdings)) {
    for (const h of spec.holdings) {
      if (!h || typeof h.fundId !== "string" || !isFiniteNumber(h.weight) || h.weight <= 0) continue;
      if (!getFundById(h.fundId)) {
        warnings.push(`Fondo desconocido "${h.fundId}", se ha omitido.`);
        continue;
      }
      holdings.push({ fundId: h.fundId, weight: h.weight });
    }
  }

  if (holdings.length === 0) return null;

  // Los pesos se normalizan a 100 para que el builder los dé por válidos
  // (tolera ±2 %). El motor también normaliza, pero así la UI no se queja.
  const total = holdings.reduce((s, h) => s + h.weight, 0);
  if (total > 0 && Math.abs(total - 100) > 0.01) {
    holdings = holdings.map((h) => ({ ...h, weight: Math.round((h.weight / total) * 100 * 100) / 100 }));
    if (Math.abs(total - 100) > 2) {
      warnings.push(`Los pesos de "${name || fallbackName}" sumaban ${total} y se han normalizado a 100.`);
    }
  }

  const rebalanceFrequency = REBALANCE_VALUES.includes(spec.rebalance as RebalanceFrequency)
    ? (spec.rebalance as RebalanceFrequency)
    : "annual";
  const managementFee = isFiniteNumber(spec.fee) && spec.fee >= 0 && spec.fee <= 10 ? spec.fee : 0;

  return { name: name || fallbackName, holdings, rebalanceFrequency, managementFee };
}

function resolveBenchmark(value: unknown, warnings: string[]): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (value.startsWith("bm:")) {
    const id = value.slice(3);
    if (getAllBenchmarks().some((b) => b.id === id)) return value;
  } else if (value.startsWith("preset:")) {
    if (getPresetById(value.slice(7))) return value;
  }
  warnings.push(`Benchmark desconocido "${value}", se ignora.`);
  return undefined;
}

/** Valida y resuelve un payload. Devuelve `null` si no hay nada útil dentro. */
export function resolveKopilotoLink(link: KopilotoLink | null): ResolvedKopilotoLink | null {
  if (!link || link.v !== 1) return null;
  const warnings: string[] = [];

  const a = resolvePortfolio(link.a, "Cartera 1", warnings);
  const b = resolvePortfolio(link.b, "Cartera 2", warnings);
  if (!a && !b) return null;

  const initial = isFiniteNumber(link.initial) && link.initial >= 0 ? Math.round(link.initial) : undefined;
  const monthly = isFiniteNumber(link.monthly) && link.monthly >= 0 ? Math.round(link.monthly) : undefined;
  const start = typeof link.start === "string" && MONTH_RE.test(link.start) ? link.start : undefined;
  const end = typeof link.end === "string" && MONTH_RE.test(link.end) ? link.end : undefined;
  const benchmark = resolveBenchmark(link.benchmark, warnings);

  return { a, b, initial, monthly, start, end, benchmark, run: link.run === true, warnings };
}

/** Atajo: del query string a la cartera resuelta en una llamada. */
export function readKopilotoLink(search: string): ResolvedKopilotoLink | null {
  return resolveKopilotoLink(parseKopilotoParam(search));
}
