// =============================================================================
// DATA FETCHER - Backtesting Tool El Proyecto K
// =============================================================================
//
// Este módulo obtiene precios históricos diarios de fondos de inversión.
// Fuentes de datos (en orden de prioridad):
//   1. Cache (memoria → Redis)
//   2. EODHD API (principal) — https://eodhd.com/
//   3. Yahoo Finance API (fallback)
//   4. CSV local (fondos bancarios españoles)
//
// =============================================================================

import { promises as fs } from "fs";
import { join } from "path";
import { getFundById } from "./fund-database";
import { getCachedPrices, setCachedPrices } from "./kv-cache";
import { validatePriceData, cleanPriceData } from "./data-validator";
import type { DailyPrice, MonthlyPrice } from "./types";

// Ruta al CSV de fondos españoles
const SPANISH_FUNDS_CSV = join(process.cwd(), "src", "data", "spanish-funds.csv");

// EODHD API configuration
const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN || "";
const EODHD_BASE_URL = "https://eodhd.com/api";

// -----------------------------------------------------------------------------
// Interfaces internas
// -----------------------------------------------------------------------------

interface YahooChartResponse {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        adjclose: Array<{
          adjclose: (number | null)[];
        }>;
      };
    }> | null;
    error: {
      code: string;
      description: string;
    } | null;
  };
}

/** Respuesta de EODHD EOD endpoint */
interface EODHDPricePoint {
  date: string;        // "2024-01-02"
  open: number;
  high: number;
  low: number;
  close: number;
  adjusted_close: number;
  volume: number;
}

// -----------------------------------------------------------------------------
// Resultado de getDailyPrices
// -----------------------------------------------------------------------------

export interface DailyPricesResult {
  prices: Map<string, number>; // YYYY-MM-DD → adjusted close
}

/** Resultado legacy de getMonthlyPrices (compatibilidad) */
export interface MonthlyPricesResult {
  prices: Map<string, number>;     // YYYY-MM → close
  exactDates: Map<string, string>; // YYYY-MM → YYYY-MM-DD
}

// -----------------------------------------------------------------------------
// Función principal — datos DIARIOS
// -----------------------------------------------------------------------------

/**
 * Obtiene los precios diarios de un fondo por su ID.
 * Estrategia: Cache → EODHD → Yahoo Finance → CSV
 */
export async function getDailyPrices(fundId: string, yahooTicker?: string, isin?: string): Promise<DailyPricesResult> {
  console.log(`[DataFetcher] Obteniendo precios diarios para: ${fundId}`);

  const fund = getFundById(fundId);
  const ticker = fund?.yahooTicker || yahooTicker;
  const effectiveIsin = fund?.isin || isin;

  if (!fund && !yahooTicker) {
    throw new Error(`Fondo no encontrado: ${fundId}`);
  }

  // 1. Intentar cache (memoria -> Redis)
  const cached = await getCachedPrices(fundId);
  if (cached) {
    console.log(`[DataFetcher] Cache hit: ${fundId} (${cached.length} días)`);
    return dailyPricesToMap(cached);
  }

  // 2. Obtener datos del origen
  let prices: DailyPrice[] = [];

  // 2a. Intentar EODHD primero (si hay API key y ticker)
  if (EODHD_API_TOKEN && EODHD_API_TOKEN !== "demo" && ticker) {
    const eodhTicker = yahooTickerToEODHD(ticker);
    console.log(`[DataFetcher] Intentando EODHD diario: ${eodhTicker} (desde Yahoo: ${ticker})`);
    prices = await fetchDailyFromEODHD(eodhTicker);

    // Si EODHD falló con el ticker, intentar con el ISIN en EUFUND
    if (prices.length === 0 && effectiveIsin) {
      console.log(`[DataFetcher] EODHD ticker falló, intentando ISIN: ${effectiveIsin}.EUFUND`);
      prices = await fetchDailyFromEODHD(`${effectiveIsin}.EUFUND`);
    }
  }

  // 2a-bis. Si no hay ticker pero sí ISIN, intentar EODHD con ISIN directamente
  if (prices.length === 0 && EODHD_API_TOKEN && EODHD_API_TOKEN !== "demo" && !ticker && effectiveIsin) {
    console.log(`[DataFetcher] Intentando EODHD con ISIN directo: ${effectiveIsin}.EUFUND`);
    prices = await fetchDailyFromEODHD(`${effectiveIsin}.EUFUND`);
  }

  // 2b. Fallback a Yahoo Finance (último recurso para APIs online)
  if (prices.length === 0 && ticker) {
    console.log(`[DataFetcher] ⚠️ EODHD no tuvo datos, fallback a Yahoo Finance: ${ticker}`);
    prices = await fetchDailyFromYahooFinance(ticker);
    if (prices.length > 0) {
      console.log(`[DataFetcher] ⚠️ Datos obtenidos de Yahoo Finance (fallback) para ${ticker}`);
    }
  }

  // 2c. Fallback a CSV (fondos bancarios españoles — solo mensual, convertir a diario)
  if (prices.length === 0 && fund) {
    console.log(`[DataFetcher] Leyendo CSV para fondo bancario: ${fund.isin}`);
    const monthlyPrices = await readFromCSV(fund.isin);
    // Convertir mensual → pseudo-diario (un punto por mes, al día 1)
    prices = monthlyPrices.map((mp) => ({
      date: mp.exactDate || `${mp.month}-01`,
      closePrice: mp.closePrice,
    }));
  }

  if (prices.length === 0) {
    const name = fund?.name || fundId;
    throw new Error(`No hay datos disponibles para: ${fundId} (${name})`);
  }

  // 3. Validar y limpiar datos
  const quality = validatePriceData(fundId, prices);
  console.log(`[DataFetcher] Calidad ${fundId}: score=${quality.qualityScore}, gaps=${quality.gaps.length}, saltos=${quality.suspiciousJumps.length}`);

  if (!quality.isUsable) {
    throw new Error(`Datos de ${fund?.name || fundId} no son usables (score: ${quality.qualityScore}).`);
  }

  const cleanPrices = cleanPriceData(prices);

  // 4. Guardar en cache (memoria + Redis)
  await setCachedPrices(fundId, cleanPrices);
  console.log(`[DataFetcher] Cacheado: ${fundId} (${cleanPrices.length} días)`);

  return dailyPricesToMap(cleanPrices);
}

// -----------------------------------------------------------------------------
// Función de compatibilidad — datos MENSUALES (agrega desde diarios)
// -----------------------------------------------------------------------------

/**
 * Obtiene los precios mensuales de un fondo (último precio de cada mes).
 * Wrapper sobre getDailyPrices para compatibilidad con código existente.
 */
export async function getMonthlyPrices(fundId: string, yahooTicker?: string, isin?: string): Promise<MonthlyPricesResult> {
  const daily = await getDailyPrices(fundId, yahooTicker, isin);
  return aggregateDailyToMonthly(daily);
}

/**
 * Agrega precios diarios a mensuales: último precio de cada mes.
 */
function aggregateDailyToMonthly(daily: DailyPricesResult): MonthlyPricesResult {
  const priceMap = new Map<string, number>();
  const exactDatesMap = new Map<string, string>();

  // Agrupar por YYYY-MM, quedarse con el último día de cada mes
  const sortedDates = Array.from(daily.prices.keys()).sort();

  for (const date of sortedDates) {
    const month = date.substring(0, 7); // YYYY-MM-DD → YYYY-MM
    const price = daily.prices.get(date)!;
    // Sobrescribir: al estar ordenados ascendentemente, el último siempre gana
    priceMap.set(month, price);
    exactDatesMap.set(month, date);
  }

  return { prices: priceMap, exactDates: exactDatesMap };
}

// -----------------------------------------------------------------------------
// EODHD API — datos diarios
// -----------------------------------------------------------------------------

/**
 * Convierte un ticker de Yahoo Finance al formato EODHD
 */
function yahooTickerToEODHD(yahooTicker: string): string {
  const exchangeMap: Record<string, string> = {
    ".DE": ".XETRA",    // Frankfurt/Xetra
    ".F": ".F",          // Frankfurt
    ".L": ".LSE",        // London
    ".AS": ".AS",        // Amsterdam (same)
    ".PA": ".PA",        // Paris (same)
    ".MI": ".MI",        // Milan (same)
    ".MC": ".MC",        // Madrid (same)
    ".BR": ".BR",        // Brussels (same)
    ".ST": ".ST",        // Stockholm (same)
  };

  for (const [yahooSuffix, eodhSuffix] of Object.entries(exchangeMap)) {
    if (yahooTicker.endsWith(yahooSuffix)) {
      return yahooTicker.replace(yahooSuffix, eodhSuffix);
    }
  }

  return yahooTicker;
}

/**
 * Descarga precios DIARIOS desde EODHD API
 */
async function fetchDailyFromEODHD(ticker: string): Promise<DailyPrice[]> {
  try {
    // period=d para datos diarios
    const url = `${EODHD_BASE_URL}/eod/${encodeURIComponent(ticker)}?period=d&fmt=json&order=a&api_token=${EODHD_API_TOKEN}`;
    console.log(`[DataFetcher] EODHD GET (daily): ${ticker}`);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000), // 30s para datos diarios (más grandes)
    });

    if (!response.ok) {
      console.error(`[DataFetcher] EODHD respondió ${response.status} para ${ticker}`);
      return [];
    }

    const data: EODHDPricePoint[] = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`[DataFetcher] EODHD devolvió respuesta vacía para ${ticker}`);
      return [];
    }

    const prices: DailyPrice[] = [];
    for (const point of data) {
      if (!point.date || point.adjusted_close == null) continue;
      if (point.adjusted_close <= 0) continue;

      prices.push({
        date: point.date,
        closePrice: point.adjusted_close,
      });
    }

    prices.sort((a, b) => a.date.localeCompare(b.date));

    console.log(`[DataFetcher] EODHD devolvió ${prices.length} días para ${ticker}`);
    return prices;
  } catch (error) {
    console.error(`[DataFetcher] Error en fetch a EODHD:`, error);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Yahoo Finance (fallback) — datos diarios
// -----------------------------------------------------------------------------

/**
 * Descarga precios diarios desde Yahoo Finance API v8
 */
async function fetchDailyFromYahooFinance(ticker: string): Promise<DailyPrice[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=max&interval=1d`;

  let prices = await attemptYahooDailyFetch(url, ticker, 1);

  if (prices.length === 0) {
    const altUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=max&interval=1d`;
    prices = await attemptYahooDailyFetch(altUrl, ticker, 2);
  }

  return prices;
}

async function attemptYahooDailyFetch(
  url: string,
  ticker: string,
  attempt: number
): Promise<DailyPrice[]> {
  try {
    console.log(`[DataFetcher] Yahoo Intento ${attempt} (daily) - GET ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`[DataFetcher] Yahoo Finance respondió ${response.status} para ${ticker}`);
      return [];
    }

    const data: YahooChartResponse = await response.json();

    if (data.chart.error) {
      console.error(`[DataFetcher] Yahoo Finance error: ${data.chart.error.description}`);
      return [];
    }

    const result = data.chart.result?.[0];
    if (!result || !result.timestamp || !result.indicators?.adjclose?.[0]?.adjclose) {
      console.error(`[DataFetcher] Respuesta incompleta de Yahoo Finance para ${ticker}`);
      return [];
    }

    const timestamps = result.timestamp;
    const closes = result.indicators.adjclose[0].adjclose;

    const prices: DailyPrice[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const closePrice = closes[i];

      if (timestamp !== undefined && closePrice !== null && closePrice !== undefined && closePrice > 0) {
        const date = new Date(timestamp * 1000);
        const dateStr = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
        prices.push({ date: dateStr, closePrice });
      }
    }

    prices.sort((a, b) => a.date.localeCompare(b.date));

    console.log(`[DataFetcher] Yahoo Finance devolvió ${prices.length} días para ${ticker}`);
    return prices;
  } catch (error) {
    console.error(`[DataFetcher] Error en fetch a Yahoo Finance (intento ${attempt}):`, error);
    return [];
  }
}

// -----------------------------------------------------------------------------
// CSV de fondos españoles
// -----------------------------------------------------------------------------

/**
 * Lee precios históricos desde el CSV de fondos españoles
 * Formato esperado del CSV: isin,date,nav
 * Devuelve MonthlyPrice[] (CSVs tienen datos mensuales)
 */
async function readFromCSV(isin: string): Promise<MonthlyPrice[]> {
  try {
    try {
      await fs.access(SPANISH_FUNDS_CSV);
    } catch {
      console.warn(`[DataFetcher] Archivo CSV no encontrado: ${SPANISH_FUNDS_CSV}`);
      return [];
    }

    const content = await fs.readFile(SPANISH_FUNDS_CSV, "utf-8");
    const lines = content.split("\n");

    if (lines.length < 2) {
      console.warn(`[DataFetcher] CSV vacío o sin datos: ${SPANISH_FUNDS_CSV}`);
      return [];
    }

    const header = lines[0]?.toLowerCase() ?? "";
    const headers = header.split(",").map((h) => h.trim());
    const isinIndex = headers.findIndex((h) => h === "isin");
    const dateIndex = headers.findIndex((h) => h === "date" || h === "fecha");
    const navIndex = headers.findIndex((h) => h === "nav" || h === "valor" || h === "precio");

    if (isinIndex === -1 || dateIndex === -1 || navIndex === -1) {
      console.error(`[DataFetcher] Formato de CSV inválido. Columnas esperadas: isin, date, nav`);
      return [];
    }

    const prices: MonthlyPrice[] = [];
    const monthlyPrices = new Map<string, { price: number; exactDate?: string }>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const parts = line.split(",");
      const rowIsin = parts[isinIndex]?.trim();
      const rowDate = parts[dateIndex]?.trim();
      const rowNav = parts[navIndex]?.trim();

      if (rowIsin !== isin) continue;
      if (!rowDate || !rowNav) continue;

      const nav = parseFloat(rowNav);
      if (isNaN(nav)) continue;

      const parsed = parseCSVDate(rowDate);
      if (!parsed) continue;

      monthlyPrices.set(parsed.month, { price: nav, exactDate: parsed.exactDate });
    }

    for (const [month, { price, exactDate }] of monthlyPrices) {
      prices.push({ month, closePrice: price, exactDate });
    }

    prices.sort((a, b) => a.month.localeCompare(b.month));

    console.log(`[DataFetcher] CSV devolvió ${prices.length} precios para ISIN ${isin}`);
    return prices;
  } catch (error) {
    console.error(`[DataFetcher] Error leyendo CSV:`, error);
    return [];
  }
}

function parseCSVDate(dateStr: string): { month: string; exactDate?: string } | null {
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { month: dateStr.substring(0, 7), exactDate: dateStr };
  }
  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    return { month: dateStr };
  }

  // DD/MM/YYYY
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const year = ddmmyyyy[3];
    const month = ddmmyyyy[2]?.padStart(2, "0");
    const day = ddmmyyyy[1]?.padStart(2, "0");
    return {
      month: `${year}-${month}`,
      exactDate: `${year}-${month}-${day}`,
    };
  }

  console.warn(`[DataFetcher] Formato de fecha no reconocido: ${dateStr}`);
  return null;
}

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

function dailyPricesToMap(prices: DailyPrice[]): DailyPricesResult {
  const priceMap = new Map<string, number>();
  for (const { date, closePrice } of prices) {
    priceMap.set(date, closePrice);
  }
  return { prices: priceMap };
}

// -----------------------------------------------------------------------------
// Información de rango de datos
// -----------------------------------------------------------------------------

export async function getDataRange(fundId: string): Promise<{ firstDate: string; lastDate: string } | null> {
  try {
    const { prices } = await getDailyPrices(fundId);
    if (prices.size === 0) return null;

    const dates = Array.from(prices.keys()).sort();
    return {
      firstDate: dates[0]!,
      lastDate: dates[dates.length - 1]!,
    };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Función legacy para compatibilidad
// -----------------------------------------------------------------------------

export async function fetchPrices(
  isin: string,
  startDate?: string,
  endDate?: string
): Promise<Array<{ date: string; nav: number }>> {
  const { getFundByIsin } = await import("./fund-database");
  const fund = getFundByIsin(isin);

  if (!fund) {
    console.error(`[DataFetcher] Fondo no encontrado para ISIN: ${isin}`);
    return [];
  }

  try {
    const { prices } = await getMonthlyPrices(fund.id);

    const result: Array<{ date: string; nav: number }> = [];

    for (const [month, closePrice] of prices) {
      const date = `${month}-01`;
      if (startDate && date < startDate) continue;
      if (endDate && date > endDate) continue;
      result.push({ date, nav: closePrice });
    }

    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  } catch (error) {
    console.error(`[DataFetcher] Error obteniendo precios para ${isin}:`, error);
    return [];
  }
}
