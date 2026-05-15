// =============================================================================
// MOMENTUM ENGINE — Relative Strength tactical asset allocation (MENSUAL)
// =============================================================================
//
// Réplica del modelo "Relative Strength" de Portfoliovisualizer con simulación
// MENSUAL (un punto de equity por mes). Para cubrir las dos convenciones de
// ejecución que admite PV utilizamos DOS series de precios por activo:
//
//   • monthlyClose[M]    = cierre del último día hábil de M  (para ranking)
//   • firstDayClose[M]   = cierre del primer día hábil de M  (para ejecución
//                           en modo "nextClose")
//
// Ambas se extraen de los datos diarios de EODHD y luego trabajamos siempre
// a granularidad mensual. Esto significa:
//
//   • Curva de equity:  un punto por mes (~250 puntos en 20 años, no 5300).
//   • Vol anualizada:   σ_mensual × √12  (no √252).
//   • Max DD:           sobre la curva mensual (no captura mínimos intra-mes).
//
// Modos:
//
//   "lastClose":   señal y trade en el mismo cierre = último día hábil de T.
//                  Holding period [last_day_of_T, last_day_of_T+1].
//                  Return mensual = monthlyClose[T+1] / monthlyClose[T] − 1.
//
//   "nextClose":   señal a último día de T, trade al primer día hábil de T+1
//                  (PortfolioVisualizer default). Holding period
//                  [first_day_of_T+1, first_day_of_T+2].
//                  Return mensual = firstDayClose[T+2] / firstDayClose[T+1] − 1.
//
// El ranking SIEMPRE usa monthlyClose (la señal se calcula al cierre del mes,
// independientemente de cuándo se ejecute el trade).
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
// Utilidades de fechas mensuales ("YYYY-MM")
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Carga y agregación de precios
// -----------------------------------------------------------------------------

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

/**
 * A partir de precios diarios, devuelve DOS series mensuales:
 *  - lastClose:  precio del ÚLTIMO día hábil de cada mes
 *  - firstClose: precio del PRIMER día hábil de cada mes
 * Las claves son "YYYY-MM".
 */
function aggregateToMonthlyPair(daily: Map<string, number>): {
  lastClose: Map<string, number>;
  firstClose: Map<string, number>;
  exactLastDay: Map<string, string>;
  exactFirstDay: Map<string, string>;
} {
  const sorted = Array.from(daily.keys()).sort();
  const lastClose = new Map<string, number>();
  const firstClose = new Map<string, number>();
  const exactLastDay = new Map<string, string>();
  const exactFirstDay = new Map<string, string>();

  for (const date of sorted) {
    const month = date.substring(0, 7);
    const price = daily.get(date)!;
    if (!firstClose.has(month)) {
      firstClose.set(month, price);
      exactFirstDay.set(month, date);
    }
    // lastClose se sobrescribe en cada iteración → queda el último día observado
    lastClose.set(month, price);
    exactLastDay.set(month, date);
  }

  return { lastClose, firstClose, exactLastDay, exactFirstDay };
}

// -----------------------------------------------------------------------------
// Momentum y volatilidad sobre datos mensuales (ranking)
// -----------------------------------------------------------------------------

function momentumAt(
  monthlyClose: Map<string, number>,
  month: string,
  lookbackMonths: number,
  excludePrevious: boolean
): number | null {
  const endKey = excludePrevious ? addMonths(month, -1) : month;
  const startKey = addMonths(endKey, -lookbackMonths);
  const startPrice = monthlyClose.get(startKey);
  const endPrice = monthlyClose.get(endKey);
  if (!startPrice || !endPrice || startPrice <= 0) return null;
  return endPrice / startPrice - 1;
}

function movingAverage(
  monthlyClose: Map<string, number>,
  month: string,
  windowMonths: number
): number | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < windowMonths; i++) {
    const k = addMonths(month, -i);
    const p = monthlyClose.get(k);
    if (p && p > 0) {
      sum += p;
      count++;
    }
  }
  if (count < Math.ceil(windowMonths * 0.6)) return null;
  return sum / count;
}

function volatilityAt(
  monthlyClose: Map<string, number>,
  month: string,
  windowMonths: number
): number | null {
  const rets: number[] = [];
  for (let i = 0; i < windowMonths; i++) {
    const prevKey = addMonths(month, -i - 1);
    const currKey = addMonths(month, -i);
    const prev = monthlyClose.get(prevKey);
    const curr = monthlyClose.get(currKey);
    if (prev && curr && prev > 0) {
      rets.push(curr / prev - 1);
    }
  }
  if (rets.length < 2) return null;
  return annualizeStdDev(rets, 12);
}

// -----------------------------------------------------------------------------
// Métricas
// -----------------------------------------------------------------------------

const RISK_FREE_RATE = 0.02;

function annualizeStdDev(returns: number[], periodsPerYear: number): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
}

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

  // Años efectivos: medidos por meses entre primer y último punto.
  // (Cada punto es UN mes — el último día del mes en lastClose, o el primero
  //  del mes siguiente en nextClose; en ambos casos suficiente para CAGR.)
  const firstMonth = equityCurve[0]!.date.substring(0, 7);
  const lastMonth = equityCurve[equityCurve.length - 1]!.date.substring(0, 7);
  const months = monthsBetween(firstMonth, lastMonth);
  const years = months / 12;
  const cagr = calcCAGR(initialValue, finalValue, years);

  // Retornos MENSUALES (uno entre cada par de puntos consecutivos)
  const monthlyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1]!.value;
    const curr = equityCurve[i]!.value;
    if (prev > 0) monthlyReturns.push(curr / prev - 1);
  }
  const vol = annualizeStdDev(monthlyReturns, 12);
  const downsideDev = annualizeDownsideDeviation(monthlyReturns, 12);
  const excess = cagr - RISK_FREE_RATE;
  const sharpe = vol > 0 ? excess / vol : 0;
  const sortino = downsideDev > 0 ? excess / downsideDev : 0;

  const maxDD = calcMaxDrawdown(equityCurve.map((p) => p.value));

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
  const yearEnds = new Map<number, number>();
  for (const point of curve) {
    const year = parseInt(point.date.substring(0, 4), 10);
    yearEnds.set(year, point.value); // sobrescribe → queda el último valor del año
  }
  const sortedYears = Array.from(yearEnds.keys()).sort((a, b) => a - b);
  const results: MomentumAnnualReturn[] = [];
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
  const rebalanceEvery = config.frequency === "quarterly" ? 3 : 1;
  const rankingMethod = config.rankingMethod ?? "momentum";
  const volPeriod = config.volatilityPeriodMonths ?? 3;
  const slippage = (config.slippagePercent ?? 0) / 100;

  // 1. Cargar precios diarios y agregar a las dos series mensuales
  type AssetSeries = {
    monthlyClose: Map<string, number>;  // para ranking
    firstDayClose: Map<string, number>; // para ejecución en nextClose
    exactLastDay: Map<string, string>;
    exactFirstDay: Map<string, string>;
  };
  const seriesPerAsset = new Map<string, AssetSeries>();

  await Promise.all(
    config.assets.map(async (asset) => {
      try {
        const daily = await fetchDailyForAsset(asset);
        if (daily.size === 0) {
          warnings.push(`Sin datos para ${asset.ticker} — excluido del universo`);
          return;
        }
        const { lastClose, firstClose, exactLastDay, exactFirstDay } =
          aggregateToMonthlyPair(daily);
        seriesPerAsset.set(asset.ticker, {
          monthlyClose: lastClose,
          firstDayClose: firstClose,
          exactLastDay,
          exactFirstDay,
        });
      } catch (err) {
        warnings.push(
          `Error obteniendo ${asset.ticker}: ${err instanceof Error ? err.message : "desconocido"}`
        );
      }
    })
  );

  if (seriesPerAsset.size < 2) {
    throw new Error("Menos de 2 activos con datos válidos — no se puede ejecutar momentum");
  }

  // Benchmark opcional (también dos series)
  let benchmarkSeries: AssetSeries | null = null;
  if (config.benchmarkTicker) {
    try {
      const daily = await getDailyPrices(
        config.benchmarkTicker,
        config.benchmarkTicker,
        undefined
      );
      const { lastClose, firstClose, exactLastDay, exactFirstDay } =
        aggregateToMonthlyPair(daily.prices);
      benchmarkSeries = {
        monthlyClose: lastClose,
        firstDayClose: firstClose,
        exactLastDay,
        exactFirstDay,
      };
    } catch (err) {
      warnings.push(
        `Benchmark ${config.benchmarkTicker} no disponible: ${
          err instanceof Error ? err.message : "desconocido"
        }`
      );
    }
  }

  // 2. Determinar rango efectivo de meses
  const minOffset = config.lookbackMonths + (config.excludePreviousMonth ? 1 : 0);
  const allFirstMonths: string[] = [];
  const allLastMonths: string[] = [];
  for (const s of seriesPerAsset.values()) {
    const sortedMonths = Array.from(s.monthlyClose.keys()).sort();
    if (sortedMonths.length > 0) {
      allFirstMonths.push(sortedMonths[0]!);
      allLastMonths.push(sortedMonths[sortedMonths.length - 1]!);
    }
  }
  const dataStartMonth = allFirstMonths.sort().pop()!;
  const dataEndMonth = allLastMonths.sort()[0]!;
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

  // 3. Helper: precio que usamos para CADA mes según el modo de ejecución
  //
  // En lastClose:  el "valor del periodo M" = monthlyClose[M] (último día de M)
  // En nextClose:  el "valor del periodo M" = firstDayClose[M+1] (1er día de M+1)
  //                — porque el holding period M comienza al cierre del 1er día
  //                  de M+1 y termina al cierre del 1er día de M+2.
  //
  // Asociamos a cada "iteración M" una fecha visible para la curva de equity:
  function periodPriceFor(series: AssetSeries, month: string): number | undefined {
    if (mode === "lastClose") {
      return series.monthlyClose.get(month);
    }
    const next = addMonths(month, 1);
    return series.firstDayClose.get(next);
  }
  function periodDateFor(series: AssetSeries, month: string): string {
    // Sólo para mostrar en el chart. Si no hay día exacto disponible volvemos a
    // "YYYY-MM-01" como fallback.
    if (mode === "lastClose") {
      return series.exactLastDay.get(month) ?? `${month}-28`;
    }
    const next = addMonths(month, 1);
    return series.exactFirstDay.get(next) ?? `${next}-01`;
  }

  // Para fechas mostradas usamos el primer activo (o el benchmark) como referencia
  const referenceSeries = seriesPerAsset.values().next().value as AssetSeries;

  // 4. Bucle mensual
  let currentValue = config.initialAmount;
  let currentWeights = new Map<string, number>();
  let currentHoldings: string[] = [];

  const equityCurve: MomentumEquityPoint[] = [];
  const rebalances: MomentumRebalance[] = [];

  let monthIdx = 0;
  for (
    let month = effectiveStartMonth;
    compareMonths(month, effectiveEndMonth) <= 0;
    month = addMonths(month, 1), monthIdx++
  ) {
    const isRebalanceMonth = monthIdx % rebalanceEvery === 0;

    // 4.1. Aplicar return desde el periodo anterior con las weights actuales
    if (equityCurve.length > 0 && currentWeights.size > 0) {
      const prevMonth = addMonths(month, -1);
      let weightedReturn = 0;
      for (const [ticker, w] of currentWeights) {
        if (ticker === "CASH") {
          weightedReturn += w * (RISK_FREE_RATE / 12);
          continue;
        }
        const series = seriesPerAsset.get(ticker);
        if (!series) continue;
        const prev = periodPriceFor(series, prevMonth);
        const curr = periodPriceFor(series, month);
        if (prev && curr && prev > 0) {
          weightedReturn += w * (curr / prev - 1);
        }
      }
      currentValue *= 1 + weightedReturn;
    }

    // 4.2. ¿Toca rebalancear?
    if (isRebalanceMonth) {
      // El ranking SIEMPRE usa monthlyClose (cierre del último día del mes de la señal)
      const signalMonth = month;
      const candidates: Array<{
        ticker: string;
        mom: number;
        vol: number | null;
        score: number;
        aboveMA: boolean;
      }> = [];

      for (const [ticker, series] of seriesPerAsset) {
        const mom = momentumAt(
          series.monthlyClose,
          signalMonth,
          config.lookbackMonths,
          config.excludePreviousMonth
        );
        if (mom === null) continue;

        let vol: number | null = null;
        if (rankingMethod === "sharpe" || config.weighting === "volatility") {
          vol = volatilityAt(series.monthlyClose, signalMonth, volPeriod);
        }

        const score =
          rankingMethod === "sharpe"
            ? vol && vol > 0
              ? mom / vol
              : -Infinity
            : mom;

        let aboveMA = true;
        if (config.movingAverageMonths && config.movingAverageMonths > 0) {
          const ma = movingAverage(
            series.monthlyClose,
            signalMonth,
            config.movingAverageMonths
          );
          const currentPrice = series.monthlyClose.get(signalMonth);
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
        const w = 1 / Math.max(1, passing.length);
        for (const c of passing) newWeights.set(c.ticker, w);
      }

      const prevSet = new Set(currentHoldings);
      const newSet = new Set(newHoldings);
      const changed =
        prevSet.size !== newSet.size || [...newSet].some((t) => !prevSet.has(t));

      if (changed || equityCurve.length === 0) {
        // La fecha del rebalanceo refleja CUÁNDO se ejecuta el trade
        rebalances.push({
          date: periodDateFor(referenceSeries, month),
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

    // 4.3. Push punto de equity (fecha = día exacto del periodo, no "YYYY-MM")
    equityCurve.push({
      date: periodDateFor(referenceSeries, month),
      value: currentValue,
      holdings: [...currentHoldings],
    });
  }

  // 5. Métricas
  const metrics = buildMetrics(equityCurve, rebalances.length);
  const annualReturns = buildAnnualReturns(equityCurve, config.initialAmount);

  // 6. Benchmark (mismo esquema mensual)
  let benchmarkCurve: MomentumEquityPoint[] | undefined;
  let benchmarkMetrics: MomentumMetrics | undefined;
  if (benchmarkSeries) {
    benchmarkCurve = [];
    let basePrice: number | undefined;
    for (
      let month = effectiveStartMonth;
      compareMonths(month, effectiveEndMonth) <= 0;
      month = addMonths(month, 1)
    ) {
      const p = periodPriceFor(benchmarkSeries, month);
      if (p === undefined) continue;
      if (basePrice === undefined) basePrice = p;
      benchmarkCurve.push({
        date: periodDateFor(benchmarkSeries, month),
        value: (p / basePrice) * config.initialAmount,
        holdings: [config.benchmarkTicker!],
      });
    }
    if (benchmarkCurve.length > 1) {
      benchmarkMetrics = buildMetrics(benchmarkCurve, 0);
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

export { monthsBetween };
