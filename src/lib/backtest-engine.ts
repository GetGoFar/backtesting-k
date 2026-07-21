// =============================================================================
// MOTOR DE BACKTESTING - Backtesting Tool El Proyecto K
// =============================================================================
//
// Motor de cálculo para simulación de carteras de inversión.
// Itera día a día internamente para máxima precisión.
// La salida se agrega a la granularidad elegida (diaria, mensual, trimestral).
//
// =============================================================================

import type {
  BacktestConfig,
  BacktestResult,
  BacktestWarning,
  Portfolio,
  PortfolioHolding,
  TimeSeriesPoint,
  AnnualReturn,
  DrawdownPoint,
  DrawdownEpisode,
  StressPeriodResult,
  BenchmarkComparison,
  BenchmarkId,
  RebalanceEvent,
  RebalanceTrade,
  FeesSummary,
  Metrics,
  FundType,
  RebalanceFrequency,
  RollingReturns,
  RollingStats,
  RollingStatsBucket,
  ReturnsHistogram,
  PortfolioAllocation,
  AllocationSlice,
  CorrelationMatrix,
  CorrelationEntry,
  AssetMetrics,
  DisplayGranularity,
  Fund,
} from "./types";
import { getFundById } from "./fund-database";
import { getBenchmarkById } from "./benchmarks";
import { getDailyPrices, getMonthlyPrices } from "./data-fetcher";
import { getExcludedAssetWarnings, getTerWarnings } from "./data-warnings";
import { runMomentum } from "./momentum-engine";
import type { MomentumConfig } from "./momentum-types";
import {
  getLastDatePerPeriod,
  shouldRebalanceByDate,
  isNewMonth,
  aggregateDailyReturns,
  getMonthFromDate,
} from "./date-utils";

// -----------------------------------------------------------------------------
// Constantes
// -----------------------------------------------------------------------------

/** Tasa libre de riesgo anual para cálculo de Sharpe/Sortino (1%) */
const RISK_FREE_RATE = 0.01;

/** Días de trading por año (para anualizar retornos diarios) */
const TRADING_DAYS_PER_YEAR = 252;

// -----------------------------------------------------------------------------
// Función principal
// -----------------------------------------------------------------------------

/**
 * Ejecuta el backtest completo para dos carteras
 */
export async function runBacktest(
  config: BacktestConfig
): Promise<{
  a: BacktestResult | null;
  b: BacktestResult | null;
  correlation?: number;
  commonDateRange?: { start: string; end: string };
  correlationMatrix?: CorrelationMatrix;
  assetMetrics?: AssetMetrics[];
  warnings?: BacktestWarning[];
}> {
  console.log("[BacktestEngine] Iniciando backtest...");
  console.log(`[BacktestEngine] Período: ${config.startDate} - ${config.endDate}`);
  console.log(`[BacktestEngine] Inversión inicial: ${config.initialAmount}€`);
  console.log(`[BacktestEngine] Granularidad: ${config.displayGranularity ?? "monthly"}`);

  const displayGranularity = config.displayGranularity ?? "monthly";
  const engineWarnings: BacktestWarning[] = [];

  let effectiveStartDate = config.startDate;
  let effectiveEndDate = config.endDate;
  let commonDateRange: { start: string; end: string } | undefined;

  // Composición del benchmark seleccionado (si lo hay). Se incluye en el
  // cálculo del rango común para que "usar rango común" también lo abarque:
  // si el histórico del benchmark es más corto (p.ej. un ETF que cotiza desde
  // 2009), las tres series arrancan en la misma fecha y la comparación es justa.
  const benchmarkCompositionForRange: PortfolioHolding[] | undefined =
    config.customBenchmark && config.customBenchmark.composition.length > 0
      ? config.customBenchmark.composition
      : config.benchmarkId
        ? getBenchmarkById(config.benchmarkId)?.composition
        : undefined;

  // Calcular el rango común cuando useCommonDateRange está activo y:
  //   - hay DOS carteras (intersección A∩B), o
  //   - hay UNA cartera + benchmark (intersección cartera∩benchmark).
  // Este segundo caso es clave: aunque solo se compare una cartera contra el
  // benchmark, "usar rango común" debe alinear ambos a la fecha donde los dos
  // tienen datos (si el benchmark cotiza desde más tarde, la cartera se recorta).
  const hasBenchmarkForRange =
    !!benchmarkCompositionForRange && benchmarkCompositionForRange.length > 0;
  const hasAnyPortfolio = !!config.portfolioA || !!config.portfolioB;
  const hasBothPortfolios = !!config.portfolioA && !!config.portfolioB;
  if (
    config.useCommonDateRange &&
    hasAnyPortfolio &&
    (hasBothPortfolios || hasBenchmarkForRange)
  ) {
    console.log("[BacktestEngine] Buscando rango de fechas común...");
    const rangeResult = await findCommonDateRangeForPortfolios(
      config.portfolioA ?? null,
      config.portfolioB ?? null,
      config.startDate,
      config.endDate,
      benchmarkCompositionForRange
    );
    if (rangeResult) {
      effectiveStartDate = rangeResult.startDate;
      effectiveEndDate = rangeResult.endDate;
      commonDateRange = { start: rangeResult.startDate, end: rangeResult.endDate };
      console.log(`[BacktestEngine] Rango común encontrado: ${effectiveStartDate} - ${effectiveEndDate}`);
    }
  }

  // Ejecutar backtests — cada cartera puede tener su propio modo y tasa
  // impositiva. Fallback al global del config si no está definido.
  const globalTaxRate = config.taxRate ?? 0;
  const taxRateA = config.portfolioA?.taxRate ?? globalTaxRate;
  const taxRateB = config.portfolioB?.taxRate ?? globalTaxRate;
  const taxModeA: TaxMode = config.portfolioA?.taxMode ?? "none";
  const taxModeB: TaxMode = config.portfolioB?.taxMode ?? "none";
  // Bandas de rebalanceo globales (aplican a ambas carteras por igual)
  const bandRel = config.rebalanceBandRelative ?? 0;
  const bandAbs = config.rebalanceBandAbsolute ?? 0;
  // Rebalanceo con aportaciones: redirige el dinero nuevo a activos rezagados
  const contributionRebalance = config.contributionRebalance ?? false;
  const resultAPromise = config.portfolioA
    ? runPortfolioBacktest(
        config.portfolioA,
        effectiveStartDate,
        effectiveEndDate,
        config.initialAmount,
        config.rebalanceFrequency,
        config.monthlyContribution ?? 0,
        displayGranularity,
        engineWarnings,
        taxRateA,
        taxModeA,
        bandRel,
        bandAbs,
        contributionRebalance
      )
    : Promise.resolve(null);

  const resultBPromise = config.portfolioB
    ? runPortfolioBacktest(
        config.portfolioB,
        effectiveStartDate,
        effectiveEndDate,
        config.initialAmount,
        config.rebalanceFrequency,
        config.monthlyContribution ?? 0,
        displayGranularity,
        engineWarnings,
        taxRateB,
        taxModeB,
        bandRel,
        bandAbs,
        contributionRebalance
      )
    : Promise.resolve(null);

  const [resultA, resultB] = await Promise.all([resultAPromise, resultBPromise]);

  // Correlación entre carteras (siempre usa datos mensuales para estabilidad)
  let correlation: number | undefined;
  if (resultA && resultB) {
    correlation = calculateCorrelation(resultA.timeSeries, resultB.timeSeries);
  }

  // FIX: el benchmark debe correr sobre el periodo REAL de los portfolios
  // (no el solicitado), para que CAGR y rentabilidad sean comparables.
  // Si un portfolio empieza en 2017 porque algún fondo no tenía datos antes,
  // el benchmark también debe empezar en 2017 — no en 2010 (que era el solicitado).
  const tsAFirst = resultA?.timeSeries[0];
  const tsBFirst = resultB?.timeSeries[0];
  const tsALast = resultA?.timeSeries[resultA.timeSeries.length - 1];
  const tsBLast = resultB?.timeSeries[resultB.timeSeries.length - 1];

  // Tomar el inicio MÁS TARDE entre A y B (intersección) si ambas existen,
  // o el de la única cartera que exista.
  const candidates_start: string[] = [];
  if (tsAFirst) candidates_start.push(tsAFirst.exactDate || `${tsAFirst.date}-01`);
  if (tsBFirst) candidates_start.push(tsBFirst.exactDate || `${tsBFirst.date}-01`);
  const actualStartForBenchmark = candidates_start.length > 0
    ? candidates_start.sort().reverse()[0]! // la más tarde
    : effectiveStartDate;

  const candidates_end: string[] = [];
  if (tsALast) candidates_end.push(tsALast.exactDate || `${tsALast.date}-01`);
  if (tsBLast) candidates_end.push(tsBLast.exactDate || `${tsBLast.date}-01`);
  const actualEndForBenchmark = candidates_end.length > 0
    ? candidates_end.sort()[0]! // la más temprana (intersección)
    : effectiveEndDate;

  // Benchmark: si se solicita, ejecutar backtest del benchmark y calcular métricas relativas.
  // Prioridad:
  //   1) customBenchmark (cartera ad-hoc o preset usado como benchmark)
  //   2) benchmarkId (de la lista predefinida de índices)
  const hasCustomBenchmark = config.customBenchmark
    && config.customBenchmark.composition.length > 0;
  if ((hasCustomBenchmark || config.benchmarkId) && (resultA || resultB)) {
    try {
      // Resolver la composición y nombres del benchmark
      let benchmarkName: string;
      let benchmarkHoldings: Array<{ fundId: string; weight: number; fund?: Fund }>;
      let benchmarkIdForComparison: BenchmarkId;
      if (hasCustomBenchmark) {
        benchmarkName = config.customBenchmark!.name;
        benchmarkHoldings = config.customBenchmark!.composition;
        // ID sintético para identificar este benchmark en la respuesta
        benchmarkIdForComparison = ("custom-" + benchmarkName.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 40)) as BenchmarkId;
      } else {
        const benchmarkDef = getBenchmarkById(config.benchmarkId!);
        if (!benchmarkDef) throw new Error("Benchmark no encontrado");
        benchmarkName = benchmarkDef.name;
        benchmarkHoldings = benchmarkDef.composition;
        benchmarkIdForComparison = config.benchmarkId!;
      }

      const benchmarkPortfolio: Portfolio = {
        name: benchmarkName,
        holdings: benchmarkHoldings,
      };
      const benchmarkResult = await runPortfolioBacktest(
        benchmarkPortfolio,
        actualStartForBenchmark,
        actualEndForBenchmark,
        config.initialAmount,
        config.rebalanceFrequency,
        config.monthlyContribution ?? 0,
        displayGranularity,
        [] // no acumulamos warnings del benchmark
      );
      if (benchmarkResult) {
        const benchmarkFundIds = benchmarkHoldings.map((h) => h.fundId);
        if (resultA) {
          resultA.benchmark = computeBenchmarkComparison(
            resultA,
            benchmarkResult,
            benchmarkIdForComparison,
            benchmarkName,
            displayGranularity
          );
          resultA.benchmark.benchmarkFundIds = benchmarkFundIds;
        }
        if (resultB) {
          resultB.benchmark = computeBenchmarkComparison(
            resultB,
            benchmarkResult,
            benchmarkIdForComparison,
            benchmarkName,
            displayGranularity
          );
          resultB.benchmark.benchmarkFundIds = benchmarkFundIds;
        }
      }
    } catch (err) {
      console.warn("[BacktestEngine] Error calculando benchmark:", err);
    }
  }

  // Métricas individuales de activos y matriz de correlaciones
  // Usar el rango de fechas REAL del backtest (no el del config, que puede ser más amplio)
  // Incluimos también los fondos del benchmark (si lo hay) para poder agrupar
  // por "Benchmark" en Métricas por activo y Correlaciones.
  const allHoldings = [
    ...(config.portfolioA?.holdings ?? []),
    ...(config.portfolioB?.holdings ?? []),
    ...(benchmarkCompositionForRange ?? []),
  ];

  // Extraer rango real de la serie temporal del backtest
  const tsA = resultA?.timeSeries;
  const tsB = resultB?.timeSeries;
  const actualStartDate =
    tsA?.[0]?.exactDate || tsB?.[0]?.exactDate || effectiveStartDate;
  const actualEndDate =
    tsA?.[tsA.length - 1]?.exactDate ||
    tsB?.[tsB.length - 1]?.exactDate ||
    effectiveEndDate;

  let correlationMatrix: CorrelationMatrix | undefined;
  let assetMetrics: AssetMetrics[] | undefined;

  if (allHoldings.length > 0) {
    [correlationMatrix, assetMetrics] = await Promise.all([
      allHoldings.length >= 2
        ? calculateAssetCorrelationMatrix(allHoldings, actualStartDate, actualEndDate)
        : Promise.resolve(undefined),
      calculateIndividualAssetMetrics(allHoldings, actualStartDate, actualEndDate, displayGranularity),
    ]);
  }

  // Warnings de TER
  engineWarnings.push(...getTerWarnings(allHoldings));

  // Warnings de activos excluidos
  if (correlationMatrix && allHoldings.length > 0) {
    const includedInCorr = new Set(correlationMatrix.fundIds);
    engineWarnings.push(...getExcludedAssetWarnings(allHoldings, includedInCorr, "correlation"));
  }
  if (assetMetrics && allHoldings.length > 0) {
    const includedInMetrics = new Set(assetMetrics.map((m) => m.fundId));
    engineWarnings.push(...getExcludedAssetWarnings(allHoldings, includedInMetrics, "metrics"));
  }

  return {
    a: resultA,
    b: resultB,
    correlation,
    commonDateRange,
    correlationMatrix,
    assetMetrics,
    warnings: engineWarnings.length > 0 ? engineWarnings : undefined,
  };
}

// -----------------------------------------------------------------------------
// Backtest de una cartera individual
// -----------------------------------------------------------------------------

async function runPortfolioBacktest(
  portfolio: Portfolio,
  startDate: string,
  endDate: string,
  initialAmount: number,
  rebalanceFrequency: RebalanceFrequency,
  monthlyContribution: number,
  displayGranularity: DisplayGranularity,
  warnings?: BacktestWarning[],
  taxRate: number = 0,
  taxMode: TaxMode = "none",
  rebalanceBandRelative: number = 0,
  rebalanceBandAbsolute: number = 0,
  contributionRebalance: boolean = false
): Promise<BacktestResult | null> {
  console.log(`[BacktestEngine] Procesando cartera: ${portfolio.name}`);

  // 1. Obtener precios diarios de todos los fondos
  const fundPrices = new Map<string, Map<string, number>>();
  const fundTers = new Map<string, number>();
  const fundTypes = new Map<string, FundType>();

  const failedFundIds = new Set<string>();

  // 1.A. Separar holdings: fondos normales vs estrategias de momentum.
  // Las estrategias de momentum se ejecutan PRIMERO y su equity curve mensual
  // se convierte en una serie de precios diarios sintética (forward-fill),
  // que luego se trata como un fondo más. Esto permite usar el momentum como
  // satélite de una cartera estática y ver su correlación con índices.
  const regularHoldings: typeof portfolio.holdings = [];
  const momentumHoldings: typeof portfolio.holdings = [];
  for (const h of portfolio.holdings) {
    if (h.momentumConfig) momentumHoldings.push(h);
    else regularHoldings.push(h);
  }

  // Ejecutar estrategias de momentum en paralelo, cada una con el rango de
  // fechas del backtest. Convertir cada equity curve mensual en una serie
  // de precios diaria (normalizada a 100 al primer punto, forward-fill entre
  // meses) y registrarla en fundPrices junto a un Fund sintético.
  if (momentumHoldings.length > 0) {
    console.log(
      `[BacktestEngine] Ejecutando ${momentumHoldings.length} estrategia(s) de momentum como satélite…`
    );
  }
  const momentumResults = await Promise.allSettled(
    momentumHoldings.map(async (h) => {
      // Overrideamos las fechas y el capital inicial del momentum config con
      // los del backtest — no nos interesa el equity ABSOLUTO del momentum,
      // sino su FORMA (que luego se normaliza a precio inicial 100).
      const cfg: MomentumConfig = {
        ...h.momentumConfig!,
        startDate,
        endDate,
        initialAmount: 100,
      };
      const res = await runMomentum(cfg);
      return { holding: h, response: res };
    })
  );

  for (let i = 0; i < momentumResults.length; i++) {
    const result = momentumResults[i]!;
    const h = momentumHoldings[i]!;
    if (result.status !== "fulfilled") {
      console.error(
        `[BacktestEngine] Error ejecutando momentum ${h.fundId}:`,
        result.reason
      );
      failedFundIds.add(h.fundId);
      if (warnings) {
        warnings.push({
          type: "data_missing",
          severity: "error",
          message: `No se pudo ejecutar la estrategia de momentum "${
            h.fund?.shortName ?? h.fund?.name ?? h.fundId
          }". Su peso se ha redistribuido entre los demás holdings.`,
          fundId: h.fundId,
        });
      }
      continue;
    }
    const equityCurve = result.value.response.equityCurve;
    if (equityCurve.length < 2) {
      console.warn(
        `[BacktestEngine] Momentum ${h.fundId} produjo equity curve con <2 puntos`
      );
      failedFundIds.add(h.fundId);
      continue;
    }

    // Forward-fill: para cada día entre startDate y endDate, el precio = el
    // último valor mensual de equity disponible <= ese día. La normalización
    // a precio inicial 100 hace que el motor lo trate como un fondo igual a
    // cualquier otro.
    const baseValue = equityCurve[0]!.value;
    if (baseValue <= 0) {
      failedFundIds.add(h.fundId);
      continue;
    }
    const dailyPrices = new Map<string, number>();
    // Generamos día a día entre la primera y última fecha de la equity curve
    const firstDate = equityCurve[0]!.date;
    const lastDate = equityCurve[equityCurve.length - 1]!.date;
    // Iterar día por día llenando con el último valor mensual <= ese día.
    let monthlyIdx = 0;
    const start = new Date(firstDate);
    const end = new Date(lastDate);
    for (
      let d = new Date(start);
      d <= end;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const dStr = d.toISOString().substring(0, 10);
      // Avanzar el índice mientras el siguiente equity point ≤ dStr
      while (
        monthlyIdx + 1 < equityCurve.length &&
        equityCurve[monthlyIdx + 1]!.date <= dStr
      ) {
        monthlyIdx++;
      }
      const normalized = (equityCurve[monthlyIdx]!.value / baseValue) * 100;
      dailyPrices.set(dStr, normalized);
    }

    fundPrices.set(h.fundId, dailyPrices);
    fundTers.set(h.fundId, 0); // El momentum ya tiene los TER de los activos subyacentes baked-in
    fundTypes.set(h.fundId, "active");
    console.log(
      `[BacktestEngine] Momentum ${h.fundId}: ${dailyPrices.size} días de datos sintéticos`
    );
  }

  // Descargar datos de los fondos NORMALES (no momentum) EN PARALELO
  // (crítico para carteras con muchos fondos)
  const holdingsWithFunds = regularHoldings.map((holding) => ({
    holding,
    fund: getFundById(holding.fundId) || holding.fund,
  }));

  const fetchResults = await Promise.allSettled(
    holdingsWithFunds.map(async ({ holding, fund }) => {
      if (!fund) throw new Error(`Fondo no encontrado: ${holding.fundId}`);
      const { prices } = await getDailyPrices(holding.fundId, fund.ticker, fund.isin);
      return { holding, fund, prices };
    })
  );

  for (let i = 0; i < fetchResults.length; i++) {
    const result = fetchResults[i]!;
    const { holding, fund } = holdingsWithFunds[i]!;

    if (result.status === "fulfilled") {
      fundPrices.set(holding.fundId, result.value.prices);
      fundTers.set(holding.fundId, result.value.fund.ter);
      fundTypes.set(holding.fundId, result.value.fund.type);
      console.log(`[BacktestEngine] ${result.value.fund.name}: ${result.value.prices.size} días de datos, TER=${result.value.fund.ter}%`);
    } else {
      console.error(`[BacktestEngine] Error obteniendo precios para ${holding.fundId}:`, result.reason);
      failedFundIds.add(holding.fundId);
      if (warnings) {
        const name = fund?.shortName || fund?.name || holding.fundId;
        warnings.push({
          type: "data_missing",
          severity: "error",
          message: `No se pudieron obtener datos históricos de "${name}". Este fondo ha sido excluido del backtest. Su peso se ha redistribuido entre los demás fondos.`,
          fundId: holding.fundId,
        });
      }
    }
  }

  if (fundPrices.size === 0) {
    console.error("[BacktestEngine] No hay datos de precios disponibles");
    return null;
  }

  // Filtrar holdings sin datos y redistribuir pesos
  const activeHoldings = failedFundIds.size > 0
    ? (() => {
        const filtered = portfolio.holdings.filter((h) => !failedFundIds.has(h.fundId));
        const totalActiveWeight = filtered.reduce((sum, h) => sum + h.weight, 0);
        if (totalActiveWeight <= 0) return filtered;
        // Normalizar pesos para que sumen 100%
        return filtered.map((h) => ({
          ...h,
          weight: (h.weight / totalActiveWeight) * 100,
        }));
      })()
    : portfolio.holdings;

  // 2. Encontrar el rango de fechas diarias (unión + forward-fill + intersección)
  const { commonDates, intersectionDates, startDay, endDay } = findCommonDailyDateRange(
    fundPrices,
    startDate,
    endDate
  );

  if (commonDates.length < 2) {
    console.error("[BacktestEngine] Rango de fechas insuficiente");
    return null;
  }

  console.log(`[BacktestEngine] Rango diario: ${startDay} - ${endDay} (${commonDates.length} días)`);

  // Permitir overrides POR CARTERA del rebalanceo (frecuencia + bandas).
  // Si la cartera define sus propios valores, sobrescriben a los globales.
  const effectiveRebalanceFrequency =
    portfolio.rebalanceFrequency ?? rebalanceFrequency;
  const effectiveBandRel =
    portfolio.rebalanceBandRelative ?? rebalanceBandRelative;
  const effectiveBandAbs =
    portfolio.rebalanceBandAbsolute ?? rebalanceBandAbsolute;

  // 3. Simular la cartera día a día (usando solo holdings con datos disponibles)
  const simulation = simulatePortfolioDaily(
    activeHoldings,
    fundPrices,
    fundTers,
    commonDates,
    initialAmount,
    effectiveRebalanceFrequency,
    monthlyContribution,
    portfolio.managementFee ?? 0,
    taxRate,
    taxMode,
    effectiveBandRel,
    effectiveBandAbs,
    contributionRebalance
  );

  if (simulation.dailyTimeSeries.length === 0) {
    return null;
  }

  // 4. Agregar la serie temporal a la granularidad solicitada
  const outputDates = getLastDatePerPeriod(commonDates, displayGranularity);
  const dailyMap = new Map(simulation.dailyTimeSeries.map((p) => [p.date, p.value]));

  const timeSeries: TimeSeriesPoint[] = outputDates
    .filter((d) => dailyMap.has(d))
    .map((d) => ({
      date: displayGranularity === "daily" ? d : d.substring(0, 7), // YYYY-MM-DD para diario, YYYY-MM para mensual/trimestral
      value: dailyMap.get(d)!,
      exactDate: d,
    }));

  // Para trimestral, usar el último mes del trimestre como date
  if (displayGranularity === "quarterly") {
    for (const point of timeSeries) {
      // Ya tiene YYYY-MM en date y la fecha exacta en exactDate — perfecto
    }
  }

  if (timeSeries.length === 0) return null;

  // 4b. Contrafactual BRUTO: agregar su serie a la misma granularidad y
  // exponerla SOLO si la cartera pagó impuestos (si no, bruto == neto y no
  // aporta nada — los consumidores hacen fallback a finalValue + paid).
  let grossFinalValue: number | undefined;
  let grossTimeSeries: TimeSeriesPoint[] | undefined;
  if (simulation.grossDailyTimeSeries && simulation.totalTaxesPaid > 0) {
    const grossMap = new Map(simulation.grossDailyTimeSeries.map((p) => [p.date, p.value]));
    grossTimeSeries = outputDates
      .filter((d) => grossMap.has(d))
      .map((d) => ({
        date: displayGranularity === "daily" ? d : d.substring(0, 7),
        value: grossMap.get(d)!,
        exactDate: d,
      }));
    grossFinalValue =
      simulation.grossDailyTimeSeries[simulation.grossDailyTimeSeries.length - 1]?.value;
  }

  // 5. Calcular métricas — dependen de la granularidad seleccionada
  // "Cuanto menos mires la cartera, menos sufrirás": en mensual/trimestral
  // se suavizan la volatilidad y los drawdowns intra-periodo.
  const dailyValues = simulation.dailyTimeSeries.map((p) => p.value);
  const finalValue = dailyValues[dailyValues.length - 1] ?? 0;

  // Calcular años usando fechas calendario reales
  const firstDate = new Date(commonDates[0]!);
  const lastDate = new Date(commonDates[commonDates.length - 1]!);
  const calendarDays = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
  const years = calendarDays / 365.25;

  // Retornos y valores según la granularidad seleccionada
  const periodReturns = aggregateDailyReturns(simulation.dailyReturns, displayGranularity);
  const periodValues = timeSeries.map((p) => p.value);

  // Para diario: filtrar retornos "limpios" (solo días donde TODOS los fondos cotizaron)
  // Evita artefactos del forward-fill (0% un día → salto doble al siguiente por festivos
  // de bolsas diferentes), que inflan artificialmente la volatilidad medida.
  let volatilityReturns: number[];
  if (displayGranularity === "daily") {
    const cleanDailyReturns = simulation.dailyReturns.filter((r, i) => {
      if (!intersectionDates.has(r.date)) return false;
      if (i === 0) return true;
      const prevDate = simulation.dailyTimeSeries[i]?.date;
      return prevDate ? intersectionDates.has(prevDate) : false;
    });
    volatilityReturns = cleanDailyReturns.map((r) => r.returnValue);
  } else {
    // Mensual/trimestral: el forward-fill no afecta a nivel de periodo agregado
    volatilityReturns = periodReturns.map((r) => r.returnValue);
  }

  // Para CAGR: usar el valor inicial real (día 1) y final real (último día)
  const dailyInitialValue = dailyValues[0] ?? simulation.totalContributions;

  // Retornos diarios crudos (ya ajustados por aportaciones en el motor) para
  // calcular TWRR. Cualquier día con aportación tiene su retorno medido sobre
  // el valor pre-aportación, por lo que encadenarlos no inyecta capital nuevo
  // en la rentabilidad medida.
  const allDailyReturnsForTWRR = simulation.dailyReturns.map((r) => r.returnValue);

  const metrics = calculateMetrics(
    periodValues,                                  // valores del periodo para max drawdown
    volatilityReturns,                             // retornos limpios para volatilidad
    periodReturns.map((r) => r.returnValue),       // retornos del periodo para best/worst
    simulation.totalContributions,
    finalValue,
    years,
    displayGranularity,
    dailyInitialValue,
    allDailyReturnsForTWRR
  );

  // 6. Rentabilidades anuales, drawdowns, rolling returns
  const annualReturns = calculateAnnualReturns(timeSeries, dailyInitialValue);
  const drawdowns = calculateDrawdowns(timeSeries);
  const topDrawdowns = calculateTopDrawdowns(timeSeries, 10);
  const stressPeriods = calculateStressPeriods(timeSeries);

  // Rolling returns: usar la serie de output (mensual o trimestral tiene más sentido para rolling)
  const rollingReturns = calculateRollingReturns(timeSeries, displayGranularity);
  const rollingStats = calculateRollingStats(timeSeries, displayGranularity);
  const returnsHistogram = calculateReturnsHistogram(volatilityReturns, displayGranularity);

  // Composición de la cartera (agregación por categoría, asset class, tipo gestión)
  const allocation = calculatePortfolioAllocation(portfolio.holdings);

  // 7. Comisiones (usar activeHoldings para calcular TER solo de fondos con datos)
  const weightedTer = calculateWeightedTer(activeHoldings, fundTers);
  const portfolioType = determinePortfolioType(activeHoldings, fundTypes);

  // Plusvalía latente al final: cualquier cartera la tiene (mismo cálculo)
  // Para "fondos sin impuestos", finalCostBasis ≈ aportaciones totales,
  // por lo que la plusvalía latente captura TODA la ganancia (lógica fiscal
  // española de fondos: traspasos exentos, pero tributas al sacar al final).
  const unrealizedGain = Math.max(0, finalValue - simulation.finalCostBasis);

  // Impuestos pendientes con el MODO de la cartera (puede ser 0 si taxMode = none)
  let pendingTaxes = 0;
  if (unrealizedGain > 0) {
    if (taxMode === "spain-irpf") {
      pendingTaxes = spanishIrpfTax(unrealizedGain);
    } else if (taxMode === "flat" && taxRate > 0) {
      pendingTaxes = unrealizedGain * taxRate;
    }
  }

  const fees: FeesSummary = {
    totalFees: simulation.totalFeesPaid,
    feesAsPercentage: finalValue > 0 ? (simulation.totalFeesPaid / finalValue) * 100 : 0,
    weightedTer,
    managementFee: portfolio.managementFee,
    managementFeePaid: simulation.totalManagementFeePaid,
    taxMode: taxMode !== "none" ? taxMode : undefined,
    taxRate: taxMode === "flat" && taxRate > 0 ? taxRate : undefined,
    totalTaxesPaid: simulation.totalTaxesPaid > 0 ? simulation.totalTaxesPaid : undefined,
    pendingTaxes: pendingTaxes > 0 ? pendingTaxes : undefined,
    // Siempre exponer la plusvalía latente (la UI puede usarla para calcular
    // impuestos hipotéticos en comparaciones, p.ej. fondo vs ETF).
    unrealizedGain: unrealizedGain > 0 ? unrealizedGain : undefined,
  };

  return {
    portfolioName: portfolio.name,
    portfolioType,
    timeSeries,
    metrics,
    annualReturns,
    drawdowns,
    topDrawdowns,
    stressPeriods,
    rebalanceLog: simulation.rebalanceLog,
    rollingReturns,
    rollingStats,
    returnsHistogram,
    allocation,
    fees,
    initialAmount,
    totalContributions: simulation.totalContributions,
    finalValue,
    grossFinalValue,
    grossTimeSeries,
  };
}

// -----------------------------------------------------------------------------
// Simulación diaria de cartera
// -----------------------------------------------------------------------------

interface DailySimulationResult {
  dailyTimeSeries: Array<{ date: string; value: number }>;
  dailyReturns: Array<{ date: string; returnValue: number }>;
  totalFeesPaid: number;
  totalManagementFeePaid: number;
  totalContributions: number;
  totalTaxesPaid: number;
  /** Coste base remanente al final del backtest, para calcular impuestos pendientes */
  finalCostBasis: number;
  /** Log de cada evento de rebalanceo */
  rebalanceLog: RebalanceEvent[];
  /** Serie diaria del contrafactual BRUTO: la misma cartera, mismos flujos y
   *  mismos días de rebalanceo, pero SIN pagar impuestos. Captura el interés
   *  compuesto que los impuestos pagados habrían generado. Solo se construye
   *  cuando taxMode != "none". */
  grossDailyTimeSeries?: Array<{ date: string; value: number }>;
}

// Tax utilities (centralizado en lib/tax-utils.ts para que UI los pueda usar también)
import { spanishIrpfTax, type TaxMode } from "./tax-utils";

/**
 * Comprueba si alguna posición ha cruzado las bandas de rebalanceo:
 *   - Banda relativa: |peso_actual - peso_objetivo| / peso_objetivo > bandRel
 *   - Banda absoluta: |peso_actual - peso_objetivo| > bandAbs (en decimal)
 * Si cualquiera de las dos se cumple para CUALQUIER activo → toca rebalancear.
 * Si ambas bandas son 0/undefined → bandas desactivadas.
 */
function checkBandsBreached(
  positionValues: Map<string, number>,
  holdings: PortfolioHolding[],
  bandRelative: number,
  bandAbsolute: number
): boolean {
  if (bandRelative <= 0 && bandAbsolute <= 0) return false;
  const totalValue = sumPositions(positionValues);
  if (totalValue <= 0) return false;
  for (const holding of holdings) {
    const target = holding.weight / 100;
    const current = (positionValues.get(holding.fundId) ?? 0) / totalValue;
    const absDrift = Math.abs(current - target);
    if (bandAbsolute > 0 && absDrift > bandAbsolute) return true;
    if (bandRelative > 0 && target > 0 && absDrift / target > bandRelative) return true;
  }
  return false;
}

function simulatePortfolioDaily(
  holdings: PortfolioHolding[],
  fundPrices: Map<string, Map<string, number>>,
  fundTers: Map<string, number>,
  dates: string[],
  initialAmount: number,
  rebalanceFrequency: RebalanceFrequency,
  monthlyContribution: number,
  managementFee: number = 0,
  taxRate: number = 0,
  taxMode: TaxMode = "none",
  rebalanceBandRelative: number = 0,
  rebalanceBandAbsolute: number = 0,
  contributionRebalance: boolean = false
): DailySimulationResult {
  const dailyTimeSeries: Array<{ date: string; value: number }> = [];
  const dailyReturns: Array<{ date: string; returnValue: number }> = [];
  const rebalanceLog: RebalanceEvent[] = [];

  // Valor de cada posición (en EUR) y coste base por fondo (per-fund accounting)
  const positionValues = new Map<string, number>();
  const fundCostBasis = new Map<string, number>();
  // Lookup de nombres cortos por fundId, para el log
  const fundNames = new Map<string, string>();

  // Inicializar posiciones y cost basis según pesos
  for (const holding of holdings) {
    const value = (initialAmount * holding.weight) / 100;
    positionValues.set(holding.fundId, value);
    fundCostBasis.set(holding.fundId, value);
    const fund = getFundById(holding.fundId) || holding.fund;
    fundNames.set(holding.fundId, fund?.shortName ?? fund?.name ?? holding.fundId);
  }

  let totalContributions = initialAmount;
  let totalFeesPaid = 0;
  let totalManagementFeePaid = 0;
  let totalTaxesPaid = 0;
  // Plusvalía acumulada en el AÑO en curso (para tramos progresivos del IRPF).
  // Se resetea cada 1 de enero.
  let annualRealizedGain = 0;
  let currentYear = parseInt(dates[0]!.substring(0, 4), 10);

  // Tasas diarias
  const dailyMgmtRate = managementFee / TRADING_DAYS_PER_YEAR / 100;

  // --- Contrafactual BRUTO (solo si hay régimen fiscal) ---
  // Réplica exacta de las posiciones que vive la MISMA simulación (mismos
  // retornos, misma comisión de gestión, mismas aportaciones y mismos días de
  // rebalanceo) pero sin pagar impuestos. Así el "bruto" incluye el interés
  // compuesto que los impuestos pagados habrían generado — sumar de vuelta el
  // impuesto nominal infravaloraba el coste fiscal real.
  const trackGross = taxMode !== "none";
  const grossPositions = trackGross ? new Map(positionValues) : null;
  const grossCostBasis = trackGross ? new Map(fundCostBasis) : null;
  const grossDailyTimeSeries: Array<{ date: string; value: number }> | undefined =
    trackGross ? [] : undefined;

  // Registrar valor inicial
  const initialValue = sumPositions(positionValues);
  dailyTimeSeries.push({ date: dates[0]!, value: initialValue });
  if (grossDailyTimeSeries) grossDailyTimeSeries.push({ date: dates[0]!, value: initialValue });

  // Simular cada día a partir del segundo
  for (let i = 1; i < dates.length; i++) {
    const currentDate = dates[i]!;
    const previousDate = dates[i - 1]!;

    // Para cada posición, calcular el retorno diario
    for (const holding of holdings) {
      const prices = fundPrices.get(holding.fundId);
      const ter = fundTers.get(holding.fundId) ?? 0;
      const currentPositionValue = positionValues.get(holding.fundId) ?? 0;

      if (!prices || currentPositionValue === 0) continue;

      const currentPrice = prices.get(currentDate);
      const previousPrice = prices.get(previousDate);

      if (!currentPrice || !previousPrice || previousPrice === 0) continue;

      // Retorno del día (precios ya incluyen TER descontado en NAV/ETF)
      const dailyReturn = (currentPrice / previousPrice) - 1;

      // Estimar TER pagado (informativo)
      const dailyTerRate = ter / TRADING_DAYS_PER_YEAR / 100;
      totalFeesPaid += currentPositionValue * dailyTerRate;

      // Aplicar retorno
      positionValues.set(holding.fundId, currentPositionValue * (1 + dailyReturn));
      // Espejo bruto: mismo retorno sobre la posición contrafactual
      if (grossPositions) {
        const gv = grossPositions.get(holding.fundId) ?? 0;
        if (gv > 0) grossPositions.set(holding.fundId, gv * (1 + dailyReturn));
      }
    }

    // Comisión de gestión diaria
    if (dailyMgmtRate > 0) {
      for (const holding of holdings) {
        const currentValue = positionValues.get(holding.fundId) ?? 0;
        const mgmtFeeAmount = currentValue * dailyMgmtRate;
        totalManagementFeePaid += mgmtFeeAmount;
        positionValues.set(holding.fundId, currentValue - mgmtFeeAmount);
        // El bruto es "antes de IMPUESTOS", no antes de comisiones: la
        // comisión de gestión también se descuenta del contrafactual.
        if (grossPositions) {
          const gv = grossPositions.get(holding.fundId) ?? 0;
          grossPositions.set(holding.fundId, gv - gv * dailyMgmtRate);
        }
      }
    }

    // Aportación mensual: aplicar en el primer día hábil de cada nuevo mes
    if (monthlyContribution > 0 && isNewMonth(currentDate, previousDate)) {
      totalContributions += monthlyContribution;
      if (contributionRebalance) {
        // Rebalanceo con aportaciones: dirigir el dinero a los activos por
        // debajo del peso objetivo. Nunca se vende → cero plusvalías realizadas,
        // cero coste fiscal. Si la aportación no alcanza a cerrar todos los
        // gaps, el resto se reparte proporcional a los pesos objetivo.
        applyContributionRebalance(
          positionValues, fundCostBasis, holdings, monthlyContribution
        );
        // Espejo bruto: mismo algoritmo de aportación sobre el contrafactual
        if (grossPositions && grossCostBasis) {
          applyContributionRebalance(
            grossPositions, grossCostBasis, holdings, monthlyContribution
          );
        }
      } else {
        // Reparto clásico proporcional a los pesos objetivo
        for (const holding of holdings) {
          const currentValue = positionValues.get(holding.fundId) ?? 0;
          const contributionToPosition = (monthlyContribution * holding.weight) / 100;
          positionValues.set(holding.fundId, currentValue + contributionToPosition);
          fundCostBasis.set(holding.fundId, (fundCostBasis.get(holding.fundId) ?? 0) + contributionToPosition);
          if (grossPositions) {
            const gv = grossPositions.get(holding.fundId) ?? 0;
            grossPositions.set(holding.fundId, gv + contributionToPosition);
          }
        }
      }
    }

    // Reset de plusvalía anual al cruzar año natural (relevante para tramos IRPF)
    const yearNow = parseInt(currentDate.substring(0, 4), 10);
    if (yearNow !== currentYear) {
      annualRealizedGain = 0;
      currentYear = yearNow;
    }

    // Rebalanceo — semántica combinada de frecuencia + bandas:
    //   1) SIN bandas (relativa=0 y absoluta=0): rebalanceo periódico clásico,
    //      la frecuencia dice cuándo se rebalancea (siempre que toque).
    //   2) CON bandas activas (alguna > 0): la frecuencia indica cada cuánto se
    //      REVISAN las bandas. Si las bandas están rotas ese día, se rebalancea.
    //      Frecuencia "none" con bandas activas = revisar todos los días.
    //   3) "none" sin bandas = nunca rebalancear (buy and hold puro).
    const bandsActive = rebalanceBandRelative > 0 || rebalanceBandAbsolute > 0;
    let shouldRebalance = false;
    if (bandsActive) {
      // "none" + bandas = check daily; otra frecuencia + bandas = check periódico
      const isCheckDay = rebalanceFrequency === "none"
        ? true
        : shouldRebalanceByDate(currentDate, previousDate, rebalanceFrequency);
      if (isCheckDay) {
        shouldRebalance = checkBandsBreached(
          positionValues, holdings, rebalanceBandRelative, rebalanceBandAbsolute
        );
      }
    } else {
      // Sin bandas: rebalanceo periódico clásico
      shouldRebalance = shouldRebalanceByDate(currentDate, previousDate, rebalanceFrequency);
    }
    if (shouldRebalance) {
      const taxResult = rebalancePortfolioWithTax(
        positionValues, fundCostBasis, fundNames, holdings,
        taxMode, taxRate, annualRealizedGain
      );
      totalTaxesPaid += taxResult.taxPaid;
      annualRealizedGain = taxResult.newAnnualRealizedGain;
      if (taxResult.event) {
        rebalanceLog.push({ ...taxResult.event, date: currentDate });
      }
      // Espejo bruto: rebalancear a pesos objetivo SIN impuesto (el valor
      // total se conserva — solo cambia la distribución).
      if (grossPositions) {
        const gTotal = sumPositions(grossPositions);
        for (const holding of holdings) {
          grossPositions.set(holding.fundId, (gTotal * holding.weight) / 100);
        }
      }
    }

    // Registrar valor total
    const portfolioValue = sumPositions(positionValues);
    dailyTimeSeries.push({ date: currentDate, value: portfolioValue });
    if (grossDailyTimeSeries && grossPositions) {
      grossDailyTimeSeries.push({ date: currentDate, value: sumPositions(grossPositions) });
    }

    // Calcular retorno diario de la cartera (ajustado por aportaciones)
    const previousTotalValue = dailyTimeSeries[dailyTimeSeries.length - 2]?.value ?? 0;
    if (previousTotalValue > 0) {
      const adjustedPrevious = previousTotalValue +
        (monthlyContribution > 0 && isNewMonth(currentDate, previousDate) ? monthlyContribution : 0);
      const portReturn = (portfolioValue / adjustedPrevious) - 1;
      dailyReturns.push({ date: currentDate, returnValue: portReturn });
    }
  }

  // Coste base final = suma de los coste base por fondo
  const finalCostBasis = Array.from(fundCostBasis.values()).reduce((s, v) => s + v, 0);

  return {
    dailyTimeSeries,
    dailyReturns,
    totalFeesPaid,
    totalManagementFeePaid,
    totalContributions,
    totalTaxesPaid,
    finalCostBasis,
    rebalanceLog,
    grossDailyTimeSeries,
  };
}

// -----------------------------------------------------------------------------
// Utilidades de cartera
// -----------------------------------------------------------------------------

function rebalancePortfolio(
  positionValues: Map<string, number>,
  holdings: PortfolioHolding[]
): void {
  const totalValue = sumPositions(positionValues);
  if (totalValue === 0) return;

  for (const holding of holdings) {
    const targetValue = (totalValue * holding.weight) / 100;
    positionValues.set(holding.fundId, targetValue);
  }
}

/**
 * Rebalanceo con aportaciones ("cash-flow rebalancing").
 *
 * Aplica la aportación dirigiéndola PRIMERO a los activos por debajo del peso
 * objetivo (los "rezagados"). Beneficios:
 *   - Cero plusvalías realizadas (nunca vende) → cero impuestos
 *   - Cero comisiones de venta
 *   - Efecto "buy low" natural sobre los activos que han bajado
 *
 * Algoritmo:
 *   1. Calcular el target_i con el total POST-aportación.
 *   2. gap_i = max(0, target_i − current_i) para cada activo.
 *   3. Si Σ gap ≥ aportación: repartir proporcional a los gaps.
 *   4. Si Σ gap < aportación: cerrar todos los gaps y repartir el resto
 *      según pesos objetivo (proporcional clásico).
 *
 * El cost basis se actualiza con el dinero comprado (es contribución nueva,
 * no plusvalía, así que cb += compra).
 */
function applyContributionRebalance(
  positionValues: Map<string, number>,
  fundCostBasis: Map<string, number>,
  holdings: PortfolioHolding[],
  contribution: number
): void {
  if (contribution <= 0) return;
  const currentTotal = sumPositions(positionValues);
  const newTotal = currentTotal + contribution;

  // 1. Calcular gaps (cuánto le falta a cada activo para llegar a su target)
  const gaps = new Map<string, number>();
  let totalGap = 0;
  for (const h of holdings) {
    const target = (newTotal * h.weight) / 100;
    const current = positionValues.get(h.fundId) ?? 0;
    const gap = Math.max(0, target - current);
    gaps.set(h.fundId, gap);
    totalGap += gap;
  }

  let cashLeft = contribution;

  // 2. Cubrir los gaps de los activos rezagados (proporcional a su gap)
  if (totalGap > 0) {
    const toFillGaps = Math.min(cashLeft, totalGap);
    for (const h of holdings) {
      const gap = gaps.get(h.fundId) ?? 0;
      if (gap <= 0) continue;
      const portion = (gap / totalGap) * toFillGaps;
      const current = positionValues.get(h.fundId) ?? 0;
      const cb = fundCostBasis.get(h.fundId) ?? 0;
      positionValues.set(h.fundId, current + portion);
      fundCostBasis.set(h.fundId, cb + portion);
    }
    cashLeft -= toFillGaps;
  }

  // 3. Resto (si la aportación cubre todos los gaps): proporcional clásico
  if (cashLeft > 0.005) {
    for (const h of holdings) {
      const portion = (cashLeft * h.weight) / 100;
      if (portion <= 0) continue;
      const current = positionValues.get(h.fundId) ?? 0;
      const cb = fundCostBasis.get(h.fundId) ?? 0;
      positionValues.set(h.fundId, current + portion);
      fundCostBasis.set(h.fundId, cb + portion);
    }
  }
}

/**
 * Rebalanceo con cálculo de impuestos sobre plusvalías realizadas.
 *
 * Modelo simplificado pero correcto en agregado:
 *   1. Se calcula el "monto rebalanceado" (sum de |target - current| / 2),
 *      que equivale al dinero que se mueve entre fondos.
 *   2. Sobre ese monto se realiza una plusvalía proporcional al ratio
 *      ganancia/valor total: tax = monto × (gain/value) × tasa.
 *   3. El impuesto se deduce proporcionalmente de todas las posiciones,
 *      reduciendo el valor total de la cartera.
 *   4. Se aplican los pesos objetivo al nuevo total (post-impuesto).
 *   5. El coste base se ajusta al alza por el "step-up" en la parte
 *      rebalanceada (la ganancia tras pagar impuestos pasa a ser nuevo
 *      coste base reinvertido).
 *
 * Devuelve el impuesto pagado y el nuevo coste base total.
 */
/**
 * Rebalanceo con cost basis POR FONDO y tracking detallado de cada operación.
 *
 * Algoritmo:
 *  1. Identifica para cada fondo si toca vender (current > target) o comprar.
 *  2. Para cada venta: calcula plusvalía concreta usando el coste base de ESE fondo.
 *  3. Suma plusvalías totales y calcula impuesto (modo IRPF o tasa fija).
 *  4. Aplica ventas: reduce posición y reduce coste base del fondo proporcionalmente.
 *  5. Aplica compras escaladas al cash disponible tras impuestos.
 *  6. Devuelve el evento con detalle de cada operación.
 *
 * El cost basis por fondo es el método FIFO/promedio simplificado.
 */
function rebalancePortfolioWithTax(
  positionValues: Map<string, number>,
  fundCostBasis: Map<string, number>,
  fundNames: Map<string, string>,
  holdings: PortfolioHolding[],
  taxMode: TaxMode,
  flatRate: number,
  annualRealizedGain: number
): {
  taxPaid: number;
  newAnnualRealizedGain: number;
  event: Omit<RebalanceEvent, "date"> | null;
} {
  const totalValueBefore = sumPositions(positionValues);
  if (totalValueBefore === 0) {
    return { taxPaid: 0, newAnnualRealizedGain: annualRealizedGain, event: null };
  }

  // 1. Identificar sells y buys
  type Sell = { fundId: string; soldAmount: number; cbSold: number; gain: number };
  type Buy = { fundId: string; desiredAmount: number };
  const sells: Sell[] = [];
  const buys: Buy[] = [];
  let totalGainRealized = 0;

  for (const holding of holdings) {
    const current = positionValues.get(holding.fundId) ?? 0;
    const target = (totalValueBefore * holding.weight) / 100;
    if (Math.abs(current - target) < 0.01) continue; // sin cambio significativo

    if (current > target) {
      const soldAmount = current - target;
      const fraction = soldAmount / current;
      const cb = fundCostBasis.get(holding.fundId) ?? 0;
      const cbSold = cb * fraction;
      const gain = soldAmount - cbSold;
      sells.push({ fundId: holding.fundId, soldAmount, cbSold, gain });
      totalGainRealized += gain;
    } else {
      buys.push({ fundId: holding.fundId, desiredAmount: target - current });
    }
  }

  if (sells.length === 0 && buys.length === 0) {
    return { taxPaid: 0, newAnnualRealizedGain: annualRealizedGain, event: null };
  }

  const trades: RebalanceTrade[] = [];

  // -------------------------------------------------------------------------
  // CASO A: Sin impuestos (fondos con traspaso fiscal en España)
  // -------------------------------------------------------------------------
  // En un traspaso entre fondos, el coste base se PRESERVA: el dinero se
  // mueve del fondo origen al destino llevando consigo su cb original
  // (no hay step-up ni tributación). De este modo, al final del backtest la
  // plusvalía latente captura TODA la ganancia acumulada, lo que permite
  // calcular correctamente la fiscalidad pendiente al liquidar.
  if (taxMode === "none" || (taxMode === "flat" && flatRate <= 0)) {
    const totalCbSold = sells.reduce((s, sell) => s + sell.cbSold, 0);
    const totalBuyDesired = buys.reduce((s, b) => s + b.desiredAmount, 0);

    // Aplicar ventas: posición y cb bajan proporcionalmente
    let cashFromSales = 0;
    for (const sell of sells) {
      const currentPos = positionValues.get(sell.fundId) ?? 0;
      positionValues.set(sell.fundId, currentPos - sell.soldAmount);
      const currentCb = fundCostBasis.get(sell.fundId) ?? 0;
      fundCostBasis.set(sell.fundId, currentCb - sell.cbSold);
      cashFromSales += sell.soldAmount;
      trades.push({
        fundId: sell.fundId,
        fundName: fundNames.get(sell.fundId) ?? sell.fundId,
        action: "sell",
        amount: sell.soldAmount,
        gain: sell.gain,
        costBasisPortion: sell.cbSold,
      });
    }

    // Aplicar compras: heredar cb proporcionalmente al peso de la compra.
    // Así la suma global de cb se conserva (no step-up).
    if (totalBuyDesired > 0) {
      for (const buy of buys) {
        const buyShare = buy.desiredAmount / totalBuyDesired;
        const cbInherited = totalCbSold * buyShare;
        const currentPos = positionValues.get(buy.fundId) ?? 0;
        positionValues.set(buy.fundId, currentPos + buy.desiredAmount);
        const currentCb = fundCostBasis.get(buy.fundId) ?? 0;
        fundCostBasis.set(buy.fundId, currentCb + cbInherited);
        trades.push({
          fundId: buy.fundId,
          fundName: fundNames.get(buy.fundId) ?? buy.fundId,
          action: "buy",
          amount: buy.desiredAmount,
        });
      }
    }

    const event: Omit<RebalanceEvent, "date"> = {
      portfolioValueBefore: totalValueBefore,
      portfolioValueAfter: totalValueBefore, // sin impuesto, valor total intacto
      totalGain: totalGainRealized,
      taxPaid: 0,
      trades,
    };

    return {
      taxPaid: 0,
      // Sin tributación efectiva: no contribuye a la base anual del IRPF
      newAnnualRealizedGain: annualRealizedGain,
      event,
    };
  }

  // -------------------------------------------------------------------------
  // CASO B: Con impuestos (IRPF España o tasa fija)
  // -------------------------------------------------------------------------
  // 2. Calcular impuesto sobre plusvalía total
  let tax = 0;
  if (totalGainRealized > 0) {
    if (taxMode === "spain-irpf") {
      const taxAfter = spanishIrpfTax(annualRealizedGain + totalGainRealized);
      const taxBefore = spanishIrpfTax(annualRealizedGain);
      tax = taxAfter - taxBefore;
    } else {
      // flat con flatRate > 0
      tax = totalGainRealized * flatRate;
    }
  }

  // 3. Aplicar sells: actualizar position y coste base del fondo
  let cashFromSales = 0;
  for (const sell of sells) {
    const currentPos = positionValues.get(sell.fundId) ?? 0;
    const newPos = currentPos - sell.soldAmount;
    positionValues.set(sell.fundId, newPos);
    const currentCb = fundCostBasis.get(sell.fundId) ?? 0;
    fundCostBasis.set(sell.fundId, currentCb - sell.cbSold);
    cashFromSales += sell.soldAmount;
    trades.push({
      fundId: sell.fundId,
      fundName: fundNames.get(sell.fundId) ?? sell.fundId,
      action: "sell",
      amount: sell.soldAmount,
      gain: sell.gain,
      costBasisPortion: sell.cbSold,
    });
  }

  // 4. Aplicar buys: usar cash post-impuesto, escalar si hace falta
  const cashAfterTax = cashFromSales - tax;
  const totalBuyDesired = buys.reduce((s, b) => s + b.desiredAmount, 0);
  if (totalBuyDesired > 0) {
    const buyScale = cashAfterTax / totalBuyDesired;
    for (const buy of buys) {
      const actualBuy = buy.desiredAmount * buyScale;
      if (actualBuy <= 0) continue;
      const currentPos = positionValues.get(buy.fundId) ?? 0;
      positionValues.set(buy.fundId, currentPos + actualBuy);
      const currentCb = fundCostBasis.get(buy.fundId) ?? 0;
      fundCostBasis.set(buy.fundId, currentCb + actualBuy);
      trades.push({
        fundId: buy.fundId,
        fundName: fundNames.get(buy.fundId) ?? buy.fundId,
        action: "buy",
        amount: actualBuy,
      });
    }
  }

  const event: Omit<RebalanceEvent, "date"> = {
    portfolioValueBefore: totalValueBefore,
    portfolioValueAfter: totalValueBefore - tax,
    totalGain: totalGainRealized,
    taxPaid: tax,
    trades,
  };

  return {
    taxPaid: tax,
    newAnnualRealizedGain: annualRealizedGain + Math.max(0, totalGainRealized),
    event,
  };
}

function sumPositions(positionValues: Map<string, number>): number {
  let total = 0;
  for (const value of positionValues.values()) {
    total += value;
  }
  return total;
}

// -----------------------------------------------------------------------------
// Cálculo de métricas
// -----------------------------------------------------------------------------

/**
 * Periodos por año según la granularidad, para anualizar volatilidad.
 */
function calculateMetrics(
  periodValues: number[],
  volatilityReturns: number[],
  displayReturns: number[],
  totalContributions: number,
  finalValue: number,
  years: number,
  granularity: DisplayGranularity,
  dailyInitialValue?: number,
  contributionAdjustedDailyReturns?: number[]
): Metrics {
  // -------------------------------------------------------------------------
  // TWRR (Time-Weighted Rate of Return) — método correcto con aportaciones.
  // -------------------------------------------------------------------------
  // Encadenando los retornos diarios (que YA están ajustados por aportaciones
  // en la simulación), obtenemos la rentabilidad pura de la cartera SIN contar
  // las aportaciones como ganancia. Es la métrica estándar del sector de fondos
  // y la única comparable con un benchmark que no tiene aportaciones.
  //
  // Sin aportaciones: TWRR ≡ (Final/Inicial) − 1, idéntico al método antiguo.
  // Con aportaciones: el método antiguo INFLABA artificialmente la rentabilidad
  // porque dividía por la inversión inicial pero el numerador (finalValue)
  // incluía toda la liquidez aportada por el inversor durante el periodo.
  let totalReturn: number;
  if (contributionAdjustedDailyReturns && contributionAdjustedDailyReturns.length > 0) {
    let product = 1;
    for (const r of contributionAdjustedDailyReturns) product *= (1 + r);
    totalReturn = product - 1;
  } else {
    // Fallback: solo se usa si no llega el array de retornos
    const initialValue = dailyInitialValue ?? periodValues[0] ?? totalContributions;
    totalReturn = initialValue > 0 ? (finalValue / initialValue) - 1 : 0;
  }

  // CAGR derivado del TWRR (anualizando el retorno encadenado)
  const cagr = years > 0
    ? Math.pow(1 + totalReturn, 1 / years) - 1
    : 0;

  // Volatilidad: depende de la granularidad seleccionada
  // Diario: ×√252, Mensual: ×√12, Trimestral: ×√4
  // "Cuanto menos mires, menos sufrirás" — la volatilidad percibida baja con periodos más largos
  const periodsPerYear = granularity === "daily" ? TRADING_DAYS_PER_YEAR
    : granularity === "quarterly" ? 4
    : 12;
  const volatility = calculatePeriodVolatility(volatilityReturns, periodsPerYear);

  // Sharpe y Sortino
  const sharpe = volatility > 0 ? (cagr - RISK_FREE_RATE) / volatility : 0;
  const downsideDeviation = calculatePeriodDownsideDeviation(volatilityReturns, periodsPerYear);
  const sortino = downsideDeviation > 0 ? (cagr - RISK_FREE_RATE) / downsideDeviation : 0;

  // Max Drawdown: desde los valores del periodo seleccionado
  // En diario captura el peor día, en mensual el peor cierre de mes, etc.
  const maxDrawdown = calculateMaxDrawdown(periodValues);

  // Best/worst period
  const bestMonth = displayReturns.length > 0 ? Math.max(...displayReturns) : 0;
  const worstMonth = displayReturns.length > 0 ? Math.min(...displayReturns) : 0;

  const positiveMonths = displayReturns.filter((r) => r > 0).length;
  const positiveMonthsRatio = displayReturns.length > 0
    ? positiveMonths / displayReturns.length
    : 0;

  // Calmar Ratio = CAGR / |Max DD|
  const calmar = maxDrawdown < 0 ? cagr / Math.abs(maxDrawdown) : 0;

  // Distribución: skewness, kurtosis, VaR, CVaR
  const skewness = calculateSkewness(volatilityReturns);
  const excessKurtosis = calculateExcessKurtosis(volatilityReturns);
  const varHistorical = calculateHistoricalVaR(volatilityReturns, 0.05);
  const cvar = calculateCVaR(volatilityReturns, 0.05);

  return {
    totalReturn,
    cagr,
    volatility,
    sharpe,
    sortino,
    maxDrawdown,
    bestMonth,
    worstMonth,
    positiveMonthsRatio,
    calmar,
    skewness,
    excessKurtosis,
    varHistorical,
    cvar,
  };
}

/**
 * Skewness (asimetría) de la distribución de retornos.
 * 0 = simétrica (normal), <0 = cola izquierda larga (más pérdidas extremas que ganancias),
 * >0 = cola derecha larga.
 * Fórmula: Pearson's moment coefficient of skewness.
 */
function calculateSkewness(returns: number[]): number {
  const n = returns.length;
  if (n < 3) return 0;
  const mean = returns.reduce((sum, r) => sum + r, 0) / n;
  const sumSquared = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0);
  const variance = sumSquared / (n - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  const sumCubed = returns.reduce((sum, r) => sum + Math.pow((r - mean) / stdDev, 3), 0);
  // Corrección de muestra (Fisher-Pearson)
  return (n / ((n - 1) * (n - 2))) * sumCubed;
}

/**
 * Excess kurtosis (curtosis en exceso): kurtosis - 3.
 * 0 = distribución normal (mesocúrtica),
 * >0 = leptocúrtica (colas gordas, más eventos extremos que la normal),
 * <0 = platocúrtica (colas finas).
 */
function calculateExcessKurtosis(returns: number[]): number {
  const n = returns.length;
  if (n < 4) return 0;
  const mean = returns.reduce((sum, r) => sum + r, 0) / n;
  const sumSquared = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0);
  const variance = sumSquared / (n - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  const sumFourth = returns.reduce((sum, r) => sum + Math.pow((r - mean) / stdDev, 4), 0);
  // Corrección de muestra para excess kurtosis
  const factor1 = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
  const factor2 = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
  return factor1 * sumFourth - factor2;
}

/**
 * Value at Risk histórico al percentil (default 5%).
 * Devuelve el peor retorno del peor (alpha × 100)% de los periodos.
 * Ej: VaR 5% = -8% significa que el 5% de los meses peores tuvieron pérdida >= 8%.
 */
function calculateHistoricalVaR(returns: number[], alpha: number = 0.05): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(sorted.length * alpha) - 1);
  return sorted[idx] ?? 0;
}

/**
 * Conditional VaR / Expected Shortfall al percentil (default 5%).
 * Devuelve el retorno promedio del peor (alpha × 100)% de los periodos.
 * Más conservador que VaR: en vez del "umbral", la "pérdida media cuando se cruza ese umbral".
 */
function calculateCVaR(returns: number[], alpha: number = 0.05): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.max(1, Math.floor(sorted.length * alpha));
  const tail = sorted.slice(0, cutoff);
  if (tail.length === 0) return 0;
  return tail.reduce((sum, r) => sum + r, 0) / tail.length;
}

function calculateCAGR(initialValue: number, finalValue: number, years: number): number {
  if (initialValue <= 0 || years <= 0) return 0;
  return Math.pow(finalValue / initialValue, 1 / years) - 1;
}

/** Volatilidad anualizada desde retornos del periodo: std(period) × √(periodsPerYear) */
function calculatePeriodVolatility(returns: number[], periodsPerYear: number): number {
  if (returns.length < 2) return 0;

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const squaredDiffs = returns.map((r) => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  return stdDev * Math.sqrt(periodsPerYear);
}

/** Downside deviation anualizada desde retornos del periodo */
function calculatePeriodDownsideDeviation(returns: number[], periodsPerYear: number): number {
  if (returns.length < 2) return 0;

  const target = 0;
  const downsideReturns = returns
    .map((r) => Math.min(r - target, 0))
    .map((r) => r * r);

  // n-1 (corrección de Bessel) para ser consistente con la volatilidad,
  // skewness y kurtosis, que también usan el estimador muestral.
  const meanSquaredDownside = downsideReturns.reduce((sum, d) => sum + d, 0) / (returns.length - 1);
  const downsideStdDev = Math.sqrt(meanSquaredDownside);

  return downsideStdDev * Math.sqrt(periodsPerYear);
}

function calculateMaxDrawdown(values: number[]): number {
  if (values.length === 0) return 0;

  let maxDrawdown = 0;
  let peak = values[0] ?? 0;

  for (const value of values) {
    if (value > peak) peak = value;
    const drawdown = (value - peak) / peak;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  return maxDrawdown;
}

// -----------------------------------------------------------------------------
// Rentabilidades anuales
// -----------------------------------------------------------------------------

function calculateAnnualReturns(timeSeries: TimeSeriesPoint[], initialPortfolioValue?: number): AnnualReturn[] {
  if (timeSeries.length === 0) return [];

  const yearlyData = new Map<number, { start: number; end: number }>();

  for (const point of timeSeries) {
    const year = parseInt(point.date.substring(0, 4), 10);
    const existing = yearlyData.get(year);

    if (!existing) {
      yearlyData.set(year, { start: point.value, end: point.value });
    } else {
      existing.end = point.value;
    }
  }

  const returns: AnnualReturn[] = [];
  let previousYearEnd: number | null = null;
  const sortedYears = Array.from(yearlyData.keys()).sort((a, b) => a - b);

  for (const year of sortedYears) {
    const data = yearlyData.get(year);
    if (!data) continue;

    // Para el primer año: usar el valor inicial real (día 1, ej: 10.000€)
    // en vez del valor del primer periodo agregado (fin de enero, ej: ~10.200€)
    const startValue = previousYearEnd ?? initialPortfolioValue ?? data.start;
    const returnPct = startValue > 0 ? ((data.end - startValue) / startValue) * 100 : 0;
    returns.push({ year, returnPct });
    previousYearEnd = data.end;
  }

  return returns;
}

// -----------------------------------------------------------------------------
// Drawdowns
// -----------------------------------------------------------------------------

function calculateDrawdowns(timeSeries: TimeSeriesPoint[]): DrawdownPoint[] {
  if (timeSeries.length === 0) return [];

  const drawdowns: DrawdownPoint[] = [];
  let peak = timeSeries[0]?.value ?? 0;

  for (const point of timeSeries) {
    if (point.value > peak) peak = point.value;
    const drawdown = peak > 0 ? ((point.value - peak) / peak) * 100 : 0;
    drawdowns.push({ date: point.date, drawdown, exactDate: point.exactDate });
  }

  return drawdowns;
}

/**
 * Calcula métricas de comparación contra un benchmark:
 * alpha de Jensen, beta, tracking error, information ratio, R², up/down capture.
 *
 * Las métricas se calculan sobre la intersección de fechas comunes en
 * los retornos (timeSeries del periodo, por defecto mensual).
 */
function computeBenchmarkComparison(
  portfolioResult: BacktestResult,
  benchmarkResult: BacktestResult,
  benchmarkId: BenchmarkId,
  benchmarkName: string,
  granularity: DisplayGranularity
): BenchmarkComparison {
  const periodsPerYear = granularity === "daily" ? TRADING_DAYS_PER_YEAR
    : granularity === "quarterly" ? 4
    : 12;

  // Construir mapas de retornos por fecha desde las timeSeries
  const portReturns = timeSeriesToReturns(portfolioResult.timeSeries);
  const benchReturns = timeSeriesToReturns(benchmarkResult.timeSeries);

  // Intersección de fechas
  const commonDates = portReturns
    .map((r) => r.date)
    .filter((d) => benchReturns.some((br) => br.date === d));

  const portArr: number[] = [];
  const benchArr: number[] = [];
  for (const date of commonDates) {
    const p = portReturns.find((r) => r.date === date)?.value;
    const b = benchReturns.find((r) => r.date === date)?.value;
    if (p !== undefined && b !== undefined) {
      portArr.push(p);
      benchArr.push(b);
    }
  }

  if (portArr.length < 2) {
    return {
      benchmarkId,
      benchmarkName,
      alpha: 0,
      beta: 0,
      trackingError: 0,
      informationRatio: 0,
      correlation: 0,
      rSquared: 0,
      upCapture: 0,
      downCapture: 0,
      benchmarkTotalReturn: benchmarkResult.metrics.totalReturn,
      benchmarkCagr: benchmarkResult.metrics.cagr,
      benchmarkVolatility: benchmarkResult.metrics.volatility,
      benchmarkTimeSeries: benchmarkResult.timeSeries,
      benchmarkStressPeriods: benchmarkResult.stressPeriods,
      benchmarkMetrics: benchmarkResult.metrics,
      benchmarkFinalValue: benchmarkResult.finalValue,
      benchmarkTotalContributions: benchmarkResult.totalContributions,
      benchmarkFees: benchmarkResult.fees,
      benchmarkAnnualReturns: benchmarkResult.annualReturns,
      benchmarkDrawdowns: benchmarkResult.drawdowns,
      benchmarkTopDrawdowns: benchmarkResult.topDrawdowns,
      benchmarkRollingReturns: benchmarkResult.rollingReturns,
      benchmarkRollingStats: benchmarkResult.rollingStats,
      benchmarkReturnsHistogram: benchmarkResult.returnsHistogram,
      benchmarkAllocation: benchmarkResult.allocation,
    };
  }

  const portMean = portArr.reduce((s, v) => s + v, 0) / portArr.length;
  const benchMean = benchArr.reduce((s, v) => s + v, 0) / benchArr.length;

  // Covarianza y varianza del benchmark
  let covariance = 0;
  let benchVariance = 0;
  let portVariance = 0;
  for (let i = 0; i < portArr.length; i++) {
    const dp = portArr[i]! - portMean;
    const db = benchArr[i]! - benchMean;
    covariance += dp * db;
    benchVariance += db * db;
    portVariance += dp * dp;
  }
  covariance /= portArr.length - 1;
  benchVariance /= portArr.length - 1;
  portVariance /= portArr.length - 1;

  const beta = benchVariance > 0 ? covariance / benchVariance : 0;

  // Correlación de Pearson
  const portStd = Math.sqrt(portVariance);
  const benchStd = Math.sqrt(benchVariance);
  const correl = portStd > 0 && benchStd > 0
    ? covariance / (portStd * benchStd)
    : 0;
  const rSquared = correl * correl;

  // Alpha de Jensen anualizado:
  //   alpha = (CAGR_port - Rf) - beta × (CAGR_bench - Rf)
  const alpha =
    (portfolioResult.metrics.cagr - RISK_FREE_RATE) -
    beta * (benchmarkResult.metrics.cagr - RISK_FREE_RATE);

  // Tracking error anualizado: std(port - bench) × √periodsPerYear
  const diffs = portArr.map((v, i) => v - benchArr[i]!);
  const diffMean = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  const diffVar = diffs.reduce((s, v) => s + Math.pow(v - diffMean, 2), 0) / (diffs.length - 1);
  const trackingError = Math.sqrt(diffVar) * Math.sqrt(periodsPerYear);

  // Information Ratio = (CAGR_port - CAGR_bench) / Tracking Error
  const informationRatio = trackingError > 0
    ? (portfolioResult.metrics.cagr - benchmarkResult.metrics.cagr) / trackingError
    : 0;

  // Up/Down capture ratios
  let upPort = 0, upBench = 0, downPort = 0, downBench = 0;
  let upCount = 0, downCount = 0;
  for (let i = 0; i < portArr.length; i++) {
    if (benchArr[i]! > 0) {
      upPort += portArr[i]!;
      upBench += benchArr[i]!;
      upCount++;
    } else if (benchArr[i]! < 0) {
      downPort += portArr[i]!;
      downBench += benchArr[i]!;
      downCount++;
    }
  }
  // Capture ratio = retorno medio cartera / retorno medio benchmark cuando benchmark va en ese sentido.
  // Nota: usa media ARITMÉTICA (suma de retornos), no encadenado geométrico — es la
  // convención más extendida (Morningstar usa geométrica); la diferencia es pequeña
  // en retornos mensuales y se asume como aproximación deliberada.
  const upCapture = upCount > 0 && upBench !== 0
    ? (upPort / upCount) / (upBench / upCount)
    : 0;
  const downCapture = downCount > 0 && downBench !== 0
    ? (downPort / downCount) / (downBench / downCount)
    : 0;

  return {
    benchmarkId,
    benchmarkName,
    alpha,
    beta,
    trackingError,
    informationRatio,
    correlation: correl,
    rSquared,
    upCapture,
    downCapture,
    benchmarkTotalReturn: benchmarkResult.metrics.totalReturn,
    benchmarkCagr: benchmarkResult.metrics.cagr,
    benchmarkVolatility: benchmarkResult.metrics.volatility,
    benchmarkTimeSeries: benchmarkResult.timeSeries,
    benchmarkStressPeriods: benchmarkResult.stressPeriods,
    benchmarkMetrics: benchmarkResult.metrics,
    benchmarkFinalValue: benchmarkResult.finalValue,
    benchmarkTotalContributions: benchmarkResult.totalContributions,
    benchmarkFees: benchmarkResult.fees,
    // Series completas para pintar el benchmark como 3ª columna/serie en
    // toda la comparativa (ya están calculadas; aquí solo se reenvían).
    benchmarkAnnualReturns: benchmarkResult.annualReturns,
    benchmarkDrawdowns: benchmarkResult.drawdowns,
    benchmarkTopDrawdowns: benchmarkResult.topDrawdowns,
    benchmarkRollingReturns: benchmarkResult.rollingReturns,
    benchmarkRollingStats: benchmarkResult.rollingStats,
    benchmarkReturnsHistogram: benchmarkResult.returnsHistogram,
    benchmarkAllocation: benchmarkResult.allocation,
  };
}

/**
 * Convierte una serie temporal en una serie de retornos por periodo.
 */
function timeSeriesToReturns(timeSeries: TimeSeriesPoint[]): Array<{ date: string; value: number }> {
  const returns: Array<{ date: string; value: number }> = [];
  for (let i = 1; i < timeSeries.length; i++) {
    const prev = timeSeries[i - 1]!;
    const curr = timeSeries[i]!;
    // Guard prev.value > 0: si una cartera colapsara a 0 (caso extremo), el
    // retorno de ese tramo se omite en vez de dividir por cero. Implica que
    // las series de cartera y benchmark podrían desalinearse en ese escenario
    // teórico; aceptado como caso límite no alcanzable con carteras normales.
    if (prev.value > 0) {
      returns.push({ date: curr.date, value: (curr.value - prev.value) / prev.value });
    }
  }
  return returns;
}

/**
 * Periodos históricos de estrés predefinidos para análisis.
 * Definidos con margen para capturar el inicio del estrés y el valle.
 */
const STRESS_PERIODS: Array<{ id: string; name: string; description: string; start: string; end: string }> = [
  {
    id: "gfc",
    name: "Crisis financiera global (GFC)",
    description: "Quiebra de Lehman Brothers, crisis subprime, contracción global.",
    start: "2007-11",
    end: "2009-03",
  },
  {
    id: "eurozone",
    name: "Crisis del euro",
    description: "Rescates de Grecia, Portugal, Irlanda. Dudas sobre la supervivencia del euro.",
    start: "2011-05",
    end: "2012-07",
  },
  {
    id: "china-oil",
    name: "China + petróleo",
    description: "Devaluación del yuan, colapso del precio del petróleo (Brent <30$).",
    start: "2015-06",
    end: "2016-02",
  },
  {
    id: "q4-2018",
    name: "Selloff Q4 2018",
    description: "Fed sube tipos, miedo a recesión y guerra comercial USA-China.",
    start: "2018-10",
    end: "2018-12",
  },
  {
    id: "covid",
    name: "COVID-19",
    description: "Confinamiento global, mayor caída mensual en décadas.",
    start: "2020-02",
    end: "2020-03",
  },
  {
    id: "inflation-2022",
    name: "Inflación y subida de tipos 2022",
    description: "Crisis energética, BCE y Fed agresivos. Bonos y bolsa caen a la vez.",
    start: "2022-01",
    end: "2022-10",
  },
];

/**
 * Calcula la rentabilidad y máximo drawdown de la cartera durante
 * cada uno de los periodos históricos de estrés predefinidos.
 *
 * Si el periodo cae fuera del rango de datos, devuelve null para
 * los valores pero mantiene la entrada (para que el usuario vea
 * qué crisis NO están cubiertas por su backtest).
 */
function calculateStressPeriods(timeSeries: TimeSeriesPoint[]): StressPeriodResult[] {
  if (timeSeries.length === 0) {
    return STRESS_PERIODS.map((p) => ({
      ...p,
      totalReturn: null,
      maxDrawdown: null,
      hasFullData: false,
    }));
  }

  const seriesStart = timeSeries[0]!.date;
  const seriesEnd = timeSeries[timeSeries.length - 1]!.date;

  return STRESS_PERIODS.map((period) => {
    // Filtrar puntos dentro del periodo de estrés. Normalizamos a YYYY-MM
    // antes de comparar: si la serie viniera en diario (YYYY-MM-DD, posible
    // vía API), la comparación lexicográfica "2009-03-15" <= "2009-03"
    // excluiría todo el mes final del periodo.
    const pointsInPeriod = timeSeries.filter((p) => {
      const month = p.date.substring(0, 7);
      return month >= period.start && month <= period.end;
    });

    // Verificar cobertura: el inicio del periodo debe estar dentro de la serie
    const startCovered = period.start >= seriesStart;
    const endCovered = period.end <= seriesEnd;
    const hasFullData = startCovered && endCovered && pointsInPeriod.length >= 2;

    if (pointsInPeriod.length < 2) {
      return {
        ...period,
        totalReturn: null,
        maxDrawdown: null,
        hasFullData: false,
      };
    }

    // Rentabilidad total del periodo (valor final / valor inicial - 1)
    const startValue = pointsInPeriod[0]!.value;
    const endValue = pointsInPeriod[pointsInPeriod.length - 1]!.value;
    const totalReturn = startValue > 0 ? (endValue - startValue) / startValue : 0;

    // Máximo drawdown durante el periodo
    const values = pointsInPeriod.map((p) => p.value);
    const maxDrawdown = calculateMaxDrawdown(values);

    return {
      ...period,
      totalReturn,
      maxDrawdown,
      hasFullData,
    };
  });
}

/**
 * Identifica episodios completos de drawdown (peak → trough → recovery)
 * y devuelve los top N ordenados por magnitud (más negativo primero).
 *
 * Un episodio nace cuando el valor cae por debajo del pico anterior y
 * termina cuando se vuelve a alcanzar el pico (o al final de la serie).
 */
function calculateTopDrawdowns(
  timeSeries: TimeSeriesPoint[],
  topN: number = 10
): DrawdownEpisode[] {
  if (timeSeries.length < 2) return [];

  // Helper: diferencia en meses entre dos fechas YYYY-MM o YYYY-MM-DD
  const monthsBetween = (start: string, end: string): number => {
    const s = new Date(start.length === 7 ? `${start}-01` : start);
    const e = new Date(end.length === 7 ? `${end}-01` : end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    return (
      (e.getFullYear() - s.getFullYear()) * 12 +
      (e.getMonth() - s.getMonth())
    );
  };

  const episodes: DrawdownEpisode[] = [];
  const first = timeSeries[0]!;
  let peak = first.value;
  let peakDate = first.date;
  let peakExactDate = first.exactDate;
  let currentTrough = peak;
  let currentTroughDate = peakDate;
  let currentTroughExactDate = peakExactDate;
  let inDrawdown = false;

  for (let i = 1; i < timeSeries.length; i++) {
    const point = timeSeries[i]!;
    const value = point.value;

    if (value >= peak) {
      // Recuperación o nuevo pico
      if (inDrawdown) {
        const ddPct = peak > 0 ? (currentTrough - peak) / peak : 0;
        episodes.push({
          peakDate,
          peakExactDate,
          troughDate: currentTroughDate,
          troughExactDate: currentTroughExactDate,
          recoveryDate: point.date,
          recoveryExactDate: point.exactDate,
          drawdownPct: ddPct,
          lengthMonths: monthsBetween(peakDate, currentTroughDate),
          recoveryMonths: monthsBetween(currentTroughDate, point.date),
          underwaterMonths: monthsBetween(peakDate, point.date),
        });
        inDrawdown = false;
      }
      peak = value;
      peakDate = point.date;
      peakExactDate = point.exactDate;
      currentTrough = value;
      currentTroughDate = point.date;
      currentTroughExactDate = point.exactDate;
    } else {
      // En drawdown — actualizar valle si profundizamos
      inDrawdown = true;
      if (value < currentTrough) {
        currentTrough = value;
        currentTroughDate = point.date;
        currentTroughExactDate = point.exactDate;
      }
    }
  }

  // Si la serie termina en drawdown, registrar como "no recuperado"
  if (inDrawdown) {
    const ddPct = peak > 0 ? (currentTrough - peak) / peak : 0;
    const lastPoint = timeSeries[timeSeries.length - 1]!;
    episodes.push({
      peakDate,
      peakExactDate,
      troughDate: currentTroughDate,
      troughExactDate: currentTroughExactDate,
      recoveryDate: null,
      recoveryExactDate: undefined,
      drawdownPct: ddPct,
      lengthMonths: monthsBetween(peakDate, currentTroughDate),
      recoveryMonths: null,
      underwaterMonths: monthsBetween(peakDate, lastPoint.date),
    });
  }

  // Ordenar por magnitud (más negativo primero) y devolver top N
  episodes.sort((a, b) => a.drawdownPct - b.drawdownPct);
  return episodes.slice(0, topN);
}

// -----------------------------------------------------------------------------
// Rolling Returns
// -----------------------------------------------------------------------------

function calculateRollingReturns(timeSeries: TimeSeriesPoint[], granularity: DisplayGranularity): RollingReturns {
  // Convertir periodos a número de puntos según granularidad
  const pointsPerYear = granularity === "daily" ? TRADING_DAYS_PER_YEAR
    : granularity === "quarterly" ? 4
    : 12;

  return {
    oneYear: calculateRollingReturnSeries(timeSeries, Math.round(pointsPerYear), 1),
    threeYear: calculateRollingReturnSeries(timeSeries, Math.round(pointsPerYear * 3), 3),
    fiveYear: calculateRollingReturnSeries(timeSeries, Math.round(pointsPerYear * 5), 5),
  };
}

function calculateRollingReturnSeries(
  timeSeries: TimeSeriesPoint[],
  periods: number,
  years: number
): Array<{ date: string; value: number; exactDate?: string }> {
  const result: Array<{ date: string; value: number; exactDate?: string }> = [];

  if (timeSeries.length < periods + 1) return result;

  for (let i = periods; i < timeSeries.length; i++) {
    const endPoint = timeSeries[i];
    const startPoint = timeSeries[i - periods];

    if (!endPoint || !startPoint) continue;

    const startValue = startPoint.value;
    const endValue = endPoint.value;

    if (startValue > 0) {
      // Anualizar con la duración REAL de la ventana (días de calendario),
      // no con los años nominales: si hay huecos de datos, una ventana de
      // 12 puntos puede abarcar 11 o 13 meses reales y el divisor fijo
      // sesgaría el retorno anualizado.
      const startDate = new Date(startPoint.exactDate || `${startPoint.date}-01`);
      const endDate = new Date(endPoint.exactDate || `${endPoint.date}-01`);
      const actualDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const actualYears = actualDays > 0 ? actualDays / 365.25 : years;
      const annualizedReturn = Math.pow(endValue / startValue, 1 / actualYears) - 1;
      result.push({ date: endPoint.date, value: annualizedReturn, exactDate: endPoint.exactDate });
    }
  }

  return result;
}

/**
 * Calcula estadísticos resumidos (best/worst/avg/median) para ventanas
 * rolling de 1, 3, 5 y 10 años.
 */
function calculateRollingStats(
  timeSeries: TimeSeriesPoint[],
  granularity: DisplayGranularity
): RollingStats {
  const pointsPerYear = granularity === "daily" ? TRADING_DAYS_PER_YEAR
    : granularity === "quarterly" ? 4
    : 12;

  const buildBucket = (years: number, label: string): RollingStatsBucket => {
    const series = calculateRollingReturnSeries(
      timeSeries,
      Math.round(pointsPerYear * years),
      years
    );
    if (series.length === 0) {
      return {
        label,
        years,
        count: 0,
        bestCagr: 0,
        bestEndDate: null,
        worstCagr: 0,
        worstEndDate: null,
        avgCagr: 0,
        medianCagr: 0,
        positiveRatio: 0,
      };
    }

    const values = series.map((p) => p.value);
    const sorted = [...values].sort((a, b) => a - b);

    let best = -Infinity;
    let worst = Infinity;
    let bestEnd: string | null = null;
    let worstEnd: string | null = null;
    for (const p of series) {
      if (p.value > best) {
        best = p.value;
        bestEnd = p.exactDate || p.date;
      }
      if (p.value < worst) {
        worst = p.value;
        worstEnd = p.exactDate || p.date;
      }
    }

    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
      : sorted[Math.floor(sorted.length / 2)]!;
    const positives = values.filter((v) => v >= 0).length;

    return {
      label,
      years,
      count: values.length,
      bestCagr: best,
      bestEndDate: bestEnd,
      worstCagr: worst,
      worstEndDate: worstEnd,
      avgCagr: avg,
      medianCagr: median,
      positiveRatio: positives / values.length,
    };
  };

  return {
    oneYear: buildBucket(1, "1 año"),
    threeYear: buildBucket(3, "3 años"),
    fiveYear: buildBucket(5, "5 años"),
    tenYear: buildBucket(10, "10 años"),
  };
}

/**
 * Calcula la composición de la cartera agregando los pesos de los fondos
 * por: categoría detallada (RV Global, RF EUR Gov…), familia (RV / RF /
 * Oro / Alt), y tipo de gestión (index / active).
 *
 * Se basa en `holdings` (lo que el usuario configuró), no en `activeHoldings`,
 * para que la composición refleje la cartera diseñada aunque algún fondo no
 * tenga datos suficientes en el periodo seleccionado.
 */
function calculatePortfolioAllocation(holdings: PortfolioHolding[]): PortfolioAllocation {
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  if (totalWeight === 0) {
    return { byCategory: [], byAssetClass: [], byManagement: [] };
  }

  type Bucket = { weight: number; fundShortNames: string[] };
  const byCategoryMap = new Map<string, Bucket>();
  const byAssetClassMap = new Map<string, Bucket>();
  const byManagementMap = new Map<string, Bucket>();

  // Mapeo categoría → familia
  const familyOf = (category: string | undefined): string => {
    if (!category) return "Otros"; // p.ej. estrategias de momentum (sin categoría)
    if (category === "Oro") return "Oro";
    if (category === "Alternativo") return "Alternativos";
    if (category.startsWith("RV")) return "Renta Variable";
    if (category.startsWith("RF")) return "Renta Fija";
    return "Otros";
  };

  for (const holding of holdings) {
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) continue;
    const w = holding.weight / 100; // a decimal
    const shortName = fund.shortName ?? fund.name ?? holding.fundId;
    const cat = fund.category ?? "Sin categoría";

    // Por categoría detallada
    const catEntry = byCategoryMap.get(cat) ?? { weight: 0, fundShortNames: [] };
    catEntry.weight += w;
    catEntry.fundShortNames.push(shortName);
    byCategoryMap.set(cat, catEntry);

    // Por familia (asset class)
    const family = familyOf(cat);
    const famEntry = byAssetClassMap.get(family) ?? { weight: 0, fundShortNames: [] };
    famEntry.weight += w;
    famEntry.fundShortNames.push(shortName);
    byAssetClassMap.set(family, famEntry);

    // Por tipo de gestión
    const mgmtLabel = fund.type === "active" ? "Gestión activa" : "Indexada";
    const mgmtEntry = byManagementMap.get(mgmtLabel) ?? { weight: 0, fundShortNames: [] };
    mgmtEntry.weight += w;
    mgmtEntry.fundShortNames.push(shortName);
    byManagementMap.set(mgmtLabel, mgmtEntry);
  }

  const toSortedSlices = (map: Map<string, Bucket>): AllocationSlice[] =>
    Array.from(map.entries())
      .map(([label, b]) => ({ label, weight: b.weight, fundShortNames: b.fundShortNames }))
      .sort((a, b) => b.weight - a.weight);

  return {
    byCategory: toSortedSlices(byCategoryMap),
    byAssetClass: toSortedSlices(byAssetClassMap),
    byManagement: toSortedSlices(byManagementMap),
  };
}

/**
 * Calcula el histograma de la distribución de retornos del periodo
 * seleccionado y la frecuencia esperada según una distribución normal
 * con la misma media y desviación estándar.
 *
 * Útil para visualizar gráficamente la asimetría (skewness) y el
 * exceso de curtosis (colas gordas) que se muestran como números en
 * la tabla de métricas.
 */
function calculateReturnsHistogram(
  returns: number[],
  granularity: DisplayGranularity
): ReturnsHistogram {
  const periodLabel = granularity === "daily" ? "día"
    : granularity === "quarterly" ? "trimestre"
    : "mes";

  if (returns.length < 5) {
    return {
      periodLabel,
      bins: [],
      mean: 0,
      stdDev: 0,
      totalCount: returns.length,
    };
  }

  // Mean y std de la muestra
  const n = returns.length;
  const mean = returns.reduce((s, v) => s + v, 0) / n;
  const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return { periodLabel, bins: [], mean, stdDev, totalCount: n };
  }

  // Determinar rango y número de bins (regla de Sturges + buffer simétrico)
  const minVal = Math.min(...returns);
  const maxVal = Math.max(...returns);
  // Centrar el histograma en la media, con ±4σ de rango y bins más finos
  const rangeHalf = Math.max(Math.abs(minVal - mean), Math.abs(maxVal - mean), 3 * stdDev);
  const binCount = Math.min(25, Math.max(10, Math.ceil(Math.sqrt(n))));
  const binWidth = (2 * rangeHalf) / binCount;
  const histStart = mean - rangeHalf;

  // Inicializar bins
  const bins = Array.from({ length: binCount }, (_, i) => ({
    binStart: histStart + i * binWidth,
    binEnd: histStart + (i + 1) * binWidth,
    binMid: histStart + (i + 0.5) * binWidth,
    count: 0,
    normalExpected: 0,
  }));

  // Asignar retornos a bins
  for (const r of returns) {
    let idx = Math.floor((r - histStart) / binWidth);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    bins[idx]!.count++;
  }

  // Calcular frecuencia esperada según normal(mean, stdDev) para cada bin
  // Usando CDF de la normal estándar (aproximación de Abramowitz-Stegun)
  const normalCdf = (x: number): number => {
    const z = (x - mean) / stdDev;
    // Aproximación: erf(z/√2) usando serie
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804 * Math.exp(-z * z / 2);
    let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    if (z > 0) prob = 1 - prob;
    return prob;
  };

  for (const bin of bins) {
    const pBin = normalCdf(bin.binEnd) - normalCdf(bin.binStart);
    bin.normalExpected = pBin * n;
  }

  return {
    periodLabel,
    bins,
    mean,
    stdDev,
    totalCount: n,
  };
}

// -----------------------------------------------------------------------------
// Rango de fechas
// -----------------------------------------------------------------------------

function findCommonDailyDateRange(
  fundPrices: Map<string, Map<string, number>>,
  requestedStart: string,
  requestedEnd: string
): { commonDates: string[]; intersectionDates: Set<string>; startDay: string; endDay: string } {
  if (fundPrices.size === 0) {
    return { commonDates: [], intersectionDates: new Set(), startDay: "", endDay: "" };
  }

  // Recopilar fechas originales de cada fondo (antes de forward-fill)
  const originalDateSets: Set<string>[] = [];
  const allDatesSet = new Set<string>();
  for (const prices of fundPrices.values()) {
    const fundDates = new Set(prices.keys());
    originalDateSets.push(fundDates);
    for (const date of fundDates) {
      allDatesSet.add(date);
    }
  }

  // Filtrar por rango solicitado
  const startPrefix = requestedStart.substring(0, 7); // YYYY-MM
  const endPrefix = requestedEnd.substring(0, 7);

  let sortedDates = Array.from(allDatesSet).sort();

  sortedDates = sortedDates.filter((date) => {
    const month = date.substring(0, 7);
    return month >= startPrefix && month <= endPrefix;
  });

  // Solo incluir fechas desde el primer día en que TODOS los fondos tienen al menos un dato
  const fundFirstDates: string[] = [];
  for (const prices of fundPrices.values()) {
    const dates = Array.from(prices.keys()).sort();
    if (dates[0]) fundFirstDates.push(dates[0]);
  }
  const latestFirstDate = fundFirstDates.sort().pop() ?? "";

  if (latestFirstDate) {
    sortedDates = sortedDates.filter((date) => date >= latestFirstDate);
  }

  // Calcular intersección: fechas donde TODOS los fondos tienen cotización real
  // (no forward-filled). Se usa para calcular volatilidad sin artefactos.
  const intersectionDates = new Set<string>();
  for (const date of sortedDates) {
    let allHaveData = true;
    for (const fundDates of originalDateSets) {
      if (!fundDates.has(date)) {
        allHaveData = false;
        break;
      }
    }
    if (allHaveData) intersectionDates.add(date);
  }

  // Forward-fill: rellenar precios faltantes con el último precio conocido
  for (const [, prices] of fundPrices) {
    let lastKnownPrice: number | undefined;
    for (const date of sortedDates) {
      const price = prices.get(date);
      if (price !== undefined) {
        lastKnownPrice = price;
      } else if (lastKnownPrice !== undefined) {
        prices.set(date, lastKnownPrice);
      }
    }
  }

  console.log(`[BacktestEngine] Fechas: ${sortedDates.length} union, ${intersectionDates.size} intersección (${((intersectionDates.size / sortedDates.length) * 100).toFixed(1)}%)`);

  return {
    commonDates: sortedDates,
    intersectionDates,
    startDay: sortedDates[0] ?? "",
    endDay: sortedDates[sortedDates.length - 1] ?? "",
  };
}

async function findCommonDateRangeForPortfolios(
  portfolioA: Portfolio | null,
  portfolioB: Portfolio | null,
  requestedStart: string,
  requestedEnd: string,
  benchmarkHoldings?: PortfolioHolding[]
): Promise<{ startDate: string; endDate: string } | null> {
  console.log("[BacktestEngine] Buscando rango común...");

  // Incluimos los holdings del benchmark (si se ha seleccionado) en la
  // intersección, para que el rango común también respete su histórico.
  // Las carteras son opcionales: puede haber una sola cartera + benchmark.
  const allHoldings = [
    ...(portfolioA?.holdings ?? []),
    ...(portfolioB?.holdings ?? []),
    ...(benchmarkHoldings ?? []),
  ];
  const allDateSets: Set<string>[] = [];
  // Fechas mínimas DERIVADAS — para holdings que no son fondos reales sino
  // estrategias dinámicas (momentum), no podemos pedir sus precios (no existen
  // aún). En su lugar, calculamos manualmente la primera fecha en que la
  // estrategia podría producir señal: latest first date entre sus activos
  // subyacentes + el lookback necesario.
  const derivedFirstDates: string[] = [];

  for (const holding of allHoldings) {
    // === RAMA 1: Holding de momentum dinámico ===
    if (holding.momentumConfig) {
      const cfg = holding.momentumConfig;
      try {
        // Fetch prices de TODOS los activos del universo del momentum en
        // paralelo; el momentum sólo puede arrancar cuando todos tienen
        // dato y ha pasado el lookback completo.
        const assetFirstDates: string[] = [];
        const assetPriceFetches = await Promise.allSettled(
          cfg.assets.map(async (a) => {
            const innerFund = a.fundId ? getFundById(a.fundId) : undefined;
            const { prices } = await getDailyPrices(
              innerFund?.id ?? a.ticker,
              innerFund?.ticker ?? a.ticker,
              innerFund?.isin
            );
            return prices;
          })
        );
        for (const res of assetPriceFetches) {
          if (res.status !== "fulfilled") continue;
          const dates = Array.from(res.value.keys()).sort();
          if (dates[0]) assetFirstDates.push(dates[0]);
        }
        if (assetFirstDates.length === 0) continue;
        // La señal necesita: lookback meses de histórico + (1 mes si
        // excludePreviousMonth) + (1 mes extra si trade execution = nextClose
        // porque en ese modo el primer punto de equity se data al firstClose
        // del mes siguiente). Sumamos esos meses al "latest first" de los
        // activos para obtener la primera fecha viable del momentum.
        // Con allowPartialUniverse (universo evolutivo), la estrategia arranca
        // cuando hay ≥2 activos con datos → usamos el SEGUNDO más antiguo,
        // coherente con el rango que calculará el propio motor momentum.
        const sortedFirsts = assetFirstDates.sort();
        const anchorFirst = cfg.allowPartialUniverse
          ? (sortedFirsts[1] ?? sortedFirsts[0]!)
          : sortedFirsts[sortedFirsts.length - 1]!;
        const minMonthsNeeded =
          cfg.lookbackMonths +
          (cfg.excludePreviousMonth ? 1 : 0) +
          ((cfg.tradeExecution ?? "lastClose") === "nextClose" ? 1 : 0);
        const firstViable = new Date(anchorFirst);
        firstViable.setUTCMonth(firstViable.getUTCMonth() + minMonthsNeeded);
        const firstViableStr = firstViable.toISOString().substring(0, 10);
        derivedFirstDates.push(firstViableStr);
        console.log(
          `[BacktestEngine] Momentum holding ${holding.fundId}: primer dato viable ≈ ${firstViableStr} (assets desde ${anchorFirst} + ${minMonthsNeeded}m lookback${cfg.allowPartialUniverse ? ", universo evolutivo" : ""})`
        );
      } catch (error) {
        console.error(
          `[BacktestEngine] Error calculando rango para momentum ${holding.fundId}:`,
          error
        );
      }
      continue;
    }

    // === RAMA 2: Fondo normal ===
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) continue;

    try {
      const { prices } = await getDailyPrices(holding.fundId, fund.ticker, fund.isin);
      if (prices.size > 0) {
        allDateSets.push(new Set(prices.keys()));
        console.log(`[BacktestEngine] ${fund.shortName}: ${prices.size} días disponibles`);
      }
    } catch (error) {
      console.error(`[BacktestEngine] Error obteniendo fechas para ${holding.fundId}:`, error);
    }
  }

  if (allDateSets.length === 0 && derivedFirstDates.length === 0) return null;

  // Unión de todas las fechas (forward fill cubrirá huecos en la simulación)
  const allDatesUnion = new Set<string>();
  for (const dateSet of allDateSets) {
    for (const date of dateSet) {
      allDatesUnion.add(date);
    }
  }

  // Solo desde el día en que TODOS los holdings tienen dato disponible.
  // Para fondos normales: primer día de su serie de precios.
  // Para momentum dinámico: primera fecha en que la estrategia produce señal
  // (latest first de sus activos + lookback meses).
  const fundFirstDates: string[] = [];
  for (const dateSet of allDateSets) {
    const sorted = Array.from(dateSet).sort();
    if (sorted[0]) fundFirstDates.push(sorted[0]);
  }
  // Combinar con las fechas derivadas de momentum holdings.
  const allFirstDates = [...fundFirstDates, ...derivedFirstDates];
  const latestFirstDate = allFirstDates.sort().pop() ?? "";

  const startPrefix = requestedStart.substring(0, 7);
  const endPrefix = requestedEnd.substring(0, 7);

  const sortedDates = Array.from(allDatesUnion)
    .sort()
    .filter((date) => {
      const month = date.substring(0, 7);
      return month >= startPrefix && month <= endPrefix && date >= latestFirstDate;
    });

  if (sortedDates.length < 2) {
    console.log("[BacktestEngine] No hay suficientes fechas comunes");
    return null;
  }

  const firstDate = sortedDates[0]!;
  const lastDate = sortedDates[sortedDates.length - 1]!;

  console.log(`[BacktestEngine] Rango común: ${firstDate} - ${lastDate} (${sortedDates.length} días)`);

  return {
    startDate: firstDate,
    endDate: lastDate,
  };
}

// -----------------------------------------------------------------------------
// Correlación entre carteras
// -----------------------------------------------------------------------------

function calculateCorrelation(
  seriesA: TimeSeriesPoint[],
  seriesB: TimeSeriesPoint[]
): number {
  const mapA = new Map(seriesA.map((p) => [p.date, p.value]));
  const mapB = new Map(seriesB.map((p) => [p.date, p.value]));

  const commonDates = seriesA
    .map((p) => p.date)
    .filter((date) => mapB.has(date))
    .sort();

  if (commonDates.length < 3) return 0;

  const returnsA: number[] = [];
  const returnsB: number[] = [];

  for (let i = 1; i < commonDates.length; i++) {
    const prevDate = commonDates[i - 1]!;
    const currDate = commonDates[i]!;

    const prevA = mapA.get(prevDate);
    const currA = mapA.get(currDate);
    const prevB = mapB.get(prevDate);
    const currB = mapB.get(currDate);

    if (prevA && currA && prevB && currB && prevA > 0 && prevB > 0) {
      returnsA.push((currA - prevA) / prevA);
      returnsB.push((currB - prevB) / prevB);
    }
  }

  if (returnsA.length < 2) return 0;

  return pearsonCorrelation(returnsA, returnsB);
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((sum, r) => sum + r, 0) / n;
  const meanB = b.reduce((sum, r) => sum + r, 0) / n;

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let i = 0; i < n; i++) {
    const diffA = a[i]! - meanA;
    const diffB = b[i]! - meanB;
    numerator += diffA * diffB;
    denomA += diffA * diffA;
    denomB += diffB * diffB;
  }

  const denominator = Math.sqrt(denomA * denomB);
  return denominator === 0 ? 0 : numerator / denominator;
}

// -----------------------------------------------------------------------------
// Métricas individuales de activos (usa datos DIARIOS — ya cacheados)
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Serie de un holding teniendo en cuenta las estrategias de momentum.
// El momentum no es un fondo real (no tiene precios que descargar); su "precio"
// es su equity curve. Para que aparezca en la correlación y en las métricas por
// activo, re-ejecutamos la estrategia (barato: los precios de los subyacentes ya
// están cacheados) y convertimos su equity en una serie normalizada a 100.
// -----------------------------------------------------------------------------

/** Equity curve (mensual) → precios DIARIOS normalizados a 100 (forward-fill). */
function equityCurveToDailyPrices(
  equityCurve: Array<{ date: string; value: number }>
): Map<string, number> {
  const out = new Map<string, number>();
  if (!equityCurve || equityCurve.length < 2) return out;
  const baseValue = equityCurve[0]!.value;
  if (baseValue <= 0) return out;
  let idx = 0;
  const start = new Date(equityCurve[0]!.date);
  const end = new Date(equityCurve[equityCurve.length - 1]!.date);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dStr = d.toISOString().substring(0, 10);
    while (idx + 1 < equityCurve.length && equityCurve[idx + 1]!.date <= dStr) idx++;
    out.set(dStr, (equityCurve[idx]!.value / baseValue) * 100);
  }
  return out;
}

/** Equity curve → precios MENSUALES (YYYY-MM) normalizados a 100. */
function equityCurveToMonthlyPrices(
  equityCurve: Array<{ date: string; value: number }>
): Map<string, number> {
  const out = new Map<string, number>();
  if (!equityCurve || equityCurve.length < 2) return out;
  const baseValue = equityCurve[0]!.value;
  if (baseValue <= 0) return out;
  for (const p of equityCurve) {
    out.set(p.date.substring(0, 7), (p.value / baseValue) * 100); // último del mes gana
  }
  return out;
}

/** Precios diarios de un holding (momentum re-ejecutado, o fondo descargado). */
async function getHoldingDailySeries(
  holding: PortfolioHolding,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  if (holding.momentumConfig) {
    try {
      const res = await runMomentum({ ...holding.momentumConfig, startDate, endDate, initialAmount: 100 });
      return equityCurveToDailyPrices(res.equityCurve);
    } catch (e) {
      console.warn(`[AssetSeries] momentum diario ${holding.fundId}:`, e);
      return new Map();
    }
  }
  const fund = getFundById(holding.fundId) || holding.fund;
  const { prices } = await getDailyPrices(holding.fundId, fund?.ticker, fund?.isin);
  return prices;
}

/** Precios mensuales de un holding (momentum re-ejecutado, o fondo descargado). */
async function getHoldingMonthlySeries(
  holding: PortfolioHolding,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  if (holding.momentumConfig) {
    try {
      const res = await runMomentum({ ...holding.momentumConfig, startDate, endDate, initialAmount: 100 });
      return equityCurveToMonthlyPrices(res.equityCurve);
    } catch (e) {
      console.warn(`[AssetSeries] momentum mensual ${holding.fundId}:`, e);
      return new Map();
    }
  }
  const fund = getFundById(holding.fundId) || holding.fund;
  const { prices } = await getMonthlyPrices(holding.fundId, fund?.ticker, fund?.isin);
  return prices;
}

async function calculateIndividualAssetMetrics(
  holdings: PortfolioHolding[],
  startDate: string,
  endDate: string,
  displayGranularity: DisplayGranularity = "monthly"
): Promise<AssetMetrics[]> {
  const uniqueHoldings = new Map<string, PortfolioHolding>();
  for (const holding of holdings) {
    if (!uniqueHoldings.has(holding.fundId)) {
      uniqueHoldings.set(holding.fundId, holding);
    }
  }

  const results: AssetMetrics[] = [];
  // Normalizar fechas exactas (YYYY-MM-DD). Si vienen como YYYY-MM las
  // expandimos al primer día. Filtramos las fechas diarias del activo dentro
  // del rango exacto del backtest, NO por prefijo de mes (eso incluía días
  // sobrantes al principio del mes de inicio y desfasaba la rentabilidad).
  const startExact = startDate.length === 7 ? `${startDate}-01` : startDate;
  const endExact = endDate.length === 7 ? `${endDate}-31` : endDate;

  for (const holding of uniqueHoldings.values()) {
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) continue;

    try {
      // Serie diaria del activo. Si el holding es una estrategia de momentum,
      // se re-ejecuta y se usa su equity curve normalizada (en vez de descargar
      // precios, que no existen para una estrategia).
      const prices = await getHoldingDailySeries(holding, startDate, endDate);
      if (prices.size < 20) continue;

      const sortedDates = Array.from(prices.keys())
        .filter((date) => date >= startExact && date <= endExact)
        .sort();

      if (sortedDates.length < 20) continue;

      // Calcular valores normalizados desde el primer día
      const firstPrice = prices.get(sortedDates[0]!);
      if (!firstPrice || firstPrice <= 0) continue;

      const dailyValues: number[] = [];
      for (const date of sortedDates) {
        const price = prices.get(date);
        if (price) dailyValues.push((price / firstPrice) * 100);
      }

      // Retornos diarios
      const dailyReturns: number[] = [];
      for (let i = 1; i < dailyValues.length; i++) {
        const prevValue = dailyValues[i - 1];
        const currValue = dailyValues[i];
        if (prevValue && currValue && prevValue > 0) {
          dailyReturns.push((currValue - prevValue) / prevValue);
        }
      }

      if (dailyReturns.length < 10) continue;

      const initialValue = dailyValues[0] ?? 100;
      const finalValue = dailyValues[dailyValues.length - 1] ?? 100;

      // Años calendario reales
      const firstDateObj = new Date(sortedDates[0]!);
      const lastDateObj = new Date(sortedDates[sortedDates.length - 1]!);
      const calendarDays = (lastDateObj.getTime() - firstDateObj.getTime()) / (1000 * 60 * 60 * 24);
      const years = calendarDays / 365.25;

      const totalReturn = (finalValue - initialValue) / initialValue;
      const cagr = years > 0 ? Math.pow(finalValue / initialValue, 1 / years) - 1 : 0;

      // Volatilidad: usar la misma granularidad que las métricas de cartera para coherencia
      // (las métricas diarias incluyen ruido del forward-fill multi-exchange que infla la vol)
      let periodReturnsForVol: number[];
      let periodsPerYear: number;
      if (displayGranularity === "daily") {
        periodReturnsForVol = dailyReturns;
        periodsPerYear = TRADING_DAYS_PER_YEAR;
      } else if (displayGranularity === "quarterly") {
        // Agrupar dailyValues por trimestre y calcular retornos
        const quarterlyValues: number[] = [];
        const quarterMap = new Map<string, number>();
        for (let i = 0; i < sortedDates.length; i++) {
          const d = sortedDates[i]!;
          const year = d.substring(0, 4);
          const month = parseInt(d.substring(5, 7), 10);
          const q = Math.ceil(month / 3);
          const key = `${year}-Q${q}`;
          const val = dailyValues[i];
          if (val !== undefined) quarterMap.set(key, val); // sobrescribe → último del trimestre
        }
        const sortedKeys = Array.from(quarterMap.keys()).sort();
        for (const k of sortedKeys) quarterlyValues.push(quarterMap.get(k)!);
        periodReturnsForVol = [];
        for (let i = 1; i < quarterlyValues.length; i++) {
          const prev = quarterlyValues[i - 1];
          const curr = quarterlyValues[i];
          if (prev && curr && prev > 0) periodReturnsForVol.push((curr - prev) / prev);
        }
        periodsPerYear = 4;
      } else {
        // monthly (default)
        const monthlyValues: number[] = [];
        const monthMap = new Map<string, number>();
        for (let i = 0; i < sortedDates.length; i++) {
          const month = sortedDates[i]!.substring(0, 7); // YYYY-MM
          const val = dailyValues[i];
          if (val !== undefined) monthMap.set(month, val); // sobrescribe → último día del mes
        }
        const sortedKeys = Array.from(monthMap.keys()).sort();
        for (const k of sortedKeys) monthlyValues.push(monthMap.get(k)!);
        periodReturnsForVol = [];
        for (let i = 1; i < monthlyValues.length; i++) {
          const prev = monthlyValues[i - 1];
          const curr = monthlyValues[i];
          if (prev && curr && prev > 0) periodReturnsForVol.push((curr - prev) / prev);
        }
        periodsPerYear = 12;
      }

      const volatility = calculatePeriodVolatility(periodReturnsForVol, periodsPerYear);
      const maxDrawdown = calculateMaxDrawdown(dailyValues);
      const sharpe = volatility > 0 ? (cagr - RISK_FREE_RATE) / volatility : 0;

      // Calcular número de meses cubiertos
      const monthsSet = new Set(sortedDates.map((d) => d.substring(0, 7)));

      results.push({
        fundId: holding.fundId,
        name: fund.name.length > fund.shortName.length ? fund.name : fund.shortName,
        isin: fund.isin,
        ticker: fund.ticker,
        ter: fund.ter,
        cagr,
        volatility,
        maxDrawdown,
        sharpe,
        totalReturn,
        months: monthsSet.size,
        weight: holding.weight,
      });
    } catch (error) {
      console.warn(`[AssetMetrics] Error calculando métricas para ${holding.fundId}:`, error);
    }
  }

  results.sort((a, b) => b.cagr - a.cagr);
  return results;
}

// -----------------------------------------------------------------------------
// Matriz de correlaciones (usa datos mensuales)
// -----------------------------------------------------------------------------

async function calculateAssetCorrelationMatrix(
  holdings: PortfolioHolding[],
  startDate: string,
  endDate: string
): Promise<CorrelationMatrix | undefined> {
  const uniqueHoldings = new Map<string, PortfolioHolding>();
  for (const holding of holdings) {
    if (!uniqueHoldings.has(holding.fundId)) {
      uniqueHoldings.set(holding.fundId, holding);
    }
  }

  const holdingsList = Array.from(uniqueHoldings.values());
  if (holdingsList.length < 2) return undefined;

  const fundReturns = new Map<string, Map<string, number>>();
  const fundNames = new Map<string, string>();

  for (const holding of holdingsList) {
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) continue;

    try {
      // Serie mensual del activo; momentum → equity curve re-ejecutada.
      const prices = await getHoldingMonthlySeries(holding, startDate, endDate);
      if (prices.size < 3) continue;

      const returns = calculateReturnsFromPrices(prices);
      if (returns.size >= 2) {
        fundReturns.set(holding.fundId, returns);
        fundNames.set(holding.fundId, fund.name.length > fund.shortName.length ? fund.name : fund.shortName);
      }
    } catch (error) {
      console.warn(`[CorrelationMatrix] Error obteniendo datos para ${holding.fundId}:`, error);
    }
  }

  const fundIds = Array.from(fundReturns.keys());
  if (fundIds.length < 2) return undefined;

  const startMonth = startDate.substring(0, 7);
  const endMonth = endDate.substring(0, 7);

  const n = fundIds.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  const entries: CorrelationEntry[] = [];

  for (let i = 0; i < n; i++) {
    matrix[i]![i] = 1;

    for (let j = i + 1; j < n; j++) {
      const fundId1 = fundIds[i]!;
      const fundId2 = fundIds[j]!;
      const returns1 = fundReturns.get(fundId1)!;
      const returns2 = fundReturns.get(fundId2)!;

      const corr = calculatePairwiseCorrelation(returns1, returns2, startMonth, endMonth);

      matrix[i]![j] = corr;
      matrix[j]![i] = corr;

      entries.push({
        fundId1,
        fundId2,
        name1: fundNames.get(fundId1) || fundId1,
        name2: fundNames.get(fundId2) || fundId2,
        correlation: corr,
      });
    }
  }

  return {
    fundIds,
    fundNames: fundIds.map((id) => fundNames.get(id) || id),
    matrix,
    entries,
  };
}

function calculateReturnsFromPrices(
  prices: Map<string, number>
): Map<string, number> {
  const returns = new Map<string, number>();
  const sortedDates = Array.from(prices.keys()).sort();

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = sortedDates[i - 1]!;
    const currDate = sortedDates[i]!;
    const prevPrice = prices.get(prevDate);
    const currPrice = prices.get(currDate);

    if (prevPrice && currPrice && prevPrice > 0) {
      returns.set(currDate, (currPrice - prevPrice) / prevPrice);
    }
  }

  return returns;
}

function calculatePairwiseCorrelation(
  returns1: Map<string, number>,
  returns2: Map<string, number>,
  startMonth: string,
  endMonth: string
): number {
  const commonDates = Array.from(returns1.keys())
    .filter((date) => returns2.has(date) && date >= startMonth && date <= endMonth)
    .sort();

  if (commonDates.length < 3) return 0;

  const values1: number[] = [];
  const values2: number[] = [];

  for (const date of commonDates) {
    const r1 = returns1.get(date);
    const r2 = returns2.get(date);
    if (r1 !== undefined && r2 !== undefined) {
      values1.push(r1);
      values2.push(r2);
    }
  }

  if (values1.length < 3) return 0;
  return pearsonCorrelation(values1, values2);
}

// -----------------------------------------------------------------------------
// Utilidades de tipo de cartera
// -----------------------------------------------------------------------------

function determinePortfolioType(
  holdings: PortfolioHolding[],
  fundTypes: Map<string, FundType>
): FundType {
  let indexWeight = 0;
  let activeWeight = 0;

  for (const holding of holdings) {
    const type = fundTypes.get(holding.fundId);
    if (type === "index") indexWeight += holding.weight;
    else if (type === "active") activeWeight += holding.weight;
  }

  return indexWeight >= activeWeight ? "index" : "active";
}

function calculateWeightedTer(
  holdings: PortfolioHolding[],
  fundTers: Map<string, number>
): number {
  let totalTer = 0;
  let totalWeight = 0;

  for (const holding of holdings) {
    const ter = fundTers.get(holding.fundId);
    if (ter !== undefined) {
      totalTer += ter * holding.weight;
      totalWeight += holding.weight;
    }
  }

  return totalWeight > 0 ? totalTer / totalWeight : 0;
}

// =============================================================================
// EXPORTS PARA TESTS
// =============================================================================
//
// Funciones internas del motor expuestas EXCLUSIVAMENTE para los tests
// unitarios (src/lib/backtest-engine.test.ts). No usar desde la app: son
// detalle de implementación y pueden cambiar de firma sin aviso.
//
// Se agrupan en `_testing` (en vez de exportarlas sueltas) para que quede
// evidente en los imports que se está tocando la tripa del motor.
// `shouldRebalanceByDate` vive en date-utils y se re-exporta aquí para que el
// test tenga un único punto de entrada.
export const _testing = {
  calculateCAGR,
  calculatePeriodVolatility,
  calculatePeriodDownsideDeviation,
  calculateMaxDrawdown,
  calculateMetrics,
  calculateRollingReturnSeries,
  rebalancePortfolio,
  shouldRebalanceByDate,
  sumPositions,
};
