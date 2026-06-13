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
import { spanishIrpfTax } from "./tax-utils";
import type {
  MomentumConfig,
  MomentumResponse,
  MomentumEquityPoint,
  MomentumRebalance,
  MomentumMetrics,
  MomentumAnnualReturn,
  MomentumAsset,
  MomentumLiveRanking,
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
      const daily = await getDailyPrices(fund.id, fund.ticker, fund.isin);
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

/**
 * Momentum acumulado del activo al mes señal `month`.
 *
 * Convención académica clásica ("12-1 momentum" de Jegadeesh & Titman, también
 * la que usa Portfoliovisualizer):
 *
 *   • excludePrevious = false →  retorno = price[T]   / price[T-lookback] − 1
 *     (lookback meses de retorno terminando en el mes señal incluido)
 *
 *   • excludePrevious = true  →  retorno = price[T-1] / price[T-lookback] − 1
 *     (lookback − 1 meses de retorno, anclados en T-1 al final y T-lookback al
 *      inicio. Ej. lookback=12, excludePrev=true → 11 meses de retorno desde
 *      "12 meses atrás" hasta "1 mes atrás".)
 */
function momentumAt(
  monthlyClose: Map<string, number>,
  month: string,
  lookbackMonths: number,
  excludePrevious: boolean
): number | null {
  const endKey = excludePrevious ? addMonths(month, -1) : month;
  // El startKey se ancla al MES SEÑAL (no al endKey). Con excludePrevious,
  // esto da una ventana de (lookback − 1) meses, que es la definición "12-1
  // momentum" estándar (start = 12 meses atrás, end = 1 mes atrás).
  const startKey = addMonths(month, -lookbackMonths);
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

/**
 * Volatilidad anualizada usando RETORNOS DIARIOS — réplica del cálculo de
 * Portfoliovisualizer.
 *
 * PV usa una "rolling window" de N × 21 días HÁBILES (no meses calendario
 * completos) que termina en el último día hábil del mes señal. Para
 * `volatilityPeriodMonths = 3` eso son 63 días hábiles ~ 90 días naturales.
 *
 * Si el mes señal está en curso (no completado todavía), terminamos en el
 * último día con datos disponibles dentro de ese mes.
 *
 * Anualiza × √252.
 */
function volatilityAt(
  dailyPrices: Map<string, number>,
  month: string,
  windowMonths: number
): number | null {
  const TRADING_DAYS_PER_MONTH = 21;
  const windowSize = windowMonths * TRADING_DAYS_PER_MONTH;

  // 1. Localizar el último día hábil DENTRO del mes señal (con datos)
  const monthPrefix = `${month}-`;
  const allDates = Array.from(dailyPrices.keys()).sort();
  let endIdx = -1;
  for (let i = allDates.length - 1; i >= 0; i--) {
    if (allDates[i]!.startsWith(monthPrefix)) {
      endIdx = i;
      break;
    }
    // Si ya pasamos el mes señal hacia atrás, no hay datos en él. Usamos el
    // último día previo al mes (caso raro — solo si el mes señal no tiene
    // datos diarios cargados).
    if (allDates[i]! < monthPrefix) {
      endIdx = i;
      break;
    }
  }
  if (endIdx < 0) return null;

  // 2. La ventana son los `windowSize` días hábiles previos (inclusive endIdx).
  //    Si no hay tantos, usamos los que haya (con mínimo de 5).
  const startIdx = Math.max(0, endIdx - windowSize + 1);
  const datesInWindow = allDates.slice(startIdx, endIdx + 1);

  // 3. Retornos diarios y std × √252
  const rets: number[] = [];
  for (let i = 1; i < datesInWindow.length; i++) {
    const prev = dailyPrices.get(datesInWindow[i - 1]!)!;
    const curr = dailyPrices.get(datesInWindow[i]!)!;
    if (prev > 0) rets.push(curr / prev - 1);
  }
  if (rets.length < 5) return null;
  return annualizeStdDev(rets, 252);
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
  // n-1 (Bessel) para consistencia con la volatilidad muestral
  const meanSq = downside.reduce((s, d) => s + d, 0) / (returns.length - 1);
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
    daily: Map<string, number>;         // para cálculo de volatilidad (estilo PV)
    monthlyClose: Map<string, number>;  // para ranking de momentum
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
          daily,
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
        daily: daily.prices,
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
  // Rango de datos del universo:
  //  - Modo clásico (PV-compatible): intersección total — arranca cuando el
  //    activo MÁS JOVEN tiene datos y termina cuando el PRIMERO se queda sin
  //    ellos. Correcto para universos de ETFs vivos.
  //  - Modo "universo evolutivo" (allowPartialUniverse): arranca cuando al
  //    menos DOS activos tienen datos (los demás van entrando al acumular
  //    histórico) y termina con el ÚLTIMO superviviente. Necesario para
  //    experimentos con deslistadas/sesgo de supervivencia.
  const sortedFirstMonths = [...allFirstMonths].sort();
  const sortedLastMonths = [...allLastMonths].sort();
  const dataStartMonth = config.allowPartialUniverse
    ? (sortedFirstMonths[1] ?? sortedFirstMonths[0]!) // 2º más antiguo → ranking con ≥2 candidatos
    : sortedFirstMonths[sortedFirstMonths.length - 1]!;
  const dataEndMonth = config.allowPartialUniverse
    ? sortedLastMonths[sortedLastMonths.length - 1]!
    : sortedLastMonths[0]!;
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

  // Para fechas mostradas usamos el primer activo como referencia. En modo
  // universo evolutivo, usamos el de MAYOR cobertura mensual (el primero del
  // universo puede nacer tarde o morir pronto y dejaría fechas en fallback).
  const referenceSeries = config.allowPartialUniverse
    ? [...seriesPerAsset.values()].reduce((best, s) =>
        s.monthlyClose.size > best.monthlyClose.size ? s : best
      )
    : (seriesPerAsset.values().next().value as AssetSeries);

  // 4. Helper: calcula el ranking + holdings que resultarían si rebalanceásemos
  //    en el mes señal `signalMonth`. Encapsula la lógica de candidatos +
  //    aplicación de pesos para reutilizarla tanto en el bucle principal como
  //    en el cálculo del "liveRanking" final.
  type Candidate = {
    ticker: string;
    mom: number;
    vol: number | null;
    score: number;
    aboveMA: boolean;
  };
  function computeRankingAt(
    signalMonth: string,
    options?: { excludePrevOverride?: boolean }
  ): {
    candidates: Candidate[];
    newHoldings: string[];
    newWeights: Map<string, number>;
    forcedCash: boolean;
  } {
    // Para el liveRanking pasamos excludePrevOverride=false: queremos que el
    // ranking actual incluya el mes en curso (igual que hace Portfoliovisualizer
    // en su página "Model Signals", que usa el dato más reciente sin
    // exclusiones). Para los rebalanceos históricos respetamos config.
    const excludePrev =
      options?.excludePrevOverride ?? config.excludePreviousMonth;
    const candidates: Candidate[] = [];
    for (const [ticker, series] of seriesPerAsset) {
      const mom = momentumAt(
        series.monthlyClose,
        signalMonth,
        config.lookbackMonths,
        excludePrev
      );
      if (mom === null) continue;

      let vol: number | null = null;
      if (rankingMethod === "sharpe" || config.weighting === "volatility") {
        vol = volatilityAt(series.daily, signalMonth, volPeriod);
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

    return { candidates, newHoldings, newWeights, forcedCash };
  }

  // 5. Bucle mensual
  let currentValue = config.initialAmount;
  let currentWeights = new Map<string, number>();
  let currentHoldings: string[] = [];

  // --- Estado fiscal ---
  // Cada rotación vende posiciones y realiza la plusvalía → tributa al instante
  // (ETFs/acciones NO son traspasables). Trackeamos el coste base absoluto por
  // ticker, la plusvalía neta acumulada del año natural (para los tramos IRPF)
  // y un valor BRUTO paralelo (la misma estrategia sin restar impuestos) para
  // poder mostrar el lastre fiscal.
  const taxMode = config.taxMode ?? "none";
  const flatRate = config.taxRate ?? 0;
  const taxOn = taxMode === "spain-irpf" || (taxMode === "flat" && flatRate > 0);
  const posCost = new Map<string, number>();
  let annualRealized = 0;
  let taxYear = -1;
  let totalTaxesPaid = 0;
  let grossValue = config.initialAmount;

  const equityCurve: MomentumEquityPoint[] = [];
  const rebalances: MomentumRebalance[] = [];

  let monthIdx = 0;
  for (
    let month = effectiveStartMonth;
    compareMonths(month, effectiveEndMonth) <= 0;
    month = addMonths(month, 1), monthIdx++
  ) {
    const isRebalanceMonth = monthIdx % rebalanceEvery === 0;

    // 4.1. APLICAR RETORNO PRIMERO con las weights ACTUALES (decididas en la
    //      iteración anterior). Esto es el retorno [T-1, T] que ganó la cartera
    //      que ya teníamos antes de tocar nada — convención PV-compatible
    //      (decide al cierre de T, ejecuta al siguiente close, los nuevos pesos
    //      no ganan nada todavía).
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
      grossValue *= 1 + weightedReturn; // contrafactual sin impuestos
    }

    // 4.2. AHORA REBALANCEAR a los nuevos pesos. La señal usa datos hasta T-1
    //      (con excludePrev=true). Los nuevos pesos NO ganan nada en esta
    //      iteración — empezarán a generar retorno en la siguiente.
    if (isRebalanceMonth) {
      const signalMonth = month;
      const { candidates, newHoldings, newWeights, forcedCash } =
        computeRankingAt(signalMonth);

      const prevSet = new Set(currentHoldings);
      const newSet = new Set(newHoldings);
      const changed =
        prevSet.size !== newSet.size || [...newSet].some((t) => !prevSet.has(t));

      if (changed || equityCurve.length === 0) {
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

        // --- IMPUESTOS: realizar plusvalía en la rotación ---
        // En la PRIMERA asignación no hay venta (solo se despliega el capital):
        // inicializamos el coste base. En las siguientes, vendemos las posiciones
        // que se reducen/eliminan, tributamos la plusvalía y restamos el impuesto
        // del valor de la cartera (cash que sale para pagar a Hacienda).
        if (taxOn) {
          if (equityCurve.length === 0) {
            // Coste base inicial = capital desplegado en cada activo
            for (const [ticker, w] of newWeights) {
              if (ticker === "CASH") continue;
              posCost.set(ticker, currentValue * w);
            }
          } else {
            const totalBefore = currentValue;
            const yr = parseInt(month.substring(0, 4), 10);
            if (yr !== taxYear) {
              taxYear = yr;
              annualRealized = 0; // los tramos IRPF se reinician cada año natural
            }

            // 1. Ventas: tickers cuyo peso baja (incluye los que desaparecen)
            let totalGainRealized = 0;
            let cashFromSales = 0;
            const sells: Array<{ ticker: string; soldAmount: number; cbSold: number }> = [];
            for (const [ticker, oldW] of currentWeights) {
              if (ticker === "CASH") continue;
              const oldVal = totalBefore * oldW;
              const newW = newWeights.get(ticker) ?? 0;
              const target = totalBefore * newW;
              if (oldVal - target > 1e-9) {
                const soldAmount = oldVal - target;
                const fraction = soldAmount / oldVal;
                const cb = posCost.get(ticker) ?? 0;
                const cbSold = cb * fraction;
                totalGainRealized += soldAmount - cbSold;
                cashFromSales += soldAmount;
                sells.push({ ticker, soldAmount, cbSold });
              }
            }

            // 2. Impuesto sobre la plusvalía neta realizada (losses netean)
            let tax = 0;
            if (totalGainRealized > 0) {
              if (taxMode === "spain-irpf") {
                tax =
                  spanishIrpfTax(annualRealized + totalGainRealized) -
                  spanishIrpfTax(Math.max(0, annualRealized));
              } else {
                tax = totalGainRealized * flatRate;
              }
            }
            annualRealized += totalGainRealized;

            // 3. Aplicar ventas al coste base
            for (const s of sells) {
              posCost.set(s.ticker, (posCost.get(s.ticker) ?? 0) - s.cbSold);
            }
            // Limpiar coste base de los tickers que salen por completo
            for (const ticker of currentWeights.keys()) {
              if (!newWeights.has(ticker)) posCost.delete(ticker);
            }

            // 4. Desplegar el cash disponible (ventas − impuesto) en las compras.
            //    El coste base de lo comprado = importe desplegado (a mercado).
            const cashAvail = cashFromSales - tax;
            const buys: Array<{ ticker: string; need: number }> = [];
            let totalNeed = 0;
            for (const [ticker, newW] of newWeights) {
              if (ticker === "CASH") continue;
              const oldW = currentWeights.get(ticker) ?? 0;
              const need = totalBefore * newW - totalBefore * oldW;
              if (need > 1e-9) {
                buys.push({ ticker, need });
                totalNeed += need;
              }
            }
            for (const b of buys) {
              const allocated = totalNeed > 0 ? cashAvail * (b.need / totalNeed) : 0;
              posCost.set(b.ticker, (posCost.get(b.ticker) ?? 0) + allocated);
            }

            currentValue -= tax;
            totalTaxesPaid += tax;
          }
        }

        // Slippage: se cobra AHORA porque el rebalanceo se ejecuta a partir de aquí
        if (slippage > 0 && equityCurve.length > 0) {
          const turnover = computeTurnover(currentWeights, newWeights);
          currentValue *= 1 - turnover * slippage;
          grossValue *= 1 - turnover * slippage;
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

  // 4.5. CORRECCIÓN DEL "FUTURO" EN nextClose MODE
  //
  // En modo nextClose el motor agenda la próxima rotación (basada en la señal
  // del mes en curso) con fecha "primer día del mes siguiente". Si ese día
  // aún no ha llegado:
  //
  //  - El último punto de equity tiene fecha FUTURA con un valor "congelado"
  //    (la rentabilidad del mes en curso no se aplicó porque
  //    firstClose[mesQueViene] no existe todavía).
  //  - La última rotación en `rebalances` está agendada para esa fecha futura
  //    pero AÚN NO se ha ejecutado. El usuario tiene las posiciones del mes
  //    anterior, no las de esta rotación.
  //
  // Para que la UI muestre correctamente "EN CURSO = las posiciones que
  // realmente sostienes" con su rentabilidad MTD:
  //
  //  1. Reemplazar el último punto de equity por uno con fecha = último día
  //     con datos diarios, valor = (equity del mes anterior) × (precio diario
  //     actual / precio diario del inicio del periodo) — calculado sobre las
  //     posiciones REALMENTE activas (= holdings del punto anterior).
  //  2. Descartar la última rotación agendada (su fecha es futura).
  //
  // Nota: usamos peso equiponderado para el cálculo MTD. Para estrategias
  // con pesos rank/volatility la rentabilidad MTD será aproximada (los pesos
  // reales no se trackean punto a punto). El historial cerrado SÍ usa pesos
  // exactos (calculados dentro del bucle).
  if (mode === "nextClose" && equityCurve.length >= 2) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const lastPoint = equityCurve[equityCurve.length - 1]!;
    if (lastPoint.date > todayStr) {
      const prevPoint = equityCurve[equityCurve.length - 2]!;
      const activeHoldings = prevPoint.holdings; // las que realmente sostienes

      // Encontrar la fecha diaria más reciente común a las posiciones activas
      let effectiveToday: string | null = null;
      for (const ticker of activeHoldings) {
        if (ticker === "CASH") continue;
        const series = seriesPerAsset.get(ticker);
        if (!series) continue;
        const dates = Array.from(series.daily.keys()).sort();
        if (dates.length === 0) continue;
        const lastDate = dates[dates.length - 1]!;
        if (effectiveToday === null || lastDate < effectiveToday) {
          effectiveToday = lastDate;
        }
      }

      if (
        effectiveToday &&
        effectiveToday <= todayStr &&
        effectiveToday > prevPoint.date
      ) {
        const n = activeHoldings.length;
        const w = 1 / n;
        let weightedReturn = 0;
        for (const ticker of activeHoldings) {
          if (ticker === "CASH") {
            const yearsBetween =
              (new Date(effectiveToday).getTime() -
                new Date(prevPoint.date).getTime()) /
              (1000 * 60 * 60 * 24 * 365);
            weightedReturn += w * (RISK_FREE_RATE * yearsBetween);
            continue;
          }
          const series = seriesPerAsset.get(ticker);
          if (!series) continue;
          const startPrice = series.daily.get(prevPoint.date);
          const currPrice = series.daily.get(effectiveToday);
          if (startPrice && currPrice && startPrice > 0) {
            weightedReturn += w * (currPrice / startPrice - 1);
          }
        }

        // Reemplazar el último equity point por la versión "real de hoy"
        lastPoint.date = effectiveToday;
        lastPoint.value = prevPoint.value * (1 + weightedReturn);
        lastPoint.holdings = [...activeHoldings]; // las que de verdad sostienes

        // Descartar la rotación agendada para el futuro (si la hay)
        if (rebalances.length > 0) {
          const lastRebal = rebalances[rebalances.length - 1]!;
          if (lastRebal.date > todayStr) {
            rebalances.pop();
          }
        }
      }
    }
  }

  // 5. Métricas
  const metrics = buildMetrics(equityCurve, rebalances.length);
  const annualReturns = buildAnnualReturns(equityCurve, config.initialAmount);

  // 5.b. Fiscalidad — la curva de equity ya es NETA del camino (se restó el
  //      impuesto en cada rotación). Adjuntamos el total pagado, el valor bruto
  //      contrafactual y el impuesto pendiente si se liquidara la posición final.
  if (taxOn && equityCurve.length > 1) {
    const finalValue = equityCurve[equityCurve.length - 1]!.value;
    const finalCostBasis = Array.from(posCost.values()).reduce((a, b) => a + b, 0);
    const finalUnrealized = Math.max(0, finalValue - finalCostBasis);
    let pendingLiquidationTax = 0;
    if (finalUnrealized > 0) {
      pendingLiquidationTax =
        taxMode === "spain-irpf"
          ? spanishIrpfTax(annualRealized + finalUnrealized) -
            spanishIrpfTax(Math.max(0, annualRealized))
          : finalUnrealized * flatRate;
    }
    metrics.totalTaxesPaid = totalTaxesPaid;
    metrics.grossFinalValue = grossValue;
    metrics.pendingLiquidationTax = pendingLiquidationTax;
  }

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

  // 7. Ranking ACTUAL / VIVO — replica EXACTA de la página "Model Signals" de
  //    Portfoliovisualizer. A diferencia del backtest histórico (que trabaja
  //    en granularidad mensual y opcionalmente excluye el mes anterior), PV
  //    calcula su Model Signal usando datos DIARIOS:
  //
  //      end   = último precio diario disponible (hoy)
  //      start = precio del día más cercano a (hoy − lookbackMonths)
  //
  //    Esto garantiza que el "ranking vivo" muestre exactamente los mismos
  //    números que el usuario ve en PV — sin la desviación que introduce
  //    el alineamiento mensual ni la exclusión del mes en curso.
  let liveRanking: MomentumLiveRanking | undefined;
  try {
    // 7.1. Encontrar la fecha de señal: la EARLIEST de las "últimas fechas"
    //      de cada activo, para que todos tengan dato a esa fecha.
    const latestPerAsset: string[] = [];
    for (const series of seriesPerAsset.values()) {
      const dates = Array.from(series.daily.keys()).sort();
      if (dates.length > 0) latestPerAsset.push(dates[dates.length - 1]!);
    }
    if (latestPerAsset.length > 0) {
      latestPerAsset.sort();
      const signalDate = latestPerAsset[0]!;

      // 7.2. Determinar la fecha de cierre del cálculo según excludePreviousMonth:
      //
      //  - excludePrev=FALSE: usamos la última fecha disponible (= signalDate, el
      //    último día con datos para todos los activos). Equivale al precio
      //    "ahora mismo" — el cálculo incluye el mes en curso.
      //
      //  - excludePrev=TRUE: usamos el último día hábil del mes ANTERIOR al
      //    mes en curso. El mes en curso queda excluido — el cálculo termina
      //    al cierre del mes pasado. Replica el "12-1 momentum" académico.
      //
      // La fecha de inicio (startDateTarget) NO cambia entre los dos modos —
      // siempre es signalDate − lookbackMonths. Es la fecha FINAL la que se
      // recorta cuando se excluye el último mes (idéntico al comportamiento
      // del motor mensual que usa monthlyClose).
      const signalMonth = signalDate.substring(0, 7);
      let endDateTarget: string;
      if (config.excludePreviousMonth) {
        // Último día del mes anterior al mes señal: tomar el primer día del
        // mes señal y restar 1 día.
        const [sy, sm] = signalMonth.split("-").map((s) => parseInt(s, 10));
        const firstOfSignalMonth = new Date(Date.UTC(sy!, (sm ?? 1) - 1, 1));
        const lastOfPrevMonth = new Date(firstOfSignalMonth);
        lastOfPrevMonth.setUTCDate(0); // retrocede al último día del mes previo
        endDateTarget = lastOfPrevMonth.toISOString().slice(0, 10);
      } else {
        endDateTarget = signalDate;
      }

      // Fecha de inicio del lookback (signalDate − lookbackMonths)
      const startD = new Date(signalDate);
      startD.setUTCMonth(startD.getUTCMonth() - config.lookbackMonths);
      const startDateTarget = startD.toISOString().slice(0, 10);
      let firstFoundStart: string | null = null;
      let firstFoundEnd: string | null = null;

      // 7.3. Calcular momentum + vol + MA por activo usando datos diarios
      type LiveCandidate = {
        ticker: string;
        mom: number;
        vol: number | null;
        score: number;
        aboveMA: boolean;
      };
      const liveCandidates: LiveCandidate[] = [];

      for (const [ticker, series] of seriesPerAsset) {
        const sortedDates = Array.from(series.daily.keys()).sort();

        // Precio final: último dato <= endDateTarget. Si excludePrev=true,
        // endDateTarget es el último día del mes pasado, así que esto
        // automáticamente excluye los días del mes en curso.
        let endIdx = -1;
        for (let i = sortedDates.length - 1; i >= 0; i--) {
          if (sortedDates[i]! <= endDateTarget) {
            endIdx = i;
            break;
          }
        }
        if (endIdx < 0) continue;
        const endPrice = series.daily.get(sortedDates[endIdx]!)!;
        if (firstFoundEnd === null) firstFoundEnd = sortedDates[endIdx]!;

        // Precio inicial: primer dato >= startDateTarget
        let startPrice: number | undefined;
        let startDateFound: string | undefined;
        for (const d of sortedDates) {
          if (d >= startDateTarget) {
            startPrice = series.daily.get(d);
            startDateFound = d;
            break;
          }
        }
        if (!startPrice || startPrice <= 0 || !startDateFound) continue;
        if (firstFoundStart === null) firstFoundStart = startDateFound;

        const mom = endPrice / startPrice - 1;

        // Volatilidad: ventana de volPeriod × 21 días hábiles que termina
        // EN endIdx (= endDateTarget). Mismo cálculo que volatilityAt pero
        // anclado al día concreto. Con excludePrev=true la ventana de vol
        // también termina en el mes anterior, coherente con la lógica.
        let vol: number | null = null;
        if (rankingMethod === "sharpe" || config.weighting === "volatility") {
          const windowSize = volPeriod * 21;
          const volStartIdx = Math.max(0, endIdx - windowSize + 1);
          const datesInWindow = sortedDates.slice(volStartIdx, endIdx + 1);
          const rets: number[] = [];
          for (let i = 1; i < datesInWindow.length; i++) {
            const prev = series.daily.get(datesInWindow[i - 1]!)!;
            const curr = series.daily.get(datesInWindow[i]!)!;
            if (prev > 0) rets.push(curr / prev - 1);
          }
          if (rets.length >= 5) vol = annualizeStdDev(rets, 252);
        }

        const score =
          rankingMethod === "sharpe"
            ? vol && vol > 0
              ? mom / vol
              : -Infinity
            : mom;

        // MA filter: usa la MA mensual del último mes COMPLETADO (signalMonth-1)
        // si excludePrev=true, o del mes señal si excludePrev=false.
        let aboveMA = true;
        if (config.movingAverageMonths && config.movingAverageMonths > 0) {
          const maMonth = config.excludePreviousMonth
            ? addMonths(signalMonth, -1)
            : signalMonth;
          const ma = movingAverage(
            series.monthlyClose,
            maMonth,
            config.movingAverageMonths
          );
          aboveMA = ma !== null && endPrice > ma;
        }

        liveCandidates.push({ ticker, mom, vol, score, aboveMA });
      }

      // 7.4. Ordenar y aplicar filtros top-K + MA + ponderación
      liveCandidates.sort((a, b) => b.score - a.score);
      const liveTopK = liveCandidates.slice(0, config.assetsToHold);
      const livePassing = config.movingAverageMonths
        ? liveTopK.filter((c) => c.aboveMA)
        : liveTopK;
      const liveForcedCash =
        config.movingAverageMonths != null && livePassing.length === 0;
      const liveHoldings = liveForcedCash
        ? ["CASH"]
        : livePassing.map((c) => c.ticker);

      if (liveCandidates.length > 0) {
        liveRanking = {
          // signalDate = fecha FINAL real usada por el cálculo (con o sin
          // exclusión del mes en curso). El usuario ve aquí el día concreto
          // hasta el que se mide el momentum.
          signalDate: firstFoundEnd ?? endDateTarget,
          startDate: firstFoundStart ?? startDateTarget,
          holdings: liveHoldings,
          forcedCash: liveForcedCash,
          ranking: liveCandidates.map((c) => ({
            ticker: c.ticker,
            momentumPercent: c.mom * 100,
            volatilityPercent: c.vol !== null ? c.vol * 100 : undefined,
            score: c.score,
            aboveMA: c.aboveMA,
          })),
        };
      }
    }
  } catch {
    // Si por algún motivo no se puede calcular, lo dejamos undefined
    // y el frontend simplemente no muestra la sección.
  }

  return {
    config,
    equityCurve,
    rebalances,
    metrics,
    annualReturns,
    benchmarkCurve,
    benchmarkMetrics,
    liveRanking,
    warnings,
  };
}

export { monthsBetween };
