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
import { obtenerAlfasMorningstar } from "./morningstar-alfa";
import { evaluarFrescura } from "./data-freshness";

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
  alfa: number | null;          // alfa de Jensen anualizada en % (ej: -2.34), Rf=0
  beta?: number | null;         // beta vs ACWI de la ventana base (retornos mensuales)
  alfa3: number | null;         // alfa de los últimos 3 años
  alfa5: number | null;         // alfa de los últimos 5 años
  alfa10: number | null;        // alfa de los últimos 10 años
  // dq3/dq5/dq10 se calculan con ALFA POR VENTANA: cada horizonte usa el alfa de
  // su propia ventana (dq3←alfa3, dq5←alfa5, dq10←alfa10) — la cifra más real
  // para ese plazo. Cuando una ventana no existe (fondo joven) se proyecta desde
  // la real más larga disponible y se marca con la flag correspondiente. Los tres
  // valores NO son necesariamente monótonos: un dq3 > dq5 indica que el fondo ha
  // empeorado en los últimos 3 años respecto a los últimos 5 (info real). Ver
  // proyectarDineroQuemado.
  dq3: number | null;           // €
  dq5: number | null;           // €
  dq10: number | null;          // €
  dq3Proyectado: boolean;       // true si dq3 proyecta una alfa de < 3 años (fondo muy joven)
  dq5Proyectado: boolean;       // true si dq5 proyecta una alfa de < 5 años
  dq10Proyectado: boolean;      // true si dq10 proyecta una alfa de < 10 años
  liga: LigaCategoria | null;
  fechaInicio: string | null;   // primer NAV usado (ventana 5y)
  fechaFin: string | null;      // último NAV usado (ventana 5y)
  anosObservados: number | null; // años cubiertos por la ventana 5y
  stale: boolean;               // true si se reusan valores de referencia
  error?: string;               // descripción si stale
  // --- Frescura del NAV ---
  /** true si lleva >30 días sin publicar NAV: fondo fusionado o cerrado. */
  datosObsoletos?: boolean;
  /** Días naturales desde el último NAV, medidos al generar el snapshot. */
  diasSinNav?: number | null;
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
  /** Fondos cuyo NAV lleva >30 días sin actualizarse (fusionados/cerrados). */
  fondosObsoletos?: number;
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

// Benchmark único para toda la liga: SPDR MSCI ACWI UCITS ETF (Acc), cotizado en
// Xetra y denominado en EUR (mismo que los NAV .EUFUND de los fondos, así no hay
// desajuste de divisa). Todos los fondos se miden como "coste de oportunidad
// frente a invertir en el índice global" (no es alfa vs el índice propio del fondo).
const BENCHMARK_GLOBAL = "SPYY.XETRA";

// Metodología unificada: todos los fondos se calculan por CAGR-diff vs ACWI en
// EUR. Desactivamos la preferencia por alfas de Morningstar (que mezclaba dos
// metodologías y daba resultados incoherentes) para que la liga sea consistente.
const USAR_MORNINGSTAR_ALFAS = false;

// Tendencia (columna "Tend."): momentum reciente del fondo frente al ACWI sobre
// los últimos ~30 días naturales. En la tabla: ▼ verde si batió al índice (baja en
// la liga), ▲ roja si quedó por debajo (sube en la liga), = dentro de ±1 pp.
const TEND_VENTANA_DIAS = 30;
const TEND_UMBRAL_PCT = 1;

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
  beta: number;
  fechaInicio: string;
  fechaFin: string;
  anos: number;
}

/**
 * Beta del fondo respecto al benchmark sobre retornos MENSUALES en el rango
 * común [desde, hasta]. beta = cov(r_fondo, r_bench) / var(r_bench).
 * Devuelve null si hay menos de 6 retornos mensuales o varianza nula.
 *
 * Resamplea a fin de mes (último NAV común de cada mes; navsFondo viene en
 * orden ascendente, así que el último set sobreescribe = cierre de mes).
 */
function betaMensual(
  navsFondo: NavPoint[],
  benchMap: Map<string, number>,
  desde: string,
  hasta: string,
): number | null {
  const porMes = new Map<string, { f: number; b: number }>();
  for (const p of navsFondo) {
    if (p.date < desde || p.date > hasta) continue;
    const b = benchMap.get(p.date);
    if (b == null) continue;
    porMes.set(p.date.slice(0, 7), { f: p.nav, b });
  }
  const meses = Array.from(porMes.keys()).sort();
  const rf: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < meses.length; i++) {
    const a = porMes.get(meses[i - 1] as string)!;
    const c = porMes.get(meses[i] as string)!;
    if (a.f > 0 && a.b > 0) {
      rf.push(c.f / a.f - 1);
      rb.push(c.b / a.b - 1);
    }
  }
  const n = rb.length;
  if (n < 6) return null;
  const mf = rf.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let cov = 0;
  let varb = 0;
  for (let i = 0; i < n; i++) {
    const rfi = rf[i] as number;
    const rbi = rb[i] as number;
    cov += (rfi - mf) * (rbi - mb);
    varb += (rbi - mb) * (rbi - mb);
  }
  if (varb <= 0) return null;
  return cov / varb;
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

  // Alfa de Jensen con tasa libre de riesgo Rf = 0:
  //   α = R_fondo − β · R_ACWI
  // donde β = cov/var de retornos mensuales. Si no hay suficientes meses para
  // estimar β de forma fiable, caemos a β = 1 (equivale a la diferencia de CAGR).
  const beta = betaMensual(navsFondo, benchMap, iniFondo.date, finFondo.date);
  const betaUsada = beta != null && isFinite(beta) ? beta : 1;
  const alfaPct = (cagrFondo - betaUsada * cagrBench) * 100;
  return { alfaPct, beta: betaUsada, fechaInicio: iniFondo.date, fechaFin: finFondo.date, anos };
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

export interface ProyeccionDineroQuemado {
  alfaBase: number | null;       // alfa "titular" (ventana real más larga) para el campo legacy `alfa`
  ventanaBaseAnos: number | null; // 3, 5 o 10 — longitud real de la ventana de alfaBase
  dq3: number | null;
  dq5: number | null;
  dq10: number | null;
  dq3Proyectado: boolean;        // true si dq3 proyecta una alfa de < 3 años (fondo muy joven)
  dq5Proyectado: boolean;        // true si dq5 proyecta una alfa de < 5 años
  dq10Proyectado: boolean;       // true si dq10 proyecta una alfa de < 10 años
}

/**
 * Calcula dq3/dq5/dq10 con la metodología de ALFA POR VENTANA: el dinero
 * quemado a N años se calcula con el alfa de la ventana de N años — la cifra
 * más real para ese horizonte — no con una única alfa histórica proyectada.
 *
 *   dq3  ← alfa3   (infrautilización real de los últimos 3 años)
 *   dq5  ← alfa5   (… de los últimos 5 años)
 *   dq10 ← alfa10  (… de los últimos 10 años)
 *
 * Si una ventana no tiene cobertura suficiente (fondo joven), se proyecta desde
 * la ventana real más larga disponible y se marca con la flag `dqNProyectado`.
 * Como las ventanas son anidadas (tener 10y implica tener 5y y 3y), en la
 * práctica solo se proyectan horizontes MÁS LARGOS que el histórico del fondo.
 *
 * CONSECUENCIA DELIBERADA (decisión de producto, jun 2026): dq3/dq5/dq10 dejan
 * de ser necesariamente monótonos. Si un fondo ha empeorado en los últimos 3
 * años respecto a los últimos 5, su dq3 puede SUPERAR a su dq5 — y eso es
 * información real ("ha empeorado recientemente"), no una incoherencia. La nota
 * de metodología de la página explica que las tres columnas son proyecciones
 * independientes (cada una sobre su ventana), no un acumulado.
 *
 * `alfaBase`/`ventanaBaseAnos` se conservan como cifra "titular" para el campo
 * legacy `alfa`: usamos la ventana real más larga (la más estable).
 */
export function proyectarDineroQuemado(
  alfa3: number | null,
  alfa5: number | null,
  alfa10: number | null,
): ProyeccionDineroQuemado {
  // SIN EXTRAPOLACIÓN (decisión de producto, jun-2026): cada horizonte usa SOLO
  // el alfa de su propia ventana real. Si el fondo no tiene histórico para ese
  // plazo, dqN = null y la UI muestra "sin datos" — proyectar sería engañoso.
  const a3 = alfa3;
  const a5 = alfa5;
  const a10 = alfa10;

  if (a3 == null && a5 == null && a10 == null) {
    return {
      alfaBase: null, ventanaBaseAnos: null,
      dq3: null, dq5: null, dq10: null,
      dq3Proyectado: false, dq5Proyectado: false, dq10Proyectado: false,
    };
  }

  // Cifra titular (campo legacy `alfa`): ventana real más larga, la más estable.
  let alfaBase: number | null = null;
  let ventana: number | null = null;
  if (alfa10 != null) { alfaBase = alfa10; ventana = 10; }
  else if (alfa5 != null) { alfaBase = alfa5; ventana = 5; }
  else if (alfa3 != null) { alfaBase = alfa3; ventana = 3; }

  return {
    alfaBase,
    ventanaBaseAnos: ventana,
    dq3: a3 != null ? dineroQuemado(a3, 3) : null,
    dq5: a5 != null ? dineroQuemado(a5, 5) : null,
    dq10: a10 != null ? dineroQuemado(a10, 10) : null,
    // Ya no se proyecta ningún horizonte: si falta histórico real, dqN = null
    // ("sin datos"). Las flags se conservan en false por compatibilidad.
    dq3Proyectado: false,
    dq5Proyectado: false,
    dq10Proyectado: false,
  };
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

  // Intentamos obtener alfas de Morningstar primero (fuente que el lector
  // consulta en su pestana Riesgo > Medidas de volatilidad). Si Morningstar
  // no devuelve datos, caemos al calculo CAGR-diff vs benchmark del CSV
  // como redundancia. Concurrencia limitada para no saturar la API publica
  // de Morningstar.
  const msAlfas = USAR_MORNINGSTAR_ALFAS
    ? await obtenerAlfasMorningstarBatch(fondos.map((f) => f.isin), 16)
    : new Map<string, { alfa3: number | null; alfa5: number | null; alfa10: number | null }>();

  const resultados: ResultadoFondo[] = [];
  for (const f of fondos) {
    const ms = msAlfas.get(f.isin) ?? null;

    // Caso preferente: Morningstar nos da al menos una alfa.
    if (ms && (ms.alfa3 != null || ms.alfa5 != null || ms.alfa10 != null)) {
      // Cada dq con la alfa de su propia ventana (proyecta solo si falta historial).
      const proy = proyectarDineroQuemado(ms.alfa3 ?? null, ms.alfa5 ?? null, ms.alfa10 ?? null);

      resultados.push({
        isin: f.isin,
        nombre: f.nombre,
        gestora: f.gestora,
        tipo: f.tipo,
        categoria: f.categoria,
        ter: f.ter_pct,
        alfa: proy.alfaBase,
        alfa3: ms.alfa3 ?? null,
        alfa5: ms.alfa5 ?? null,
        alfa10: ms.alfa10 ?? null,
        dq3: proy.dq3,
        dq5: proy.dq5,
        dq10: proy.dq10,
        dq3Proyectado: proy.dq3Proyectado,
        dq5Proyectado: proy.dq5Proyectado,
        dq10Proyectado: proy.dq10Proyectado,
        liga: null,
        fechaInicio: null,
        fechaFin: null,
        anosObservados: proy.ventanaBaseAnos,
        stale: false,
        tendencia: "sin_ref",
        dq5Anterior: null,
        deltaDq5: null,
      });
      continue;
    }

    // Fallback: calculo CAGR-diff vs benchmark con datos EODHD.
    const simboloFondo = `${f.isin}.EUFUND`;
    const navsFondo = await fetcher(simboloFondo);
    const sb = simboloBenchmark(f);
    const navsB = sb ? (navsBench.get(sb) ?? []) : [];

    if (navsFondo.length < 2 || navsB.length < 2) {
      resultados.push(stalePorFalta(f, previos.get(f.isin)));
      continue;
    }

    const alfa3 = calcularAlfa(navsFondo, navsB, 3);
    const alfa5 = calcularAlfa(navsFondo, navsB, 5);
    const alfa10 = calcularAlfa(navsFondo, navsB, 10);

    if (!alfa3 && !alfa5 && !alfa10) {
      resultados.push(stalePorFalta(f, previos.get(f.isin)));
      continue;
    }

    // Cada dq con la alfa de su propia ventana (proyecta solo si falta historial).
    const proy = proyectarDineroQuemado(
      alfa3?.alfaPct ?? null,
      alfa5?.alfaPct ?? null,
      alfa10?.alfaPct ?? null,
    );
    // La ventana que aportó la alfa base, para fechas/años observados.
    const ventanaBase = alfa10 ?? alfa5 ?? alfa3;

    resultados.push({
      isin: f.isin,
      nombre: f.nombre,
      gestora: f.gestora,
      tipo: f.tipo,
      categoria: f.categoria,
      ter: f.ter_pct,
      alfa: proy.alfaBase,
      beta: ventanaBase?.beta ?? null,
      alfa3: alfa3?.alfaPct ?? null,
      alfa5: alfa5?.alfaPct ?? null,
      alfa10: alfa10?.alfaPct ?? null,
      dq3: proy.dq3,
      dq5: proy.dq5,
      dq10: proy.dq10,
      dq3Proyectado: proy.dq3Proyectado,
      dq5Proyectado: proy.dq5Proyectado,
      dq10Proyectado: proy.dq10Proyectado,
      liga: null,           // se asigna después de ordenar
      fechaInicio: ventanaBase!.fechaInicio,
      fechaFin: ventanaBase!.fechaFin,
      anosObservados: ventanaBase!.anos,
      stale: false,
      tendencia: calcularTendencia30dias(navsFondo, navsB), // momentum vs ACWI últimos ~30 días
      dq5Anterior: null,
      deltaDq5: null,
    });
  }

  // La tendencia es el momentum reciente (vs ACWI, ~30 días), calculado por fondo
  // en el bucle anterior. Ya no se compara contra el snapshot mensual anterior.

  // Ranking + categoría: orden descendente por dq3 (mayor = peor).
  // Usamos dq3 (no dq5) como criterio porque es la ventana que TODOS los fondos
  // tienen REAL — incluidos los de < 5 años, cuyo dq5/dq10 sería proyectado. Así
  // la clasificación nunca mezcla dato real con proyección, y refleja la
  // infrautilización más reciente. Solo fondos frescos (no stale) se categorizan;
  // los stale conservan sus dq para la tabla pero sin liga asignada.
  const conDatos = resultados
    .filter((r) => !r.stale && r.dq3 != null)
    .sort((a, b) => (b.dq3 ?? 0) - (a.dq3 ?? 0));
  conDatos.forEach((r, i) => { r.liga = asignarCategoria(i + 1, conDatos.length); });

  const stale = resultados.filter((r) => r.stale);
  const fondosOrdenados = [...conDatos, ...stale];

  // Frescura: un fondo fusionado o cerrado sigue devolviendo histórico, pero
  // congelado. Sin marcarlo compite en el ranking contra fondos con datos de
  // esta semana, sobre una ventana que termina meses antes. Se mide contra el
  // instante de generación, no el de lectura, para que el dato no "envejezca"
  // solo por consultar el snapshot más tarde.
  const generadoEn = new Date();
  const conFrescura = fondosOrdenados.map((f) => {
    const fr = evaluarFrescura(f.fechaFin, generadoEn);
    return { ...f, datosObsoletos: fr.obsoleto, diasSinNav: f.fechaFin ? fr.diasSinActualizar : null };
  });

  return {
    generadoEn: generadoEn.toISOString(),
    totalFondos: fondos.length,
    fondosOk: conDatos.length,
    fondosStale: stale.length,
    fondosObsoletos: conFrescura.filter((f) => f.datosObsoletos).length,
    inversionRef: INVERSION_REF,
    fondos: conFrescura,
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Lookup batched de alfas Morningstar para una lista de ISINs. Usa concurrencia
 * limitada para no abusar del endpoint público de Morningstar. Devuelve un Map
 * con los ISINs encontrados; los no encontrados quedan ausentes y caen al
 * fallback EODHD en el motor.
 */
async function obtenerAlfasMorningstarBatch(
  isins: string[],
  concurrencia: number = 8,
): Promise<Map<string, { alfa3: number | null; alfa5: number | null; alfa10: number | null }>> {
  const out = new Map<string, { alfa3: number | null; alfa5: number | null; alfa10: number | null }>();
  // Procesar en chunks paralelos para acotar la concurrencia.
  for (let i = 0; i < isins.length; i += concurrencia) {
    const chunk = isins.slice(i, i + concurrencia);
    const results = await Promise.all(chunk.map((isin) => obtenerAlfasMorningstar(isin)));
    chunk.forEach((isin, j) => {
      const r = results[j];
      if (r) out.set(isin, { alfa3: r.alfa3, alfa5: r.alfa5, alfa10: r.alfa10 });
    });
  }
  return out;
}

function simboloBenchmark(_f: FondoCsv): string {
  // Benchmark único para todos los fondos: MSCI ACWI (SPYY.XETRA) en EUR.
  // Antes se leía el benchmark por fondo del CSV, lo que introducía desajustes
  // de divisa (p.ej. IXP.US en USD) y de rango — origen de los alfas erróneos.
  return BENCHMARK_GLOBAL;
}

function stalePorFalta(f: FondoCsv, previo?: ResultadoFondo): ResultadoFondo {
  if (previo && previo.dq5 != null) {
    return {
      ...previo,
      stale: true,
      error: "Sin datos del proveedor esta semana, valores anteriores",
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
    dq3Proyectado: false,
    dq5Proyectado: false,
    dq10Proyectado: false,
    liga: null,
    fechaInicio: null,
    fechaFin: null,
    anosObservados: null,
    stale: true,
    error: "Sin datos del proveedor",
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

/**
 * Tendencia de momentum reciente: rendimiento del fondo frente al ACWI en los
 * últimos ~TEND_VENTANA_DIAS días naturales (sobre el rango común).
 *   mejorando  → el fondo batió al índice en el último mes (▼ verde: baja en la liga)
 *   empeorando → quedó por debajo del índice (▲ roja: sube en la liga)
 *   estable    → diferencia dentro de ±TEND_UMBRAL_PCT puntos porcentuales
 *   sin_ref    → no hay suficiente histórico reciente común
 */
function calcularTendencia30dias(navsFondo: NavPoint[], navsBench: NavPoint[]): Tendencia {
  if (navsFondo.length < 2 || navsBench.length < 2) return "sin_ref";
  const benchMap = new Map<string, number>();
  for (const p of navsBench) benchMap.set(p.date, p.nav);
  // Último punto común
  let fF: NavPoint | undefined;
  let fB: number | undefined;
  for (let i = navsFondo.length - 1; i >= 0; i--) {
    const p = navsFondo[i];
    if (!p) continue;
    const b = benchMap.get(p.date);
    if (b != null) { fF = p; fB = b; break; }
  }
  if (!fF || fB == null) return "sin_ref";
  // Primer punto común con fecha >= (fin - ventana)
  const cutoff = restarAnos(fF.date, TEND_VENTANA_DIAS / DIAS_POR_ANO);
  let iF: NavPoint | undefined;
  let iB: number | undefined;
  for (const p of navsFondo) {
    if (p.date < cutoff) continue;
    const b = benchMap.get(p.date);
    if (b != null) { iF = p; iB = b; break; }
  }
  if (!iF || iB == null || iF.date === fF.date || iF.nav <= 0 || iB <= 0) return "sin_ref";
  const excesoPct = ((fF.nav / iF.nav - 1) - (fB / iB - 1)) * 100;
  if (excesoPct > TEND_UMBRAL_PCT) return "mejorando";
  if (excesoPct < -TEND_UMBRAL_PCT) return "empeorando";
  return "estable";
}

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
