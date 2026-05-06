// =============================================================================
// INFORME DE FONDO — comparativa fondo del usuario vs Cartera K10 Sectorial
// =============================================================================
//
// Backtest simplificado y dedicado al informe que se entrega al lead capturado
// por la calculadora "Dinero Quemado". Compara la evolución del NAV del fondo
// (input) contra una cesta sintética que replica la Cartera K10 Inbestme:
//
//   80% RV Sectorial (Staples 10% / Utilities 10% / Healthcare 20% /
//                     Tech 20% / Energy 10% / REITs 10%)
//   20% Oro (Invesco Physical Gold)
//
// El motor se mantiene aparte del backtest-engine principal para evitar
// la dependencia con fund-database (los fondos del usuario son ad-hoc por
// ISIN y no están necesariamente en la BD curada).
//
// =============================================================================

import { fetchNavsEODHD, type NavPoint } from "./liga-engine";

// Componentes de la Cartera K10 Sectorial (mismos pesos que portfolio-presets
// k-inbestme-10) — los tickers Yahoo que ya están en fund-database.
const K10_HOLDINGS: Array<{ ticker: string; weight: number; name: string }> = [
  { ticker: "XDWS.DE", weight: 10, name: "Xtrackers MSCI World Consumer Staples" },
  { ticker: "XDWU.DE", weight: 10, name: "Xtrackers MSCI World Utilities" },
  { ticker: "XDWH.DE", weight: 20, name: "Xtrackers MSCI World Health Care" },
  { ticker: "XDWT.DE", weight: 20, name: "Xtrackers MSCI World Information Technology" },
  { ticker: "XDW0.DE", weight: 10, name: "Xtrackers MSCI World Energy" },
  { ticker: "EPRA.PA", weight: 10, name: "Amundi Index FTSE EPRA NAREIT Global REITs" },
  { ticker: "8PSG.F",  weight: 20, name: "Invesco Physical Gold" },
];

const INVERSION_INICIAL = 10_000;
const DIAS_POR_ANO = 365.25;

export interface InformeKpi {
  valorFinal: number;          // €
  cagr: number;                // % (decimal — ej 0.087 = 8.7%/año)
  volatilidad: number;         // % anualizada (decimal)
  maxDrawdown: number;         // % (decimal, negativo — ej -0.32 = -32%)
}

export interface InformeFondo {
  isin: string;
  nombreFondo: string;
  // Series temporales — ya alineadas a las mismas fechas, listas para chartear.
  fechas: string[];            // YYYY-MM-DD (mensuales agregadas)
  valorFondo: number[];        // € — patrimonio acumulado del fondo del user
  valorK10: number[];          // € — patrimonio acumulado de la cartera K10
  // KPIs
  kpiFondo: InformeKpi;
  kpiK10: InformeKpi;
  correlacion: number;         // [-1, 1] — correlación de los retornos mensuales
  // Metadatos
  rangoFechas: { inicio: string; fin: string };
  anosCubiertos: number;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Filtra el mapa por la primera observación de cada mes. Devuelve serie ordenada. */
function reducirAMensual(navs: NavPoint[]): NavPoint[] {
  const porMes = new Map<string, NavPoint>();
  for (const p of navs) {
    const ym = p.date.slice(0, 7);
    if (!porMes.has(ym)) porMes.set(ym, p);
  }
  return Array.from(porMes.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Encuentra el set de fechas comunes a varias series mensuales. */
function fechasComunes(series: NavPoint[][]): string[] {
  if (series.length === 0) return [];
  const sets = series.map((s) => new Set(s.map((p) => p.date)));
  const comunes = Array.from(sets[0]!).filter((d) => sets.every((s) => s.has(d)));
  return comunes.sort();
}

/** Construye serie sintética de la cartera K10 con pesos fijos sin rebalanceo. */
function construirSerieK10(seriesPorTicker: Map<string, NavPoint[]>): NavPoint[] {
  const validos = K10_HOLDINGS.filter((h) => (seriesPorTicker.get(h.ticker) ?? []).length > 0);
  if (validos.length === 0) return [];

  const seriesMensuales = validos.map((h) => reducirAMensual(seriesPorTicker.get(h.ticker)!));
  const fechas = fechasComunes(seriesMensuales);
  if (fechas.length < 13) return []; // Necesitamos al menos 1 año de meses comunes

  // Pesos normalizados a 1 entre los componentes válidos
  const sumaPesos = validos.reduce((s, h) => s + h.weight, 0);

  // Para cada fecha, valor de cartera = sum(weight_i * (NAV_t / NAV_0)) * 100
  // Equivalente a: cesta de €100 inicial, sin rebalanceo
  const navIniciales = seriesMensuales.map((s) => {
    const punto = s.find((p) => p.date === fechas[0]);
    return punto?.nav ?? 0;
  });

  return fechas.map((fecha) => {
    let valor = 0;
    for (let i = 0; i < seriesMensuales.length; i++) {
      const navInicial = navIniciales[i]!;
      const punto = seriesMensuales[i]!.find((p) => p.date === fecha);
      if (!punto || navInicial <= 0) continue;
      const ret = punto.nav / navInicial;
      valor += (validos[i]!.weight / sumaPesos) * ret * 100;
    }
    return { date: fecha, nav: valor };
  });
}

/** CAGR a partir de NAV inicial y final con duración en años. */
function cagr(navIni: number, navFin: number, anos: number): number {
  if (navIni <= 0 || navFin <= 0 || anos <= 0) return 0;
  return Math.pow(navFin / navIni, 1 / anos) - 1;
}

/** Volatilidad anualizada de retornos mensuales. */
function volatilidadAnualizada(retornosMensuales: number[]): number {
  if (retornosMensuales.length < 2) return 0;
  const mu = retornosMensuales.reduce((s, r) => s + r, 0) / retornosMensuales.length;
  const varianza = retornosMensuales.reduce((s, r) => s + (r - mu) ** 2, 0) / (retornosMensuales.length - 1);
  return Math.sqrt(varianza) * Math.sqrt(12);
}

/** Maximum drawdown de una serie de NAVs. Devuelve valor negativo (ej -0.32). */
function maxDrawdown(navs: number[]): number {
  let pico = navs[0] ?? 0;
  let mdd = 0;
  for (const v of navs) {
    if (v > pico) pico = v;
    if (pico > 0) {
      const dd = (v - pico) / pico;
      if (dd < mdd) mdd = dd;
    }
  }
  return mdd;
}

/** Correlación de Pearson entre dos series de igual longitud. */
function correlacion(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const mu_a = a.reduce((s, v) => s + v, 0) / a.length;
  const mu_b = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = a[i]! - mu_a;
    const xb = b[i]! - mu_b;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

/** Retornos mensuales (NAV_t / NAV_{t-1} - 1). */
function retornosMensuales(navs: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < navs.length; i++) {
    if (navs[i - 1]! > 0) out.push(navs[i]! / navs[i - 1]! - 1);
  }
  return out;
}

function calcularKpis(navs: number[], fechaInicio: string, fechaFin: string): InformeKpi {
  if (navs.length < 2) {
    return { valorFinal: INVERSION_INICIAL, cagr: 0, volatilidad: 0, maxDrawdown: 0 };
  }
  const navIni = navs[0]!;
  const navFin = navs[navs.length - 1]!;
  const valorFinal = INVERSION_INICIAL * (navFin / navIni);

  const ms = new Date(fechaFin + "T00:00:00Z").getTime() - new Date(fechaInicio + "T00:00:00Z").getTime();
  const anos = ms / (DIAS_POR_ANO * 24 * 3600 * 1000);

  const cagrPct = cagr(navIni, navFin, anos);
  const rets = retornosMensuales(navs);
  const vol = volatilidadAnualizada(rets);
  const mdd = maxDrawdown(navs);

  return {
    valorFinal: Math.round(valorFinal),
    cagr: cagrPct,
    volatilidad: vol,
    maxDrawdown: mdd,
  };
}

// -----------------------------------------------------------------------------
// Función principal
// -----------------------------------------------------------------------------

/**
 * Genera el informe del fondo del usuario vs cartera K10 Sectorial.
 * Usa NAVs mensuales alineados a las fechas comunes a ambos.
 */
export async function generarInformeFondo(
  isin: string,
  nombreFondo: string,
  apiToken: string,
): Promise<InformeFondo | null> {
  // 1) Tirar NAVs del fondo del user
  const navsFondoRaw = await fetchNavsEODHD(`${isin}.EUFUND`, apiToken);
  if (navsFondoRaw.length < 30) return null;

  // 2) Tirar NAVs de los componentes K10 en paralelo
  const seriesPorTicker = new Map<string, NavPoint[]>();
  await Promise.all(
    K10_HOLDINGS.map(async (h) => {
      const navs = await fetchNavsEODHD(h.ticker, apiToken);
      if (navs.length > 0) seriesPorTicker.set(h.ticker, navs);
    }),
  );

  // 3) Construir serie sintética K10
  const navsK10 = construirSerieK10(seriesPorTicker);
  if (navsK10.length < 13) return null;

  // 4) Reducir fondo a mensual y alinear con K10
  const navsFondoMensual = reducirAMensual(navsFondoRaw);
  const fechasFondo = new Set(navsFondoMensual.map((p) => p.date));
  const fechasK10 = new Set(navsK10.map((p) => p.date));
  const fechasComunesArr = Array.from(fechasFondo).filter((d) => fechasK10.has(d)).sort();

  if (fechasComunesArr.length < 13) return null;

  const navsFondoFiltrado = fechasComunesArr.map((d) => navsFondoMensual.find((p) => p.date === d)?.nav ?? 0);
  const navsK10Filtrado = fechasComunesArr.map((d) => navsK10.find((p) => p.date === d)?.nav ?? 0);

  if (navsFondoFiltrado[0]! <= 0 || navsK10Filtrado[0]! <= 0) return null;

  // 5) Series de patrimonio (€10k inicial) — para chartear
  const navIniFondo = navsFondoFiltrado[0]!;
  const navIniK10 = navsK10Filtrado[0]!;
  const valorFondo = navsFondoFiltrado.map((nav) => Math.round(INVERSION_INICIAL * (nav / navIniFondo)));
  const valorK10 = navsK10Filtrado.map((nav) => Math.round(INVERSION_INICIAL * (nav / navIniK10)));

  // 6) KPIs
  const fechaIni = fechasComunesArr[0]!;
  const fechaFin = fechasComunesArr[fechasComunesArr.length - 1]!;
  const kpiFondo = calcularKpis(navsFondoFiltrado, fechaIni, fechaFin);
  const kpiK10 = calcularKpis(navsK10Filtrado, fechaIni, fechaFin);

  // 7) Correlación de retornos mensuales
  const retsFondo = retornosMensuales(navsFondoFiltrado);
  const retsK10 = retornosMensuales(navsK10Filtrado);
  const corr = correlacion(retsFondo, retsK10);

  const ms = new Date(fechaFin + "T00:00:00Z").getTime() - new Date(fechaIni + "T00:00:00Z").getTime();
  const anosCubiertos = ms / (DIAS_POR_ANO * 24 * 3600 * 1000);

  return {
    isin,
    nombreFondo,
    fechas: fechasComunesArr,
    valorFondo,
    valorK10,
    kpiFondo,
    kpiK10,
    correlacion: corr,
    rangoFechas: { inicio: fechaIni, fin: fechaFin },
    anosCubiertos,
  };
}
