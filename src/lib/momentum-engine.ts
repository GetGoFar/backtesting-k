// =============================================================================
// MOMENTUM ENGINE — Relative Strength tactical asset allocation
// =============================================================================
//
// Réplica del modelo "Relative Strength" de Portfoliovisualizer:
//
//   1. Cada N períodos (mes/trimestre) rankear el universo por retorno
//      acumulado en lookbackMonths.
//   2. Si excludePreviousMonth = true, el lookback termina en t-1 (no en t).
//      Razón: el momentum de 1 mes suele revertir (Jegadeesh 1990).
//   3. Top-K activos pasan a la cartera.
//   4. Si movingAverageMonths > 0: solo entran los top-K que estén por encima
//      de su MA de N meses. Si todos fallan el filtro, va a CASH (no opera).
//   5. Pondera con equal-weight (o rank-weight / inverse-vol según config).
//   6. Reinvierte en el siguiente periodo.
//
// El motor trabaja en BASE MENSUAL (último precio de cada mes) — Portfoliovisualizer
// hace lo mismo. Reduce ruido vs datos diarios y casa con la lógica académica.
// =============================================================================

import { getDailyPrices, type DailyPricesResult } from "./data-fetcher";
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
// Utilidades de fechas — trabajamos con keys "YYYY-MM"
// -----------------------------------------------------------------------------

/** "YYYY-MM" → Date (1er día del mes). */
function monthKeyToDate(key: string): Date {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
}

/** Date → "YYYY-MM". */
function dateToMonthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

/** Avanza N meses sobre una key "YYYY-MM". */
function addMonths(key: string, n: number): string {
  const d = monthKeyToDate(key);
  d.setUTCMonth(d.getUTCMonth() + n);
  return dateToMonthKey(d);
}

/** Compara dos keys "YYYY-MM" (-1 / 0 / 1). */
function compareMonths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Diferencia en meses entre dos keys. */
function monthsBetween(a: string, b: string): number {
  const da = monthKeyToDate(a);
  const db = monthKeyToDate(b);
  return (
    (db.getUTCFullYear() - da.getUTCFullYear()) * 12 +
    (db.getUTCMonth() - da.getUTCMonth())
  );
}

// -----------------------------------------------------------------------------
// Agregación a mensual
// -----------------------------------------------------------------------------

/** Agrega precios diarios a mensuales (último precio de cada mes). */
function aggregateToMonthly(daily: DailyPricesResult): Map<string, number> {
  const monthly = new Map<string, number>();
  const sortedDates = Array.from(daily.prices.keys()).sort();
  for (const date of sortedDates) {
    const month = date.substring(0, 7);
    monthly.set(month, daily.prices.get(date)!);
  }
  return monthly;
}

/** Carga precios mensuales para un activo. Acepta fundId opcional para TER/metadata. */
async function fetchMonthlyForAsset(asset: MomentumAsset): Promise<Map<string, number>> {
  // Si tiene fundId, usar la ruta normal de fund-database (cache, validación, fallbacks).
  if (asset.fundId) {
    const fund = getFundById(asset.fundId);
    if (fund) {
      const daily = await getDailyPrices(fund.id, fund.yahooTicker, fund.isin);
      return aggregateToMonthly(daily);
    }
  }
  // Ticker libre: usar el ticker como id (data-fetcher lo manda a EODHD/Yahoo).
  const daily = await getDailyPrices(asset.ticker, asset.ticker, undefined);
  return aggregateToMonthly(daily);
}

// -----------------------------------------------------------------------------
// Cálculo de momentum
// -----------------------------------------------------------------------------

/**
 * Retorna el momentum del activo en `date`. Mide retorno acumulado desde
 * (date - lookbackMonths) hasta (date - excludePrevious ? 1 : 0).
 * Retorna null si no hay suficientes datos.
 */
function momentumAt(
  prices: Map<string, number>,
  date: string,
  lookbackMonths: number,
  excludePrevious: boolean
): number | null {
  const endKey = excludePrevious ? addMonths(date, -1) : date;
  const startKey = addMonths(endKey, -lookbackMonths);
  const startPrice = prices.get(startKey);
  const endPrice = prices.get(endKey);
  if (!startPrice || !endPrice || startPrice <= 0) return null;
  return endPrice / startPrice - 1;
}

/** Devuelve la media móvil de N meses centrada en `date`. */
function movingAverage(
  prices: Map<string, number>,
  date: string,
  windowMonths: number
): number | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < windowMonths; i++) {
    const k = addMonths(date, -i);
    const p = prices.get(k);
    if (p && p > 0) {
      sum += p;
      count++;
    }
  }
  if (count < Math.ceil(windowMonths * 0.6)) return null; // mínimo 60% de datos
  return sum / count;
}

/**
 * Volatilidad anualizada en los últimos `windowMonths` meses TERMINANDO en `date`.
 * Calcula retornos mensuales y multiplica desv. típica × √12.
 * Devuelve null si no hay datos suficientes.
 */
function volatilityAt(
  prices: Map<string, number>,
  date: string,
  windowMonths: number
): number | null {
  const rets: number[] = [];
  for (let i = 0; i < windowMonths; i++) {
    const prevKey = addMonths(date, -i - 1);
    const currKey = addMonths(date, -i);
    const prev = prices.get(prevKey);
    const curr = prices.get(currKey);
    if (prev && curr && prev > 0) {
      rets.push(curr / prev - 1);
    }
  }
  if (rets.length < 2) return null;
  return calcVolatility(rets);
}

// -----------------------------------------------------------------------------
// Métricas
// -----------------------------------------------------------------------------

function calcCAGR(initial: number, final: number, years: number): number {
  if (initial <= 0 || years <= 0) return 0;
  return Math.pow(final / initial, 1 / years) - 1;
}

function calcVolatility(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;
  const mean = monthlyReturns.reduce((s, r) => s + r, 0) / monthlyReturns.length;
  const variance =
    monthlyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) /
    (monthlyReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12);
}

function calcDownsideDeviation(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;
  const downside = monthlyReturns.map((r) => Math.min(r, 0) ** 2);
  const meanSq = downside.reduce((s, d) => s + d, 0) / monthlyReturns.length;
  return Math.sqrt(meanSq) * Math.sqrt(12);
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

const RISK_FREE_RATE = 0.02; // 2% anual — coherente con backtest engine

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

  const months = monthsBetween(
    equityCurve[0]!.date,
    equityCurve[equityCurve.length - 1]!.date
  );
  const years = months / 12;
  const cagr = calcCAGR(initialValue, finalValue, years);

  // Retornos mensuales
  const monthlyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1]!.value;
    const curr = equityCurve[i]!.value;
    if (prev > 0) monthlyReturns.push(curr / prev - 1);
  }

  const vol = calcVolatility(monthlyReturns);
  const downsideDev = calcDownsideDeviation(monthlyReturns);
  const excessReturn = cagr - RISK_FREE_RATE;
  const sharpe = vol > 0 ? excessReturn / vol : 0;
  const sortino = downsideDev > 0 ? excessReturn / downsideDev : 0;

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

function buildAnnualReturns(curve: MomentumEquityPoint[]): MomentumAnnualReturn[] {
  if (curve.length < 2) return [];
  const byYear = new Map<number, { start: number; end: number }>();
  for (const point of curve) {
    const year = parseInt(point.date.substring(0, 4), 10);
    if (!byYear.has(year)) {
      byYear.set(year, { start: point.value, end: point.value });
    } else {
      byYear.get(year)!.end = point.value;
    }
  }
  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, vals]) => ({
      year,
      returnPercent: vals.start > 0 ? (vals.end / vals.start - 1) * 100 : 0,
      finalValue: vals.end,
    }));
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

  // 1. Cargar precios mensuales de TODOS los activos en paralelo
  const pricesPerAsset = new Map<string, Map<string, number>>();
  const assetMeta = new Map<string, MomentumAsset>();
  await Promise.all(
    config.assets.map(async (asset) => {
      try {
        const monthly = await fetchMonthlyForAsset(asset);
        if (monthly.size === 0) {
          warnings.push(`Sin datos para ${asset.ticker} — excluido del universo`);
          return;
        }
        pricesPerAsset.set(asset.ticker, monthly);
        assetMeta.set(asset.ticker, asset);
      } catch (err) {
        warnings.push(
          `Error obteniendo ${asset.ticker}: ${err instanceof Error ? err.message : "desconocido"}`
        );
      }
    })
  );

  // Benchmark opcional
  let benchmarkPrices: Map<string, number> | null = null;
  if (config.benchmarkTicker) {
    try {
      const daily = await getDailyPrices(
        config.benchmarkTicker,
        config.benchmarkTicker,
        undefined
      );
      benchmarkPrices = aggregateToMonthly(daily);
    } catch (err) {
      warnings.push(
        `Benchmark ${config.benchmarkTicker} no disponible: ${err instanceof Error ? err.message : "desconocido"}`
      );
    }
  }

  if (pricesPerAsset.size < 2) {
    throw new Error("Menos de 2 activos con datos válidos — no se puede ejecutar momentum");
  }

  // 2. Determinar el rango de meses utilizables
  // Necesitamos al menos `lookbackMonths` (+ 1 si excludePrevious) ANTES del inicio
  // para poder calcular el primer momentum.
  const minOffset = config.lookbackMonths + (config.excludePreviousMonth ? 1 : 0);
  const requestedStart = config.startDate.substring(0, 7);
  const requestedEnd = config.endDate.substring(0, 7);

  // Primer mes con datos para TODOS los activos (intersección de rangos)
  const allFirstMonths: string[] = [];
  const allLastMonths: string[] = [];
  for (const prices of pricesPerAsset.values()) {
    const sorted = Array.from(prices.keys()).sort();
    if (sorted.length > 0) {
      allFirstMonths.push(sorted[0]!);
      allLastMonths.push(sorted[sorted.length - 1]!);
    }
  }
  const dataStart = allFirstMonths.sort().pop()!; // máximo de los firstMonth
  const dataEnd = allLastMonths.sort()[0]!;        // mínimo de los lastMonth

  // El primer mes en el que podemos OPERAR es dataStart + minOffset
  const firstOperationalMonth = addMonths(dataStart, minOffset);
  const effectiveStart =
    compareMonths(requestedStart, firstOperationalMonth) >= 0
      ? requestedStart
      : firstOperationalMonth;
  const effectiveEnd =
    compareMonths(requestedEnd, dataEnd) <= 0 ? requestedEnd : dataEnd;

  if (effectiveStart !== requestedStart) {
    warnings.push(
      `Fecha inicio ajustada de ${requestedStart} a ${effectiveStart} por falta de datos para el lookback.`
    );
  }
  if (effectiveEnd !== requestedEnd) {
    warnings.push(
      `Fecha fin ajustada de ${requestedEnd} a ${effectiveEnd} por límite de datos.`
    );
  }

  if (compareMonths(effectiveStart, effectiveEnd) >= 0) {
    throw new Error(
      `Rango efectivo vacío (${effectiveStart} → ${effectiveEnd}). Amplía el rango o reduce el lookback.`
    );
  }

  // 3. Bucle mensual: simulación
  let currentValue = config.initialAmount;
  let currentHoldings: string[] = []; // tickers que se sostienen ESTE mes
  let currentWeights = new Map<string, number>();

  const equityCurve: MomentumEquityPoint[] = [];
  const rebalances: MomentumRebalance[] = [];

  const slippage = (config.slippagePercent ?? 0) / 100;
  const rebalanceEvery = config.frequency === "quarterly" ? 3 : 1;

  // Iteramos mes a mes desde effectiveStart hasta effectiveEnd
  let monthIdx = 0;
  for (
    let month = effectiveStart;
    compareMonths(month, effectiveEnd) <= 0;
    month = addMonths(month, 1), monthIdx++
  ) {
    // ¿Toca rebalancear?
    const isRebalanceMonth = monthIdx % rebalanceEvery === 0;

    if (isRebalanceMonth) {
      // Calcular ranking en este mes
      const rankingMethod = config.rankingMethod ?? "momentum";
      const volPeriod = config.volatilityPeriodMonths ?? 3;

      const candidates: Array<{
        ticker: string;
        mom: number;
        vol: number | null;
        score: number;
        aboveMA: boolean;
      }> = [];

      for (const [ticker, prices] of pricesPerAsset) {
        const mom = momentumAt(
          prices,
          month,
          config.lookbackMonths,
          config.excludePreviousMonth
        );
        if (mom === null) continue;

        // Volatilidad: solo se calcula si el método la necesita o si se va a
        // ponderar por inverse volatility (la usa más abajo igualmente).
        let vol: number | null = null;
        if (rankingMethod === "sharpe" || config.weighting === "volatility") {
          vol = volatilityAt(prices, month, volPeriod);
        }

        // Score por el que se ordenará el universo
        let score: number;
        if (rankingMethod === "sharpe") {
          // Si la volatilidad es 0 o no calculable, penalizar al final (-Inf)
          score = vol && vol > 0 ? mom / vol : -Infinity;
        } else {
          score = mom; // momentum puro
        }

        let aboveMA = true;
        if (config.movingAverageMonths && config.movingAverageMonths > 0) {
          const ma = movingAverage(prices, month, config.movingAverageMonths);
          const currentPrice = prices.get(month);
          aboveMA = ma !== null && currentPrice !== undefined && currentPrice > ma;
        }

        candidates.push({ ticker, mom, vol, score, aboveMA });
      }

      candidates.sort((a, b) => b.score - a.score);
      const topK = candidates.slice(0, config.assetsToHold);

      // Aplicar filtro MA: descartar los que no superan MA si está activo
      const passing = config.movingAverageMonths
        ? topK.filter((c) => c.aboveMA)
        : topK;
      const forcedCash = config.movingAverageMonths != null && passing.length === 0;

      const newHoldings = forcedCash ? ["CASH"] : passing.map((c) => c.ticker);
      const newWeights = new Map<string, number>();
      if (forcedCash) {
        newWeights.set("CASH", 1);
      } else if (config.weighting === "equal" || config.weighting === "rank") {
        // rank → ponderación inversa al puesto (1º pesa más)
        if (config.weighting === "rank") {
          const N = passing.length;
          const totalRank = (N * (N + 1)) / 2; // suma 1..N
          passing.forEach((c, i) => {
            newWeights.set(c.ticker, (N - i) / totalRank);
          });
        } else {
          const w = 1 / passing.length;
          for (const c of passing) newWeights.set(c.ticker, w);
        }
      } else if (config.weighting === "volatility") {
        // Inverse volatility weighting (vol de últimos volPeriod meses)
        const vols: Array<{ ticker: string; inv: number }> = [];
        for (const c of passing) {
          // Reutilizar la volatilidad ya calculada en el candidato si existe
          const v = c.vol ?? volatilityAt(pricesPerAsset.get(c.ticker)!, month, volPeriod);
          vols.push({ ticker: c.ticker, inv: v && v > 0 ? 1 / v : 0 });
        }
        const sumInv = vols.reduce((s, v) => s + v.inv, 0);
        if (sumInv > 0) {
          for (const v of vols) newWeights.set(v.ticker, v.inv / sumInv);
        } else {
          const w = 1 / passing.length;
          for (const c of passing) newWeights.set(c.ticker, w);
        }
      }

      // Detectar si hay cambio respecto al mes anterior
      const prevSet = new Set(currentHoldings);
      const newSet = new Set(newHoldings);
      const changed =
        prevSet.size !== newSet.size ||
        [...newSet].some((t) => !prevSet.has(t));

      if (changed || equityCurve.length === 0) {
        rebalances.push({
          date: month,
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

        // Slippage: aplicar al porcentaje rotado
        if (slippage > 0 && equityCurve.length > 0) {
          // Capital que sale + capital que entra = ~100% del valor si se rota todo
          // (aproximación simple). Lo cobramos como 2 × slippage × valor sobre la parte
          // que cambia.
          const turnover = computeTurnover(currentWeights, newWeights);
          currentValue *= 1 - turnover * slippage;
        }
      }

      currentHoldings = newHoldings;
      currentWeights = newWeights;
    }

    // Aplicar retorno del mes ACTUAL (de month-1 a month) sobre las posiciones
    // que se mantienen ESTE mes. Para el primer mes, todavía no hay variación.
    if (equityCurve.length > 0) {
      const prevMonth = addMonths(month, -1);
      let weightedReturn = 0;
      for (const [ticker, w] of currentWeights) {
        if (ticker === "CASH") {
          // Cash devuelve ~ tasa libre de riesgo prorrateada mensualmente
          weightedReturn += w * (RISK_FREE_RATE / 12);
          continue;
        }
        const prices = pricesPerAsset.get(ticker);
        if (!prices) continue;
        const prev = prices.get(prevMonth);
        const curr = prices.get(month);
        if (prev && curr && prev > 0) {
          weightedReturn += w * (curr / prev - 1);
        }
      }
      currentValue *= 1 + weightedReturn;
    }

    equityCurve.push({
      date: month,
      value: currentValue,
      holdings: [...currentHoldings],
    });
  }

  // 4. Métricas
  const metrics = buildMetrics(equityCurve, rebalances.length);
  const annualReturns = buildAnnualReturns(equityCurve);

  // 5. Benchmark
  let benchmarkCurve: MomentumEquityPoint[] | undefined;
  let benchmarkMetrics: MomentumMetrics | undefined;
  if (benchmarkPrices) {
    benchmarkCurve = [];
    const sorted = Array.from(benchmarkPrices.keys()).sort();
    const firstAvail = sorted.find(
      (k) => compareMonths(k, effectiveStart) >= 0
    );
    if (firstAvail) {
      const startPrice = benchmarkPrices.get(firstAvail)!;
      for (
        let month = effectiveStart;
        compareMonths(month, effectiveEnd) <= 0;
        month = addMonths(month, 1)
      ) {
        const p = benchmarkPrices.get(month);
        if (!p) continue;
        benchmarkCurve.push({
          date: month,
          value: (p / startPrice) * config.initialAmount,
          holdings: [config.benchmarkTicker!],
        });
      }
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

/** Aproximación de turnover entre dos asignaciones (L1/2). */
function computeTurnover(
  prev: Map<string, number>,
  next: Map<string, number>
): number {
  const tickers = new Set([...prev.keys(), ...next.keys()]);
  let sum = 0;
  for (const t of tickers) {
    sum += Math.abs((next.get(t) ?? 0) - (prev.get(t) ?? 0));
  }
  return sum / 2; // turnover one-way
}
