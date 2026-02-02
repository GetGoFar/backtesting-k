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
} from "./types";
import { getFundById } from "./fund-database";
import { getMonthlyPrices } from "./data-fetcher";

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
): Promise<{ a: BacktestResult | null; b: BacktestResult | null }> {
  console.log("[BacktestEngine] Iniciando backtest...");
  console.log(`[BacktestEngine] Período: ${config.startDate} - ${config.endDate}`);
  console.log(`[BacktestEngine] Inversión inicial: ${config.initialAmount}€`);

  // Ejecutar backtests en paralelo
  const [resultA, resultB] = await Promise.all([
    runPortfolioBacktest(
      config.portfolioA,
      config.startDate,
      config.endDate,
      config.initialAmount,
      config.rebalanceFrequency,
      config.monthlyContribution ?? 0
    ),
    runPortfolioBacktest(
      config.portfolioB,
      config.startDate,
      config.endDate,
      config.initialAmount,
      config.rebalanceFrequency,
      config.monthlyContribution ?? 0
    ),
  ]);

  console.log("[BacktestEngine] Backtest completado");

  return { a: resultA, b: resultB };
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
  const years = commonDates.length / 12;

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

      // Retorno bruto del mes: (precio_mes / precio_mes_anterior) - 1
      const grossReturn = (currentPrice / previousPrice) - 1;

      // Retorno neto después de TER: retorno_bruto - (TER/12/100)
      const monthlyTerDeduction = ter / 12 / 100;
      const netReturn = grossReturn - monthlyTerDeduction;

      // Calcular comisión pagada este mes
      const feeAmount = currentPositionValue * monthlyTerDeduction;
      totalFeesPaid += feeAmount;

      // Aplicar retorno a la posición
      const newPositionValue = currentPositionValue * (1 + netReturn);
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
// Exports adicionales para testing
// -----------------------------------------------------------------------------

export const _testing = {
  calculateCAGR,
  calculateVolatility,
  calculateDownsideDeviation,
  calculateMaxDrawdown,
  calculateMetrics,
  calculateRollingReturnSeries,
  findCommonDateRange,
  rebalancePortfolio,
  shouldRebalance,
  sumPositions,
};
