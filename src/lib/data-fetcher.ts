// =============================================================================
// DATA FETCHER - Backtesting Tool El Proyecto K
// =============================================================================
//
// Este módulo obtiene precios históricos mensuales de fondos de inversión.
// - Fondos indexados: Yahoo Finance API
// - Fondos bancarios españoles: CSV local
//
// -----------------------------------------------------------------------------
// ENDPOINTS DE YAHOO FINANCE (pueden cambiar, mantener actualizado):
// -----------------------------------------------------------------------------
// Principal (v8 - actual):
//   https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=max&interval=1mo
//
// Alternativos:
//   https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?range=max&interval=1mo
//   https://query1.finance.yahoo.com/v7/finance/download/{ticker}?period1=0&period2=9999999999&interval=1mo
//   https://finance.yahoo.com/quote/{ticker}/history (requiere scraping)
//
// Si v8 deja de funcionar, probar con query2 o el endpoint v7 de descarga CSV.
// -----------------------------------------------------------------------------

import { promises as fs } from "fs";
import { join } from "path";
import { getFundById } from "./fund-database";
import { getCachedPrices, setCachedPrices } from "./kv-cache";
import { validatePriceData, cleanPriceData } from "./data-validator";
import type { MonthlyPrice } from "./types";

// Ruta al CSV de fondos españoles
const SPANISH_FUNDS_CSV = join(process.cwd(), "src", "data", "spanish-funds.csv");

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

// -----------------------------------------------------------------------------
// Función principal
// -----------------------------------------------------------------------------

/**
 * Obtiene los precios mensuales de un fondo por su ID
 * Estrategia de cache: Memoria -> Redis (Upstash) -> Yahoo Finance/CSV
 */
export async function getMonthlyPrices(fundId: string, yahooTicker?: string): Promise<Map<string, number>> {
  console.log(`[DataFetcher] Obteniendo precios para: ${fundId}`);

  const fund = getFundById(fundId);
  const ticker = fund?.yahooTicker || yahooTicker;

  if (!fund && !yahooTicker) {
    throw new Error(`Fondo no encontrado: ${fundId}`);
  }

  // 1. Intentar cache (memoria -> Redis)
  const cached = await getCachedPrices(fundId);
  if (cached) {
    console.log(`[DataFetcher] Cache hit: ${fundId} (${cached.length} meses)`);
    return monthlyPricesToMap(cached);
  }

  // 2. Obtener datos del origen
  let prices: MonthlyPrice[];

  if (ticker) {
    console.log(`[DataFetcher] Descargando de Yahoo Finance: ${ticker}`);
    prices = await fetchFromYahooFinance(ticker);
  } else if (fund) {
    console.log(`[DataFetcher] Leyendo CSV para fondo bancario: ${fund.isin}`);
    prices = await readFromCSV(fund.isin);
  } else {
    prices = [];
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
  console.log(`[DataFetcher] Cacheado: ${fundId} (${cleanPrices.length} meses)`);

  return monthlyPricesToMap(cleanPrices);
}

// -----------------------------------------------------------------------------
// Yahoo Finance
// -----------------------------------------------------------------------------

/**
 * Descarga precios mensuales desde Yahoo Finance API v8
 * Incluye un reintento automático si falla la primera vez
 */
async function fetchFromYahooFinance(ticker: string): Promise<MonthlyPrice[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=max&interval=1mo`;

  // Primer intento
  let prices = await attemptYahooFetch(url, ticker, 1);

  // Si falla, reintento con query2
  if (prices.length === 0) {
    console.log(`[DataFetcher] Reintentando con endpoint alternativo para ${ticker}`);
    const altUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=max&interval=1mo`;
    prices = await attemptYahooFetch(altUrl, ticker, 2);
  }

  return prices;
}

/**
 * Intenta obtener datos de Yahoo Finance
 */
async function attemptYahooFetch(
  url: string,
  ticker: string,
  attempt: number
): Promise<MonthlyPrice[]> {
  try {
    console.log(`[DataFetcher] Intento ${attempt} - GET ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[DataFetcher] Yahoo Finance respondió ${response.status} para ${ticker}`);
      return [];
    }

    const data: YahooChartResponse = await response.json();

    // Verificar errores en la respuesta
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

    // Deduplicar por mes: quedarse con el último precio válido de cada mes
    const monthlyMap = new Map<string, number>();

    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const closePrice = closes[i];

      if (timestamp !== undefined && closePrice !== null && closePrice !== undefined) {
        const date = new Date(timestamp * 1000);
        const month = formatYearMonth(date);
        monthlyMap.set(month, closePrice); // sobrescribe con el último del mes
      }
    }

    const prices: MonthlyPrice[] = [];
    for (const [month, closePrice] of monthlyMap) {
      prices.push({ month, closePrice });
    }
    prices.sort((a, b) => a.month.localeCompare(b.month));

    console.log(`[DataFetcher] Yahoo Finance devolvió ${prices.length} meses para ${ticker} (de ${timestamps.length} registros)`);
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
 */
async function readFromCSV(isin: string): Promise<MonthlyPrice[]> {
  try {
    // Verificar si el archivo existe
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

    // Encontrar índices de columnas (cabecera flexible)
    const header = lines[0]?.toLowerCase() ?? "";
    const headers = header.split(",").map((h) => h.trim());
    const isinIndex = headers.findIndex((h) => h === "isin");
    const dateIndex = headers.findIndex((h) => h === "date" || h === "fecha");
    const navIndex = headers.findIndex((h) => h === "nav" || h === "valor" || h === "precio");

    if (isinIndex === -1 || dateIndex === -1 || navIndex === -1) {
      console.error(`[DataFetcher] Formato de CSV inválido. Columnas esperadas: isin, date, nav`);
      console.error(`[DataFetcher] Columnas encontradas: ${headers.join(", ")}`);
      return [];
    }

    const prices: MonthlyPrice[] = [];
    const monthlyPrices = new Map<string, number>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const parts = line.split(",");
      const rowIsin = parts[isinIndex]?.trim();
      const rowDate = parts[dateIndex]?.trim();
      const rowNav = parts[navIndex]?.trim();

      // Filtrar por ISIN del fondo solicitado
      if (rowIsin !== isin) continue;

      if (!rowDate || !rowNav) continue;

      const nav = parseFloat(rowNav);
      if (isNaN(nav)) continue;

      // Convertir fecha a YYYY-MM
      const month = parseCSVDate(rowDate);
      if (!month) continue;

      // Guardar el último valor del mes (sobrescribir si hay varios)
      monthlyPrices.set(month, nav);
    }

    // Convertir Map a array ordenado
    for (const [month, closePrice] of monthlyPrices) {
      prices.push({ month, closePrice });
    }

    prices.sort((a, b) => a.month.localeCompare(b.month));

    console.log(`[DataFetcher] CSV devolvió ${prices.length} precios para ISIN ${isin}`);
    return prices;
  } catch (error) {
    console.error(`[DataFetcher] Error leyendo CSV:`, error);
    return [];
  }
}

/**
 * Parsea fechas del CSV en varios formatos posibles
 */
function parseCSVDate(dateStr: string): string | null {
  // Intentar formato YYYY-MM-DD o YYYY-MM
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(dateStr)) {
    return dateStr.substring(0, 7);
  }

  // Intentar formato DD/MM/YYYY
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const year = ddmmyyyy[3];
    const month = ddmmyyyy[2]?.padStart(2, "0");
    return `${year}-${month}`;
  }

  // Intentar formato MM/DD/YYYY
  const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy && mmddyyyy[1] && parseInt(mmddyyyy[1]) <= 12) {
    const year = mmddyyyy[3];
    const month = mmddyyyy[1]?.padStart(2, "0");
    return `${year}-${month}`;
  }

  console.warn(`[DataFetcher] Formato de fecha no reconocido: ${dateStr}`);
  return null;
}


// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

/**
 * Formatea una fecha como YYYY-MM
 */
function formatYearMonth(date: Date): string {
  // Yahoo Finance monthly data timestamps represent the 1st trading day
  // of each month, but in the exchange's local timezone. Due to timezone
  // differences (e.g. CET vs UTC), a timestamp meant for Jan 1 00:00 CET
  // becomes Dec 31 23:00 UTC. This causes misalignment between European
  // and US funds, breaking correlation calculations.
  //
  // Fix: if the UTC day is > 15, it's a timezone artifact — advance to next month.
  // For interval=1mo data, timestamps are always within the first ~5 days.
  const day = date.getUTCDate();
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1; // 1-indexed

  if (day > 15) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return `${year}-${month.toString().padStart(2, "0")}`;
}

/**
 * Convierte array de MonthlyPrice a Map
 */
function monthlyPricesToMap(prices: MonthlyPrice[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const { month, closePrice } of prices) {
    map.set(month, closePrice);
  }
  return map;
}

// -----------------------------------------------------------------------------
// Información de rango de datos
// -----------------------------------------------------------------------------

/**
 * Obtiene el rango de fechas disponibles para un fondo
 * @param fundId - ID del fondo
 * @returns Objeto con firstDate y lastDate en formato YYYY-MM, o null si no hay datos
 */
export async function getDataRange(fundId: string): Promise<{ firstDate: string; lastDate: string } | null> {
  try {
    const prices = await getMonthlyPrices(fundId);
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
// Función legacy para compatibilidad (usada por backtest-engine.ts)
// -----------------------------------------------------------------------------

/**
 * Obtiene precios diarios para un fondo por ISIN
 * @deprecated Usar getMonthlyPrices(fundId) en su lugar
 */
export async function fetchPrices(
  isin: string,
  startDate?: string,
  endDate?: string
): Promise<Array<{ date: string; nav: number }>> {
  // Buscar el fondo por ISIN para obtener su ID
  const { getFundByIsin } = await import("./fund-database");
  const fund = getFundByIsin(isin);

  if (!fund) {
    console.error(`[DataFetcher] Fondo no encontrado para ISIN: ${isin}`);
    return [];
  }

  try {
    const monthlyPrices = await getMonthlyPrices(fund.id);

    // Convertir Map a array de precios diarios (usando el primer día del mes)
    const prices: Array<{ date: string; nav: number }> = [];

    for (const [month, closePrice] of monthlyPrices) {
      const date = `${month}-01`;

      // Filtrar por rango de fechas si se especifica
      if (startDate && date < startDate) continue;
      if (endDate && date > endDate) continue;

      prices.push({ date, nav: closePrice });
    }

    // Ordenar por fecha
    prices.sort((a, b) => a.date.localeCompare(b.date));

    return prices;
  } catch (error) {
    console.error(`[DataFetcher] Error obteniendo precios para ${isin}:`, error);
    return [];
  }
}
