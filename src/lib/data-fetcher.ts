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
import path from "path";
import { getFundById } from "./fund-database";
import type { MonthlyPrice } from "./types";

// Directorio de caché
const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días - datos históricos no cambian

// Caché en memoria para evitar lecturas repetidas del disco durante una sesión
const memoryCache = new Map<string, { data: MonthlyPrice[]; timestamp: number }>();
const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos en memoria

// Ruta al CSV de fondos españoles
const SPANISH_FUNDS_CSV = path.join(process.cwd(), "src", "data", "spanish-funds.csv");

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

interface CacheEntry {
  timestamp: number;
  data: MonthlyPrice[];
}

// -----------------------------------------------------------------------------
// Función principal
// -----------------------------------------------------------------------------

/**
 * Obtiene los precios mensuales de un fondo por su ID
 * @param fundId - ID del fondo (ej: "vanguard-global", "caixabank-global")
 * @param yahooTicker - Ticker de Yahoo Finance (opcional, para fondos dinámicos)
 * @returns Map de fecha (YYYY-MM) a precio de cierre
 */
export async function getMonthlyPrices(fundId: string, yahooTicker?: string): Promise<Map<string, number>> {
  console.log(`[DataFetcher] Obteniendo precios para: ${fundId}`);

  // Buscar en base de datos local
  const fund = getFundById(fundId);

  // Si no está en la base de datos pero tenemos ticker de Yahoo, usarlo directamente
  const ticker = fund?.yahooTicker || yahooTicker;
  const isLocalFund = !!fund;

  if (!fund && !yahooTicker) {
    const error = `Fondo no encontrado: ${fundId}`;
    console.error(`[DataFetcher] ERROR: ${error}`);
    throw new Error(error);
  }

  // 1. Intentar caché en memoria primero (más rápido)
  const memCached = memoryCache.get(fundId);
  if (memCached && Date.now() - memCached.timestamp < MEMORY_CACHE_TTL_MS) {
    console.log(`[DataFetcher] Usando caché en memoria para ${fundId} (${memCached.data.length} registros)`);
    return monthlyPricesToMap(memCached.data);
  }

  // 2. Intentar cargar desde caché en disco
  const cachedData = await loadFromCache(fundId);
  if (cachedData) {
    // Guardar en memoria para accesos futuros
    memoryCache.set(fundId, { data: cachedData, timestamp: Date.now() });
    console.log(`[DataFetcher] Usando caché de disco para ${fundId} (${cachedData.length} registros)`);
    return monthlyPricesToMap(cachedData);
  }

  // Obtener datos según el tipo de fondo
  let prices: MonthlyPrice[];

  if (ticker) {
    console.log(`[DataFetcher] Descargando de Yahoo Finance: ${ticker}`);
    prices = await fetchFromYahooFinance(ticker);
  } else if (isLocalFund && fund) {
    console.log(`[DataFetcher] Leyendo CSV para fondo bancario: ${fund.isin}`);
    prices = await readFromCSV(fund.isin);
  } else {
    prices = [];
  }

  if (prices.length === 0) {
    const name = fund?.name || fundId;
    const error = `No hay datos disponibles para el fondo: ${fundId} (${name})`;
    console.error(`[DataFetcher] ERROR: ${error}`);
    throw new Error(error);
  }

  // Guardar en caché (disco y memoria)
  await saveToCache(fundId, prices);
  memoryCache.set(fundId, { data: prices, timestamp: Date.now() });
  console.log(`[DataFetcher] Guardado en caché: ${fundId} (${prices.length} registros)`);

  return monthlyPricesToMap(prices);
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

    const prices: MonthlyPrice[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const closePrice = closes[i];

      if (timestamp !== undefined && closePrice !== null && closePrice !== undefined) {
        const date = new Date(timestamp * 1000);
        const month = formatYearMonth(date);
        prices.push({ month, closePrice });
      }
    }

    console.log(`[DataFetcher] Yahoo Finance devolvió ${prices.length} precios para ${ticker}`);
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
// Sistema de caché
// -----------------------------------------------------------------------------

/**
 * Carga datos desde el caché si existe y no ha expirado
 */
async function loadFromCache(fundId: string): Promise<MonthlyPrice[] | null> {
  const cacheFile = getCacheFilePath(fundId);

  try {
    await fs.access(cacheFile);
    const content = await fs.readFile(cacheFile, "utf-8");
    const entry: CacheEntry = JSON.parse(content);

    // Verificar TTL
    const age = Date.now() - entry.timestamp;
    if (age < CACHE_TTL_MS) {
      const hoursOld = Math.round(age / (60 * 60 * 1000));
      console.log(`[DataFetcher] Caché válido para ${fundId} (${hoursOld}h de antigüedad)`);
      return entry.data;
    }

    console.log(`[DataFetcher] Caché expirado para ${fundId}`);
    return null;
  } catch {
    // Archivo no existe o error al leer
    return null;
  }
}

/**
 * Guarda datos en el caché
 */
async function saveToCache(fundId: string, data: MonthlyPrice[]): Promise<void> {
  const cacheFile = getCacheFilePath(fundId);

  try {
    // Crear directorio de caché si no existe
    await fs.mkdir(CACHE_DIR, { recursive: true });

    const entry: CacheEntry = {
      timestamp: Date.now(),
      data,
    };

    await fs.writeFile(cacheFile, JSON.stringify(entry, null, 2), "utf-8");
  } catch (error) {
    console.error(`[DataFetcher] Error guardando caché para ${fundId}:`, error);
    // No lanzar error, el caché es opcional
  }
}

/**
 * Obtiene la ruta del archivo de caché para un fondo
 */
function getCacheFilePath(fundId: string): string {
  // Sanitizar el fundId para uso como nombre de archivo
  const safeId = fundId.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(CACHE_DIR, `prices_${safeId}.json`);
}

/**
 * Limpia el caché de un fondo específico
 */
export async function clearCache(fundId: string): Promise<void> {
  const cacheFile = getCacheFilePath(fundId);
  try {
    await fs.unlink(cacheFile);
    console.log(`[DataFetcher] Caché eliminado para ${fundId}`);
  } catch {
    // Ignorar si no existe
  }
}

/**
 * Limpia todo el caché
 */
export async function clearAllCache(): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      if (file.startsWith("prices_") && file.endsWith(".json")) {
        await fs.unlink(path.join(CACHE_DIR, file));
      }
    }
    console.log(`[DataFetcher] Todo el caché ha sido eliminado`);
  } catch {
    // Ignorar si el directorio no existe
  }
}

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

/**
 * Formatea una fecha como YYYY-MM
 */
function formatYearMonth(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
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
