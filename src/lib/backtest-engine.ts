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
  FeesSummary,
  Metrics,
  FundType,
  RebalanceFrequency,
  RollingReturns,
  CorrelationMatrix,
  CorrelationEntry,
  AssetMetrics,
  DisplayGranularity,
} from "./types";
import { getFundById } from "./fund-database";
import { getBenchmarkById } from "./benchmarks";
import { getDailyPrices, getMonthlyPrices } from "./data-fetcher";
import { getExcludedAssetWarnings, getTerWarnings } from "./data-warnings";
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

  // Si useCommonDateRange está activo, encontrar el rango común
  if (config.useCommonDateRange && config.portfolioA && config.portfolioB) {
    console.log("[BacktestEngine] Buscando rango de fechas común entre carteras...");
    const rangeResult = await findCommonDateRangeForPortfolios(
      config.portfolioA,
      config.portfolioB,
      config.startDate,
      config.endDate
    );
    if (rangeResult) {
      effectiveStartDate = rangeResult.startDate;
      effectiveEndDate = rangeResult.endDate;
      commonDateRange = { start: rangeResult.startDate, end: rangeResult.endDate };
      console.log(`[BacktestEngine] Rango común encontrado: ${effectiveStartDate} - ${effectiveEndDate}`);
    }
  }

  // Ejecutar backtests
  const resultAPromise = config.portfolioA
    ? runPortfolioBacktest(
        config.portfolioA,
        effectiveStartDate,
        effectiveEndDate,
        config.initialAmount,
        config.rebalanceFrequency,
        config.monthlyContribution ?? 0,
        displayGranularity,
        engineWarnings
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
        engineWarnings
      )
    : Promise.resolve(null);

  const [resultA, resultB] = await Promise.all([resultAPromise, resultBPromise]);

  // Correlación entre carteras (siempre usa datos mensuales para estabilidad)
  let correlation: number | undefined;
  if (resultA && resultB) {
    correlation = calculateCorrelation(resultA.timeSeries, resultB.timeSeries);
  }

  // Benchmark: si se solicita, ejecutar backtest del benchmark y calcular métricas relativas
  if (config.benchmarkId && (resultA || resultB)) {
    try {
      const benchmarkDef = getBenchmarkById(config.benchmarkId);
      if (benchmarkDef) {
        const benchmarkPortfolio: Portfolio = {
          name: benchmarkDef.name,
          holdings: benchmarkDef.composition,
        };
        const benchmarkResult = await runPortfolioBacktest(
          benchmarkPortfolio,
          effectiveStartDate,
          effectiveEndDate,
          config.initialAmount,
          config.rebalanceFrequency,
          config.monthlyContribution ?? 0,
          displayGranularity,
          [] // no acumulamos warnings del benchmark
        );
        if (benchmarkResult) {
          if (resultA) {
            resultA.benchmark = computeBenchmarkComparison(
              resultA,
              benchmarkResult,
              config.benchmarkId,
              benchmarkDef.name,
              displayGranularity
            );
          }
          if (resultB) {
            resultB.benchmark = computeBenchmarkComparison(
              resultB,
              benchmarkResult,
              config.benchmarkId,
              benchmarkDef.name,
              displayGranularity
            );
          }
        }
      }
    } catch (err) {
      console.warn("[BacktestEngine] Error calculando benchmark:", err);
    }
  }

  // Métricas individuales de activos y matriz de correlaciones
  // Usar el rango de fechas REAL del backtest (no el del config, que puede ser más amplio)
  const allHoldings = [
    ...(config.portfolioA?.holdings ?? []),
    ...(config.portfolioB?.holdings ?? []),
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
  warnings?: BacktestWarning[]
): Promise<BacktestResult | null> {
  console.log(`[BacktestEngine] Procesando cartera: ${portfolio.name}`);

  // 1. Obtener precios diarios de todos los fondos
  const fundPrices = new Map<string, Map<string, number>>();
  const fundTers = new Map<string, number>();
  const fundTypes = new Map<string, FundType>();

  const failedFundIds = new Set<string>();

  // Descargar datos de todos los fondos EN PARALELO (crítico para carteras con muchos fondos)
  const holdingsWithFunds = portfolio.holdings.map((holding) => ({
    holding,
    fund: getFundById(holding.fundId) || holding.fund,
  }));

  const fetchResults = await Promise.allSettled(
    holdingsWithFunds.map(async ({ holding, fund }) => {
      if (!fund) throw new Error(`Fondo no encontrado: ${holding.fundId}`);
      const { prices } = await getDailyPrices(holding.fundId, fund.yahooTicker, fund.isin);
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

  // 3. Simular la cartera día a día (usando solo holdings con datos disponibles)
  const simulation = simulatePortfolioDaily(
    activeHoldings,
    fundPrices,
    fundTers,
    commonDates,
    initialAmount,
    rebalanceFrequency,
    monthlyContribution,
    portfolio.managementFee ?? 0
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

  const metrics = calculateMetrics(
    periodValues,                                  // valores del periodo para max drawdown
    volatilityReturns,                             // retornos limpios para volatilidad
    periodReturns.map((r) => r.returnValue),       // retornos del periodo para best/worst
    simulation.totalContributions,
    finalValue,
    years,
    displayGranularity,
    dailyInitialValue
  );

  // 6. Rentabilidades anuales, drawdowns, rolling returns
  const annualReturns = calculateAnnualReturns(timeSeries, dailyInitialValue);
  const drawdowns = calculateDrawdowns(timeSeries);
  const topDrawdowns = calculateTopDrawdowns(timeSeries, 10);
  const stressPeriods = calculateStressPeriods(timeSeries);

  // Rolling returns: usar la serie de output (mensual o trimestral tiene más sentido para rolling)
  const rollingReturns = calculateRollingReturns(timeSeries, displayGranularity);

  // 7. Comisiones (usar activeHoldings para calcular TER solo de fondos con datos)
  const weightedTer = calculateWeightedTer(activeHoldings, fundTers);
  const portfolioType = determinePortfolioType(activeHoldings, fundTypes);

  const fees: FeesSummary = {
    totalFees: simulation.totalFeesPaid,
    feesAsPercentage: finalValue > 0 ? (simulation.totalFeesPaid / finalValue) * 100 : 0,
    weightedTer,
    managementFee: portfolio.managementFee,
    managementFeePaid: simulation.totalManagementFeePaid,
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
    rollingReturns,
    fees,
    totalContributions: simulation.totalContributions,
    finalValue,
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
}

function simulatePortfolioDaily(
  holdings: PortfolioHolding[],
  fundPrices: Map<string, Map<string, number>>,
  fundTers: Map<string, number>,
  dates: string[],
  initialAmount: number,
  rebalanceFrequency: RebalanceFrequency,
  monthlyContribution: number,
  managementFee: number = 0
): DailySimulationResult {
  const dailyTimeSeries: Array<{ date: string; value: number }> = [];
  const dailyReturns: Array<{ date: string; returnValue: number }> = [];

  // Valor de cada posición (en EUR)
  const positionValues = new Map<string, number>();

  // Inicializar posiciones según pesos
  for (const holding of holdings) {
    const value = (initialAmount * holding.weight) / 100;
    positionValues.set(holding.fundId, value);
  }

  let totalContributions = initialAmount;
  let totalFeesPaid = 0;
  let totalManagementFeePaid = 0;

  // Tasas diarias
  const dailyMgmtRate = managementFee / TRADING_DAYS_PER_YEAR / 100;

  // Registrar valor inicial
  const initialValue = sumPositions(positionValues);
  dailyTimeSeries.push({ date: dates[0]!, value: initialValue });

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
    }

    // Comisión de gestión diaria
    if (dailyMgmtRate > 0) {
      for (const holding of holdings) {
        const currentValue = positionValues.get(holding.fundId) ?? 0;
        const mgmtFeeAmount = currentValue * dailyMgmtRate;
        totalManagementFeePaid += mgmtFeeAmount;
        positionValues.set(holding.fundId, currentValue - mgmtFeeAmount);
      }
    }

    // Aportación mensual: aplicar en el primer día hábil de cada nuevo mes
    if (monthlyContribution > 0 && isNewMonth(currentDate, previousDate)) {
      totalContributions += monthlyContribution;
      for (const holding of holdings) {
        const currentValue = positionValues.get(holding.fundId) ?? 0;
        const contributionToPosition = (monthlyContribution * holding.weight) / 100;
        positionValues.set(holding.fundId, currentValue + contributionToPosition);
      }
    }

    // Rebalanceo
    if (shouldRebalanceByDate(currentDate, previousDate, rebalanceFrequency)) {
      rebalancePortfolio(positionValues, holdings);
    }

    // Registrar valor total
    const portfolioValue = sumPositions(positionValues);
    dailyTimeSeries.push({ date: currentDate, value: portfolioValue });

    // Calcular retorno diario de la cartera (ajustado por aportaciones)
    const previousTotalValue = dailyTimeSeries[dailyTimeSeries.length - 2]?.value ?? 0;
    if (previousTotalValue > 0) {
      const adjustedPrevious = previousTotalValue +
        (monthlyContribution > 0 && isNewMonth(currentDate, previousDate) ? monthlyContribution : 0);
      const portReturn = (portfolioValue / adjustedPrevious) - 1;
      dailyReturns.push({ date: currentDate, returnValue: portReturn });
    }
  }

  return {
    dailyTimeSeries,
    dailyReturns,
    totalFeesPaid,
    totalManagementFeePaid,
    totalContributions,
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
  dailyInitialValue?: number
): Metrics {
  const totalReturn = totalContributions > 0
    ? (finalValue - totalContributions) / totalContributions
    : 0;

  // Usar el valor inicial diario real (día 1) para CAGR
  const initialValue = dailyInitialValue ?? periodValues[0] ?? totalContributions;
  const cagr = calculateCAGR(initialValue, finalValue, years);

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

  const meanSquaredDownside = downsideReturns.reduce((sum, d) => sum + d, 0) / returns.length;
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
  // Capture ratio = retorno medio cartera / retorno medio benchmark cuando benchmark va en ese sentido
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
    // Filtrar puntos dentro del periodo de estrés (comparación lexicográfica YYYY-MM)
    const pointsInPeriod = timeSeries.filter(
      (p) => p.date >= period.start && p.date <= period.end
    );

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
      const annualizedReturn = Math.pow(endValue / startValue, 1 / years) - 1;
      result.push({ date: endPoint.date, value: annualizedReturn, exactDate: endPoint.exactDate });
    }
  }

  return result;
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
  portfolioA: Portfolio,
  portfolioB: Portfolio,
  requestedStart: string,
  requestedEnd: string
): Promise<{ startDate: string; endDate: string } | null> {
  console.log("[BacktestEngine] Buscando rango común entre carteras...");

  const allHoldings = [...portfolioA.holdings, ...portfolioB.holdings];
  const allDateSets: Set<string>[] = [];

  for (const holding of allHoldings) {
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) continue;

    try {
      const { prices } = await getDailyPrices(holding.fundId, fund.yahooTicker, fund.isin);
      if (prices.size > 0) {
        allDateSets.push(new Set(prices.keys()));
        console.log(`[BacktestEngine] ${fund.shortName}: ${prices.size} días disponibles`);
      }
    } catch (error) {
      console.error(`[BacktestEngine] Error obteniendo fechas para ${holding.fundId}:`, error);
    }
  }

  if (allDateSets.length === 0) return null;

  // Unión de todas las fechas (forward fill cubrirá huecos en la simulación)
  const allDatesUnion = new Set<string>();
  for (const dateSet of allDateSets) {
    for (const date of dateSet) {
      allDatesUnion.add(date);
    }
  }

  // Solo desde el día en que TODOS los fondos tienen al menos un dato
  const fundFirstDates: string[] = [];
  for (const dateSet of allDateSets) {
    const sorted = Array.from(dateSet).sort();
    if (sorted[0]) fundFirstDates.push(sorted[0]);
  }
  const latestFirstDate = fundFirstDates.sort().pop() ?? "";

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
  // Usar prefijo de mes para filtrar fechas diarias (YYYY-MM-DD >= YYYY-MM)
  const startPrefix = startDate.substring(0, 7);
  const endPrefix = endDate.substring(0, 7);

  for (const holding of uniqueHoldings.values()) {
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) continue;

    try {
      // Usar datos diarios (ya están cacheados desde el backtest)
      const { prices } = await getDailyPrices(holding.fundId, fund.yahooTicker, fund.isin);
      if (prices.size < 20) continue;

      const sortedDates = Array.from(prices.keys())
        .filter((date) => {
          const month = date.substring(0, 7);
          return month >= startPrefix && month <= endPrefix;
        })
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
        yahooTicker: fund.yahooTicker,
        ter: fund.ter,
        cagr,
        volatility,
        maxDrawdown,
        sharpe,
        totalReturn,
        months: monthsSet.size,
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
      const { prices } = await getMonthlyPrices(holding.fundId, fund.yahooTicker, fund.isin);
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
