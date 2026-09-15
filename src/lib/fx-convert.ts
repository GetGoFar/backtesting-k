// =============================================================================
// CONVERSIÓN DE DIVISA — precios de un activo en la divisa (o unidad) elegida
// =============================================================================
//
// Un fondo en EUR que tiene un activo en USD valora su NAV dividiendo el precio
// en USD por el tipo de cambio del día. Aquí se hace exactamente eso para que
// el usuario pueda ver los resultados en EUR, USD, GBP, CHF, JPY… o en ORO
// (onzas): el oro es una "divisa" más, con XAUUSD como tipo de cambio.
//
// Pivote: el dólar. EODHD sirve `XXX.FOREX` = unidades de XXX por 1 USD (EUR
// desde 1975, JPY/CHF/CAD desde 1971, GBP solo desde 2000) y `XAUUSD.FOREX` =
// USD por onza (desde 1979). Para pasar de A a B:
//   precio_B = precio_A × usdPor(A) / usdPor(B)
// con el tipo de cambio del mismo día (o el último conocido si ese día no hay
// dato: forward-fill). Los días anteriores al primer tipo de cambio disponible
// no se pueden convertir y se descartan (la serie empieza más tarde).
//
// La divisa objetivo viaja en el contexto del request (`displayCurrency`);
// "native" = sin convertir (comportamiento histórico de la app). Las series
// nativas y los tipos de cambio se cachean por separado: la conversión es un
// producto en memoria, barato.
//
// Reglas:
//   - Un par de divisas (EURUSD.FOREX) NUNCA se convierte: la serie ES el tipo
//     de cambio (convertirlo daría una constante).
//   - Cotizaciones en peniques (GBX/GBp, acciones de la LSE) se pasan a GBP
//     dividiendo por 100 antes de convertir.
//   - El campo `currency` del fondo debe ser la divisa de la COTIZACIÓN que se
//     descarga (la del listing), no la divisa base del fondo.
// =============================================================================

import { getDailyPrices, aggregateDailyToMonthly } from "./data-fetcher";
import type { DailyPricesResult, MonthlyPricesResult } from "./data-fetcher";
import { getRequestContext } from "./request-context";
import { isCurrencyPairTicker } from "./forex";
import type { DisplayCurrency } from "./types";

export { DISPLAY_CURRENCIES, isDisplayCurrency, currencyUnitLabel, displayCurrencyName } from "./display-currency";

/** Nota que deja cada conversión en el contexto del request (→ avisos). */
export interface FxConversionNote {
  fundId: string;
  from: string;
  to: DisplayCurrency;
  /** Primer día de la serie nativa. */
  nativeFirstDate: string | null;
  /** Primer día convertible (null si no se pudo convertir ningún día). */
  convertedFirstDate: string | null;
  droppedDays: number;
}

// -----------------------------------------------------------------------------
// Normalización de códigos
// -----------------------------------------------------------------------------

/** Normaliza el código de divisa de un fondo: mayúsculas y peniques → GBP/100. */
export function normalizeCurrency(raw: string | undefined): { code: string; scale: number } | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  if (c === "GBX" || (c === "GBP" && raw.trim() === "GBp")) return { code: "GBP", scale: 0.01 };
  if (c === "GBP") return { code: "GBP", scale: 1 };
  if (!/^[A-Z]{3}$/.test(c)) return null;
  return { code: c, scale: 1 };
}

// -----------------------------------------------------------------------------
// Tipos de cambio: USD por unidad de cada divisa (o por onza de oro)
// -----------------------------------------------------------------------------

/** Serie "USD por 1 unidad" de la divisa. null = USD (identidad). */
export async function getUsdPerUnitSeries(code: string): Promise<Map<string, number> | null> {
  if (code === "USD") return null;
  if (code === "XAU") {
    // Oro spot: XAUUSD ya es USD por onza (fondo curado, cacheado).
    const { prices } = await getDailyPrices("spot-gold");
    return prices;
  }
  // XXX.FOREX = unidades de XXX por 1 USD → invertir.
  const ticker = `${code}.FOREX`;
  const { prices } = await getDailyPrices(`fxrate-${code.toLowerCase()}`, ticker);
  const inverted = new Map<string, number>();
  for (const [date, unitsPerUsd] of prices) {
    if (unitsPerUsd > 0) inverted.set(date, 1 / unitsPerUsd);
  }
  return inverted;
}

// -----------------------------------------------------------------------------
// Conversión pura (testeable)
// -----------------------------------------------------------------------------

/**
 * Convierte una serie de precios usando dos series "USD por unidad" con
 * forward-fill por fecha. `scale` reescala el precio nativo antes (GBX → 0.01).
 * Devuelve la serie convertida y el número de días descartados por caer antes
 * del primer tipo de cambio disponible.
 */
export function convertPriceMap(
  prices: Map<string, number>,
  usdPerFrom: Map<string, number> | null,
  usdPerTo: Map<string, number> | null,
  scale: number = 1
): { prices: Map<string, number>; droppedDays: number } {
  const out = new Map<string, number>();
  const dates = Array.from(prices.keys()).sort();
  const from = usdPerFrom ? sortedSeries(usdPerFrom) : null;
  const to = usdPerTo ? sortedSeries(usdPerTo) : null;
  let iFrom = 0;
  let iTo = 0;
  let dropped = 0;
  for (const date of dates) {
    let factor = scale;
    if (from) {
      while (iFrom + 1 < from.length && from[iFrom + 1]![0] <= date) iFrom++;
      if (from[iFrom]![0] > date) { dropped++; continue; }
      factor *= from[iFrom]![1];
    }
    if (to) {
      while (iTo + 1 < to.length && to[iTo + 1]![0] <= date) iTo++;
      if (to[iTo]![0] > date) { dropped++; continue; }
      factor /= to[iTo]![1];
    }
    const price = prices.get(date)!;
    if (factor > 0 && isFinite(factor)) out.set(date, price * factor);
  }
  return { prices: out, droppedDays: dropped };
}

function sortedSeries(m: Map<string, number>): Array<[string, number]> {
  if (m.size === 0) return [["9999-12-31", 1]];
  return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

// -----------------------------------------------------------------------------
// Carga de precios en la divisa objetivo
// -----------------------------------------------------------------------------

/** Divisa objetivo del request actual ("native" si no hay contexto). */
export function getDisplayCurrency(): DisplayCurrency {
  return getRequestContext()?.displayCurrency ?? "native";
}

/**
 * Precios diarios de un fondo en la divisa objetivo del request. Si no hay
 * que convertir (native, misma divisa, par de divisas, divisa desconocida)
 * devuelve la serie tal cual. Deja una nota en el contexto cuando convierte.
 */
export async function getDailyPricesIn(
  fundId: string,
  ticker?: string,
  isin?: string,
  nativeCurrency?: string
): Promise<DailyPricesResult> {
  const native = await getDailyPrices(fundId, ticker, isin);
  const target = getDisplayCurrency();
  if (target === "native") return native;
  if (isCurrencyPairTicker(ticker)) return native; // un tipo de cambio no se convierte
  const from = normalizeCurrency(nativeCurrency);
  if (!from) {
    console.warn(`[FX] ${fundId}: divisa "${nativeCurrency}" desconocida, se usa sin convertir`);
    return native;
  }
  if (from.code === target && from.scale === 1) return native;

  const [usdPerFrom, usdPerTo] = await Promise.all([
    getUsdPerUnitSeries(from.code),
    getUsdPerUnitSeries(target),
  ]);
  const { prices, droppedDays } = convertPriceMap(native.prices, usdPerFrom, usdPerTo, from.scale);

  const nativeDates = Array.from(native.prices.keys()).sort();
  const convertedDates = Array.from(prices.keys()).sort();
  const note: FxConversionNote = {
    fundId,
    from: from.code,
    to: target,
    nativeFirstDate: nativeDates[0] ?? null,
    convertedFirstDate: convertedDates[0] ?? null,
    droppedDays,
  };
  getRequestContext()?.fxNotes?.push(note);
  console.log(
    `[FX] ${fundId}: ${from.code} → ${target}, ${prices.size} días` +
      (droppedDays > 0 ? ` (${droppedDays} descartados antes de ${note.convertedFirstDate})` : "")
  );
  return { prices };
}

/** Versión mensual (último cierre de cada mes) de `getDailyPricesIn`. */
export async function getMonthlyPricesIn(
  fundId: string,
  ticker?: string,
  isin?: string,
  nativeCurrency?: string
): Promise<MonthlyPricesResult> {
  const daily = await getDailyPricesIn(fundId, ticker, isin, nativeCurrency);
  return aggregateDailyToMonthly(daily);
}
