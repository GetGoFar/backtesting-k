// =============================================================================
// LIGA — Clasificador de fondos arbitrarios (no solo los 100 de la liga)
// =============================================================================
//
// Dado un ISIN, devuelve:
//   - Si el fondo está en la liga: su posición y datos directamente del snapshot
//   - Si NO está en la liga: hace lookup en Morningstar (proxy WP), determina
//     un benchmark por heurística, tira NAVs de EODHD, calcula alfa, dq3/5/10,
//     y devuelve qué posición teórica tendría en la liga.
//
// Resultado cacheado en Redis con TTL 24h por ISIN.
//
// =============================================================================

import {
  calcularAlfa,
  cargarFondosCsv,
  crearSerieSintetica,
  dineroQuemado,
  fetchNavsEODHD,
  type FondoCsv,
  type NavPoint,
  type SnapshotLiga,
} from "./liga-engine";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface BenchmarkSpec {
  isin: string;
  ticker: string;
  nombre: string;
  // Símbolo a usar al llamar a EODHD
  simbolo: string;
  // Si está presente, este benchmark es una cesta sintética. El campo describe
  // los componentes y los pesos para que el cliente pueda mostrarlos.
  composicion?: {
    descripcion: string;          // p.ej. "60% RV Global + 40% RF EUR"
    componentes: Array<{ ticker: string; peso: number; nombre: string }>;
  };
}

export type ClassifyError =
  | "isin_invalido"
  | "no_morningstar"
  | "no_eodhd"
  | "rango_corto"
  | "interno";

export interface ClassifyResult {
  isin: string;
  enLaLiga: boolean;
  // Si enLaLiga=true, copia del registro de la liga
  // Si enLaLiga=false, datos calculados al vuelo
  nombre: string | null;
  gestora?: string | null;
  tipo: string | null;             // categoría/tipo Morningstar
  alfa: number | null;             // % — alfa principal (alfa5 cuando hay datos a 5y)
  alfa3: number | null;            // % — alfa de los últimos 3 años
  alfa5: number | null;            // % — alfa de los últimos 5 años
  alfa10: number | null;           // % — alfa de los últimos 10 años
  dq3: number | null;
  dq5: number | null;
  dq10: number | null;
  posicionTeorica: number | null;  // Dónde caería en el ranking actual
  totalEnLiga: number;
  zona: "champions" | "europa" | "permanencia" | "descenso" | null;
  benchmarkUsado: BenchmarkSpec | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  anosObservados: number | null;
  generadoEn: string;
  // Si algo falla, también devolvemos qué etapa
  error?: ClassifyError;
  detalle?: string;
}

// -----------------------------------------------------------------------------
// Catálogo de benchmarks
// -----------------------------------------------------------------------------

const BENCHMARK_SP500: BenchmarkSpec = {
  isin: "IE00B3XXRP09",
  ticker: "VUSA.AS",
  nombre: "Vanguard S&P 500 UCITS ETF",
  simbolo: "VUSA.AS",
};
const BENCHMARK_EUROPE: BenchmarkSpec = {
  isin: "IE00B1YZSC51",
  ticker: "IMEU.AS",
  nombre: "iShares MSCI Europe UCITS ETF",
  simbolo: "IMEU.AS",
};
const BENCHMARK_EM: BenchmarkSpec = {
  isin: "LU1681045370",
  ticker: "AEEM.PA",
  nombre: "Amundi MSCI Emerging Markets ETF",
  simbolo: "AEEM.PA",
};
const BENCHMARK_SPAIN: BenchmarkSpec = {
  isin: "ES0157097019",
  ticker: "BBVAI.MC",
  nombre: "BBVA Acción IBEX 35 ETF",
  simbolo: "BBVAI.MC",
};
const BENCHMARK_RF_EUR: BenchmarkSpec = {
  isin: "IE00B4WXJJ64",
  ticker: "IEGA.AS",
  nombre: "iShares Core EUR Government Bond UCITS ETF",
  simbolo: "IEGA.AS",
};
const BENCHMARK_WORLD: BenchmarkSpec = {
  isin: "IE00B4L5Y983",
  ticker: "IWDA.AS",
  nombre: "iShares Core MSCI World UCITS ETF",
  simbolo: "IWDA.AS",
};

/**
 * Cestas sintéticas para fondos mixtos. El simbolo no se usa para llamar a
 * EODHD directamente — al detectar uno de estos, classifyFund construye la
 * serie sintética combinando RV Global (IWDA) + RF EUR (VGEA) con pesos.
 */
function benchmarkMixto(pesoEquity: number): BenchmarkSpec {
  const pesoBond = 1 - pesoEquity;
  const labelEq = `${Math.round(pesoEquity * 100)}%`;
  const labelBond = `${Math.round(pesoBond * 100)}%`;
  return {
    isin: `__SYNTH_${Math.round(pesoEquity * 100)}_${Math.round(pesoBond * 100)}`,
    ticker: `${labelEq}/${labelBond}`,
    nombre: `Cesta sintética ${labelEq} RV Global + ${labelBond} RF EUR`,
    simbolo: `__SYNTH_${Math.round(pesoEquity * 100)}_${Math.round(pesoBond * 100)}`,
    composicion: {
      descripcion: `${labelEq} RV Global (MSCI World) + ${labelBond} RF EUR (Eurozone Gov Bond)`,
      componentes: [
        { ticker: "IWDA.AS", peso: pesoEquity, nombre: "iShares Core MSCI World UCITS ETF" },
        { ticker: "IEGA.AS", peso: pesoBond, nombre: "iShares Core EUR Government Bond UCITS ETF" },
      ],
    },
  };
}

const BENCHMARK_MIXTO_AGRESIVO = benchmarkMixto(0.8);     // 80/20
const BENCHMARK_MIXTO_MODERADO = benchmarkMixto(0.6);     // 60/40
const BENCHMARK_MIXTO_CONSERVADOR = benchmarkMixto(0.4);  // 40/60

function esBenchmarkSintetico(b: BenchmarkSpec): boolean {
  return b.simbolo.startsWith("__SYNTH_");
}

interface BenchmarkRule {
  // Lista de palabras clave que deben aparecer (en cualquier orden) en
  // nombre.toLowerCase() o tipo.toLowerCase() para activar este benchmark.
  // Cualquier coincidencia activa la regla.
  keywords: string[];
  benchmark: BenchmarkSpec;
}

// Reglas evaluadas en orden — la primera que matchea gana.
// Precedencia diseñada para que las categorías más específicas dominen:
// 1) mixtos primero (porque "mixto agresivo" contiene la palabra "agresivo"
//    pero también "mixto" — y queremos que entre por mixto, no por equity)
// 2) regiones específicas (EEUU, España) sobre genéricas
// 3) renta fija
// 4) default = MSCI World
const BENCHMARK_RULES: BenchmarkRule[] = [
  // Mixtos / multiactivos (PRIMERO — para que ganen sobre keywords de equity)
  // Conservador: más bonos
  {
    keywords: [
      "mixto conservador", "mixto defensivo", "conservative allocation",
      "defensive allocation", "indexa 1", "indexa 2", "indexa 3",
    ],
    benchmark: BENCHMARK_MIXTO_CONSERVADOR,
  },
  // Agresivo: más equity
  {
    keywords: [
      "mixto agresivo", "aggressive allocation", "agresivo global",
      "indexa 8", "indexa 9", "indexa 10", "imdi funds rojo", "imdi rojo",
    ],
    benchmark: BENCHMARK_MIXTO_AGRESIVO,
  },
  // Mixto genérico / moderado / balanced
  {
    keywords: [
      "mixto moderado", "mixto flexible", "mixto global", " mixto ",
      "moderate allocation", "balanced allocation", "multiactivo",
      "asset allocation", "indexa 4", "indexa 5", "indexa 6", "indexa 7",
    ],
    benchmark: BENCHMARK_MIXTO_MODERADO,
  },

  // EEUU / Norteamérica / Nasdaq / S&P
  {
    keywords: [
      "nasdaq", "norteameric", "us tech", "eeuu", "ee.uu",
      "estados unidos", "united states", "us large", "us cap",
      "s&p", "sp500", "sp 500", " usa", "usa ", "us equity",
    ],
    benchmark: BENCHMARK_SP500,
  },
  // Latinoamérica → EM (proxy)
  { keywords: ["latinoam", "latam"], benchmark: BENCHMARK_EM },
  // Emergentes / Asia / China / India
  {
    keywords: ["emergent", "emerging", "china", "india", "asia"],
    benchmark: BENCHMARK_EM,
  },
  // Europa / Eurozona
  {
    keywords: ["europa", "europe", "eurozona", "eurozone"],
    benchmark: BENCHMARK_EUROPE,
  },
  // España / Iberia / IBEX
  {
    keywords: ["españa", "espana", "ibérica", "iberica", "ibex", "spain"],
    benchmark: BENCHMARK_SPAIN,
  },
  // Renta fija
  {
    keywords: [
      "renta fija", " rf ", "fixed income", "bond", "bono ",
      "obligacion", "deuda",
    ],
    benchmark: BENCHMARK_RF_EUR,
  },
];

/**
 * Devuelve el benchmark por defecto + una "razón" textual de por qué.
 * Si ninguna regla matchea, cae a MSCI World.
 */
export function inferirBenchmark(
  nombre: string,
  tipo: string,
): { benchmark: BenchmarkSpec; razon: string } {
  const blob = `${nombre || ""} ${tipo || ""}`.toLowerCase();
  for (const regla of BENCHMARK_RULES) {
    for (const kw of regla.keywords) {
      if (blob.includes(kw)) {
        return {
          benchmark: regla.benchmark,
          razon: `Match por palabra clave "${kw.trim()}"`,
        };
      }
    }
  }
  return {
    benchmark: BENCHMARK_WORLD,
    razon: "Default: MSCI World (sin región/tipo específico detectado)",
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export function isinValido(isin: string): boolean {
  return ISIN_REGEX.test(isin);
}

/**
 * Calcula la posición que un dq5 tendría en el ranking actual de la liga.
 * Basado en orden descendente (mayor dq5 = peor = posición 1).
 */
export function posicionEnRanking(
  dq5: number,
  snapshot: SnapshotLiga,
): { posicion: number; total: number; zona: "champions" | "europa" | "permanencia" | "descenso" } {
  const dq5sActuales = snapshot.fondos
    .filter((f) => !f.stale && f.dq5 != null)
    .map((f) => f.dq5 as number)
    .sort((a, b) => b - a);
  // Posición = nº de fondos con dq5 estrictamente mayor + 1
  let posicion = 1;
  for (const v of dq5sActuales) {
    if (v > dq5) posicion += 1;
    else break;
  }
  const total = dq5sActuales.length + 1; // +1 para incluir al fondo nuevo
  const pct = posicion / total;
  let zona: "champions" | "europa" | "permanencia" | "descenso";
  if (pct <= 0.25) zona = "champions";
  else if (pct <= 0.5) zona = "europa";
  else if (pct <= 0.75) zona = "permanencia";
  else zona = "descenso";
  return { posicion, total, zona };
}

/**
 * Pide a WordPress (snippet #1853) el nombre y tipo del fondo desde Morningstar.
 * Devuelve null si Morningstar no encuentra el fondo o el lookup falla.
 */
export async function lookupMorningstar(
  isin: string,
  wordpressUrl: string,
): Promise<{ nombre: string; tipo: string } | null> {
  try {
    const url = `${wordpressUrl}/wp-json/epk/v1/fund?isin=${encodeURIComponent(isin)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; name?: string; type?: string };
    if (!data.ok || !data.name) return null;
    return { nombre: data.name, tipo: data.type ?? "" };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Función principal
// -----------------------------------------------------------------------------

interface ClassifyOpts {
  apiToken: string;
  wordpressUrl: string;
  /** Snapshot actual de la liga (para lookup directo + cálculo de posición). */
  snapshot: SnapshotLiga;
  /** Permite inyectar fetcher para tests. */
  fetcher?: (simbolo: string) => Promise<NavPoint[]>;
  /**
   * Fondos del CSV (opcional). Si se pasa, los fondos de la liga muestran
   * su benchmark real del CSV en vez de "—". Si se omite, se carga desde disco.
   */
  fondosCsv?: FondoCsv[];
}

export async function classifyFund(
  isinRaw: string,
  opts: ClassifyOpts,
): Promise<ClassifyResult> {
  const isin = isinRaw.trim().toUpperCase();
  const generadoEn = new Date().toISOString();
  const totalEnLiga = opts.snapshot.fondosOk;

  if (!isinValido(isin)) {
    return {
      isin, enLaLiga: false, nombre: null, tipo: null,
      alfa: null, alfa3: null, alfa5: null, alfa10: null, dq3: null, dq5: null, dq10: null,
      posicionTeorica: null, totalEnLiga, zona: null,
      benchmarkUsado: null,
      fechaInicio: null, fechaFin: null, anosObservados: null,
      generadoEn,
      error: "isin_invalido",
      detalle: `ISIN no respeta formato: ${isin}`,
    };
  }

  // Fast path: ya está en la liga
  const enLiga = opts.snapshot.fondos.find((f) => f.isin === isin);
  if (enLiga && enLiga.dq5 != null && !enLiga.stale) {
    const { posicion, zona } = posicionEnRanking(enLiga.dq5, opts.snapshot);
    // Recuperar el benchmark real del CSV para mostrarlo
    const fondosCsv = opts.fondosCsv ?? (await cargarFondosCsv().catch(() => []));
    const csvRow = fondosCsv.find((c) => c.isin === isin);
    const benchmarkUsado: BenchmarkSpec | null = csvRow
      ? {
          isin: csvRow.benchmark_isin,
          ticker: csvRow.benchmark_ticker || csvRow.benchmark_isin,
          nombre: csvRow.benchmark_notas || csvRow.benchmark_ticker || "Benchmark de la liga",
          simbolo: csvRow.benchmark_ticker || `${csvRow.benchmark_isin}.EUFUND`,
        }
      : null;
    return {
      isin,
      enLaLiga: true,
      nombre: enLiga.nombre,
      gestora: enLiga.gestora,
      tipo: enLiga.categoria,
      alfa: enLiga.alfa,
      alfa3: enLiga.alfa3,
      alfa5: enLiga.alfa5,
      alfa10: enLiga.alfa10,
      dq3: enLiga.dq3,
      dq5: enLiga.dq5,
      dq10: enLiga.dq10,
      posicionTeorica: posicion,
      totalEnLiga,
      zona,
      benchmarkUsado,
      fechaInicio: enLiga.fechaInicio,
      fechaFin: enLiga.fechaFin,
      anosObservados: enLiga.anosObservados,
      generadoEn,
    };
  }

  // Slow path: fondo nuevo
  const morningstar = await lookupMorningstar(isin, opts.wordpressUrl);
  if (!morningstar) {
    return {
      isin, enLaLiga: false, nombre: null, tipo: null,
      alfa: null, alfa3: null, alfa5: null, alfa10: null, dq3: null, dq5: null, dq10: null,
      posicionTeorica: null, totalEnLiga, zona: null,
      benchmarkUsado: null,
      fechaInicio: null, fechaFin: null, anosObservados: null,
      generadoEn,
      error: "no_morningstar",
      detalle: "Morningstar no devolvió ficha del fondo",
    };
  }

  const { benchmark } = inferirBenchmark(morningstar.nombre, morningstar.tipo);

  const fetcher = opts.fetcher
    ?? ((s: string) => fetchNavsEODHD(s, opts.apiToken));

  // Para benchmarks sintéticos (mixtos), construimos la serie combinando
  // las dos series componentes en lugar de pedirla a EODHD directamente.
  let navsBenchPromise: Promise<NavPoint[]>;
  if (esBenchmarkSintetico(benchmark) && benchmark.composicion) {
    const componentes = benchmark.composicion.componentes;
    navsBenchPromise = Promise.all(componentes.map((c) => fetcher(c.ticker)))
      .then((series) => {
        if (series.length !== 2 || !series[0] || !series[1]) return [];
        const pesoA = componentes[0]?.peso ?? 0.6;
        return crearSerieSintetica(series[0], series[1], pesoA);
      });
  } else {
    navsBenchPromise = fetcher(benchmark.simbolo);
  }

  const [navsFondo, navsBench] = await Promise.all([
    fetcher(`${isin}.EUFUND`),
    navsBenchPromise,
  ]);

  if (navsFondo.length < 2) {
    return {
      isin, enLaLiga: false,
      nombre: morningstar.nombre, tipo: morningstar.tipo,
      alfa: null, alfa3: null, alfa5: null, alfa10: null, dq3: null, dq5: null, dq10: null,
      posicionTeorica: null, totalEnLiga, zona: null,
      benchmarkUsado: benchmark,
      fechaInicio: null, fechaFin: null, anosObservados: null,
      generadoEn,
      error: "no_eodhd",
      detalle: "EODHD no tiene NAVs históricos suficientes para este fondo",
    };
  }

  if (navsBench.length < 2) {
    return {
      isin, enLaLiga: false,
      nombre: morningstar.nombre, tipo: morningstar.tipo,
      alfa: null, alfa3: null, alfa5: null, alfa10: null, dq3: null, dq5: null, dq10: null,
      posicionTeorica: null, totalEnLiga, zona: null,
      benchmarkUsado: benchmark,
      fechaInicio: null, fechaFin: null, anosObservados: null,
      generadoEn,
      error: "no_eodhd",
      detalle: "Benchmark sin datos en EODHD",
    };
  }

  // Una alfa por ventana (3y / 5y / 10y) — coherente con la nueva metodología
  // del snapshot. Cada DQ se calcula con la alfa de su propia ventana.
  const alfa3w = calcularAlfa(navsFondo, navsBench, 3);
  const alfa5w = calcularAlfa(navsFondo, navsBench, 5);
  const alfa10w = calcularAlfa(navsFondo, navsBench, 10);

  if (!alfa3w && !alfa5w && !alfa10w) {
    return {
      isin, enLaLiga: false,
      nombre: morningstar.nombre, tipo: morningstar.tipo,
      alfa: null, alfa3: null, alfa5: null, alfa10: null, dq3: null, dq5: null, dq10: null,
      posicionTeorica: null, totalEnLiga, zona: null,
      benchmarkUsado: benchmark,
      fechaInicio: null, fechaFin: null, anosObservados: null,
      generadoEn,
      error: "rango_corto",
      detalle: "Rango común con benchmark insuficiente para 3/5/10 años",
    };
  }

  const dq3 = alfa3w ? dineroQuemado(alfa3w.alfaPct, 3) : null;
  const dq5 = alfa5w ? dineroQuemado(alfa5w.alfaPct, 5) : null;
  const dq10 = alfa10w ? dineroQuemado(alfa10w.alfaPct, 10) : null;

  // Para posicionar en ranking necesitamos un dq5; si no hay, caemos a la
  // ventana siguiente disponible para evitar dejar el fondo sin posición.
  const dqRanking = dq5 ?? dq10 ?? dq3 ?? 0;
  const { posicion, zona } = posicionEnRanking(dqRanking, opts.snapshot);

  const alfaPpal = alfa5w ?? alfa10w ?? alfa3w;

  return {
    isin,
    enLaLiga: false,
    nombre: morningstar.nombre,
    tipo: morningstar.tipo,
    alfa: alfaPpal!.alfaPct,
    alfa3: alfa3w?.alfaPct ?? null,
    alfa5: alfa5w?.alfaPct ?? null,
    alfa10: alfa10w?.alfaPct ?? null,
    dq3, dq5, dq10,
    posicionTeorica: posicion,
    totalEnLiga,
    zona,
    benchmarkUsado: benchmark,
    fechaInicio: alfaPpal!.fechaInicio,
    fechaFin: alfaPpal!.fechaFin,
    anosObservados: alfaPpal!.anos,
    generadoEn,
  };
}
