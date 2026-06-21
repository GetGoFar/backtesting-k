// =============================================================================
// DATA FETCHER - Backtesting Tool El Proyecto K
// =============================================================================
//
// Este módulo obtiene precios históricos diarios de fondos de inversión.
// Fuentes de datos (en orden de prioridad):
//   1. Cache (memoria → Redis)
//   2. EODHD API — https://eodhd.com/
//   3. CSV local (fondos bancarios españoles que no están en ninguna API)
//
// =============================================================================

import { promises as fs } from "fs";
import { join } from "path";
import { getFundById } from "./fund-database";
import { getCachedPrices, setCachedPrices } from "./kv-cache";
import { validatePriceData, cleanPriceData } from "./data-validator";
import { getProvider } from "./providers";
import type { DailyPrice, MonthlyPrice } from "./types";

// Ruta al CSV de fondos españoles
const SPANISH_FUNDS_CSV = join(process.cwd(), "src", "data", "spanish-funds.csv");

// La descarga de precios se delega en el proveedor activo (ver ./providers).

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

/** Fuente de precios. Sólo EODHD — el alias del tipo se mantiene por compat
 *  con código existente que aún lo importa. */
export type DataSource = "eodhd";

/**
 * Obtiene los precios diarios de un fondo por su ID.
 *
 * Fuente: EODHD como API principal + CSV local para fondos bancarios
 * españoles que no existen en ninguna API online.
 *
 * El parámetro `dataSource` se mantiene en la firma por compatibilidad con
 * código existente pero ya no se usa (se ignora si se pasa).
 */
export async function getDailyPrices(
  fundId: string,
  inputTicker?: string,
  isin?: string,
  _dataSource?: DataSource
): Promise<DailyPricesResult> {
  console.log(`[DataFetcher] Obteniendo precios diarios para: ${fundId}`);

  const fund = getFundById(fundId);
  const ticker = fund?.ticker || inputTicker;
  const effectiveIsin = fund?.isin || isin;

  if (!fund && !ticker) {
    throw new Error(`Fondo no encontrado: ${fundId}`);
  }

  // Cache key (segmentado por fuente — sólo EODHD ahora, pero mantenemos
  // el prefijo "::eodhd" para que no colisione con entradas viejas en cache
  // que se generaron con Yahoo cuando el toggle existía).
  const cacheKey = `${fundId}::eodhd`;

  // 1. Intentar cache (memoria -> Redis)
  const cached = await getCachedPrices(cacheKey);
  if (cached) {
    console.log(`[DataFetcher] Cache hit: ${cacheKey} (${cached.length} días)`);
    return dailyPricesToMap(cached);
  }

  // 2. Obtener datos del origen (EODHD)
  let prices: DailyPrice[] = [];
  // Para fondos en la BD local: usar el flag distributing explícito (curado).
  // Para fondos dinámicos (búsqueda): default a adjusted_close (=distributing=true) porque
  // captura dividendos correctamente para ETFs distribución (DBMF, etc.) y para fondos
  // acumulación limpios adjusted_close == close (no perjudica).
  const isDistributing = fund ? (fund.distributing ?? false) : true;

  // Proveedor de datos activo (EODHD por defecto; otro vía env var
  // DATA_PROVIDER). El proveedor resuelve el símbolo y hace sus propios
  // fallbacks (p.ej. ISIN.EUFUND en EODHD); devuelve [] si no hay datos.
  const provider = getProvider();
  prices = await provider.fetchDailyPrices({
    ticker,
    isin: effectiveIsin,
    distributing: isDistributing,
  });

  // CSV de fondos bancarios españoles — última red de seguridad SOLO para
  // fondos que no existen en ninguna API online (EODHD no tiene los .EUFUND
  // de banca, requieren add-on premium).
  if (prices.length === 0 && fund) {
    console.log(`[DataFetcher] Leyendo CSV para fondo bancario: ${fund.isin}`);
    const monthlyPrices = await readFromCSV(fund.isin);
    prices = monthlyPrices.map((mp) => ({
      date: mp.exactDate || `${mp.month}-01`,
      closePrice: mp.closePrice,
    }));
  }

  if (prices.length === 0) {
    const name = fund?.name || fundId;
    throw new Error(`No hay datos disponibles para: ${fundId} (${name})`);
  }

  // 4. Validar y limpiar datos
  const quality = validatePriceData(fundId, prices);
  console.log(`[DataFetcher] Calidad ${fundId}: score=${quality.qualityScore}, gaps=${quality.gaps.length}, saltos=${quality.suspiciousJumps.length}`);

  if (!quality.isUsable) {
    throw new Error(`Datos de ${fund?.name || fundId} no son usables (score: ${quality.qualityScore}).`);
  }

  const cleanPrices = cleanPriceData(prices);

  // 5. Guardar en cache (memoria + Redis) bajo la key segmentada por fuente
  await setCachedPrices(cacheKey, cleanPrices);
  console.log(`[DataFetcher] Cacheado: ${cacheKey} (${cleanPrices.length} días)`);

  return dailyPricesToMap(cleanPrices);
}

// -----------------------------------------------------------------------------
// Función de compatibilidad — datos MENSUALES (agrega desde diarios)
// -----------------------------------------------------------------------------

/**
 * Obtiene los precios mensuales de un fondo (último precio de cada mes).
 * Wrapper sobre getDailyPrices para compatibilidad con código existente.
 */
export async function getMonthlyPrices(
  fundId: string,
  ticker?: string,
  isin?: string,
  dataSource?: DataSource
): Promise<MonthlyPricesResult> {
  const daily = await getDailyPrices(fundId, ticker, isin, dataSource);
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
