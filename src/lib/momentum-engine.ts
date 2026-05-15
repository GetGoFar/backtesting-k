// =============================================================================
// MOMENTUM ENGINE — Relative Strength tactical asset allocation (DAILY)
// =============================================================================
//
// Réplica del modelo "Relative Strength" de Portfoliovisualizer con simulación
// DIARIA:
//
//   1. Cargamos precios diarios (adjusted_close) de cada activo del universo.
//   2. Construimos un calendario de días hábiles (unión de fechas).
//   3. Para el RANKING agregamos a mensual (último día hábil de cada mes).
//   4. Programamos los rebalanceos según `tradeExecution`:
//        - "lastClose": el rebalanceo se ejecuta al cierre del ÚLTIMO día
//          hábil del mes (mismo día que se calcula la señal).
//        - "nextClose": al cierre del PRIMER día hábil del mes siguiente
//          (PortfolioVisualizer-style: 1 día hábil de delay entre señal y trade).
//   5. Simulamos día a día: aplicamos retornos diarios a las holdings, y en
//      los días marcados como rebalanceo cambiamos a las nuevas holdings.
//
// Métricas: volatilidad anualizada con √252; los "mejores/peor mes" y "% meses
// positivos" se calculan a partir de retornos MENSUALES re-agregados desde la
// equity curve diaria (para que sigan teniendo sentido humano).
// =============================================================================

import { getDailyPrices } from "./data-fetcher";
import { getFundById } from "./fund-database";
import type {
  MomentumConfig,
  MomentumResponse,
  MomentumEquityPoint,
  MomentumRebalance,
  MomentumMetrics,
  MomentumAnnualReturn,
  MomentumAsset,
} from "./momentum-types";

// -----------------------------------------------------------------------------
// Utilidades de fechas
// -----------------------------------------------------------------------------

/** "YYYY-MM" → Date (1er día del mes UTC). */
function monthKeyToDate(key: string): Date {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
}

function dateToMonthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

function addMonths(key: string, n: number): string {
  const d = monthKeyToDate(key);
  d.setUTCMonth(d.getUTCMonth() + n);
  return dateToMonthKey(d);
}

function compareMonths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function monthsBetween(a: string, b: string): number {
  const da = monthKeyToDate(a);
  const db = monthKeyToDate(b);
  return (
    (db.getUTCFullYear() - da.getUTCFullYear()) * 12 +
    (db.getUTCMonth() - da.getUTCMonth())
  );
}

/** Días naturales entre dos "YYYY-MM-DD" (b - a). */
function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

// -----------------------------------------------------------------------------
// Carga de datos
// -----------------------------------------------------------------------------

/** Carga precios diarios para un activo. */
async function fetchDailyForAsset(asset: MomentumAsset): Promise<Map<string, number>> {
  if (asset.fundId) {
    const fund = getFundById(asset.fundId);
    if (fund) {
      const daily = await getDailyPrices(fund.id, fund.yahooTicker, fund.isin);
      return daily.prices;
    }
  }
  const daily = await getDailyPrices(asset.ticker, asset.ticker, undefined);
  return daily.prices;
}

/** Reduce diarias a mensuales: último precio observado en cada mes. */
function aggregateDailyToMonthly(daily: Map<string, number>): Map<string, number> {
  const monthly = new Map<string, number>();
  const sorted = Array.from(daily.keys()).sort();
  for (const date of sorted) {
    const month = date.substring(0, 7);
    monthly.set(month, daily.get(date)!); // se sobrescribe → queda el último
  }
  return monthly;
}

// -----------------------------------------------------------------------------
// Cálculo de momentum y volatilidad (sobre datos mensuales)
// -----------------------------------------------------------------------------

function momentumAt(
  monthlyPrices: Map<string, number>,
  month: string,
  lookbackMonths: number,
  excludePrevious: boolean
): number | null {
  const endKey = excludePrevious ? addMonths(month, -1) : month;
  const startKey = addMonths(endKey, -lookbackMonths);
  const startPrice = monthlyPrices.get(startKey);
  const endPrice = monthlyPrices.get(endKey);
  if (!startPrice || !endPrice || startPrice <= 0) return null;
  return endPrice / startPrice - 1;
}

function movingAverage(
  monthlyPrices: Map<string, number>,
  month: string,
  windowMonths: number
): number | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < windowMonths; i++) {
    const k = addMonths(month, -i);
    const p = monthlyPrices.get(k);
    if (p && p > 0) {
      sum += p;
      count++;
    }
  }
  if (count < Math.ceil(windowMonths * 0.6)) return null;
  return sum / count;
}

function volatilityAt(
  monthlyPrices: Map<string, number>,
  month: string,
  windowMonths: number
): number | null {
  const rets: number[] = [];
  for (let i = 0; i < windowMonths; i++) {
    const prevKey = addMonths(month, -i - 1);
    const currKey = addMonths(month, -i);
    const prev = monthlyPrices.get(prevKey);
    const curr = monthlyPrices.get(currKey);
    if (prev && curr && prev > 0) {
      rets.push(curr / prev - 1);
    }
  }
  if (rets.length < 2) return null;
  return annualizeStdDev(rets, 12);
}

// -----------------------------------------------------------------------------
// Helpers de estadística
// -----------------------------------------------------------------------------

/** Volatilidad anualizada desde retornos de un periodo. */
function annualizeStdDev(returns: number[], periodsPerYear: number): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
}

/** Downside deviation anualizada. */
function annualizeDownsideDeviation(returns: number[], periodsPerYear: number): number {
  if (returns.length < 2) return 0;
  const downside = returns.map((r) => Math.min(r, 0) ** 2);
  const meanSq = downside.reduce((s, d) => s + d, 0) / returns.length;
  return Math.sqrt(meanSq) * Math.sqrt(periodsPerYear);
}

function calcCAGR(initial: number, final: number, years: number): number {
  if (initial <= 0 || years <= 0) return 0;
  return Math.pow(final / initial, 1 / years) - 1;
}

function calcMaxDrawdown(values: number[]): number {
  if (values.length === 0) return 0;
  let maxDD = 0;
  let peak = values[0]!;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

const RISK_FREE_RATE = 0.02; // anual, igual que el backtest engine
const TRADING_DAYS_PER_YEAR = 252;

function buildMetrics(
  equityCurve: MomentumEquityPoint[],
  totalRebalances: number
): MomentumMetrics {
  if (equityCurve.length < 2) {
    return {
      totalReturn: 0,
      cagr: 0,
      volatility: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      bestMonth: 0,
      worstMonth: 0,
      positiveMonths: 0,
      tradesPerYear: 0,
      totalRebalances,
    };
  }

  const initialValue = equityCurve[0]!.value;
  const finalValue = equityCurve[equityCurve.length - 1]!.value;
  const totalReturn = finalValue / initialValue - 1;

  // Años efectivos (días naturales entre primer y último punto)
  const days = daysBetween(
    equityCurve[0]!.date,
    equityCurve[equityCurve.length - 1]!.date
  );
  const years = days / 365.25;
  const cagr = calcCAGR(initialValue, finalValue, years);

  // Retornos diarios para vol/sharpe (anualizamos × √252)
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1]!.value;
    const curr = equityCurve[i]!.value;
    if (prev > 0) dailyReturns.push(curr / prev - 1);
  }
  const vol = annualizeStdDev(dailyReturns, TRADING_DAYS_PER_YEAR);
  const downsideDev = annualizeDownsideDeviation(dailyReturns, TRADING_DAYS_PER_YEAR);
  const excess = cagr - RISK_FREE_RATE;
  const sharpe = vol > 0 ? excess / vol : 0;
  const sortino = downsideDev > 0 ? excess / downsideDev : 0;

  const maxDD = calcMaxDrawdown(equityCurve.map((p) => p.value));

  // Retornos MENSUALES re-agregados desde la equity diaria — los usamos para
  // los métricos "mejor mes / peor mes / % meses positivos" porque tienen
  // sentido humano (los retornos diarios son extremos y poco informativos).
  const monthlyValues = new Map<string, number>();
  for (const p of equityCurve) {
    monthlyValues.set(p.date.substring(0, 7), p.value); // último valor del mes
  }
  const sortedMonths = Array.from(monthlyValues.keys()).sort();
  const monthlyReturns: number[] = [];
  for (let i = 1; i < sortedMonths.length; i++) {
    const a = monthlyValues.get(sortedMonths[i - 1]!)!;
    const b = monthlyValues.get(sortedMonths[i]!)!;
    if (a > 0) monthlyReturns.push(b / a - 1);
  }
  const bestMonth = monthlyReturns.length > 0 ? Math.max(...monthlyReturns) : 0;
  const worstMonth = monthlyReturns.length > 0 ? Math.min(...monthlyReturns) : 0;
  const positiveMonths =
    monthlyReturns.length > 0
      ? monthlyReturns.filter((r) => r > 0).length / monthlyReturns.length
      : 0;

  const tradesPerYear = years > 0 ? totalRebalances / years : 0;

  return {
    totalReturn: totalReturn * 100,
    cagr: cagr * 100,
    volatility: vol * 100,
    sharpe,
    sortino,
    maxDrawdown: maxDD * 100,
    bestMonth: bestMonth * 100,
    worstMonth: worstMonth * 100,
    positiveMonths: positiveMonths * 100,
    tradesPerYear,
    totalRebalances,
  };
}

function buildAnnualReturns(
  curve: MomentumEquityPoint[],
  initialValue: number
): MomentumAnnualReturn[] {
  if (curve.length < 1) return [];

  // Último valor de cada año (= cierre anual del último día hábil)
  const yearEnds = new Map<number, number>();
  for (const point of curve) {
    const year = parseInt(point.date.substring(0, 4), 10);
    yearEnds.set(year, point.value);
  }

  const sortedYears = Array.from(yearEnds.keys()).sort((a, b) => a - b);
  const results: MomentumAnnualReturn[] = [];

  // Año Y: (cierre_Y / cierre_{Y-1}) − 1. Primer año usa initialValue.
  let prev: number | null = null;
  for (const year of sortedYears) {
    const endValue = yearEnds.get(year)!;
    const startValue = prev ?? initialValue;
    const returnPercent = startValue > 0 ? (endValue / startValue - 1) * 100 : 0;
    results.push({ year, returnPercent, finalValue: endValue });
    prev = endValue;
  }
  return results;
}

/** Turnover one-way entre dos asignaciones (suma de |delta_w| / 2). */
function computeTurnover(
  prev: Map<string, number>,
  next: Map<string, number>
): number {
  const tickers = new Set([...prev.keys(), ...next.keys()]);
  let sum = 0;
  for (const t of tickers) {
    sum += Math.abs((next.get(t) ?? 0) - (prev.get(t) ?? 0));
  }
  return sum / 2;
}

// -----------------------------------------------------------------------------
// Motor principal
// -----------------------------------------------------------------------------

export async function runMomentum(config: MomentumConfig): Promise<MomentumResponse> {
  const warnings: string[] = [];

  if (config.assets.length < 2) {
    throw new Error("Momentum requiere al menos 2 activos en el universo");
  }
  if (config.assetsToHold < 1) {
    throw new Error("assetsToHold debe ser >= 1");
  }
  if (config.lookbackMonths < 1) {
    throw new Error("lookbackMonths debe ser >= 1");
  }

  const mode = config.tradeExecution ?? "lastClose";
  const rebalanceMode = config.frequency === "quarterly" ? 3 : 1;
  const rankingMethod = config.rankingMethod ?? "momentum";
  const volPeriod = config.volatilityPeriodMonths ?? 3;
  const slippage = (config.slippagePercent ?? 0) / 100;

  // 1. Cargar precios DIARIOS en paralelo
  const dailyPricesPerAsset = new Map<string, Map<string, number>>();
  await Promise.all(
    config.assets.map(async (asset) => {
      try {
        const daily = await fetchDailyForAsset(asset);
        if (daily.size === 0) {
          warnings.push(`Sin datos para ${asset.ticker} — excluido del universo`);
          return;
        }
        dailyPricesPerAsset.set(asset.ticker, daily);
      } catch (err) {
        warnings.push(
          `Error obteniendo ${asset.ticker}: ${err instanceof Error ? err.message : "desconocido"}`
        );
      }
    })
  );

  if (dailyPricesPerAsset.size < 2) {
    throw new Error("Menos de 2 activos con datos válidos — no se puede ejecutar momentum");
  }

  // Benchmark opcional
  let benchmarkDaily: Map<string, number> | null = null;
  if (config.benchmarkTicker) {
    try {
      const daily = await getDailyPrices(
        config.benchmarkTicker,
        config.benchmarkTicker,
        undefined
      );
      benchmarkDaily = daily.prices;
    } catch (err) {
      warnings.push(
        `Benchmark ${config.benchmarkTicker} no disponible: ${
          err instanceof Error ? err.message : "desconocido"
        }`
      );
    }
  }

  // 2. Agregar a mensual (para señales / ranking)
  const monthlyPricesPerAsset = new Map<string, Map<string, number>>();
  for (const [ticker, daily] of dailyPricesPerAsset) {
    monthlyPricesPerAsset.set(ticker, aggregateDailyToMonthly(daily));
  }

  // 3. Calendario de días hábiles (unión de fechas de todos los activos)
  const allDaysSet = new Set<string>();
  for (const daily of dailyPricesPerAsset.values()) {
    for (const day of daily.keys()) allDaysSet.add(day);
  }
  const allDays = Array.from(allDaysSet).sort();

  // 4. Mapas mes → primer/último día hábil con datos en el calendario
  const firstDayOfMonth = new Map<string, string>();
  const lastDayOfMonth = new Map<string, string>();
  for (const day of allDays) {
    const m = day.substring(0, 7);
    if (!firstDayOfMonth.has(m)) firstDayOfMonth.set(m, day);
    lastDayOfMonth.set(m, day);
  }

  // 5. Determinar el rango efectivo de meses (limitado por lookback disponible)
  const minOffset = config.lookbackMonths + (config.excludePreviousMonth ? 1 : 0);
  const allFirstMonths: string[] = [];
  const allLastMonths: string[] = [];
  for (const monthly of monthlyPricesPerAsset.values()) {
    const sorted = Array.from(monthly.keys()).sort();
    if (sorted.length > 0) {
      allFirstMonths.push(sorted[0]!);
      allLastMonths.push(sorted[sorted.length - 1]!);
    }
  }
  const dataStartMonth = allFirstMonths.sort().pop()!; // intersección — el último "primer mes"
  const dataEndMonth = allLastMonths.sort()[0]!;       // intersección — el primer "último mes"
  const firstOperationalMonth = addMonths(dataStartMonth, minOffset);

  const requestedStartMonth = config.startDate.substring(0, 7);
  const requestedEndMonth = config.endDate.substring(0, 7);
  const effectiveStartMonth =
    compareMonths(requestedStartMonth, firstOperationalMonth) >= 0
      ? requestedStartMonth
      : firstOperationalMonth;
  const effectiveEndMonth =
    compareMonths(requestedEndMonth, dataEndMonth) <= 0
      ? requestedEndMonth
      : dataEndMonth;

  if (effectiveStartMonth !== requestedStartMonth) {
    warnings.push(
      `Fecha inicio ajustada de ${requestedStartMonth} a ${effectiveStartMonth} por falta de datos para el lookback.`
    );
  }
  if (effectiveEndMonth !== requestedEndMonth) {
    warnings.push(
      `Fecha fin ajustada de ${requestedEndMonth} a ${effectiveEndMonth} por límite de datos.`
    );
  }
  if (compareMonths(effectiveStartMonth, effectiveEndMonth) >= 0) {
    throw new Error(
      `Rango efectivo vacío (${effectiveStartMonth} → ${effectiveEndMonth}). Amplía el rango o reduce el lookback.`
    );
  }

  // 6. Construir el SCHEDULE de rebalanceos:
  //    Cada entrada: (signalMonth, executionDay)
  //    - signalMonth: mes cuyos cierres usamos para rankear (con excludePrev se
  //      descuenta uno más adelante en momentumAt)
  //    - executionDay: día hábil exacto en que cambiamos las holdings
  type RebalanceSchedule = {
    signalMonth: string;
    executionDay: string;
  };
  const schedule: RebalanceSchedule[] = [];
  let monthIdx = 0;
  for (
    let m = effectiveStartMonth;
    compareMonths(m, effectiveEndMonth) <= 0;
    m = addMonths(m, 1), monthIdx++
  ) {
    if (monthIdx % rebalanceMode !== 0) continue;

    let executionDay: string | undefined;
    if (mode === "lastClose") {
      executionDay = lastDayOfMonth.get(m);
    } else {
      // "nextClose": ejecutar al primer día hábil del MES SIGUIENTE
      const next = addMonths(m, 1);
      executionDay = firstDayOfMonth.get(next);
    }
    if (executionDay) {
      schedule.push({ signalMonth: m, executionDay });
    }
  }

  if (schedule.length === 0) {
    throw new Error("No se pudo programar ningún rebalanceo dentro del rango efectivo");
  }

  const rebalanceByDay = new Map<string, RebalanceSchedule>();
  for (const reb of schedule) rebalanceByDay.set(reb.executionDay, reb);

  // 7. Determinar el rango de días para la simulación
  const firstSimDay = schedule[0]!.executionDay;
  // Último día: el último día hábil que NO supera el effectiveEndMonth
  // (ojo: si mode="nextClose" puede haber un schedule con executionDay > último día hábil del effectiveEndMonth — lo recortamos)
  const effectiveEndLast = lastDayOfMonth.get(effectiveEndMonth)!;
  const lastSimDay = effectiveEndLast;

  // 8. Simulación día a día
  let currentValue = config.initialAmount;
  let currentWeights = new Map<string, number>();
  let currentHoldings: string[] = [];
  let prevDay: string | null = null;

  const equityCurve: MomentumEquityPoint[] = [];
  const rebalances: MomentumRebalance[] = [];

  // Cash daily rate (composición continua → discreto diario)
  const dailyRfRate = Math.pow(1 + RISK_FREE_RATE, 1 / TRADING_DAYS_PER_YEAR) - 1;

  for (const day of allDays) {
    if (day < firstSimDay) continue;
    if (day > lastSimDay) break;

    // 8.1. Aplicar retorno diario (prevDay → day) con las weights actuales
    if (prevDay !== null && currentWeights.size > 0) {
      let weightedReturn = 0;
      for (const [ticker, w] of currentWeights) {
        if (ticker === "CASH") {
          weightedReturn += w * dailyRfRate;
          continue;
        }
        const prices = dailyPricesPerAsset.get(ticker);
        if (!prices) continue;
        const prev = prices.get(prevDay);
        const curr = prices.get(day);
        if (prev && curr && prev > 0) {
          weightedReturn += w * (curr / prev - 1);
        }
      }
      currentValue *= 1 + weightedReturn;
    }

    // 8.2. ¿Hoy es día de rebalanceo?
    const reb = rebalanceByDay.get(day);
    if (reb) {
      // Calcular ranking usando precios mensuales en reb.signalMonth
      const candidates: Array<{
        ticker: string;
        mom: number;
        vol: number | null;
        score: number;
        aboveMA: boolean;
      }> = [];

      for (const [ticker, monthly] of monthlyPricesPerAsset) {
        const mom = momentumAt(
          monthly,
          reb.signalMonth,
          config.lookbackMonths,
          config.excludePreviousMonth
        );
        if (mom === null) continue;

        let vol: number | null = null;
        if (rankingMethod === "sharpe" || config.weighting === "volatility") {
          vol = volatilityAt(monthly, reb.signalMonth, volPeriod);
        }

        const score =
          rankingMethod === "sharpe"
            ? vol && vol > 0
              ? mom / vol
              : -Infinity
            : mom;

        let aboveMA = true;
        if (config.movingAverageMonths && config.movingAverageMonths > 0) {
          const ma = movingAverage(monthly, reb.signalMonth, config.movingAverageMonths);
          const currentPrice = monthly.get(reb.signalMonth);
          aboveMA = ma !== null && currentPrice !== undefined && currentPrice > ma;
        }

        candidates.push({ ticker, mom, vol, score, aboveMA });
      }

      candidates.sort((a, b) => b.score - a.score);
      const topK = candidates.slice(0, config.assetsToHold);
      const passing = config.movingAverageMonths
        ? topK.filter((c) => c.aboveMA)
        : topK;
      const forcedCash =
        config.movingAverageMonths != null && passing.length === 0;

      const newHoldings = forcedCash ? ["CASH"] : passing.map((c) => c.ticker);
      const newWeights = new Map<string, number>();
      if (forcedCash) {
        newWeights.set("CASH", 1);
      } else if (config.weighting === "rank") {
        const N = passing.length;
        const totalRank = (N * (N + 1)) / 2;
        passing.forEach((c, i) => {
          newWeights.set(c.ticker, (N - i) / totalRank);
        });
      } else if (config.weighting === "volatility") {
        const vols = passing.map((c) => ({
          ticker: c.ticker,
          inv: c.vol && c.vol > 0 ? 1 / c.vol : 0,
        }));
        const sumInv = vols.reduce((s, v) => s + v.inv, 0);
        if (sumInv > 0) {
          for (const v of vols) newWeights.set(v.ticker, v.inv / sumInv);
        } else {
          const w = 1 / passing.length;
          for (const c of passing) newWeights.set(c.ticker, w);
        }
      } else {
        // equal
        const w = 1 / Math.max(1, passing.length);
        for (const c of passing) newWeights.set(c.ticker, w);
      }

      // Detectar cambio respecto al anterior
      const prevSet = new Set(currentHoldings);
      const newSet = new Set(newHoldings);
      const changed =
        prevSet.size !== newSet.size || [...newSet].some((t) => !prevSet.has(t));

      if (changed || equityCurve.length === 0) {
        rebalances.push({
          date: day,
          previousHoldings: currentHoldings,
          newHoldings,
          ranking: candidates.map((c) => ({
            ticker: c.ticker,
            momentumPercent: c.mom * 100,
            volatilityPercent: c.vol !== null ? c.vol * 100 : undefined,
            score: c.score,
            aboveMA: c.aboveMA,
          })),
          forcedCash,
        });

        if (slippage > 0 && equityCurve.length > 0) {
          const turnover = computeTurnover(currentWeights, newWeights);
          currentValue *= 1 - turnover * slippage;
        }
      }

      currentHoldings = newHoldings;
      currentWeights = newWeights;
    }

    // 8.3. Empujar punto de equity diario
    equityCurve.push({
      date: day,
      value: currentValue,
      holdings: [...currentHoldings],
    });

    prevDay = day;
  }

  // 9. Métricas
  const metrics = buildMetrics(equityCurve, rebalances.length);
  const annualReturns = buildAnnualReturns(equityCurve, config.initialAmount);

  // 10. Benchmark (también diario)
  let benchmarkCurve: MomentumEquityPoint[] | undefined;
  let benchmarkMetrics: MomentumMetrics | undefined;
  if (benchmarkDaily) {
    benchmarkCurve = [];
    // Encontrar el precio del benchmark en firstSimDay (o el más próximo posterior)
    let basePrice: number | undefined;
    let baseDay: string | undefined;
    for (const day of allDays) {
      if (day < firstSimDay) continue;
      const p = benchmarkDaily.get(day);
      if (p !== undefined) {
        basePrice = p;
        baseDay = day;
        break;
      }
    }
    if (basePrice && baseDay) {
      for (const day of allDays) {
        if (day < baseDay) continue;
        if (day > lastSimDay) break;
        const p = benchmarkDaily.get(day);
        if (p === undefined) continue;
        benchmarkCurve.push({
          date: day,
          value: (p / basePrice) * config.initialAmount,
          holdings: [config.benchmarkTicker!],
        });
      }
      if (benchmarkCurve.length > 0) {
        benchmarkMetrics = buildMetrics(benchmarkCurve, 0);
      }
    }
  }

  return {
    config,
    equityCurve,
    rebalances,
    metrics,
    annualReturns,
    benchmarkCurve,
    benchmarkMetrics,
    warnings,
  };
}

// `monthsBetween` exposed in case future helpers need it
export { monthsBetween };
