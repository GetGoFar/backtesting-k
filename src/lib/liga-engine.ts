// =============================================================================
// LIGA DE FONDOS BASURA — Motor de cálculo
// =============================================================================
//
// Genera el snapshot del ranking de "dinero quemado" para los fondos de la liga
// publicada en https://elproyectok.com/liga-fondos-basura/.
//
// Flujo:
//   1. Lee CSV `liga-fondos.csv` con la lista de fondos y sus benchmarks
//   2. Tira NAVs de EODHD (.EUFUND para fondos españoles, ticker normal para
//      benchmarks ETF) — deduplica benchmarks para minimizar llamadas
//   3. Calcula alfa anualizada por fondo vs benchmark sobre el rango común
//   4. Aplica la fórmula publicada en la página: dq(n) = 100000 * (1 - (1+α/100)^n)
//   5. Asigna categoría por cuartil sobre dq5
//
// La fórmula y la inversión de referencia (100.000 €) son fijas para
// mantener compatibilidad con la metodología original.
//
// =============================================================================

import { promises as fs } from "fs";
import { join } from "path";
import Papa from "papaparse";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export type LigaCategoria =
  | "champions"   // top 25% peor (más dinero quemado)
  | "europa"      // 25-50%
  | "permanencia" // 50-75%
  | "descenso";   // mejor 25%

export interface FondoCsv {
  isin: string;
  nombre: string;
  gestora: string;
  tipo: string;
  categoria: string;
  ter_pct: number;
  benchmark_isin: string;
  benchmark_ticker: string;
  benchmark_notas: string;
  ref_dq3: number;
  ref_dq5: number;
  ref_dq10: number;
}

export interface NavPoint {
  date: string;     // YYYY-MM-DD
  nav: number;
}

/**
 * Tendencia respecto al snapshot anterior (cron mensual, día 1):
 *   - mejorando : el dinero quemado a 5 años bajó (mejor para el fondo)
 *   - empeorando: el dinero quemado a 5 años subió
 *   - estable   : variación dentro del umbral de ruido (±500 €)
 *   - nuevo     : el ISIN no estaba en el snapshot anterior
 *   - sin_ref   : no hay snapshot anterior con qué comparar
 */
export type Tendencia = "mejorando" | "empeorando" | "estable" | "nuevo" | "sin_ref";

export interface ResultadoFondo {
  isin: string;
  nombre: string;
  gestora: string;
  tipo: string;
  categoria: string;
  ter: number;
  // alfa "principal" (== alfa5 cuando hay datos a 5 años; si no, la mejor
  // ventana disponible). Se conserva para compatibilidad con consumidores
  // antiguos del snapshot que sólo leen `alfa`. Las nuevas vistas deberían
  // usar alfa3/alfa5/alfa10 directamente.
  alfa: number | null;          // anualizada en % (ej: -2.34)
  alfa3: number | null;         // alfa de los últimos 3 años
  alfa5: number | null;         // alfa de los últimos 5 años
  alfa10: number | null;        // alfa de los últimos 10 años
  dq3: number | null;           // € (calculado con alfa3)
  dq5: number | null;           // € (calculado con alfa5)
  dq10: number | null;          // € (calculado con alfa10)
  liga: LigaCategoria | null;
  fechaInicio: string | null;   // primer NAV usado (ventana 5y)
  fechaFin: string | null;      // último NAV usado (ventana 5y)
  anosObservados: number | null; // años cubiertos por la ventana 5y
  stale: boolean;               // true si se reusan valores de referencia
  error?: string;               // descripción si stale
  // --- Comparación con snapshot anterior ---
  tendencia: Tendencia;
  dq5Anterior: number | null;   // dq5 que tenía en el snapshot anterior (debug/UI)
  deltaDq5: number | null;      // dq5_actual - dq5_anterior (positivo = empeoró)
}

export interface SnapshotLiga {
  generadoEn: string;            // ISO
  totalFondos: number;
  fondosOk: number;
  fondosStale: number;
  inversionRef: number;          // siempre 100000
  fondos: ResultadoFondo[];
}

// -----------------------------------------------------------------------------
// Constantes
// -----------------------------------------------------------------------------

const INVERSION_REF = 100_000;
const DIAS_POR_ANO = 365.25;
const CSV_PATH = join(process.cwd(), "src", "data", "liga-fondos.csv");
const EODHD_BASE_URL = "https://eodhd.com/api";

// -----------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------

export async function cargarFondosCsv(path: string = CSV_PATH): Promise<FondoCsv[]> {
  const raw = await fs.readFile(path, "utf-8");
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    throw new Error(`Error parseando CSV: ${parsed.errors[0]?.message}`);
  }
  return parsed.data.map((r) => ({
    isin: r.isin ?? "",
    nombre: r.nombre ?? "",
    gestora: r.gestora ?? "",
    tipo: r.tipo ?? "",
    categoria: r.categoria ?? "",
    ter_pct: parseFloat(r.ter_pct ?? "0"),
    benchmark_isin: r.benchmark_isin ?? "",
    benchmark_ticker: r.benchmark_ticker ?? "",
    benchmark_notas: r.benchmark_notas ?? "",
    ref_dq3: parseFloat(r.ref_dq3 ?? "0"),
    ref_dq5: parseFloat(r.ref_dq5 ?? "0"),
    ref_dq10: parseFloat(r.ref_dq10 ?? "0"),
  }));
}

// -----------------------------------------------------------------------------
// EODHD fetch
// -----------------------------------------------------------------------------

/**
 * Tira NAVs históricos de EODHD (endpoint /eod). El parámetro `simbolo` puede
 * ser un ticker (p.ej. IWDA.AS) o un ISIN con sufijo .EUFUND.
 *
 * Devuelve serie ordenada ascendentemente. Vacío si EODHD responde sin datos
 * o falla la llamada (no lanza para permitir tolerancia parcial en el batch).
 */
export async function fetchNavsEODHD(
  simbolo: string,
  apiToken: string,
  desde?: string,
): Promise<NavPoint[]> {
  if (!apiToken) {
    throw new Error("EODHD_API_TOKEN no configurado");
  }
  const params = new URLSearchParams({
    period: "d",
    fmt: "json",
    order: "a",
    api_token: apiToken,
  });
  if (desde) params.set("from", desde);
  const url = `${EODHD_BASE_URL}/eod/${encodeURIComponent(simbolo)}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.warn(`[liga-engine] EODHD ${response.status} para ${simbolo}`);
      return [];
    }
    const data = (await response.json()) as Array<{
      date: string;
      close: number | null;
      adjusted_close: number | null;
    }>;
    if (!Array.isArray(data) || data.length === 0) return [];

    const points: NavPoint[] = [];
    for (const p of data) {
      // Para fondos UE (.EUFUND) y ETFs UCITS preferimos adjusted_close cuando
      // está disponible (incluye dividendos reinvertidos en la serie). Si el
      // adjusted_close viene vacío, caemos a close (los .EUFUND a menudo solo
      // exponen NAV en close porque el fondo ya capitaliza dividendos).
      const nav = p.adjusted_close ?? p.close;
      if (!p.date || nav == null || nav <= 0) continue;
      points.push({ date: p.date, nav });
    }
    points.sort((a, b) => a.date.localeCompare(b.date));
    return points;
  } catch (err) {
    console.warn(`[liga-engine] Error EODHD para ${simbolo}:`, err);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Cálculos puros
// -----------------------------------------------------------------------------

/** Diferencia en años entre dos fechas YYYY-MM-DD. */
export function aniosEntre(fechaIni: string, fechaFin: string): number {
  const ini = new Date(fechaIni + "T00:00:00Z").getTime();
  const fin = new Date(fechaFin + "T00:00:00Z").getTime();
  const ms = fin - ini;
  return ms / (DIAS_POR_ANO * 24 * 3600 * 1000);
}

/**
 * CAGR (rentabilidad anualizada) entre dos NAVs separados por `anos` años.
 * Si los inputs son inválidos o no positivos devuelve null.
 */
export function calcularCAGR(navIni: number, navFin: number, anos: number): number | null {
  if (navIni <= 0 || navFin <= 0 || anos <= 0) return null;
  return Math.pow(navFin / navIni, 1 / anos) - 1;
}

export interface AlfaResultado {
  alfaPct: number;
  fechaInicio: string;
  fechaFin: string;
  anos: number;
}

/**
 * Alfa anualizada del fondo respecto a su benchmark sobre el rango común
 * de fechas. Devuelve un valor en % (ej: -2.34 significa que el fondo
 * rinde 2.34 puntos porcentuales menos que su benchmark al año).
 *
 * Reglas:
 *  - Usa el último NAV común como fecha final.
 *  - Si `ventanaAnos` se pasa, busca el primer NAV común con fecha
 *    >= (fechaFin - ventanaAnos años) y exige al menos `ventanaAnos - 0.5`
 *    años de cobertura efectiva (margen para fondos cuyo NAV histórico no
 *    arranca exactamente en el día N años atrás). Si no llega → null.
 *  - Si `ventanaAnos` es undefined, usa el primer NAV común disponible
 *    (rango histórico completo) y exige al menos 1 año.
 *  - Cualquier NAV inválido aborta (devuelve null).
 */
export function calcularAlfa(
  navsFondo: NavPoint[],
  navsBench: NavPoint[],
  ventanaAnos?: number,
): AlfaResultado | null {
  if (navsFondo.length < 2 || navsBench.length < 2) return null;

  // Indexar bench por fecha para localizar puntos comunes
  const benchMap = new Map<string, number>();
  for (const p of navsBench) benchMap.set(p.date, p.nav);

  // Último punto común (fecha final)
  let finFondo: NavPoint | undefined;
  let finBench: number | undefined;
  for (let i = navsFondo.length - 1; i >= 0; i--) {
    const p = navsFondo[i];
    if (!p) continue;
    const b = benchMap.get(p.date);
    if (b != null) { finFondo = p; finBench = b; break; }
  }
  if (!finFondo || finBench == null) return null;

  // Primer punto común dentro de la ventana (o desde el principio si no hay
  // ventana). Para ventanas, calculamos el cutoff y avanzamos hasta el primer
  // común con fecha >= cutoff.
  const cutoff = ventanaAnos != null ? restarAnos(finFondo.date, ventanaAnos) : null;

  let iniFondo: NavPoint | undefined;
  let iniBench: number | undefined;
  for (const p of navsFondo) {
    if (cutoff != null && p.date < cutoff) continue;
    const b = benchMap.get(p.date);
    if (b != null) { iniFondo = p; iniBench = b; break; }
  }
  if (!iniFondo || iniBench == null) return null;

  const anos = aniosEntre(iniFondo.date, finFondo.date);
  const minAnos = ventanaAnos != null ? ventanaAnos - 0.5 : 1;
  if (anos < minAnos) return null;

  const cagrFondo = calcularCAGR(iniFondo.nav, finFondo.nav, anos);
  const cagrBench = calcularCAGR(iniBench, finBench, anos);
  if (cagrFondo == null || cagrBench == null) return null;

  const alfaPct = (cagrFondo - cagrBench) * 100;
  return { alfaPct, fechaInicio: iniFondo.date, fechaFin: finFondo.date, anos };
}

/** Resta `anos` años a una fecha YYYY-MM-DD; devuelve YYYY-MM-DD. */
function restarAnos(fechaIso: string, anos: number): string {
  const d = new Date(fechaIso + "T00:00:00Z");
  const ms = anos * DIAS_POR_ANO * 24 * 3600 * 1000;
  return new Date(d.getTime() - ms).toISOString().slice(0, 10);
}

/**
 * Combina dos series de NAVs (p.ej. RV Global + RF EUR) en una cesta sintética
 * con peso fijo del primero, sin rebalanceo. Usado como benchmark de fondos
 * mixtos cuando no podemos atarlos a un benchmark de mercado puro.
 *
 * Fórmula: dado peso w para A y (1-w) para B,
 *   synth_t = w * (navA_t / navA_0) + (1-w) * (navB_t / navB_0)
 *
 * Esto representa "un euro invertido al inicio en w% A + (1-w)% B y dejado
 * tal cual hasta hoy". No es un 60/40 con rebalanceo mensual perfecto,
 * pero es una aproximación razonable y reproducible.
 */
export function crearSerieSintetica(
  navsA: NavPoint[],
  navsB: NavPoint[],
  pesoA: number,
): NavPoint[] {
  if (navsA.length < 2 || navsB.length < 2) return [];
  if (pesoA < 0 || pesoA > 1) return [];

  // Indexar por fecha
  const mapB = new Map<string, number>();
  for (const p of navsB) mapB.set(p.date, p.nav);

  // Encontrar primer punto común
  let inicio: { date: string; navA0: number; navB0: number } | undefined;
  for (const p of navsA) {
    const b = mapB.get(p.date);
    if (b != null) { inicio = { date: p.date, navA0: p.nav, navB0: b }; break; }
  }
  if (!inicio) return [];

  const pesoB = 1 - pesoA;
  const out: NavPoint[] = [];
  for (const p of navsA) {
    if (p.date < inicio.date) continue;
    const b = mapB.get(p.date);
    if (b == null) continue;
    // Normalizar a 100 para que se vea como un NAV típico
    const synth = 100 * (pesoA * (p.nav / inicio.navA0) + pesoB * (b / inicio.navB0));
    if (synth > 0) out.push({ date: p.date, nav: synth });
  }
  return out;
}

/**
 * "Dinero quemado" según la fórmula publicada en la página:
 *   dq(α, n) = inversion * (1 - (1 + α/100)^n)
 *
 * Si α es negativa (fondo peor que benchmark) → dq positivo (perdiste dinero).
 * Si α es positiva → dq negativo (ganaste extra).
 */
export function dineroQuemado(
  alfaPct: number,
  anos: number,
  inversion: number = INVERSION_REF,
): number {
  return inversion * (1 - Math.pow(1 + alfaPct / 100, anos));
}

/**
 * Asigna categoría de liga por cuartil sobre dq5 (mayor dq5 = peor).
 * `posicion` es la posición 1-indexada en el ranking ordenado descendentemente
 * por dq5, y `total` el número total de fondos válidos.
 */
export function asignarCategoria(posicion: number, total: number): LigaCategoria {
  if (total <= 0) return "descenso";
  const pct = posicion / total;
  if (pct <= 0.25) return "champions";
  if (pct <= 0.5) return "europa";
  if (pct <= 0.75) return "permanencia";
  return "descenso";
}

// -----------------------------------------------------------------------------
// Generación del snapshot completo
// -----------------------------------------------------------------------------

interface GenerarSnapshotOpts {
  apiToken: string;
  /** Permite inyectar un fetcher para tests. Por defecto usa fetchNavsEODHD. */
  fetcher?: (simbolo: string) => Promise<NavPoint[]>;
  /** Fondos previos (para reusar valores stale si EODHD falla). */
  snapshotPrevio?: SnapshotLiga | null;
  /** YYYY-MM-DD desde el que pedir NAVs. Por defecto: hace 11 años. */
  desde?: string;
}

export async function generarSnapshot(
  fondos: FondoCsv[],
  opts: GenerarSnapshotOpts,
): Promise<SnapshotLiga> {
  const desde = opts.desde ?? hace11Anos();
  const fetcher = opts.fetcher ?? ((s) => fetchNavsEODHD(s, opts.apiToken, desde));

  // Deduplicar benchmarks
  const benchmarksUnicos = Array.from(new Set(fondos.map((f) => simboloBenchmark(f))));
  const navsBench = new Map<string, NavPoint[]>();
  for (const sb of benchmarksUnicos) {
    if (!sb) continue;
    const navs = await fetcher(sb);
    navsBench.set(sb, navs);
  }

  // Procesar cada fondo
  const previos = new Map<string, ResultadoFondo>();
  if (opts.snapshotPrevio) {
    for (const r of opts.snapshotPrevio.fondos) previos.set(r.isin, r);
  }

  const resultados: ResultadoFondo[] = [];
  for (const f of fondos) {
    const simboloFondo = `${f.isin}.EUFUND`;
    const navsFondo = await fetcher(simboloFondo);
    const sb = simboloBenchmark(f);
    const navsB = sb ? (navsBench.get(sb) ?? []) : [];

    if (navsFondo.length < 2 || navsB.length < 2) {
      resultados.push(stalePorFalta(f, previos.get(f.isin)));
      continue;
    }

    // Una alfa por horizonte: el DQ a 3 / 5 / 10 años refleja la alfa
    // efectiva de esa ventana, no una proyección de la alfa histórica
    // completa. Los fondos sin cobertura suficiente para una ventana
    // dejan ese DQ a null (la UI ya muestra "—").
    const alfa3 = calcularAlfa(navsFondo, navsB, 3);
    const alfa5 = calcularAlfa(navsFondo, navsB, 5);
    const alfa10 = calcularAlfa(navsFondo, navsB, 10);

    // Si ni siquiera la ventana más corta arroja datos, tratamos como stale.
    if (!alfa3 && !alfa5 && !alfa10) {
      resultados.push(stalePorFalta(f, previos.get(f.isin)));
      continue;
    }

    const dq3 = alfa3 ? dineroQuemado(alfa3.alfaPct, 3) : null;
    const dq5 = alfa5 ? dineroQuemado(alfa5.alfaPct, 5) : null;
    const dq10 = alfa10 ? dineroQuemado(alfa10.alfaPct, 10) : null;

    // Alfa "principal" para compatibilidad: alfa5 si existe, si no la
    // ventana más larga disponible.
    const alfaPpal = alfa5 ?? alfa10 ?? alfa3;

    resultados.push({
      isin: f.isin,
      nombre: f.nombre,
      gestora: f.gestora,
      tipo: f.tipo,
      categoria: f.categoria,
      ter: f.ter_pct,
      alfa: alfaPpal!.alfaPct,
      alfa3: alfa3?.alfaPct ?? null,
      alfa5: alfa5?.alfaPct ?? null,
      alfa10: alfa10?.alfaPct ?? null,
      dq3,
      dq5,
      dq10,
      liga: null,           // se asigna después de ordenar
      fechaInicio: alfaPpal!.fechaInicio,
      fechaFin: alfaPpal!.fechaFin,
      anosObservados: alfaPpal!.anos,
      stale: false,
      tendencia: "sin_ref", // se asigna después al comparar con previo
      dq5Anterior: null,
      deltaDq5: null,
    });
  }

  // Asigna tendencia comparando con el snapshot anterior (si existe)
  asignarTendencia(resultados, previos, opts.snapshotPrevio != null);

  // Ranking + categoría: orden descendente por dq5 (mayor = peor).
  // Solo fondos con datos frescos (no stale) participan en la categorización.
  // Los stale conservan dq5 para mostrarlos en la tabla pero sin liga asignada.
  const conDatos = resultados
    .filter((r) => !r.stale && r.dq5 != null)
    .sort((a, b) => (b.dq5 ?? 0) - (a.dq5 ?? 0));
  conDatos.forEach((r, i) => { r.liga = asignarCategoria(i + 1, conDatos.length); });

  const stale = resultados.filter((r) => r.stale);
  const fondosOrdenados = [...conDatos, ...stale];

  return {
    generadoEn: new Date().toISOString(),
    totalFondos: fondos.length,
    fondosOk: conDatos.length,
    fondosStale: stale.length,
    inversionRef: INVERSION_REF,
    fondos: fondosOrdenados,
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function simboloBenchmark(f: FondoCsv): string {
  if (f.benchmark_ticker) return f.benchmark_ticker;
  if (f.benchmark_isin && f.benchmark_isin !== "MIXED_60_40") {
    return `${f.benchmark_isin}.EUFUND`;
  }
  return "";
}

function stalePorFalta(f: FondoCsv, previo?: ResultadoFondo): ResultadoFondo {
  if (previo && previo.dq5 != null) {
    return {
      ...previo,
      stale: true,
      error: "EODHD sin datos esta semana, valores anteriores",
      // Un fondo stale conserva su dq5; no estamos midiendo cambios reales,
      // así que tendencia = sin_ref para no inducir flechas falsas.
      tendencia: "sin_ref",
      dq5Anterior: null,
      deltaDq5: null,
    };
  }
  return {
    isin: f.isin,
    nombre: f.nombre,
    gestora: f.gestora,
    tipo: f.tipo,
    categoria: f.categoria,
    ter: f.ter_pct,
    alfa: null,
    alfa3: null,
    alfa5: null,
    alfa10: null,
    dq3: f.ref_dq3 || null,
    dq5: f.ref_dq5 || null,
    dq10: f.ref_dq10 || null,
    liga: null,
    fechaInicio: null,
    fechaFin: null,
    anosObservados: null,
    stale: true,
    error: "Sin datos en EODHD",
    tendencia: "sin_ref",
    dq5Anterior: null,
    deltaDq5: null,
  };
}

/**
 * Umbral en € por debajo del cual consideramos que un fondo ha estado
 * "estable" entre snapshots — evita ruido en mercados laterales o por
 * fluctuaciones intradía.
 */
const UMBRAL_ESTABLE_EUR = 500;

function asignarTendencia(
  resultados: ResultadoFondo[],
  previos: Map<string, ResultadoFondo>,
  hayPrevio: boolean,
): void {
  if (!hayPrevio) {
    // Sin snapshot anterior, todos quedan en sin_ref (default).
    return;
  }
  for (const r of resultados) {
    if (r.stale || r.dq5 == null) continue;   // stale ya queda sin_ref
    const prev = previos.get(r.isin);
    if (!prev || prev.dq5 == null) {
      r.tendencia = "nuevo";
      continue;
    }
    const delta = r.dq5 - prev.dq5;
    r.dq5Anterior = prev.dq5;
    r.deltaDq5 = delta;
    if (Math.abs(delta) <= UMBRAL_ESTABLE_EUR) {
      r.tendencia = "estable";
    } else if (delta > 0) {
      // dq5 subió → quema más dinero → empeoró
      r.tendencia = "empeorando";
    } else {
      r.tendencia = "mejorando";
    }
  }
}

function hace11Anos(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 11);
  return d.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Exports para tests
// -----------------------------------------------------------------------------

export const _testing = {
  simboloBenchmark,
  stalePorFalta,
  hace11Anos,
  asignarTendencia,
  UMBRAL_ESTABLE_EUR,
};
