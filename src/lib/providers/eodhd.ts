// =============================================================================
// PROVEEDOR EODHD — https://eodhd.com/
// =============================================================================
//
// Fuente principal e histórica de la app. Cubre ETFs/acciones USA, fondos
// mutuos USA con histórico largo, UCITS europeos (Xetra/Euronext/BME/…),
// oro (XAUUSD.FOREX) y NAV de fondos europeos por ISIN (ISIN.EUFUND).
//
// Movido aquí desde data-fetcher.ts al introducir la capa de proveedores.
// =============================================================================

import type { DailyPrice } from "../types";
import type { DataProvider, FetchPricesArgs } from "./types";

const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN || "";
const EODHD_BASE_URL = "https://eodhd.com/api";

/** Respuesta de EODHD EOD endpoint */
interface EODHDPricePoint {
  date: string; // "2024-01-02"
  open: number;
  high: number;
  low: number;
  close: number;
  adjusted_close: number;
  volume: number;
}

/**
 * Convierte un ticker en formato "símbolo.exchange" al formato EODHD.
 * El campo `ticker` de los fondos usa los sufijos clásicos (.DE, .L, etc.);
 * EODHD usa sufijos distintos para algunos mercados (.XETRA, .LSE).
 */
function tickerToEODHD(ticker: string): string {
  const exchangeMap: Record<string, string> = {
    ".DE": ".XETRA", // Frankfurt/Xetra
    ".F": ".F", // Frankfurt
    ".L": ".LSE", // London
    ".AS": ".AS", // Amsterdam (same)
    ".PA": ".PA", // Paris (same)
    ".MI": ".MI", // Milan (same)
    ".MC": ".MC", // Madrid (same)
    ".BR": ".BR", // Brussels (same)
    ".ST": ".ST", // Stockholm (same)
  };

  for (const [inputSuffix, eodhSuffix] of Object.entries(exchangeMap)) {
    if (ticker.endsWith(inputSuffix)) {
      return ticker.replace(inputSuffix, eodhSuffix);
    }
  }

  // Tickers sin sufijo (típicamente acciones estadounidenses como AAPL, MSFT):
  // EODHD requiere el sufijo .US para identificarlos.
  if (!ticker.includes(".")) {
    return `${ticker}.US`;
  }

  return ticker;
}

/**
 * Descarga datos de SPLITS desde EODHD API.
 * Devuelve array de eventos de split: {date, factor}.
 * Factor = denominator/numerator → multiplicador para ajustar precios históricos.
 * Ejemplo: split "1/10" (reverse 10:1) → factor = 10 (precios antiguos × 10)
 * Ejemplo: split "2/1" (forward 2:1) → factor = 0.5 (precios antiguos × 0.5)
 */
interface SplitEvent {
  date: string;
  factor: number;
}

async function fetchSplitsFromEODHD(ticker: string): Promise<SplitEvent[]> {
  try {
    const url = `${EODHD_BASE_URL}/splits/${encodeURIComponent(ticker)}?fmt=json&api_token=${EODHD_API_TOKEN}`;
    console.log(`[DataFetcher] EODHD GET (splits): ${ticker}`);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[DataFetcher] EODHD splits respondió ${response.status} para ${ticker}`);
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    const splits: SplitEvent[] = [];
    for (const item of data) {
      if (!item.date || !item.split) continue;
      const parts = String(item.split).split("/");
      const numerator = parseFloat(parts[0] || "1");
      const denominator = parseFloat(parts[1] || "1");
      if (numerator > 0 && denominator > 0 && numerator !== denominator) {
        splits.push({
          date: item.date,
          factor: denominator / numerator,
        });
        console.log(`[DataFetcher] Split ${ticker} el ${item.date}: ${item.split} → factor histórico ×${(denominator / numerator).toFixed(4)}`);
      }
    }

    return splits.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.warn(`[DataFetcher] Error obteniendo splits para ${ticker}:`, error);
    return [];
  }
}

/**
 * Aplica ajustes de splits a precios close.
 * Para cada precio anterior a un split, multiplica por el factor del split.
 * Esto da: close ajustado por splits, SIN ajuste de dividendos.
 * Es lo que PV usa para ETFs acumulativos.
 */
function applySplitAdjustments(prices: DailyPrice[], splits: SplitEvent[]): DailyPrice[] {
  if (splits.length === 0) return prices;

  return prices.map((p) => {
    let cumulativeFactor = 1;
    for (const split of splits) {
      if (p.date < split.date) {
        cumulativeFactor *= split.factor;
      }
    }
    if (cumulativeFactor === 1) return p;
    return {
      date: p.date,
      closePrice: p.closePrice * cumulativeFactor,
    };
  });
}

/**
 * Descarga precios DIARIOS desde EODHD API.
 *
 * Dos modos según el tipo de fondo:
 * - ETFs acumulativos (distributing=false): close + splits manuales
 *   Los dividendos se reinvierten en el NAV → el precio ya lo refleja.
 *   adjusted_close de EODHD resta dividendos "fantasma" → distorsiona.
 *
 * - ETFs de distribución (distributing=true): adjusted_close directamente
 *   Los dividendos se pagan al inversor y el precio cae en ex-dividend.
 *   adjusted_close reinvierte esos dividendos → total return correcto.
 */
async function fetchDailyFromEODHD(ticker: string, distributing: boolean = false): Promise<DailyPrice[]> {
  try {
    if (distributing) {
      // ETFs de distribución: usar adjusted_close (incluye dividendos + splits)
      const response = await fetch(
        `${EODHD_BASE_URL}/eod/${encodeURIComponent(ticker)}?period=d&fmt=json&order=a&api_token=${EODHD_API_TOKEN}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        }
      );

      console.log(`[DataFetcher] EODHD GET (daily, adjusted_close): ${ticker}`);

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
        prices.push({ date: point.date, closePrice: point.adjusted_close });
      }

      prices.sort((a, b) => a.date.localeCompare(b.date));
      console.log(`[DataFetcher] EODHD devolvió ${prices.length} días para ${ticker} (adjusted_close, distributing)`);
      return prices;
    }

    // ETFs acumulativos: close + splits manuales
    const [pricesResponse, splits] = await Promise.all([
      fetch(
        `${EODHD_BASE_URL}/eod/${encodeURIComponent(ticker)}?period=d&fmt=json&order=a&api_token=${EODHD_API_TOKEN}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        }
      ),
      fetchSplitsFromEODHD(ticker),
    ]);

    console.log(`[DataFetcher] EODHD GET (daily, close+splits): ${ticker}`);

    if (!pricesResponse.ok) {
      console.error(`[DataFetcher] EODHD respondió ${pricesResponse.status} para ${ticker}`);
      return [];
    }

    const data: EODHDPricePoint[] = await pricesResponse.json();

    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`[DataFetcher] EODHD devolvió respuesta vacía para ${ticker}`);
      return [];
    }

    const rawPrices: DailyPrice[] = [];
    for (const point of data) {
      if (!point.date || point.close == null) continue;
      if (point.close <= 0) continue;
      rawPrices.push({ date: point.date, closePrice: point.close });
    }

    rawPrices.sort((a, b) => a.date.localeCompare(b.date));

    // Aplicar ajustes de splits manualmente (sin dividendos)
    const adjustedPrices = applySplitAdjustments(rawPrices, splits);

    console.log(`[DataFetcher] EODHD devolvió ${adjustedPrices.length} días para ${ticker} (${splits.length} splits aplicados)`);
    return adjustedPrices;
  } catch (error) {
    console.error(`[DataFetcher] Error en fetch a EODHD:`, error);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Provider público
// -----------------------------------------------------------------------------

export const eodhdProvider: DataProvider = {
  name: "eodhd",
  async fetchDailyPrices({ ticker, isin, distributing }: FetchPricesArgs): Promise<DailyPrice[]> {
    // Sin token (o token "demo") no se puede consultar EODHD → [] (el caller
    // hará el fallback a CSV de fondos españoles).
    if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") return [];

    let prices: DailyPrice[] = [];
    if (ticker) {
      const eodhTicker = tickerToEODHD(ticker);
      console.log(`[EODHD] diario: ${eodhTicker} (distributing: ${distributing})`);
      prices = await fetchDailyFromEODHD(eodhTicker, distributing);
      // Fallback: muchos fondos UCITS/institucionales se resuelven por ISIN en
      // el exchange virtual EUFUND de EODHD cuando el ticker de bolsa falla.
      if (prices.length === 0 && isin) {
        console.log(`[EODHD] ticker falló, intentando ISIN: ${isin}.EUFUND`);
        prices = await fetchDailyFromEODHD(`${isin}.EUFUND`, distributing);
      }
    } else if (isin) {
      console.log(`[EODHD] ISIN directo: ${isin}.EUFUND`);
      prices = await fetchDailyFromEODHD(`${isin}.EUFUND`, distributing);
    }
    return prices;
  },
};
