// POST /api/cartera/riesgo  { activos: [{ isin, nombre, valor }] }
// Volatilidad anual real de esa cesta (máximo periodo común de los activos,
// pesos por valor) calculada por el motor de backtest del propio Laboratorio K
// (POST /api/backtest en el mismo origen de la petición, nunca un dominio
// fijo), más la volatilidad del peor tramo de 3 años (serie diaria) para no
// fiarse de una década tranquila. Cada ISIN se resuelve primero en el catálogo
// curado (id local, en memoria) y, si no está, como activo de mercado (ticker
// EODHD) inline.
// Solo para socios: exige la cookie del Laboratorio, porque gasta EODHD y CPU.

import { NextRequest, NextResponse } from "next/server";
import { exigirAcceso } from "@/lib/lab-auth";
import { getAllFunds } from "@/lib/fund-database";
import { buscarMercado, type ResultadoBusqueda } from "@/lib/eodhd-search";
import type { Fund, PortfolioHolding } from "@/lib/types";
import type { ActivoRiesgo, RespuestaRiesgo } from "@/lib/mi-cartera/riesgo";

// Vercel corta la función a los 60 s: el backtest se limita a 50 para poder responder.
export const maxDuration = 60;
const TIMEOUT_BACKTEST_MS = 50_000;
const TIMEOUT_MERCADO_MS = 10_000;

const ES_ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const BOLSAS_PREFERIDAS = ["XETRA", "AS", "MI", "PA", "MC", "LSE", "SW", "EUFUND"];

type Holding = PortfolioHolding;

async function json<T>(url: string, init?: RequestInit, ms = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Catálogo curado por ISIN exacto: el primero de la lista, como hacía
 * /api/funds?search=. Sin los fondos ad hoc que otras rutas registran en caliente.
 */
function catalogoPorIsin(isin: string): Fund | undefined {
  return getAllFunds().find((f) => f.isin.toUpperCase() === isin);
}

async function resolver(a: ActivoRiesgo): Promise<{ holding: Holding; nombre: string } | { motivo: string }> {
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

/** Desviación típica muestral. */
function desviacion(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Peor tramo de N años de la serie diaria: volatilidad anualizada (√252) de la
 * ventana móvil con más desviación. Devuelve null si no hay N años completos.
 */
function peorTramo(serie: { date: string; exactDate?: string; value: number }[], anos: number): { volatilidad: number; hasta: string } | null {
  const rets: number[] = [];
  for (let i = 1; i < serie.length; i++) {
    const a = serie[i - 1]?.value ?? 0;
    const b = serie[i]?.value ?? 0;
    if (a > 0 && b > 0) rets.push(b / a - 1);
  }
  const ventana = 252 * anos;
  if (rets.length < ventana) return null;
  // Suma acumulada de x y x² para calcular cada ventana en tiempo constante.
  let mejor = -1;
  let fin = 0;
  let sx = 0;
  let sxx = 0;
  for (let i = 0; i < rets.length; i++) {
    const x = rets[i] ?? 0;
    sx += x;
    sxx += x * x;
    if (i >= ventana) {
      const y = rets[i - ventana] ?? 0;
      sx -= y;
      sxx -= y * y;
    }
    if (i >= ventana - 1) {
      const n = ventana;
      const varianza = Math.max(0, (sxx - (sx * sx) / n) / (n - 1));
      if (varianza > mejor) {
        mejor = varianza;
        fin = i + 1; // índice en la serie
      }
    }
  }
  if (mejor < 0) return null;
  const punto = serie[fin] ?? serie[serie.length - 1];
  return { volatilidad: Math.sqrt(mejor) * Math.sqrt(252), hasta: punto?.exactDate ?? punto?.date ?? "" };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sinAcceso = await exigirAcceso(req);
  if (sinAcceso) return sinAcceso;

  let body: { activos?: ActivoRiesgo[] };
  try {
    body = (await req.json()) as { activos?: ActivoRiesgo[] };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const activos = (body.activos ?? [])
    .map((a) => ({ isin: String(a.isin ?? "").toUpperCase().trim(), nombre: String(a.nombre ?? ""), valor: Number(a.valor) || 0 }))
    .filter((a) => ES_ISIN.test(a.isin) && a.valor > 0)
    .slice(0, 40);
  if (activos.length === 0) return NextResponse.json({ error: "Sin activos con ISIN" }, { status: 400 });

  // Un mismo ISIN puede aparecer varias veces (en distintas partes): se suma.
  const porIsin = new Map<string, ActivoRiesgo>();
  for (const a of activos) {
    const prev = porIsin.get(a.isin);
    porIsin.set(a.isin, prev ? { ...prev, valor: prev.valor + a.valor } : a);
  }

  const resueltos = await Promise.all([...porIsin.values()].map(async (a) => ({ a, r: await resolver(a) })));
  const incluidos: { isin: string; nombre: string; valor: number; holding: Holding }[] = [];
  const excluidos: RespuestaRiesgo["excluidos"] = [];
  for (const { a, r } of resueltos) {
    if ("holding" in r) incluidos.push({ isin: a.isin, nombre: r.nombre, valor: a.valor, holding: r.holding });
    else excluidos.push({ isin: a.isin, nombre: a.nombre, motivo: r.motivo });
  }
  if (incluidos.length === 0) return NextResponse.json({ error: "Ningún activo con datos de precios", excluidos }, { status: 422 });

  const total = incluidos.reduce((s, x) => s + x.valor, 0);
  const holdings = incluidos.map((x) => ({ ...x.holding, weight: Math.round((x.valor / total) * 10000) / 100 }));

  const hoy = new Date();
  // Desde muy atrás: con useCommonDateRange la herramienta recorta al periodo
  // en que TODOS los activos tienen precios.
  const inicio = new Date("1990-01-01T00:00:00Z");
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  // Al motor de backtest de esta misma app, por HTTP y en el mismo origen que
  // la petición (en local, localhost; en Vercel, el despliegue que atiende).
  const origen = new URL(req.url).origin;
  type Punto = { date: string; exactDate?: string; value: number };
  type Resultado = { metrics?: { volatility?: number; maxDrawdown?: number }; timeSeries?: Punto[] };
  const bt = await json<{ resultA?: Resultado; a?: Resultado; error?: string; message?: string }>(
    `${origen}/api/backtest`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        portfolioA: { name: "Mi cartera", holdings },
        startDate: iso(inicio),
        endDate: iso(hoy),
        initialAmount: 10000,
        rebalanceFrequency: "annual",
        displayGranularity: "daily",
        useCommonDateRange: true,
      }),
    },
    TIMEOUT_BACKTEST_MS,
  );
  const resultado = bt?.resultA ?? bt?.a;
  const vol = resultado?.metrics?.volatility;
  if (typeof vol !== "number" || !Number.isFinite(vol)) {
    return NextResponse.json({ error: "La herramienta no ha podido calcular la volatilidad", detalle: bt?.message ?? bt?.error ?? null, excluidos }, { status: 502 });
  }
  const serie = resultado?.timeSeries ?? [];
  const primero = serie[0];
  const ultimo = serie[serie.length - 1];
  const desde = primero?.exactDate ?? primero?.date ?? iso(inicio);
  const hasta = ultimo?.exactDate ?? ultimo?.date ?? iso(hoy);
  const meses = Math.max(1, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / (30.44 * 86400000)));
  const peor = peorTramo(serie, 3);

  const respuesta: RespuestaRiesgo = {
    volatilidad: vol,
    caidaMaxima: resultado?.metrics?.maxDrawdown ?? 0,
    desde,
    hasta,
    meses,
    ...(peor ? { volatilidadPeor3a: peor.volatilidad, peor3aHasta: peor.hasta } : {}),
    incluidos: incluidos.map((x) => ({ isin: x.isin, nombre: x.nombre })),
    excluidos,
  };
  return NextResponse.json(respuesta);
}
