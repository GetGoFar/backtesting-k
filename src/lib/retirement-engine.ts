// =============================================================================
// RETIREMENT ENGINE — Block bootstrap + glide path A→B + IRPF + inflación
// =============================================================================
//
// Algoritmo: para cada path (≥1000), generar la trayectoria mes a mes:
//
//   1) Block bootstrap de 12 meses: para cada año del plan, escoger
//      aleatoriamente un índice de inicio de la serie histórica y aplicar
//      los 12 meses consecutivos a partir de ahí.
//
//   2) Glide path: en los `glidePathYears` previos a la jubilación,
//      interpolar linealmente el retorno entre cartera A (acumulación) y
//      cartera B (distribución). Antes de eso = 100% A; después = 100% B.
//
//   3) Flujos: durante acumulación se aporta `monthlyContributionReal`
//      ajustado por inflación (€ nominales). Durante jubilación se retira
//      `monthlyWithdrawalReal` ajustado por inflación, descontando IRPF
//      proporcional a la plusvalía latente.
//
// El motor devuelve además los COHORTES HISTÓRICOS: una simulación
// determinista por cada posible mes de inicio dentro de la serie histórica.
// Esto enseña "sequence of returns risk" con datos reales.
//
// Todos los valores devueltos están en € REALES (descontando inflación).
// =============================================================================

import type {
  RetirementConfig,
  RetirementResult,
  RetirementYearPoint,
  RetirementHistoricalCohort,
} from "./retirement-types";

// -----------------------------------------------------------------------------
// IRPF España 2024 sobre el ahorro — tramos progresivos
// -----------------------------------------------------------------------------

const SPAIN_IRPF_BRACKETS: Array<{ upTo: number; rate: number }> = [
  { upTo: 6000, rate: 0.19 },
  { upTo: 50000, rate: 0.21 },
  { upTo: 200000, rate: 0.23 },
  { upTo: 300000, rate: 0.27 },
  { upTo: Infinity, rate: 0.28 },
];

/** Cuota IRPF total para una plusvalía anual `gainAnnual` (€). */
function spainIrpfTax(gainAnnual: number): number {
  if (gainAnnual <= 0) return 0;
  let remaining = gainAnnual;
  let cumulLow = 0;
  let tax = 0;
  for (const br of SPAIN_IRPF_BRACKETS) {
    const slice = Math.max(0, Math.min(remaining, br.upTo - cumulLow));
    tax += slice * br.rate;
    remaining -= slice;
    cumulLow = br.upTo;
    if (remaining <= 0) break;
  }
  return tax;
}

// -----------------------------------------------------------------------------
// Path único — devuelve la serie mensual de valores REALES y los flujos
// -----------------------------------------------------------------------------

interface PathResult {
  /** Valor del patrimonio en € reales al final de cada mes. 0 si se agotó. */
  monthlyValuesReal: number[];
  /** Mes (0-indexed) en el que se agotó el dinero. undefined si llegó al fin. */
  depletionMonth?: number;
  /** Acumulado de aportaciones en € reales. */
  totalContributionsReal: number;
  /** Acumulado de retiradas (netas de IRPF) en € reales. */
  totalWithdrawalsReal: number;
}

interface BootstrapSource {
  /** Series de retornos mensuales: returns[i] = retorno mensual del mes i en histórica. */
  retA: number[];
  retB: number[];
  /** Longitud de la serie (igual para A y B después de alinear). */
  length: number;
}

/**
 * Calcula el `weightA` (0..1) del glide path para un mes dado del plan.
 * - Antes de `retirementAge - glidePathYears`: 100% A
 * - Entre `-glidePathYears` y 0 antes de jubilación: interpolación lineal
 * - Desde la jubilación en adelante: 100% B
 */
function glideWeight(
  monthOfPlan: number,
  monthsToRetirement: number,
  glidePathMonths: number
): number {
  const monthsLeft = monthsToRetirement - monthOfPlan;
  if (glidePathMonths <= 0) return monthsLeft > 0 ? 1 : 0;
  if (monthsLeft >= glidePathMonths) return 1;
  if (monthsLeft <= 0) return 0;
  return monthsLeft / glidePathMonths;
}

/**
 * Ejecuta una trayectoria mes a mes.
 *
 * @param config — configuración del plan
 * @param source — series históricas de retornos mensuales de A y B
 * @param sampler — función que devuelve el índice de inicio del bloque de
 *                  12 meses para cada AÑO del plan. Para bootstrap aleatorio
 *                  devuelve un valor random; para cohortes históricos devuelve
 *                  un índice contiguo a partir del mes de inicio del cohorte.
 */
function simulatePath(
  config: RetirementConfig,
  source: BootstrapSource,
  /** Recibe el índice de bloque (0, 1, 2, ...) y devuelve el mes inicial del
   *  bloque en el histórico. La frecuencia con la que se llama depende de
   *  `config.blockSizeMonths` (1 vez por bloque). */
  sampler: (blockIdx: number) => number
): PathResult {
  const monthsAcc = (config.retirementAge - config.currentAge) * 12;
  const totalMonths = (config.endAge - config.currentAge) * 12;
  const glidePathMonths = Math.max(0, Math.round(config.glidePathYears * 12));

  // Inflación mensual derivada de la anual
  const inflMonthly =
    Math.pow(1 + config.inflationAnnualPct / 100, 1 / 12) - 1;

  let currentValue = config.initialCapital;
  // Coste base para cálculo de plusvalía (método del coste medio)
  let costBasis = config.initialCapital;

  // Plusvalía RECONOCIDA en el año natural en curso (para tramos IRPF)
  let annualGainRecognized = 0;
  let annualTaxPaid = 0;

  const monthlyValuesReal: number[] = [];
  let totalContributionsReal = 0;
  let totalWithdrawalsReal = 0;
  let depletionMonth: number | undefined;

  for (let m = 0; m < totalMonths; m++) {
    // Reset anual del tracking de IRPF al iniciar nuevo año natural
    if (m > 0 && m % 12 === 0) {
      annualGainRecognized = 0;
      annualTaxPaid = 0;
    }

    // Inflación acumulada hasta este mes (factor multiplicativo)
    const inflFactor = Math.pow(1 + inflMonthly, m);

    // ---- 1) Retorno del mes vía block bootstrap + glide path ----
    // Sampler se invoca una vez por BLOQUE (no por año). Dentro de un bloque
    // los meses son consecutivos en el histórico, preservando autocorrelación
    // intra-bloque. Entre bloques distintos, independencia.
    const blockSize = config.blockSizeMonths;
    const blockIdxInPlan = Math.floor(m / blockSize);
    const monthInBlock = m % blockSize;
    const blockStart = sampler(blockIdxInPlan);
    const histIdx = (blockStart + monthInBlock) % source.length;
    const wA = glideWeight(m, monthsAcc, glidePathMonths);
    const retM = wA * source.retA[histIdx]! + (1 - wA) * source.retB[histIdx]!;

    if (currentValue > 0) currentValue *= 1 + retM;

    // ---- 2) Flujos: aportación o retirada ----
    const isRetiredPhase = m >= monthsAcc;

    if (!isRetiredPhase) {
      // Aportación: nominal = contribución real × inflación
      const contribNom = config.monthlyContributionReal * inflFactor;
      currentValue += contribNom;
      costBasis += contribNom;
      totalContributionsReal += config.monthlyContributionReal;
    } else if (currentValue > 0) {
      const withdrawNom = config.monthlyWithdrawalReal * inflFactor;

      // Fracción de la cartera que es plusvalía latente (método coste medio)
      const gainFraction =
        currentValue > 0 ? Math.max(0, currentValue - costBasis) / currentValue : 0;

      // Si retiramos `X` nominal: plusvalía realizada = X × gainFraction
      // En el año natural acumulamos plusvalía y aplicamos tramos.
      const gainThisMonth = withdrawNom * gainFraction;
      const gainAfter = annualGainRecognized + gainThisMonth;

      let monthTax = 0;
      if (config.taxMode === "spain-irpf") {
        const taxAfter = spainIrpfTax(gainAfter);
        monthTax = Math.max(0, taxAfter - annualTaxPaid);
        annualTaxPaid = taxAfter;
      } else if (config.taxMode === "flat" && config.flatTaxRatePct) {
        monthTax = gainThisMonth * (config.flatTaxRatePct / 100);
      }
      annualGainRecognized = gainAfter;

      const totalToTake = withdrawNom + monthTax;

      if (totalToTake >= currentValue) {
        // Se agota este mes
        depletionMonth = m;
        const realizedNet = Math.max(0, currentValue - monthTax);
        totalWithdrawalsReal += realizedNet / inflFactor;
        currentValue = 0;
        costBasis = 0;
      } else {
        currentValue -= totalToTake;
        // Ajustar costBasis proporcionalmente a la parte de capital retirada
        const principalFraction = 1 - gainFraction;
        costBasis = Math.max(0, costBasis - withdrawNom * principalFraction);
        totalWithdrawalsReal += config.monthlyWithdrawalReal;
      }
    }

    monthlyValuesReal.push(currentValue / inflFactor);
  }

  return {
    monthlyValuesReal,
    depletionMonth,
    totalContributionsReal,
    totalWithdrawalsReal,
  };
}

// -----------------------------------------------------------------------------
// Función principal de la simulación
// -----------------------------------------------------------------------------

/**
 * Construye las series de retornos mensuales {retA, retB} alineadas por mes
 * común. Espera dos maps "YYYY-MM" → retorno mensual de cada cartera.
 */
function alignReturns(
  monthlyRetA: Map<string, number>,
  monthlyRetB: Map<string, number>,
  startMonth?: string,
  endMonth?: string
): { months: string[]; retA: number[]; retB: number[] } {
  const common: string[] = [];
  for (const m of monthlyRetA.keys()) {
    if (!monthlyRetB.has(m)) continue;
    if (startMonth && m < startMonth) continue;
    if (endMonth && m > endMonth) continue;
    common.push(m);
  }
  common.sort();
  return {
    months: common,
    retA: common.map((m) => monthlyRetA.get(m)!),
    retB: common.map((m) => monthlyRetB.get(m)!),
  };
}

/**
 * Calcula percentiles de un array de valores numéricos.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

export interface RunRetirementInput {
  config: RetirementConfig;
  monthlyReturnsAccumulation: Map<string, number>;
  monthlyReturnsDistribution: Map<string, number>;
}

export function runRetirementSimulation(input: RunRetirementInput): RetirementResult {
  const { config, monthlyReturnsAccumulation, monthlyReturnsDistribution } = input;
  const warnings: string[] = [];

  // Alinear retornos históricos de ambas carteras
  const aligned = alignReturns(
    monthlyReturnsAccumulation,
    monthlyReturnsDistribution,
    config.histStartMonth,
    config.histEndMonth
  );

  if (aligned.months.length < 24) {
    throw new Error(
      `Histórico insuficiente: solo ${aligned.months.length} meses comunes (mínimo 24). Amplía el rango histStartMonth/histEndMonth.`
    );
  }

  const source: BootstrapSource = {
    retA: aligned.retA,
    retB: aligned.retB,
    length: aligned.months.length,
  };

  const totalYears = config.endAge - config.currentAge;
  const totalMonths = totalYears * 12;
  const requestedBlockSize = config.blockSizeMonths;

  // ---- Auto-ajuste del blockSize cuando el histórico es corto ----
  // Si los puntos de inicio posibles son muy pocos, el bootstrap apenas
  // sortea entre N alternativas → trayectorias clónicas, percentiles falsamente
  // estrechos. Auto-reducimos blockSize para tener al menos ~24 puntos de
  // inicio, con un mínimo de 1 mes. AVISAMOS al usuario del ajuste.
  let effectiveBlockSize = requestedBlockSize;
  const MIN_BLOCK_START_POINTS = 24;
  if (source.length - effectiveBlockSize < MIN_BLOCK_START_POINTS) {
    effectiveBlockSize = Math.max(
      1,
      Math.min(requestedBlockSize, source.length - MIN_BLOCK_START_POINTS)
    );
    if (effectiveBlockSize < requestedBlockSize) {
      warnings.push(
        `Histórico corto (${source.length} meses): blockSize reducido de ${requestedBlockSize} a ${effectiveBlockSize} meses para que el bootstrap tenga al menos ${MIN_BLOCK_START_POINTS} puntos de inicio posibles y aporte diversidad.`
      );
    }
  }
  const maxBlockStart = Math.max(0, source.length - effectiveBlockSize);
  const blockStartPoints = maxBlockStart + 1;

  // ---- Avisos por histórico corto e insuficiente para el plan ----
  const recyclingFactor = totalMonths / source.length;
  if (source.length < 180) {
    warnings.push(
      `Histórico común de sólo ${source.length} meses (${(source.length / 12).toFixed(1)} años). Mínimo recomendado: 15 años. El bootstrap puede no incluir crisis severas y sobrestimar la probabilidad de éxito.`
    );
  }
  if (recyclingFactor > 1.5) {
    warnings.push(
      `El plan dura ${(totalMonths / 12).toFixed(0)} años pero el histórico solo cubre ${(source.length / 12).toFixed(1)}. Cada cohorte histórico recicla el histórico ${recyclingFactor.toFixed(1)} veces, lo que infla artificialmente la estabilidad de los percentiles.`
    );
  }
  if (maxBlockStart === 0) {
    warnings.push(
      `El histórico (${source.length} meses) es igual o menor al tamaño del bloque (${effectiveBlockSize}); el bootstrap no aporta diversidad.`
    );
  }

  // ---- 1) Bootstrap aleatorio: numPaths trayectorias ----
  // Bloque de tamaño efectivo (puede haberse reducido arriba) — pasamos al
  // simulador la versión "efectiva" sustituyendo en la config local.
  const cfgEffective: RetirementConfig = {
    ...config,
    blockSizeMonths: effectiveBlockSize,
  };
  const paths: PathResult[] = [];
  for (let i = 0; i < config.numPaths; i++) {
    const sampler = (_year: number) =>
      Math.floor(Math.random() * blockStartPoints);
    paths.push(simulatePath(cfgEffective, source, sampler));
  }

  // ---- 2) Percentiles año a año (valores reales al cierre de cada año) ----
  const currentYear = new Date().getUTCFullYear();
  const yearByYear: RetirementYearPoint[] = [];
  for (let year = 1; year <= totalYears; year++) {
    const m = year * 12 - 1; // último mes de ese año (índice 0-based)
    const valuesAtMonth = paths
      .map((p) => p.monthlyValuesReal[m] ?? 0)
      .sort((a, b) => a - b);
    const survivors = valuesAtMonth.filter((v) => v > 0).length;
    // Aportaciones acumuladas en €/reales hasta este mes
    const monthsAcc = (config.retirementAge - config.currentAge) * 12;
    const contribMonths = Math.min(m + 1, monthsAcc);
    const withdrawMonths = Math.max(0, m + 1 - monthsAcc);
    yearByYear.push({
      age: config.currentAge + year,
      year: currentYear + year,
      p10: percentile(valuesAtMonth, 10),
      p25: percentile(valuesAtMonth, 25),
      p50: percentile(valuesAtMonth, 50),
      p75: percentile(valuesAtMonth, 75),
      p90: percentile(valuesAtMonth, 90),
      contributionsCumulativeReal: config.monthlyContributionReal * contribMonths,
      withdrawalsCumulativeReal: config.monthlyWithdrawalReal * withdrawMonths,
      survivalRate: paths.length > 0 ? (survivors / paths.length) * 100 : 0,
    });
  }

  // ---- 3) Métricas agregadas ----
  const finalValues = paths
    .map((p) => p.monthlyValuesReal[totalMonths - 1] ?? 0)
    .sort((a, b) => a - b);
  const successCount = paths.filter(
    (p) => (p.monthlyValuesReal[totalMonths - 1] ?? 0) > 0
  ).length;
  const successProbability = (successCount / paths.length) * 100;
  const depleted = paths.filter((p) => p.depletionMonth !== undefined);
  const depletionAges = depleted
    .map((p) => config.currentAge + (p.depletionMonth ?? 0) / 12)
    .sort((a, b) => a - b);
  const medianDepletionAge =
    depletionAges.length > 0
      ? depletionAges[Math.floor(depletionAges.length / 2)]
      : undefined;
  const medianFinalValueReal = percentile(finalValues, 50);

  // ---- 4) Cohortes históricos (uno por cada posible mes de inicio) ----
  const cohorts: RetirementHistoricalCohort[] = [];
  const needed = totalMonths;
  // Cuántos meses de histórico necesitamos como mínimo para correr UN cohorte
  // completo de forma determinista. Usamos sampling con wrap si no llega.
  for (let start = 0; start < source.length; start++) {
    // Para cada bloque del plan, índice de inicio = start + blockIdx*blockSize
    // (con wrap modular si el plan es más largo que el histórico).
    const sampler = (blockIdx: number) =>
      (start + blockIdx * effectiveBlockSize) % source.length;
    const path = simulatePath(cfgEffective, source, sampler);
    const finalReal = path.monthlyValuesReal[needed - 1] ?? 0;
    const success = finalReal > 0;
    const depletionAge =
      path.depletionMonth !== undefined
        ? config.currentAge + path.depletionMonth / 12
        : undefined;
    const startMonth = aligned.months[start]!;
    cohorts.push({
      startMonth,
      startYear: parseInt(startMonth.substring(0, 4), 10),
      finalValueReal: finalReal,
      depletionAge,
      success,
      totalWithdrawnReal: path.totalWithdrawalsReal,
    });
  }

  const histSuccessCount = cohorts.filter((c) => c.success).length;
  const historicalSuccessRate =
    cohorts.length > 0 ? (histSuccessCount / cohorts.length) * 100 : 0;
  const worstHistoricalCohort = cohorts
    .slice()
    .sort((a, b) => a.finalValueReal - b.finalValueReal)[0];
  const bestHistoricalCohort = cohorts
    .slice()
    .sort((a, b) => b.finalValueReal - a.finalValueReal)[0];

  return {
    config,
    successProbability,
    medianFinalValueReal,
    medianDepletionAge,
    depletionProbability: (depleted.length / paths.length) * 100,
    yearByYear,
    historicalCohorts: cohorts,
    historicalSuccessRate,
    worstHistoricalCohort,
    bestHistoricalCohort,
    bootstrapSource: {
      historicalMonths: source.length,
      historicalStartMonth: aligned.months[0] ?? "",
      historicalEndMonth: aligned.months[aligned.months.length - 1] ?? "",
      planMonths: totalMonths,
      recyclingFactor,
      requestedBlockSize,
      effectiveBlockSize,
      blockStartPoints,
    },
    warnings,
  };
}
