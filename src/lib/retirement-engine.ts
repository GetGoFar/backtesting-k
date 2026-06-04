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
  FinancialGoal,
} from "./retirement-types";

// -----------------------------------------------------------------------------
// Compatibilidad: si la config no trae `goals` explícitos, reconstruimos
// dos goals por defecto desde los campos legacy: contribución continua hasta
// jubilación + retirada fija desde jubilación hasta fin del plan. Ambos
// ajustados por inflación.
// -----------------------------------------------------------------------------
function buildLegacyGoals(config: RetirementConfig): FinancialGoal[] {
  const goals: FinancialGoal[] = [];
  if (config.monthlyContributionReal > 0) {
    goals.push({
      id: "legacy-contribution",
      type: "contribution",
      amount: config.monthlyContributionReal,
      start: "immediately",
      durationType: "untilRetirement",
      inflationAdjusted: true,
    });
  }
  if (config.monthlyWithdrawalReal > 0) {
    goals.push({
      id: "legacy-withdrawal",
      type: "fixedWithdrawal",
      amount: config.monthlyWithdrawalReal,
      start: "atRetirement",
      durationType: "untilEnd",
      inflationAdjusted: true,
    });
  }
  return goals;
}

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

  // Normalizar goals: si no vienen explícitos, reconstruir desde los
  // campos legacy `monthlyContributionReal` / `monthlyWithdrawalReal`.
  const goals = (config.goals && config.goals.length > 0)
    ? config.goals
    : buildLegacyGoals(config);

  // Pre-calcular ventanas [startMonth, endMonth) por goal
  const goalWindows = goals.map((g) => {
    const startMonth =
      g.start === "immediately"
        ? 0
        : g.start === "atRetirement"
        ? monthsAcc
        : Math.max(0, Math.round((g.startYearsFromNow ?? 0) * 12));
    const endMonth =
      g.durationType === "untilEnd"
        ? totalMonths
        : g.durationType === "untilRetirement"
        ? monthsAcc
        : startMonth + Math.max(0, Math.round((g.durationYears ?? 0) * 12));
    return { goal: g, startMonth, endMonth };
  });

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

    // ---- 2) Flujos: iterar todos los objetivos activos este mes ----
    // Acumulamos primero las aportaciones (suman a currentValue + costBasis)
    // y los retiros NOMINALES brutos. Después aplicamos los retiros con IRPF.
    let contribNomThisMonth = 0;
    let withdrawNomThisMonth = 0;
    let contribRealThisMonth = 0;
    let withdrawRealThisMonth = 0;

    for (const { goal, startMonth, endMonth } of goalWindows) {
      if (m < startMonth || m >= endMonth) continue;
      const inflMul = goal.inflationAdjusted ? inflFactor : 1;
      if (goal.type === "contribution") {
        const amt = (goal.amount ?? 0) * inflMul;
        contribNomThisMonth += amt;
        contribRealThisMonth += amt / inflFactor;
      } else if (goal.type === "fixedWithdrawal") {
        const amt = (goal.amount ?? 0) * inflMul;
        withdrawNomThisMonth += amt;
        withdrawRealThisMonth += amt / inflFactor;
      } else if (goal.type === "percentageWithdrawal") {
        // % anual → mensual = pct/12. Aplicado sobre currentValue tras retorno
        const pct = (goal.percentagePct ?? 0) / 100 / 12;
        const amt = currentValue * pct;
        withdrawNomThisMonth += amt;
        withdrawRealThisMonth += amt / inflFactor;
      }
    }

    // Aportaciones primero
    if (contribNomThisMonth > 0) {
      currentValue += contribNomThisMonth;
      costBasis += contribNomThisMonth;
      totalContributionsReal += contribRealThisMonth;
    }

    // Retiros con IRPF (sólo si hay capital y hay retiros)
    if (withdrawNomThisMonth > 0 && currentValue > 0) {
      const gainFraction =
        currentValue > 0
          ? Math.max(0, currentValue - costBasis) / currentValue
          : 0;
      const gainThisMonth = withdrawNomThisMonth * gainFraction;
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

      const totalToTake = withdrawNomThisMonth + monthTax;
      if (totalToTake >= currentValue) {
        if (depletionMonth === undefined) depletionMonth = m;
        const realizedNet = Math.max(0, currentValue - monthTax);
        totalWithdrawalsReal += realizedNet / inflFactor;
        currentValue = 0;
        costBasis = 0;
      } else {
        currentValue -= totalToTake;
        const principalFraction = 1 - gainFraction;
        costBasis = Math.max(
          0,
          costBasis - withdrawNomThisMonth * principalFraction
        );
        totalWithdrawalsReal += withdrawRealThisMonth;
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
/**
 * Encuentra la ventana de `windowMonths` consecutivos cuya rentabilidad
 * acumulada es la PEOR. Devuelve el índice de inicio y el retorno acumulado.
 * Se usa para el stress test de sequence-of-returns risk: inyectar este
 * tramo al inicio de la jubilación.
 */
function findWorstWindow(
  returns: number[],
  windowMonths: number
): { startIdx: number; cumulativeReturn: number } {
  if (returns.length < windowMonths) {
    return { startIdx: 0, cumulativeReturn: 0 };
  }
  let worstStart = 0;
  let worstCum = Infinity;
  for (let i = 0; i + windowMonths <= returns.length; i++) {
    let cum = 1;
    for (let k = 0; k < windowMonths; k++) cum *= 1 + returns[i + k]!;
    if (cum < worstCum) {
      worstCum = cum;
      worstStart = i;
    }
  }
  // Retornar como porcentaje: (1+r)−1 × 100
  return {
    startIdx: worstStart,
    cumulativeReturn: (worstCum - 1) * 100,
  };
}

/**
 * Simula la fase de retirada con un retiro mensual fijo (en € reales) sobre
 * un capital inicial real K y una secuencia de retornos REALES mensuales.
 * Devuelve `success` según el criterio elegido:
 *   - "noDeplete": dinero no llega a 0 antes del final
 *   - "preserveCapital": además, capital final ≥ capital inicial K
 */
function simulateWithdrawalReal(
  K: number,
  R: number,
  realReturns: number[],
  criterion: "noDeplete" | "preserveCapital"
): boolean {
  let capital = K;
  for (const r of realReturns) {
    capital = capital * (1 + r) - R;
    if (capital <= 0) return false;
  }
  return criterion === "preserveCapital" ? capital >= K : true;
}

/**
 * Binary search del retiro mensual máximo (€ reales) que cumple el criterio.
 */
function findMaxWithdrawal(
  K: number,
  realReturns: number[],
  criterion: "noDeplete" | "preserveCapital"
): number {
  if (K <= 0 || realReturns.length === 0) return 0;
  let lo = 0;
  let hi = K; // cota superior — retirar todo el capital en un mes
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (simulateWithdrawalReal(K, mid, realReturns, criterion)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Convierte retornos NOMINALES mensuales en REALES, dado un inflMonthly.
 * real = (1 + nominal) / (1 + infl) - 1
 */
function toRealReturns(nominal: number[], inflMonthly: number): number[] {
  const inflFactor = 1 + inflMonthly;
  return nominal.map((r) => (1 + r) / inflFactor - 1);
}

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
  const monthsAcc = (config.retirementAge - config.currentAge) * 12;
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

  // ---- Aviso por goals en cantidades NOMINALES ----
  const effectiveGoals = (config.goals && config.goals.length > 0)
    ? config.goals
    : buildLegacyGoals(config);
  const nominalGoals = effectiveGoals.filter((g) => !g.inflationAdjusted);
  if (nominalGoals.length > 0) {
    warnings.push(
      `Hay ${nominalGoals.length} objetivo(s) en cantidades NOMINALES (no ajustadas por inflación). Con 2-3% de inflación anual, su poder adquisitivo se erosiona ~25% por década. Las cifras finales aparentemente "altas" en € de hoy son engañosamente optimistas.`
    );
  }

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

  // Path representativo: del conjunto bootstrap, el que más cerca queda
  // del p50 al final. Sirve para tener UNA trayectoria real comparable con
  // la del sequence risk (en vez de el p50 cruzando paths, que no es una
  // trayectoria real).
  const representativeIdx = paths
    .map((p, i) => ({
      i,
      diff: Math.abs(
        (p.monthlyValuesReal[totalMonths - 1] ?? 0) - medianFinalValueReal
      ),
    }))
    .sort((a, b) => a.diff - b.diff)[0]?.i ?? 0;
  const representativePath = paths[representativeIdx]!;

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

  // ---- 5) Sequence-of-returns risk: peor ventana inyectada al jubilarse ----
  // Buscamos la peor ventana de 5 años (60 meses) en el histórico de la cartera
  // de DISTRIBUCIÓN (la que se usa post-jubilación). Si la jubilación dura
  // menos de 5 años, usamos toda esa duración. Si el histórico es menor que
  // la ventana solicitada, recortamos a la longitud del histórico.
  const desiredWindowMonths = 60;
  const retirementMonths = totalMonths - monthsAcc;
  const windowMonths = Math.min(
    desiredWindowMonths,
    Math.max(12, retirementMonths),
    source.length
  );
  const worstWindow = findWorstWindow(source.retB, windowMonths);

  // Construimos un sampler especial: random durante acumulación, luego
  // INYECTAR la peor ventana en los bloques que cubren los primeros
  // `windowMonths` de jubilación, y random después.
  const sequenceRiskSampler = (blockIdx: number): number => {
    const monthOfPlan = blockIdx * effectiveBlockSize;
    if (monthOfPlan < monthsAcc) {
      // Acumulación → random
      return Math.floor(Math.random() * blockStartPoints);
    }
    const monthsIntoRetirement = monthOfPlan - monthsAcc;
    if (monthsIntoRetirement < windowMonths) {
      // Inyectar peor ventana — el offset dentro de la ventana se calcula
      // según en qué punto del bloque estamos
      const offsetInWindow = monthsIntoRetirement;
      // El sampler devuelve un blockStart; los meses del bloque son
      // (blockStart + monthInBlock) % source.length. Queremos que el
      // resultado coincida con worstWindow.startIdx + offsetInWindow para
      // monthInBlock=0. Así que blockStart = worstWindow.startIdx + offsetInWindow.
      return (worstWindow.startIdx + offsetInWindow) % source.length;
    }
    // Post peor-ventana → random
    return Math.floor(Math.random() * blockStartPoints);
  };
  // Promediamos múltiples runs del escenario de riesgo (la parte aleatoria
  // pre/post peor-ventana añade variabilidad). Tomamos la MEDIANA del valor
  // final para representar el escenario.
  const SEQ_RISK_RUNS = 200;
  const seqRiskPaths: PathResult[] = [];
  for (let i = 0; i < SEQ_RISK_RUNS; i++) {
    seqRiskPaths.push(simulatePath(cfgEffective, source, sequenceRiskSampler));
  }
  // Mediana del valor final + cohorte mediano (representativo)
  const seqFinalSorted = seqRiskPaths
    .map((p) => p.monthlyValuesReal[totalMonths - 1] ?? 0)
    .sort((a, b) => a - b);
  const seqMedianFinal = seqFinalSorted[Math.floor(seqFinalSorted.length / 2)] ?? 0;
  // Path representativo: el que más cerca está de la mediana
  const seqRepIdx = seqRiskPaths
    .map((p, i) => ({
      i,
      diff: Math.abs((p.monthlyValuesReal[totalMonths - 1] ?? 0) - seqMedianFinal),
    }))
    .sort((a, b) => a.diff - b.diff)[0]?.i ?? 0;
  const seqRepPath = seqRiskPaths[seqRepIdx]!;
  const seqDepletion =
    seqRepPath.depletionMonth !== undefined
      ? config.currentAge + seqRepPath.depletionMonth / 12
      : undefined;

  // ---- Tasas de retirada SWR / PWR ----
  // Capital REAL al jubilarse: mediana del bootstrap en el mes monthsAcc-1
  const capitalsAtRetirement = paths
    .map((p) => p.monthlyValuesReal[Math.max(0, monthsAcc - 1)] ?? 0)
    .sort((a, b) => a - b);
  const capitalAtRetirementReal = percentile(capitalsAtRetirement, 50);

  // Pasamos los retornos del histórico de la cartera de distribución a REALES
  const inflMonthly =
    Math.pow(1 + config.inflationAnnualPct / 100, 1 / 12) - 1;
  const realReturns = toRealReturns(source.retB, inflMonthly);

  // Para cada ventana contigua del histórico de longitud `retirement_months`
  // (con wrap modular si el histórico es más corto que la jubilación),
  // buscamos el retiro máximo según cada criterio.
  const retMonths = totalMonths - monthsAcc;
  const swrPerWindow: number[] = [];
  const pwrPerWindow: number[] = [];
  if (capitalAtRetirementReal > 0 && retMonths > 0 && realReturns.length > 0) {
    for (let start = 0; start < source.length; start++) {
      const window: number[] = [];
      for (let k = 0; k < retMonths; k++) {
        window.push(realReturns[(start + k) % source.length]!);
      }
      swrPerWindow.push(
        findMaxWithdrawal(capitalAtRetirementReal, window, "noDeplete")
      );
      pwrPerWindow.push(
        findMaxWithdrawal(capitalAtRetirementReal, window, "preserveCapital")
      );
    }
  }
  swrPerWindow.sort((a, b) => a - b);
  pwrPerWindow.sort((a, b) => a - b);
  const confidencePct = 90;
  // El "umbral seguro" = peor 10% de los escenarios. Como swrPerWindow está
  // ordenado ascendente, el percentil 10 (índice 10%) es ese umbral.
  const safeIdx = Math.max(0, Math.floor(swrPerWindow.length * (100 - confidencePct) / 100));
  const swrSafe = swrPerWindow[safeIdx] ?? 0;
  const pwrSafe = pwrPerWindow[safeIdx] ?? 0;
  const swrMedianVal = percentile(swrPerWindow, 50);
  const pwrMedianVal = percentile(pwrPerWindow, 50);

  const toPctAnnual = (eurMonth: number): number =>
    capitalAtRetirementReal > 0
      ? (eurMonth * 12 / capitalAtRetirementReal) * 100
      : 0;

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
    withdrawalRates: {
      capitalAtRetirementReal,
      windowsAnalyzed: swrPerWindow.length,
      confidencePct,
      swr: { eurPerMonth: swrSafe, pctAnnual: toPctAnnual(swrSafe) },
      pwr: { eurPerMonth: pwrSafe, pctAnnual: toPctAnnual(pwrSafe) },
      swrMedian: { eurPerMonth: swrMedianVal, pctAnnual: toPctAnnual(swrMedianVal) },
      pwrMedian: { eurPerMonth: pwrMedianVal, pctAnnual: toPctAnnual(pwrMedianVal) },
    },
    representativeMedianPath: {
      monthlyValuesReal: representativePath.monthlyValuesReal,
    },
    sequenceRisk: {
      windowMonths,
      worstWindowStartMonth: aligned.months[worstWindow.startIdx] ?? "",
      worstWindowCumulativeReturn: worstWindow.cumulativeReturn,
      finalValueReal: seqRepPath.monthlyValuesReal[totalMonths - 1] ?? 0,
      success: (seqRepPath.monthlyValuesReal[totalMonths - 1] ?? 0) > 0,
      depletionAge: seqDepletion,
      monthlyValuesReal: seqRepPath.monthlyValuesReal,
    },
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
