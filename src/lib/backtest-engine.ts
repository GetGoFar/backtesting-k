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
        displayGranularity
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
        displayGranularity
      )
    : Promise.resolve(null);

  const [resultA, resultB] = await Promise.all([resultAPromise, resultBPromise]);

  // Correlación entre carteras (siempre usa datos mensuales para estabilidad)
  let correlation: number | undefined;
  if (resultA && resultB) {
    correlation = calculateCorrelation(resultA.timeSeries, resultB.timeSeries);
  }

  // Métricas individuales de activos y matriz de correlaciones
  const allHoldings = [
    ...(config.portfolioA?.holdings ?? []),
    ...(config.portfolioB?.holdings ?? []),
  ];

  let correlationMatrix: CorrelationMatrix | undefined;
  let assetMetrics: AssetMetrics[] | undefined;

  if (allHoldings.length > 0) {
    [correlationMatrix, assetMetrics] = await Promise.all([
      allHoldings.length >= 2
        ? calculateAssetCorrelationMatrix(allHoldings, effectiveStartDate, effectiveEndDate)
        : Promise.resolve(undefined),
      calculateIndividualAssetMetrics(allHoldings, effectiveStartDate, effectiveEndDate),
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
  displayGranularity: DisplayGranularity
): Promise<BacktestResult | null> {
  console.log(`[BacktestEngine] Procesando cartera: ${portfolio.name}`);

  // 1. Obtener precios diarios de todos los fondos
  const fundPrices = new Map<string, Map<string, number>>();
  const fundTers = new Map<string, number>();
  const fundTypes = new Map<string, FundType>();

  for (const holding of portfolio.holdings) {
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) {
      console.warn(`[BacktestEngine] Fondo no encontrado: ${holding.fundId}`);
      continue;
    }

    try {
      const { prices } = await getDailyPrices(holding.fundId, fund.yahooTicker, fund.isin);
      fundPrices.set(holding.fundId, prices);
      fundTers.set(holding.fundId, fund.ter);
      fundTypes.set(holding.fundId, fund.type);
      console.log(`[BacktestEngine] ${fund.name}: ${prices.size} días de datos, TER=${fund.ter}%`);
    } catch (error) {
      console.error(`[BacktestEngine] Error obteniendo precios para ${holding.fundId}:`, error);
    }
  }

  if (fundPrices.size === 0) {
    console.error("[BacktestEngine] No hay datos de precios disponibles");
    return null;
  }

  // 2. Encontrar el rango de fechas diarias común
  const { commonDates, startDay, endDay } = findCommonDailyDateRange(
    fundPrices,
    startDate,
    endDate
  );

  if (commonDates.length < 2) {
    console.error("[BacktestEngine] Rango de fechas insuficiente");
    return null;
  }

  console.log(`[BacktestEngine] Rango diario: ${startDay} - ${endDay} (${commonDates.length} días)`);

  // 3. Simular la cartera día a día
  const simulation = simulatePortfolioDaily(
    portfolio.holdings,
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

  // 5. Calcular métricas (SIEMPRE desde retornos diarios para máxima precisión)
  const values = simulation.dailyTimeSeries.map((p) => p.value);
  const finalValue = values[values.length - 1] ?? 0;
  const tradingDays = commonDates.length - 1;
  const years = tradingDays / TRADING_DAYS_PER_YEAR;

  // Agregar retornos diarios al periodo de display para best/worst period
  const periodReturns = aggregateDailyReturns(simulation.dailyReturns, displayGranularity);

  const metrics = calculateMetrics(
    values,
    simulation.dailyReturns.map((r) => r.returnValue),
    periodReturns.map((r) => r.returnValue),
    simulation.totalContributions,
    finalValue,
    years
  );

  // 6. Rentabilidades anuales, drawdowns, rolling returns
  const annualReturns = calculateAnnualReturns(timeSeries);
  const drawdowns = calculateDrawdowns(timeSeries);

  // Rolling returns: usar la serie de output (mensual o trimestral tiene más sentido para rolling)
  const rollingReturns = calculateRollingReturns(timeSeries, displayGranularity);

  // 7. Comisiones
  const weightedTer = calculateWeightedTer(portfolio.holdings, fundTers);
  const portfolioType = determinePortfolioType(portfolio.holdings, fundTypes);

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

function calculateMetrics(
  values: number[],
  dailyReturns: number[],
  periodReturns: number[],
  totalContributions: number,
  finalValue: number,
  years: number
): Metrics {
  const totalReturn = totalContributions > 0
    ? (finalValue - totalContributions) / totalContributions
    : 0;

  const initialValue = values[0] ?? totalContributions;
  const cagr = calculateCAGR(initialValue, finalValue, years);

  // Volatilidad: calculada desde retornos diarios, anualizada con √252
  const volatility = calculateDailyVolatility(dailyReturns);

  // Sharpe y Sortino
  const sharpe = volatility > 0 ? (cagr - RISK_FREE_RATE) / volatility : 0;
  const downsideDeviation = calculateDailyDownsideDeviation(dailyReturns);
  const sortino = downsideDeviation > 0 ? (cagr - RISK_FREE_RATE) / downsideDeviation : 0;

  const maxDrawdown = calculateMaxDrawdown(values);

  // Best/worst period (usa retornos agregados al periodo de display)
  const bestMonth = periodReturns.length > 0 ? Math.max(...periodReturns) : 0;
  const worstMonth = periodReturns.length > 0 ? Math.min(...periodReturns) : 0;

  const positiveMonths = periodReturns.filter((r) => r > 0).length;
  const positiveMonthsRatio = periodReturns.length > 0
    ? positiveMonths / periodReturns.length
    : 0;

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
  };
}

function calculateCAGR(initialValue: number, finalValue: number, years: number): number {
  if (initialValue <= 0 || years <= 0) return 0;
  return Math.pow(finalValue / initialValue, 1 / years) - 1;
}

/** Volatilidad anualizada desde retornos diarios: std(daily) × √252 */
function calculateDailyVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;

  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const squaredDiffs = dailyReturns.map((r) => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (dailyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  return stdDev * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Downside deviation anualizada desde retornos diarios */
function calculateDailyDownsideDeviation(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;

  const target = 0;
  const downsideReturns = dailyReturns
    .map((r) => Math.min(r - target, 0))
    .map((r) => r * r);

  const meanSquaredDownside = downsideReturns.reduce((sum, d) => sum + d, 0) / dailyReturns.length;
  const downsideStdDev = Math.sqrt(meanSquaredDownside);

  return downsideStdDev * Math.sqrt(TRADING_DAYS_PER_YEAR);
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

function calculateAnnualReturns(timeSeries: TimeSeriesPoint[]): AnnualReturn[] {
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

    const startValue = previousYearEnd ?? data.start;
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
): { commonDates: string[]; startDay: string; endDay: string } {
  const allDateSets: Set<string>[] = [];
  for (const prices of fundPrices.values()) {
    allDateSets.push(new Set(prices.keys()));
  }

  if (allDateSets.length === 0) {
    return { commonDates: [], startDay: "", endDay: "" };
  }

  // Intersección de todas las fechas
  let commonDates = allDateSets[0] ? new Set(allDateSets[0]) : new Set<string>();
  for (let i = 1; i < allDateSets.length; i++) {
    const dateSet = allDateSets[i];
    if (!dateSet) continue;
    commonDates = new Set([...commonDates].filter((date) => dateSet.has(date)));
  }

  // Filtrar por rango solicitado
  // requestedStart/End puede ser YYYY-MM-DD o YYYY-MM
  const startPrefix = requestedStart.substring(0, 7); // YYYY-MM
  const endPrefix = requestedEnd.substring(0, 7);

  let sortedDates = Array.from(commonDates).sort();

  // Filtrar: incluir fechas cuyo mes YYYY-MM esté en el rango
  sortedDates = sortedDates.filter((date) => {
    const month = date.substring(0, 7);
    return month >= startPrefix && month <= endPrefix;
  });

  return {
    commonDates: sortedDates,
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

  let commonDates = allDateSets[0] ? new Set(allDateSets[0]) : new Set<string>();
  for (let i = 1; i < allDateSets.length; i++) {
    const dateSet = allDateSets[i];
    if (!dateSet) continue;
    commonDates = new Set([...commonDates].filter((date) => dateSet.has(date)));
  }

  const startPrefix = requestedStart.substring(0, 7);
  const endPrefix = requestedEnd.substring(0, 7);

  const sortedDates = Array.from(commonDates)
    .sort()
    .filter((date) => {
      const month = date.substring(0, 7);
      return month >= startPrefix && month <= endPrefix;
    });

  if (sortedDates.length < 2) {
    console.log("[BacktestEngine] No hay suficientes fechas comunes");
    return null;
  }

  const firstDate = sortedDates[0]!;
  const lastDate = sortedDates[sortedDates.length - 1]!;

  // Devolver como YYYY-MM-DD
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
// Métricas individuales de activos (usa datos mensuales para eficiencia)
// -----------------------------------------------------------------------------

async function calculateIndividualAssetMetrics(
  holdings: PortfolioHolding[],
  startDate: string,
  endDate: string
): Promise<AssetMetrics[]> {
  const uniqueHoldings = new Map<string, PortfolioHolding>();
  for (const holding of holdings) {
    if (!uniqueHoldings.has(holding.fundId)) {
      uniqueHoldings.set(holding.fundId, holding);
    }
  }

  const results: AssetMetrics[] = [];
  const startMonth = startDate.substring(0, 7);
  const endMonth = endDate.substring(0, 7);

  for (const holding of uniqueHoldings.values()) {
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) continue;

    try {
      // Usar getMonthlyPrices (wrapper) para métricas individuales — más eficiente
      const { prices } = await getMonthlyPrices(holding.fundId, fund.yahooTicker, fund.isin);
      if (prices.size < 3) continue;

      const sortedDates = Array.from(prices.keys())
        .filter((date) => date >= startMonth && date <= endMonth)
        .sort();

      if (sortedDates.length < 3) continue;

      const values: number[] = [];
      const firstPrice = prices.get(sortedDates[0]!);
      if (!firstPrice) continue;

      for (const date of sortedDates) {
        const price = prices.get(date);
        if (price) values.push((price / firstPrice) * 100);
      }

      const monthlyReturns: number[] = [];
      for (let i = 1; i < values.length; i++) {
        const prevValue = values[i - 1];
        const currValue = values[i];
        if (prevValue && currValue && prevValue > 0) {
          monthlyReturns.push((currValue - prevValue) / prevValue);
        }
      }

      if (monthlyReturns.length < 2) continue;

      const initialValue = values[0] ?? 100;
      const finalValue = values[values.length - 1] ?? 100;
      const years = (sortedDates.length - 1) / 12;

      const totalReturn = (finalValue - initialValue) / initialValue;
      const cagr = years > 0 ? Math.pow(finalValue / initialValue, 1 / years) - 1 : 0;
      // Volatilidad mensual anualizada para asset metrics
      const volatility = calculateMonthlyVolatility(monthlyReturns);
      const maxDrawdown = calculateMaxDrawdown(values);
      const sharpe = volatility > 0 ? (cagr - RISK_FREE_RATE) / volatility : 0;

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
        months: sortedDates.length,
      });
    } catch (error) {
      console.warn(`[AssetMetrics] Error calculando métricas para ${holding.fundId}:`, error);
    }
  }

  results.sort((a, b) => b.cagr - a.cagr);
  return results;
}

/** Volatilidad mensual anualizada: std(monthly) × √12 */
function calculateMonthlyVolatility(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;
  const mean = monthlyReturns.reduce((sum, r) => sum + r, 0) / monthlyReturns.length;
  const squaredDiffs = monthlyReturns.map((r) => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (monthlyReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12);
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
