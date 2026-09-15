// =============================================================================
// DIVISAS (FOREX) — helpers compartidos por buscador, BD de fondos y data-fetcher
// =============================================================================
//
// Un par de divisas en EODHD es "<PAR>.FOREX" (EURUSD.FOREX). NO es un activo
// cotizado en la moneda del final: la serie ES el tipo de cambio, así que se
// usa tal cual, sin convertir a EUR (convertir EURUSD "de USD a EUR" daría una
// serie constante de 1). Su rentabilidad es la variación del par.
//
// Los metales spot de EODHD (XAUUSD, XAGUSD…) también cuelgan de .FOREX pero
// NO son pares de divisas: se tratan como hasta ahora (oro spot intacto).
// =============================================================================

import type { DailyPrice } from "./types";

/** Metales que EODHD sirve bajo .FOREX pero que no son pares de divisas. */
const METAL_CODES = new Set(["XAU", "XAG", "XPT", "XPD"]);

/** true si el código de 6 letras es un metal spot (XAUUSD, XAGUSD…). */
export function isMetalCode(code: string): boolean {
  return METAL_CODES.has(code.slice(0, 3).toUpperCase());
}

/** Nombres en español de las divisas más habituales (para etiquetas). */
export const CURRENCY_NAMES: Record<string, string> = {
  EUR: "Euro",
  USD: "Dólar",
  GBP: "Libra",
  JPY: "Yen",
  CHF: "Franco suizo",
  AUD: "Dólar australiano",
  CAD: "Dólar canadiense",
  NZD: "Dólar neozelandés",
  SEK: "Corona sueca",
  NOK: "Corona noruega",
  DKK: "Corona danesa",
  PLN: "Zloty polaco",
  CZK: "Corona checa",
  HUF: "Florín húngaro",
  MXN: "Peso mexicano",
  BRL: "Real brasileño",
  CNY: "Yuan",
  HKD: "Dólar de Hong Kong",
  SGD: "Dólar de Singapur",
  ZAR: "Rand",
  TRY: "Lira turca",
  INR: "Rupia india",
  KRW: "Won",
};

/**
 * Si la consulta "parece un par de divisas", devuelve su código canónico de
 * 6 letras; si no, null. Acepta: "EURUSD", "eurusd", "EUR/USD", "EUR USD",
 * "EUR-USD", "EURUSD=X" (Yahoo) y "EURUSD.FOREX" (EODHD).
 */
export function parseCurrencyPairQuery(raw: string): string | null {
  let q = raw.trim().toUpperCase();
  q = q.replace(/\.FOREX$/, "").replace(/=X$/, "");
  q = q.replace(/[\s/\-_]+/g, "");
  if (!/^[A-Z]{6}$/.test(q)) return null;
  // Los metales spot (XAUUSD…) no son pares de divisas: no los tratamos aquí.
  if (METAL_CODES.has(q.slice(0, 3))) return null;
  return q;
}

/** Código de 6 letras de un par (sin sufijo) o null si no lo es. */
export function currencyPairCode(ticker: string | undefined): string | null {
  if (!ticker) return null;
  const m = ticker.toUpperCase().match(/^([A-Z]{6})\.FOREX$/);
  if (!m || !m[1]) return null;
  return METAL_CODES.has(m[1].slice(0, 3)) ? null : m[1];
}

/** true si el ticker es un par de divisas EODHD (EURUSD.FOREX), NO un metal. */
export function isCurrencyPairTicker(ticker: string | undefined): boolean {
  return currencyPairCode(ticker) !== null;
}

/** Divisa cotizada del par (EURUSD → USD, USDJPY → JPY). */
export function quoteCurrencyOf(code: string): string {
  return code.slice(3, 6).toUpperCase();
}

/** Divisa base del par (EURUSD → EUR). */
export function baseCurrencyOf(code: string): string {
  return code.slice(0, 3).toUpperCase();
}

/** Nombre legible "Euro / Dólar (EURUSD)"; null si alguna divisa es desconocida. */
export function describeCurrencyPair(code: string): string | null {
  const base = CURRENCY_NAMES[baseCurrencyOf(code)];
  const quote = CURRENCY_NAMES[quoteCurrencyOf(code)];
  if (!base || !quote) return null;
  return `${base} / ${quote} (${code.toUpperCase()})`;
}

/** Nombre corto "EUR/USD". */
export function shortCurrencyPairName(code: string): string {
  return `${baseCurrencyOf(code)}/${quoteCurrencyOf(code)}`;
}

/**
 * Elimina las filas de sábado y domingo. EODHD publica para los pares una
 * cotización de domingo (apertura asiática) casi todas las semanas y, en
 * algunos tramos, también de sábado. Para un backtest con calendario bursátil
 * (252 sesiones/año, forward-fill contra ETFs) esas filas sobran: inflan el
 * número de observaciones y meterían días sin sesión en la unión de fechas.
 */
export function dropWeekendRows(prices: DailyPrice[]): DailyPrice[] {
  return prices.filter((p) => {
    const day = new Date(`${p.date}T00:00:00Z`).getUTCDay();
    return day !== 0 && day !== 6;
  });
}
