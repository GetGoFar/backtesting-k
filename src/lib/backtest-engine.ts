// =============================================================================
// MOTOR DE BACKTESTING - Backtesting Tool El Proyecto K
// =============================================================================
//
// Motor de cálculo para simulación de carteras de inversión.
// Implementa todos los cálculos financieros con precisión según fórmulas estándar.
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
} from "./types";
import { getFundById } from "./fund-database";
import { getMonthlyPrices } from "./data-fetcher";
import { getExcludedAssetWarnings, getTerWarnings } from "./data-warnings";

// -----------------------------------------------------------------------------
// Constantes
// -----------------------------------------------------------------------------

/** Tasa libre de riesgo anual para cálculo de Sharpe/Sortino (1%) */
const RISK_FREE_RATE = 0.01;

// -----------------------------------------------------------------------------
// Función principal
// -----------------------------------------------------------------------------

/**
 * Ejecuta el backtest completo para dos carteras
 * @param config - Configuración del backtest
 * @returns Resultados para cartera A y B (null si no hay datos suficientes)
 */
export async function runBacktest(
  config: BacktestConfig
): Promise<{ a: BacktestResult | null; b: BacktestResult | null; correlation?: number; commonDateRange?: { start: string; end: string }; correlationMatrix?: CorrelationMatrix; assetMetrics?: AssetMetrics[]; warnings?: BacktestWarning[] }> {
  console.log("[BacktestEngine] Iniciando backtest...");
  console.log(`[BacktestEngine] Período: ${config.startDate} - ${config.endDate}`);
  console.log(`[BacktestEngine] Inversión inicial: ${config.initialAmount}€`);
  console.log(`[BacktestEngine] Usar rango común: ${config.useCommonDateRange ?? false}`);

  // Coleccionar warnings del engine
  const engineWarnings: BacktestWarning[] = [];

  let effectiveStartDate = config.startDate;
  let effectiveEndDate = config.endDate;
  let commonDateRange: { start: string; end: string } | undefined;

  // Si useCommonDateRange está activo y hay dos carteras, encontrar el rango común primero
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

  // Ejecutar backtests solo para carteras que existen
  const resultAPromise = config.portfolioA
    ? runPortfolioBacktest(
        config.portfolioA,
        effectiveStartDate,
        effectiveEndDate,
        config.initialAmount,
        config.rebalanceFrequency,
        config.monthlyContribution ?? 0
      )
    : Promise.resolve(null);

  const resultBPromise = config.portfolioB
    ? runPortfolioBacktest(
        config.portfolioB,
        effectiveStartDate,
        effectiveEndDate,
        config.initialAmount,
        config.rebalanceFrequency,
        config.monthlyContribution ?? 0
      )
    : Promise.resolve(null);

  const [resultA, resultB] = await Promise.all([resultAPromise, resultBPromise]);

  console.log("[BacktestEngine] Backtest completado");

  // Calcular correlación si ambas carteras tienen resultados
  let correlation: number | undefined;
  if (resultA && resultB && resultA.timeSeries.length > 1 && resultB.timeSeries.length > 1) {
    correlation = calculateCorrelation(resultA.timeSeries, resultB.timeSeries);
    console.log(`[BacktestEngine] Correlación entre carteras: ${(correlation * 100).toFixed(1)}%`);
  }

  // Calcular matriz de correlaciones entre activos individuales
  let correlationMatrix: CorrelationMatrix | undefined;
  let assetMetrics: AssetMetrics[] | undefined;
  const allHoldings = [
    ...(config.portfolioA?.holdings ?? []),
    ...(config.portfolioB?.holdings ?? []),
  ];

  if (allHoldings.length >= 1) {
    // Calcular métricas individuales de cada activo
    assetMetrics = await calculateIndividualAssetMetrics(
      allHoldings,
      effectiveStartDate,
      effectiveEndDate
    );
    if (assetMetrics && assetMetrics.length > 0) {
      console.log(`[BacktestEngine] Métricas de activos calculadas: ${assetMetrics.length} activos`);
    }

    // Calcular matriz de correlaciones (solo si hay 2+ activos)
    if (allHoldings.length >= 2) {
      correlationMatrix = await calculateAssetCorrelationMatrix(
        allHoldings,
        effectiveStartDate,
        effectiveEndDate
      );
      if (correlationMatrix) {
        console.log(`[BacktestEngine] Matriz de correlaciones calculada: ${correlationMatrix.fundIds.length} activos`);
      }
    }
  }

  // Generar warnings de TER no confirmado
  const allHoldingsForWarnings = [
    ...(config.portfolioA?.holdings ?? []),
    ...(config.portfolioB?.holdings ?? []),
  ];
  engineWarnings.push(...getTerWarnings(allHoldingsForWarnings));

  // Generar warnings de activos excluidos de la correlación
  if (correlationMatrix && allHoldings.length > 0) {
    const includedInCorr = new Set(correlationMatrix.fundIds);
    engineWarnings.push(
      ...getExcludedAssetWarnings(allHoldings, includedInCorr, "correlation")
    );
  }

  // Generar warnings de activos excluidos de las métricas
  if (assetMetrics && allHoldings.length > 0) {
    const includedInMetrics = new Set(assetMetrics.map((m) => m.fundId));
    engineWarnings.push(
      ...getExcludedAssetWarnings(allHoldings, includedInMetrics, "metrics")
    );
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

/**
 * Ejecuta el backtest para una cartera individual
 */
async function runPortfolioBacktest(
  portfolio: Portfolio,
  startDate: string,
  endDate: string,
  initialAmount: number,
  rebalanceFrequency: RebalanceFrequency,
  monthlyContribution: number
): Promise<BacktestResult | null> {
  console.log(`[BacktestEngine] Procesando cartera: ${portfolio.name}`);

  // 1. Obtener precios históricos de todos los fondos
  const fundPrices = new Map<string, Map<string, number>>();
  const fundTers = new Map<string, number>();
  const fundTypes = new Map<string, FundType>();

  for (const holding of portfolio.holdings) {
    // Usar fondo de la base de datos local o el fondo dinámico del holding
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) {
      console.warn(`[BacktestEngine] Fondo no encontrado: ${holding.fundId}`);
      continue;
    }

    try {
      // Pasar el yahooTicker para fondos dinámicos que no están en la BD local
      const prices = await getMonthlyPrices(holding.fundId, fund.yahooTicker);
      fundPrices.set(holding.fundId, prices);
      fundTers.set(holding.fundId, fund.ter);
      fundTypes.set(holding.fundId, fund.type);
      console.log(`[BacktestEngine] ${fund.name}: ${prices.size} meses de datos, TER=${fund.ter}%`);
    } catch (error) {
      console.error(`[BacktestEngine] Error obteniendo precios para ${holding.fundId}:`, error);
    }
  }

  if (fundPrices.size === 0) {
    console.error("[BacktestEngine] No hay datos de precios disponibles");
    return null;
  }

  // 2. Encontrar el rango de fechas común
  const { commonDates, startMonth, endMonth } = findCommonDateRange(
    fundPrices,
    startDate,
    endDate
  );

  if (commonDates.length < 2) {
    console.error("[BacktestEngine] Rango de fechas insuficiente");
    return null;
  }

  console.log(`[BacktestEngine] Rango común: ${startMonth} - ${endMonth} (${commonDates.length} meses)`);

  // 3. Simular la cartera mes a mes
  const simulation = simulatePortfolio(
    portfolio.holdings,
    fundPrices,
    fundTers,
    commonDates,
    initialAmount,
    rebalanceFrequency,
    monthlyContribution
  );

  if (simulation.timeSeries.length === 0) {
    return null;
  }

  // 4. Calcular métricas
  const values = simulation.timeSeries.map((p) => p.value);
  const finalValue = values[values.length - 1] ?? 0;
  // El número de años es (meses - 1) / 12 porque tenemos N puntos pero N-1 períodos
  const years = (commonDates.length - 1) / 12;

  const metrics = calculateMetrics(
    values,
    simulation.monthlyReturns,
    simulation.totalContributions,
    finalValue,
    years
  );

  // 5. Calcular rentabilidades anuales
  const annualReturns = calculateAnnualReturns(simulation.timeSeries);

  // 6. Calcular drawdowns
  const drawdowns = calculateDrawdowns(simulation.timeSeries);

  // 7. Calcular rolling returns
  const rollingReturns = calculateRollingReturns(simulation.timeSeries);

  // 8. Calcular tipo de cartera
  const portfolioType = determinePortfolioType(portfolio.holdings, fundTypes);

  // 9. Resumen de comisiones
  const fees: FeesSummary = {
    totalFees: simulation.totalFeesPaid,
    feesAsPercentage: finalValue > 0 ? (simulation.totalFeesPaid / finalValue) * 100 : 0,
    weightedTer: calculateWeightedTer(portfolio.holdings, fundTers),
  };

  return {
    portfolioName: portfolio.name,
    portfolioType,
    timeSeries: simulation.timeSeries,
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
// Simulación de cartera
// -----------------------------------------------------------------------------

interface SimulationResult {
  timeSeries: TimeSeriesPoint[];
  monthlyReturns: number[];
  totalFeesPaid: number;
  totalContributions: number;
}

/**
 * Simula la evolución de la cartera mes a mes
 */
function simulatePortfolio(
  holdings: PortfolioHolding[],
  fundPrices: Map<string, Map<string, number>>,
  fundTers: Map<string, number>,
  dates: string[],
  initialAmount: number,
  rebalanceFrequency: RebalanceFrequency,
  monthlyContribution: number
): SimulationResult {
  const timeSeries: TimeSeriesPoint[] = [];
  const monthlyReturns: number[] = [];

  // Valor de cada posición (en EUR)
  const positionValues = new Map<string, number>();

  // Inicializar posiciones según pesos
  for (const holding of holdings) {
    const value = (initialAmount * holding.weight) / 100;
    positionValues.set(holding.fundId, value);
  }

  let totalContributions = initialAmount;
  let totalFeesPaid = 0;
  let lastRebalanceIndex = 0;

  // Registrar valor inicial
  const initialValue = sumPositions(positionValues);
  const firstDate = dates[0];
  if (firstDate) {
    timeSeries.push({ date: firstDate, value: initialValue });
  }

  // Simular cada mes a partir del segundo
  for (let i = 1; i < dates.length; i++) {
    const currentDate = dates[i];
    const previousDate = dates[i - 1];

    if (!currentDate || !previousDate) continue;

    // Para cada posición, calcular el retorno mensual
    for (const holding of holdings) {
      const prices = fundPrices.get(holding.fundId);
      const ter = fundTers.get(holding.fundId) ?? 0;
      const currentPositionValue = positionValues.get(holding.fundId) ?? 0;

      if (!prices || currentPositionValue === 0) continue;

      const currentPrice = prices.get(currentDate);
      const previousPrice = prices.get(previousDate);

      if (!currentPrice || !previousPrice || previousPrice === 0) continue;

      // Retorno del mes: (precio_mes / precio_mes_anterior) - 1
      // NOTA: Los precios NAV de Yahoo Finance YA incluyen el TER descontado,
      // por lo que no debemos restar el TER nuevamente (evitar doble conteo)
      const monthlyReturn = (currentPrice / previousPrice) - 1;

      // Estimar comisiones pagadas para mostrar al usuario (informativo)
      // Esto es una estimación basada en el TER del fondo
      const monthlyTerRate = ter / 12 / 100;
      const estimatedFee = currentPositionValue * monthlyTerRate;
      totalFeesPaid += estimatedFee;

      // Aplicar retorno a la posición
      const newPositionValue = currentPositionValue * (1 + monthlyReturn);
      positionValues.set(holding.fundId, newPositionValue);
    }

    // Aportación mensual (si aplica)
    if (monthlyContribution > 0) {
      totalContributions += monthlyContribution;
      for (const holding of holdings) {
        const currentValue = positionValues.get(holding.fundId) ?? 0;
        const contributionToPosition = (monthlyContribution * holding.weight) / 100;
        positionValues.set(holding.fundId, currentValue + contributionToPosition);
      }
    }

    // Rebalanceo (si toca)
    if (shouldRebalance(i, lastRebalanceIndex, rebalanceFrequency)) {
      rebalancePortfolio(positionValues, holdings);
      lastRebalanceIndex = i;
    }

    // Registrar valor total de la cartera
    const portfolioValue = sumPositions(positionValues);
    timeSeries.push({ date: currentDate, value: portfolioValue });

    // Calcular retorno mensual de la cartera (para métricas)
    const previousTotalValue = timeSeries[timeSeries.length - 2]?.value ?? 0;
    if (previousTotalValue > 0) {
      // Ajustar por aportaciones para calcular el retorno real
      const adjustedPreviousValue = previousTotalValue + monthlyContribution;
      const monthlyReturn = (portfolioValue / adjustedPreviousValue) - 1;
      monthlyReturns.push(monthlyReturn);
    }
  }

  return {
    timeSeries,
    monthlyReturns,
    totalFeesPaid,
    totalContributions,
  };
}

/**
 * Determina si toca rebalancear
 */
function shouldRebalance(
  currentIndex: number,
  lastRebalanceIndex: number,
  frequency: RebalanceFrequency
): boolean {
  if (frequency === "none") return false;

  const monthsSinceRebalance = currentIndex - lastRebalanceIndex;

  switch (frequency) {
    case "monthly":
      return monthsSinceRebalance >= 1;
    case "quarterly":
      return monthsSinceRebalance >= 3;
    case "annual":
      return monthsSinceRebalance >= 12;
    default:
      return false;
  }
}

/**
 * Rebalancea la cartera según los pesos objetivo
 */
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
 * Suma el valor de todas las posiciones
 */
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
 * Calcula todas las métricas de rendimiento
 */
function calculateMetrics(
  values: number[],
  monthlyReturns: number[],
  totalContributions: number,
  finalValue: number,
  years: number
): Metrics {
  // Rentabilidad total
  const totalReturn = totalContributions > 0
    ? (finalValue - totalContributions) / totalContributions
    : 0;

  // CAGR: (valor_final / valor_inicial)^(1/años) - 1
  // Usamos valor inicial = primera aportación para simplificar con aportaciones
  const initialValue = values[0] ?? totalContributions;
  const cagr = calculateCAGR(initialValue, finalValue, years);

  // Volatilidad: std(retornos_mensuales) × √12
  const volatility = calculateVolatility(monthlyReturns);

  // Sharpe: (CAGR - tasa_libre_riesgo) / volatilidad
  const sharpe = volatility > 0 ? (cagr - RISK_FREE_RATE) / volatility : 0;

  // Sortino: (CAGR - tasa_libre_riesgo) / downside_deviation
  const downsideDeviation = calculateDownsideDeviation(monthlyReturns);
  const sortino = downsideDeviation > 0 ? (cagr - RISK_FREE_RATE) / downsideDeviation : 0;

  // Max Drawdown
  const maxDrawdown = calculateMaxDrawdown(values);

  // Mejor y peor mes
  const bestMonth = monthlyReturns.length > 0 ? Math.max(...monthlyReturns) : 0;
  const worstMonth = monthlyReturns.length > 0 ? Math.min(...monthlyReturns) : 0;

  // Porcentaje de meses positivos
  const positiveMonths = monthlyReturns.filter((r) => r > 0).length;
  const positiveMonthsRatio = monthlyReturns.length > 0
    ? positiveMonths / monthlyReturns.length
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

/**
 * CAGR: (valor_final / valor_inicial)^(1/años) - 1
 */
function calculateCAGR(initialValue: number, finalValue: number, years: number): number {
  if (initialValue <= 0 || years <= 0) return 0;
  return Math.pow(finalValue / initialValue, 1 / years) - 1;
}

/**
 * Volatilidad: std(retornos_mensuales) × √12
 */
function calculateVolatility(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;

  const mean = monthlyReturns.reduce((sum, r) => sum + r, 0) / monthlyReturns.length;
  const squaredDiffs = monthlyReturns.map((r) => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (monthlyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  // Anualizar: × √12
  return stdDev * Math.sqrt(12);
}

/**
 * Downside Deviation: √(media(min(retorno - target, 0)²)) × √12
 * Target = 0 (retorno mínimo aceptable)
 */
function calculateDownsideDeviation(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;

  const target = 0;
  const downsideReturns = monthlyReturns
    .map((r) => Math.min(r - target, 0))
    .map((r) => r * r);

  const meanSquaredDownside = downsideReturns.reduce((sum, d) => sum + d, 0) / monthlyReturns.length;
  const downsideStdDev = Math.sqrt(meanSquaredDownside);

  // Anualizar: × √12
  return downsideStdDev * Math.sqrt(12);
}

/**
 * Max Drawdown: máxima caída desde pico a valle
 */
function calculateMaxDrawdown(values: number[]): number {
  if (values.length === 0) return 0;

  let maxDrawdown = 0;
  let peak = values[0] ?? 0;

  for (const value of values) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = (value - peak) / peak;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

// -----------------------------------------------------------------------------
// Rentabilidades anuales
// -----------------------------------------------------------------------------

/**
 * Calcula las rentabilidades anuales desglosadas
 */
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

/**
 * Calcula la serie temporal de drawdowns
 */
function calculateDrawdowns(timeSeries: TimeSeriesPoint[]): DrawdownPoint[] {
  if (timeSeries.length === 0) return [];

  const drawdowns: DrawdownPoint[] = [];
  let peak = timeSeries[0]?.value ?? 0;

  for (const point of timeSeries) {
    if (point.value > peak) {
      peak = point.value;
    }
    const drawdown = peak > 0 ? ((point.value - peak) / peak) * 100 : 0;
    drawdowns.push({ date: point.date, drawdown });
  }

  return drawdowns;
}

// -----------------------------------------------------------------------------
// Rolling Returns
// -----------------------------------------------------------------------------

/**
 * Calcula rolling returns a 1, 3 y 5 años
 * Rolling return = rentabilidad anualizada en una ventana móvil
 */
function calculateRollingReturns(timeSeries: TimeSeriesPoint[]): RollingReturns {
  return {
    oneYear: calculateRollingReturnSeries(timeSeries, 12),
    threeYear: calculateRollingReturnSeries(timeSeries, 36),
    fiveYear: calculateRollingReturnSeries(timeSeries, 60),
  };
}

/**
 * Calcula una serie de rolling returns para un período dado
 * @param timeSeries - Serie temporal de valores
 * @param months - Número de meses en la ventana
 */
function calculateRollingReturnSeries(
  timeSeries: TimeSeriesPoint[],
  months: number
): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];

  if (timeSeries.length < months + 1) {
    return result;
  }

  for (let i = months; i < timeSeries.length; i++) {
    const endPoint = timeSeries[i];
    const startPoint = timeSeries[i - months];

    if (!endPoint || !startPoint) continue;

    const startValue = startPoint.value;
    const endValue = endPoint.value;

    if (startValue > 0) {
      // Rentabilidad anualizada: (valor_final / valor_inicial)^(12/meses) - 1
      const years = months / 12;
      const annualizedReturn = Math.pow(endValue / startValue, 1 / years) - 1;
      result.push({ date: endPoint.date, value: annualizedReturn });
    }
  }

  return result;
}

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

/**
 * Encuentra el rango de fechas común entre dos carteras completas
 * Útil para comparar carteras que tienen fondos con diferentes rangos de datos
 */
async function findCommonDateRangeForPortfolios(
  portfolioA: Portfolio,
  portfolioB: Portfolio,
  requestedStart: string,
  requestedEnd: string
): Promise<{ startDate: string; endDate: string } | null> {
  console.log("[BacktestEngine] Buscando rango común entre carteras...");

  // Recopilar todos los fondos de ambas carteras
  const allHoldings = [...portfolioA.holdings, ...portfolioB.holdings];
  const allDateSets: Set<string>[] = [];

  // Obtener las fechas disponibles de cada fondo
  for (const holding of allHoldings) {
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) continue;

    try {
      const prices = await getMonthlyPrices(holding.fundId, fund.yahooTicker);
      if (prices.size > 0) {
        allDateSets.push(new Set(prices.keys()));
        console.log(`[BacktestEngine] ${fund.shortName}: ${prices.size} meses disponibles`);
      }
    } catch (error) {
      console.error(`[BacktestEngine] Error obteniendo fechas para ${holding.fundId}:`, error);
    }
  }

  if (allDateSets.length === 0) {
    return null;
  }

  // Encontrar la intersección de todas las fechas
  let commonDates = allDateSets[0] ? new Set(allDateSets[0]) : new Set<string>();
  for (let i = 1; i < allDateSets.length; i++) {
    const dateSet = allDateSets[i];
    if (!dateSet) continue;
    commonDates = new Set([...commonDates].filter((date) => dateSet.has(date)));
  }

  // Convertir a array y ordenar
  let sortedDates = Array.from(commonDates).sort();

  // Filtrar por rango solicitado (convertir YYYY-MM-DD a YYYY-MM)
  const startMonth = requestedStart.substring(0, 7);
  const endMonth = requestedEnd.substring(0, 7);

  sortedDates = sortedDates.filter((date) => date >= startMonth && date <= endMonth);

  if (sortedDates.length < 2) {
    console.log("[BacktestEngine] No hay suficientes fechas comunes");
    return null;
  }

  const firstDate = sortedDates[0]!;
  const lastDate = sortedDates[sortedDates.length - 1]!;

  console.log(`[BacktestEngine] Rango común: ${firstDate} - ${lastDate} (${sortedDates.length} meses)`);

  return {
    startDate: `${firstDate}-01`,
    endDate: `${lastDate}-01`,
  };
}

/**
 * Encuentra el rango de fechas común donde todos los fondos tienen datos
 */
function findCommonDateRange(
  fundPrices: Map<string, Map<string, number>>,
  requestedStart: string,
  requestedEnd: string
): { commonDates: string[]; startMonth: string; endMonth: string } {
  // Obtener todas las fechas de cada fondo
  const allDateSets: Set<string>[] = [];
  for (const prices of fundPrices.values()) {
    allDateSets.push(new Set(prices.keys()));
  }

  if (allDateSets.length === 0) {
    return { commonDates: [], startMonth: "", endMonth: "" };
  }

  // Encontrar la intersección de todas las fechas
  let commonDates = allDateSets[0] ? new Set(allDateSets[0]) : new Set<string>();
  for (let i = 1; i < allDateSets.length; i++) {
    const dateSet = allDateSets[i];
    if (!dateSet) continue;
    commonDates = new Set([...commonDates].filter((date) => dateSet.has(date)));
  }

  // Convertir a array y ordenar
  let sortedDates = Array.from(commonDates).sort();

  // Filtrar por rango solicitado (convertir YYYY-MM-DD a YYYY-MM)
  const startMonth = requestedStart.substring(0, 7);
  const endMonth = requestedEnd.substring(0, 7);

  sortedDates = sortedDates.filter((date) => date >= startMonth && date <= endMonth);

  return {
    commonDates: sortedDates,
    startMonth: sortedDates[0] ?? "",
    endMonth: sortedDates[sortedDates.length - 1] ?? "",
  };
}

/**
 * Determina el tipo de cartera basado en el peso mayoritario
 */
function determinePortfolioType(
  holdings: PortfolioHolding[],
  fundTypes: Map<string, FundType>
): FundType {
  let indexWeight = 0;
  let activeWeight = 0;

  for (const holding of holdings) {
    const type = fundTypes.get(holding.fundId);
    if (type === "index") {
      indexWeight += holding.weight;
    } else if (type === "active") {
      activeWeight += holding.weight;
    }
  }

  return indexWeight >= activeWeight ? "index" : "active";
}

/**
 * Calcula el TER promedio ponderado de la cartera
 */
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

// -----------------------------------------------------------------------------
// Correlación entre carteras
// -----------------------------------------------------------------------------

/**
 * Calcula la correlación de Pearson entre dos series temporales
 * Usa los retornos mensuales para calcular la correlación
 */
function calculateCorrelation(
  seriesA: TimeSeriesPoint[],
  seriesB: TimeSeriesPoint[]
): number {
  // Crear mapas de fecha -> valor para alinear las series
  const mapA = new Map(seriesA.map((p) => [p.date, p.value]));
  const mapB = new Map(seriesB.map((p) => [p.date, p.value]));

  // Encontrar fechas comunes
  const commonDates = seriesA
    .map((p) => p.date)
    .filter((date) => mapB.has(date))
    .sort();

  if (commonDates.length < 3) return 0;

  // Calcular retornos mensuales para cada serie
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

  // Calcular correlación de Pearson
  const n = returnsA.length;
  const meanA = returnsA.reduce((sum, r) => sum + r, 0) / n;
  const meanB = returnsB.reduce((sum, r) => sum + r, 0) / n;

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let i = 0; i < n; i++) {
    const diffA = returnsA[i]! - meanA;
    const diffB = returnsB[i]! - meanB;
    numerator += diffA * diffB;
    denomA += diffA * diffA;
    denomB += diffB * diffB;
  }

  const denominator = Math.sqrt(denomA * denomB);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

// -----------------------------------------------------------------------------
// Métricas individuales de activos
// -----------------------------------------------------------------------------

/**
 * Calcula métricas individuales para cada activo de las carteras
 */
async function calculateIndividualAssetMetrics(
  holdings: PortfolioHolding[],
  startDate: string,
  endDate: string
): Promise<AssetMetrics[]> {
  // Eliminar duplicados
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
      const prices = await getMonthlyPrices(holding.fundId, fund.yahooTicker);
      if (prices.size < 3) continue;

      // Filtrar precios al rango de fechas
      const sortedDates = Array.from(prices.keys())
        .filter((date) => date >= startMonth && date <= endMonth)
        .sort();

      if (sortedDates.length < 3) continue;

      // Construir serie de valores (normalizada a 100)
      const values: number[] = [];
      const firstPrice = prices.get(sortedDates[0]!);
      if (!firstPrice) continue;

      for (const date of sortedDates) {
        const price = prices.get(date);
        if (price) {
          values.push((price / firstPrice) * 100);
        }
      }

      // Calcular retornos mensuales
      const monthlyReturns: number[] = [];
      for (let i = 1; i < values.length; i++) {
        const prevValue = values[i - 1];
        const currValue = values[i];
        if (prevValue && currValue && prevValue > 0) {
          monthlyReturns.push((currValue - prevValue) / prevValue);
        }
      }

      if (monthlyReturns.length < 2) continue;

      // Calcular métricas
      const initialValue = values[0] ?? 100;
      const finalValue = values[values.length - 1] ?? 100;
      const years = (sortedDates.length - 1) / 12;

      const totalReturn = (finalValue - initialValue) / initialValue;
      const cagr = years > 0 ? Math.pow(finalValue / initialValue, 1 / years) - 1 : 0;
      const volatility = calculateVolatility(monthlyReturns);
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

  // Ordenar por CAGR descendente
  results.sort((a, b) => b.cagr - a.cagr);

  return results;
}

// -----------------------------------------------------------------------------
// Matriz de correlaciones entre activos
// -----------------------------------------------------------------------------

/**
 * Calcula la matriz de correlaciones entre todos los activos de las carteras
 * @param holdings - Lista de holdings de ambas carteras
 * @param startDate - Fecha de inicio del análisis
 * @param endDate - Fecha de fin del análisis
 * @returns Matriz de correlaciones o undefined si no hay datos suficientes
 */
async function calculateAssetCorrelationMatrix(
  holdings: PortfolioHolding[],
  startDate: string,
  endDate: string
): Promise<CorrelationMatrix | undefined> {
  // Eliminar duplicados (mismo fondo puede estar en ambas carteras)
  const uniqueHoldings = new Map<string, PortfolioHolding>();
  for (const holding of holdings) {
    if (!uniqueHoldings.has(holding.fundId)) {
      uniqueHoldings.set(holding.fundId, holding);
    }
  }

  const holdingsList = Array.from(uniqueHoldings.values());

  if (holdingsList.length < 2) {
    return undefined;
  }

  // Obtener precios mensuales de cada fondo
  const fundReturns = new Map<string, Map<string, number>>();
  const fundNames = new Map<string, string>();

  for (const holding of holdingsList) {
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) continue;

    try {
      const prices = await getMonthlyPrices(holding.fundId, fund.yahooTicker);
      if (prices.size < 3) continue;

      // Calcular retornos mensuales
      const returns = calculateMonthlyReturnsFromPrices(prices);
      if (returns.size >= 2) {
        fundReturns.set(holding.fundId, returns);
        fundNames.set(holding.fundId, fund.name.length > fund.shortName.length ? fund.name : fund.shortName);
      }
    } catch (error) {
      console.warn(`[CorrelationMatrix] Error obteniendo datos para ${holding.fundId}:`, error);
    }
  }

  const fundIds = Array.from(fundReturns.keys());
  if (fundIds.length < 2) {
    return undefined;
  }

  // Filtrar retornos al rango de fechas solicitado
  const startMonth = startDate.substring(0, 7);
  const endMonth = endDate.substring(0, 7);

  // Inicializar matriz de correlaciones
  const n = fundIds.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  const entries: CorrelationEntry[] = [];

  // Calcular correlaciones pairwise
  for (let i = 0; i < n; i++) {
    matrix[i]![i] = 1; // Correlación consigo mismo es siempre 1

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

/**
 * Calcula retornos mensuales a partir de precios
 */
function calculateMonthlyReturnsFromPrices(
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
      const monthlyReturn = (currPrice - prevPrice) / prevPrice;
      returns.set(currDate, monthlyReturn);
    }
  }

  return returns;
}

/**
 * Calcula la correlación de Pearson entre dos series de retornos mensuales
 */
function calculatePairwiseCorrelation(
  returns1: Map<string, number>,
  returns2: Map<string, number>,
  startMonth: string,
  endMonth: string
): number {
  // Encontrar fechas comunes dentro del rango
  const commonDates = Array.from(returns1.keys())
    .filter((date) => returns2.has(date) && date >= startMonth && date <= endMonth)
    .sort();

  if (commonDates.length < 3) {
    return 0;
  }

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

  if (values1.length < 3) {
    return 0;
  }

  // Calcular correlación de Pearson
  const n = values1.length;
  const mean1 = values1.reduce((sum, v) => sum + v, 0) / n;
  const mean2 = values2.reduce((sum, v) => sum + v, 0) / n;

  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = values1[i]! - mean1;
    const diff2 = values2[i]! - mean2;
    numerator += diff1 * diff2;
    denom1 += diff1 * diff1;
    denom2 += diff2 * diff2;
  }

  const denominator = Math.sqrt(denom1 * denom2);
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

// -----------------------------------------------------------------------------
// Exports adicionales para testing
// -----------------------------------------------------------------------------

export const _testing = {
  calculateCAGR,
  calculateVolatility,
  calculateDownsideDeviation,
  calculateMaxDrawdown,
  calculateMetrics,
  calculateRollingReturnSeries,
  calculateCorrelation,
  calculatePairwiseCorrelation,
  calculateMonthlyReturnsFromPrices,
  findCommonDateRange,
  rebalancePortfolio,
  shouldRebalance,
  sumPositions,
};
