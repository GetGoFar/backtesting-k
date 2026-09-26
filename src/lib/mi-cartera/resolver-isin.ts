// Resolución ISIN → holding del motor de backtest. SOLO SERVIDOR (tira del
// catálogo en memoria y de la búsqueda EODHD).
//
// Cada ISIN se resuelve primero en el catálogo curado (id local) y, si no está,
// como activo de mercado (ticker EODHD) inline: holding {fundId:"eodhd-<ISIN>",
// weight, fund}. El peso lo pone quien llama; aquí sale siempre a 0.
// La comparten /api/cartera/riesgo (volatilidad de Mi cartera) y
// /api/cartera/backtest (Mi cartera como cartera A del Backtest).

import { getAllFunds } from "@/lib/fund-database";
import { buscarMercado, type ResultadoBusqueda } from "@/lib/eodhd-search";
import type { Fund, PortfolioHolding } from "@/lib/types";

export const ES_ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
export const BOLSAS_PREFERIDAS = ["XETRA", "AS", "MI", "PA", "MC", "LSE", "SW", "EUFUND"];
export const TIMEOUT_MERCADO_MS = 10_000;

export type ActivoIsin = { isin: string; nombre: string };
export type Resuelto = { holding: PortfolioHolding; nombre: string } | { motivo: string };

/**
 * Catálogo curado por ISIN exacto: el primero de la lista, como hacía
 * /api/funds?search=. Sin los fondos ad hoc que otras rutas registran en caliente.
 */
export function catalogoPorIsin(isin: string): Fund | undefined {
  return getAllFunds().find((f) => f.isin.toUpperCase() === isin);
}

/** `a.isin` ya en mayúsculas y con formato válido (quien llama lo ha limpiado). */
export async function resolver(a: ActivoIsin): Promise<Resuelto> {
  const exacto = catalogoPorIsin(a.isin);
  if (exacto) return { holding: { fundId: exacto.id, weight: 0 }, nombre: exacto.name || a.nombre };

  let mercado: ResultadoBusqueda[] = [];
  try {
    mercado = await buscarMercado(a.isin, { signal: AbortSignal.timeout(TIMEOUT_MERCADO_MS) });
  } catch {
    mercado = [];
  }
  const listados = mercado.filter((r) => (r.isin ?? "").toUpperCase() === a.isin && r.symbol && !r.isCurrency);
  if (listados.length === 0) return { motivo: "sin datos de precios" };
  const rango = (r: ResultadoBusqueda) => {
    const i = BOLSAS_PREFERIDAS.indexOf(r.exchange);
    return (i < 0 ? 50 : i) + (r.currency === "EUR" ? 0 : 100);
  };
  const mejor = [...listados].sort((x, y) => rango(x) - rango(y))[0]!;
  const nombre = mejor.name || a.nombre;
  return {
    holding: {
      fundId: `eodhd-${a.isin}`,
      weight: 0,
      fund: { id: `eodhd-${a.isin}`, name: nombre, shortName: nombre.length > 40 ? `${nombre.slice(0, 37)}…` : nombre, isin: a.isin, ticker: mejor.symbol, ter: 0, category: "RV Global", type: "active", currency: mejor.currency || "EUR" },
    },
    nombre,
  };
}
