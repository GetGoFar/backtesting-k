// =============================================================================
// PROVEEDOR financialdata.net
// =============================================================================
//
// API: https://financialdata.net/api/v1  ·  auth: ?key=API_KEY
// Endpoints de precios diarios (uno por TIPO de instrumento):
//   /etf-prices · /stock-prices · /international-stock-prices ·
//   /commodity-prices · (se intenta también /mutual-fund-prices)
// Cada uno: ?identifier=SÍMBOLO&offset=N&format=json
// Respuesta: array de { trading_symbol, date, open, high, low, close, volume }.
//
// LIMITACIONES (investigación 2026-06):
//   - SIN adjusted_close → devolvemos `close` crudo. Para fondos/ETFs de
//     ACUMULACIÓN (el grueso del público) close ≈ total return, así que va bien;
//     para DISTRIBUCIÓN se pierden los dividendos (mejora futura: endpoints de
//     dividendos/splits aparte).
//   - Paginado a 300 registros/llamada → iteramos con offset.
//   - No resuelve por ISIN → los fondos sin ticker de bolsa no se cubren.
//   - Histórico daily documentado ~10 años (insuficiente para proxies de fondos
//     mutuos desde 1990 — verificar en la prueba).
//   - Símbolo: US = ticker a secas (SPY, AAPL); internacional = ticker.bolsa
//     (ej. SHEL.L). El mapeo de sufijos Xetra/BME/etc. está por confirmar EN VIVO.
// =============================================================================

import type { DailyPrice } from "../types";
import type { DataProvider, FetchPricesArgs } from "./types";

const BASE = "https://financialdata.net/api/v1";
const TOKEN = process.env.FINANCIALDATA_API_TOKEN || process.env.FINANCIALDATA_API_KEY || "";
const PAGE = 300; // límite de registros por llamada de la API
const MAX_PAGES = 60; // tope de seguridad (~70 años de diario)

interface FDPricePoint {
  trading_symbol?: string;
  date?: string;
  close?: number;
}

/** Endpoints candidatos (en orden) según la forma del símbolo. */
function candidates(ticker: string): Array<{ endpoint: string; symbol: string }> {
  if (ticker.includes(".")) {
    if (ticker.endsWith(".FOREX")) {
      // oro spot XAUUSD.FOREX → probar como commodity con el símbolo base
      return [{ endpoint: "commodity-prices", symbol: ticker.replace(/\.FOREX$/, "") }];
    }
    // financialdata usa el sufijo de bolsa (ej. .L). El resto (.DE/.MC/…) se
    // pasa tal cual y se ajusta si la prueba lo pide.
    return [{ endpoint: "international-stock-prices", symbol: ticker }];
  }
  // Sin sufijo (US): ETF (la mayoría: XLP/SPY/QQQ…), luego acción (AAPL/MSFT),
  // y por último fondo mutuo (VBMFX/VFINX…) por si existe el endpoint.
  return [
    { endpoint: "etf-prices", symbol: ticker },
    { endpoint: "stock-prices", symbol: ticker },
    { endpoint: "mutual-fund-prices", symbol: ticker },
  ];
}

/** Descarga TODAS las páginas de un endpoint para un símbolo. */
async function fetchAllPages(endpoint: string, symbol: string): Promise<DailyPrice[]> {
  const out: DailyPrice[] = [];
  for (let page = 0, offset = 0; page < MAX_PAGES; page++, offset += PAGE) {
    const url = `${BASE}/${endpoint}?identifier=${encodeURIComponent(symbol)}&offset=${offset}&format=json&key=${TOKEN}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    } catch (e) {
      console.warn(`[financialdata] error de red en ${endpoint} ${symbol}:`, e);
      break;
    }
    if (!res.ok) {
      if (page === 0) console.warn(`[financialdata] ${endpoint} ${symbol}: HTTP ${res.status}`);
      break;
    }
    const json: unknown = await res.json();
    // Éxito = array de registros; error/no-encontrado = objeto { message }.
    const arr: FDPricePoint[] | null = Array.isArray(json)
      ? (json as FDPricePoint[])
      : Array.isArray((json as { data?: unknown })?.data)
        ? ((json as { data: FDPricePoint[] }).data)
        : null;
    if (!arr) {
      if (page === 0) {
        const msg = (json as { message?: string })?.message;
        console.warn(`[financialdata] ${endpoint} ${symbol}: ${msg ?? "respuesta no-array"}`);
      }
      break;
    }
    if (arr.length === 0) break;
    for (const p of arr) {
      if (!p.date || p.close == null || p.close <= 0) continue;
      out.push({ date: p.date, closePrice: p.close });
    }
    if (arr.length < PAGE) break; // última página
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export const financialDataProvider: DataProvider = {
  name: "financialdata",
  async fetchDailyPrices({ ticker, isin, distributing }: FetchPricesArgs): Promise<DailyPrice[]> {
    if (!TOKEN) {
      console.warn("[financialdata] Falta FINANCIALDATA_API_TOKEN en el entorno.");
      return [];
    }
    if (!ticker) {
      // financialdata.net no resuelve por ISIN.
      console.warn(`[financialdata] Fondo sin ticker (ISIN ${isin ?? "?"}) no soportado.`);
      return [];
    }
    void distributing; // sin adjusted_close → siempre `close` crudo (ver cabecera)

    for (const { endpoint, symbol } of candidates(ticker)) {
      const prices = await fetchAllPages(endpoint, symbol);
      if (prices.length > 0) {
        console.log(`[financialdata] ${symbol} via ${endpoint}: ${prices.length} días`);
        return prices;
      }
    }
    console.warn(`[financialdata] sin datos para "${ticker}".`);
    return [];
  },
};
