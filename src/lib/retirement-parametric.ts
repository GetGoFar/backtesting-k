// =============================================================================
// RETIREMENT PARAMETRIC — Monte Carlo paramétrico (log-normal)
// =============================================================================
//
// Versión paramétrica del simulador de jubilación: en vez de tirar retornos del
// histórico de EODHD, los GENERA cada mes desde una distribución log-normal
// parametrizada por (retorno esperado, volatilidad) anuales.
//
// Se usa en /simulador-retiro como widget público embedable en elproyectok.com.
// =============================================================================

import type {
  FinancialGoal,
  GoalDuration,
  GoalStart,
  GoalType,
  RetirementTaxMode,
  WithdrawalScenario,
  RetirementYearPoint,
} from "./retirement-types";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

/** Configuración paramétrica — sin carteras, sólo media y vol. */
export interface ParametricConfig {
  // Edades
  currentAge: number;
  retirementAge: number;
  endAge: number;

  // Capital y flujos
  initialCapital: number;
  goals: FinancialGoal[];

  // Parámetros de la cartera de ACUMULACIÓN
  accumulationReturn: number; // % anual esperado (nominal)
  accumulationVol: number;    // % anual desv. típica
  // Parámetros de la cartera de DISTRIBUCIÓN
  distributionReturn: number;
  distributionVol: number;
  /** Años de transición lineal A→B antes de jubilarse (0 = instantánea). */
  glidePathYears: number;

  // Macro
  inflationAnnualPct: number;
  taxMode: RetirementTaxMode;
  flatTaxRatePct?: number;

  // Sim
  /** Número de paths del Monte Carlo. Default 1000. */
  numPaths: number;
}

export interface ParametricResult {
  config: ParametricConfig;

  // Métricas agregadas
  successProbability: number;
  medianFinalValueReal: number;
  medianDepletionAge?: number;
  depletionProbability: number;

  // Fan chart
  yearByYear: RetirementYearPoint[];

  // Path representativo (mediano) — para gráfico vs sequence risk
  representativeMedianPath: { monthlyValuesReal: number[] };

  // Sequence risk: el path real con peor 5 años inmediatos post-jubilación
  sequenceRisk: {
    windowMonths: number;
    finalValueReal: number;
    success: boolean;
    depletionAge?: number;
    /** % de pérdida acumulada en los primeros 5 años de jubilación (nominal). */
    worstWindowCumulativeReturn: number;
    monthlyValuesReal: number[];
  };

  // Tasas SWR/PWR path-by-path con escenarios
  withdrawalRates: {
    capitalAtRetirementReal: number;
    pathsAnalyzed: number;
    scenarios: WithdrawalScenario[];
  };

  warnings: string[];
}

// -----------------------------------------------------------------------------
// Generador normal estándar (Box-Muller)
// -----------------------------------------------------------------------------

/** N(0,1) muestra una variable aleatoria normal estándar. */
function randStandardNormal(): number {
  // Box-Muller — evitamos u1 = 0 para que el log no explote.
  let u1 = 0;
  while (u1 === 0) u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// -----------------------------------------------------------------------------
// IRPF España (mismo que el motor histórico)
// -----------------------------------------------------------------------------

const SPAIN_IRPF_BRACKETS: Array<{ upTo: number; rate: number }> = [
  { upTo: 6000, rate: 0.19 },
  { upTo: 50000, rate: 0.21 },
  { upTo: 200000, rate: 0.23 },
  { upTo: 300000, rate: 0.27 },
  { upTo: Infinity, rate: 0.28 },
];

function spainIrpfTax(gainAnnual: number): number {
  if (gainAnnual <= 0) return 0;
  let remaining = gainAnnual;
  let tax = 0;
  let prev = 0;
  for (const b of SPAIN_IRPF_BRACKETS) {
    const slice = Math.min(remaining, b.upTo - prev);
    tax += slice * b.rate;
    remaining -= slice;
    prev = b.upTo;
    if (remaining <= 0) break;
  }
  return tax;
}

// -----------------------------------------------------------------------------
// Parámetros log-normal mensuales
// -----------------------------------------------------------------------------

/** Convierte (μ_anual, σ_anual) en parámetros log-normales mensuales con
 *  corrección Itô para que el retorno medio AGREGADO en 12 meses sea ≈ μ. */
function logNormalMonthlyParams(
  annualReturnPct: number,
  annualVolPct: number
): { mu: number; sigma: number } {
  const muAnn = annualReturnPct / 100;
  const sigAnn = annualVolPct / 100;
  // Aproximación: si σ es pequeña, σ_log ≈ σ
  const muLogAnn = Math.log(1 + muAnn);
  // Drift mensual de log con corrección Itô (asegura que E[exp(X)] − 1 = μ/12)
  const monthlyMu = muLogAnn / 12 - (sigAnn * sigAnn) / 24;
  const monthlySigma = sigAnn / Math.sqrt(12);
  return { mu: monthlyMu, sigma: monthlySigma };
}

// -----------------------------------------------------------------------------
// Path simulator (idéntico al histórico — sólo cambia de dónde vienen los retornos)
// -----------------------------------------------------------------------------

interface PathOut {
  monthlyValuesReal: number[];
  depletionMonth?: number;
  /** Capital REAL al inicio de cada mes (para SWR/PWR path-by-path). */
  capitalAtRetirementReal: number;
  /** Retornos REALES post-jubilación. */
  postReturnsReal: number[];
}

function glideWeight(m: number, monthsAcc: number, glidePathMonths: number): number {
  if (glidePathMonths <= 0) return m < monthsAcc ? 1 : 0;
  const start = monthsAcc - glidePathMonths;
  if (m < start) return 1;
  if (m >= monthsAcc) return 0;
  const monthsLeft = monthsAcc - m;
  return monthsLeft / glidePathMonths;
}

interface GoalWindow {
  goal: FinancialGoal;
  startMonth: number;
  endMonth: number;
}

function buildGoalWindows(
  goals: FinancialGoal[],
  monthsAcc: number,
  totalMonths: number
): GoalWindow[] {
  return goals.map((g) => {
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
}

/** Simula UN path completo del Monte Carlo paramétrico. */
function simulateParametricPath(config: ParametricConfig): PathOut {
  const totalMonths = (config.endAge - config.currentAge) * 12;
  const monthsAcc = (config.retirementAge - config.currentAge) * 12;
  const glidePathMonths = Math.max(0, Math.round(config.glidePathYears * 12));

  const paramA = logNormalMonthlyParams(config.accumulationReturn, config.accumulationVol);
  const paramB = logNormalMonthlyParams(config.distributionReturn, config.distributionVol);

  const inflMonthly = Math.pow(1 + config.inflationAnnualPct / 100, 1 / 12) - 1;

  const goalWindows = buildGoalWindows(config.goals, monthsAcc, totalMonths);

  let currentValue = config.initialCapital;
  let costBasis = config.initialCapital;
  let annualGainRecognized = 0;
  let annualTaxPaid = 0;

  const monthlyValuesReal: number[] = [];
  let depletionMonth: number | undefined;
  let capitalAtRetirementReal = 0;
  const postReturnsReal: number[] = [];
  let prevValueReal: number | undefined;

  for (let m = 0; m < totalMonths; m++) {
    if (m > 0 && m % 12 === 0) {
      annualGainRecognized = 0;
      annualTaxPaid = 0;
    }

    const inflFactor = Math.pow(1 + inflMonthly, m);

    // --- 1) Retorno del mes — sample log-normal de A y B + glide path ---
    const wA = glideWeight(m, monthsAcc, glidePathMonths);
    // Sampling independiente cada mes (iid). Si quisiéramos correlacionar
    // A y B podríamos usar la misma variable normal y escalar; iid es lo
    // estándar en MC paramétrico.
    const zA = randStandardNormal();
    const zB = randStandardNormal();
    const logRetA = paramA.mu + paramA.sigma * zA;
    const logRetB = paramB.mu + paramB.sigma * zB;
    const retA = Math.exp(logRetA) - 1;
    const retB = Math.exp(logRetB) - 1;
    const retM = wA * retA + (1 - wA) * retB;

    if (currentValue > 0) currentValue *= 1 + retM;

    // --- 2) Cash flows según goals ---
    let contribNomThisMonth = 0;
    let withdrawNomThisMonth = 0;

    for (const { goal, startMonth, endMonth } of goalWindows) {
      if (m < startMonth || m >= endMonth) continue;
      const inflMul = goal.inflationAdjusted ? inflFactor : 1;
      if (goal.type === "contribution") {
        const amt = (goal.amount ?? 0) * inflMul;
        contribNomThisMonth += amt;
      } else if (goal.type === "fixedWithdrawal") {
        const amt = (goal.amount ?? 0) * inflMul;
        withdrawNomThisMonth += amt;
      } else if (goal.type === "percentageWithdrawal") {
        const pct = (goal.percentagePct ?? 0) / 100 / 12;
        withdrawNomThisMonth += currentValue * pct;
      }
    }

    if (contribNomThisMonth > 0) {
      currentValue += contribNomThisMonth;
      costBasis += contribNomThisMonth;
    }

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
        currentValue = 0;
        costBasis = 0;
      } else {
        currentValue -= totalToTake;
        const principalFraction = 1 - gainFraction;
        costBasis = Math.max(0, costBasis - withdrawNomThisMonth * principalFraction);
      }
    }

    const real = currentValue / inflFactor;
    monthlyValuesReal.push(real);

    if (m === monthsAcc - 1) capitalAtRetirementReal = real;
    if (m >= monthsAcc && prevValueReal !== undefined && prevValueReal > 0) {
      postReturnsReal.push(real / prevValueReal - 1);
    } else if (m >= monthsAcc) {
      postReturnsReal.push(0);
    }
    prevValueReal = real;
  }

  return { monthlyValuesReal, depletionMonth, capitalAtRetirementReal, postReturnsReal };
}

// -----------------------------------------------------------------------------
// SWR/PWR helpers (mismo que el motor histórico)
// -----------------------------------------------------------------------------

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

function findMaxWithdrawal(
  K: number,
  realReturns: number[],
  criterion: "noDeplete" | "preserveCapital"
): number {
  if (K <= 0 || realReturns.length === 0) return 0;
  let lo = 0;
  let hi = K;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (simulateWithdrawalReal(K, mid, realReturns, criterion)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(
    0,
    Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx]!;
}

// -----------------------------------------------------------------------------
// Función principal
// -----------------------------------------------------------------------------

export function runParametricRetirement(config: ParametricConfig): ParametricResult {
  const warnings: string[] = [];

  const totalYears = config.endAge - config.currentAge;
  const totalMonths = totalYears * 12;
  const monthsAcc = (config.retirementAge - config.currentAge) * 12;

  if (totalMonths < 12) {
    throw new Error("endAge debe ser al menos 1 año mayor que currentAge");
  }
  if (config.accumulationVol < 0 || config.distributionVol < 0) {
    throw new Error("La volatilidad debe ser positiva");
  }

  const numPaths = Math.max(100, Math.min(5000, config.numPaths || 1000));

  // ---- Bootstrap paramétrico: simular N paths ----
  const paths: PathOut[] = [];
  for (let i = 0; i < numPaths; i++) {
    paths.push(simulateParametricPath(config));
  }

  // ---- Métricas agregadas ----
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

  // ---- Path representativo (mediano) ----
  const representativeIdx =
    paths
      .map((p, i) => ({
        i,
        diff: Math.abs(
          (p.monthlyValuesReal[totalMonths - 1] ?? 0) - medianFinalValueReal
        ),
      }))
      .sort((a, b) => a.diff - b.diff)[0]?.i ?? 0;
  const representativePath = paths[representativeIdx]!;

  // ---- Fan chart año a año ----
  const currentYear = new Date().getUTCFullYear();
  const yearByYear: RetirementYearPoint[] = [];
  for (let year = 1; year <= totalYears; year++) {
    const m = year * 12 - 1;
    const valuesAtMonth = paths
      .map((p) => p.monthlyValuesReal[m] ?? 0)
      .sort((a, b) => a - b);
    const survivors = valuesAtMonth.filter((v) => v > 0).length;
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
      contributionsCumulativeReal: 0,
      contributionRealAnnual: 0,
      withdrawalsCumulativeReal: 0,
      withdrawalRealAnnual: 0,
      survivalRate: paths.length > 0 ? (survivors / paths.length) * 100 : 0,
    });
  }

  // ---- Sequence risk: el path con peor 5-año cumulativo post-jubilación ----
  const retMonths = totalMonths - monthsAcc;
  const seqWindowMonths = Math.min(60, Math.max(12, retMonths));
  let worstPath: PathOut | null = null;
  let worstCumProd = Infinity;
  for (const p of paths) {
    if (p.depletionMonth !== undefined && p.depletionMonth < monthsAcc) continue;
    let cum = 1;
    for (let k = 0; k < seqWindowMonths; k++) {
      const r = p.postReturnsReal[k] ?? 0;
      cum *= 1 + r;
    }
    if (cum < worstCumProd) {
      worstCumProd = cum;
      worstPath = p;
    }
  }
  const seqPath = worstPath ?? representativePath;
  const seqDepletion =
    seqPath.depletionMonth !== undefined
      ? config.currentAge + seqPath.depletionMonth / 12
      : undefined;
  const sequenceRisk = {
    windowMonths: seqWindowMonths,
    finalValueReal: seqPath.monthlyValuesReal[totalMonths - 1] ?? 0,
    success: (seqPath.monthlyValuesReal[totalMonths - 1] ?? 0) > 0,
    depletionAge: seqDepletion,
    worstWindowCumulativeReturn:
      worstCumProd === Infinity ? 0 : (worstCumProd - 1) * 100,
    monthlyValuesReal: seqPath.monthlyValuesReal,
  };

  // ---- Tasas SWR/PWR path-by-path ----
  // Re-corremos sin retiros para tener capital al jubilarse limpio
  const contribOnlyGoals = config.goals.filter((g) => g.type === "contribution");
  const cfgNoWithdrawal: ParametricConfig = {
    ...config,
    goals: contribOnlyGoals,
  };
  const swrPerPath: number[] = [];
  const pwrPerPath: number[] = [];
  const capitalsAtRetirement: number[] = [];
  for (let i = 0; i < numPaths && retMonths > 0; i++) {
    const p = simulateParametricPath(cfgNoWithdrawal);
    if (p.capitalAtRetirementReal <= 0) continue;
    capitalsAtRetirement.push(p.capitalAtRetirementReal);
    swrPerPath.push(
      findMaxWithdrawal(p.capitalAtRetirementReal, p.postReturnsReal, "noDeplete")
    );
    pwrPerPath.push(
      findMaxWithdrawal(
        p.capitalAtRetirementReal,
        p.postReturnsReal,
        "preserveCapital"
      )
    );
  }
  swrPerPath.sort((a, b) => a - b);
  pwrPerPath.sort((a, b) => a - b);
  capitalsAtRetirement.sort((a, b) => a - b);
  const capitalAtRetirementReal = percentile(capitalsAtRetirement, 50);
  const toPctAnnual = (eurMonth: number): number =>
    capitalAtRetirementReal > 0
      ? (eurMonth * 12 / capitalAtRetirementReal) * 100
      : 0;

  const SCENARIO_DEFS = [
    { label: "Bengen", key: "bengen", percentile: 1 },
    { label: "Agorero", key: "agorero", percentile: 5 },
    { label: "Conservador", key: "conservador", percentile: 25 },
    { label: "Medio", key: "medio", percentile: 50 },
    { label: "Optimista", key: "optimista", percentile: 75 },
  ];
  const scenarios: WithdrawalScenario[] = SCENARIO_DEFS.map((s) => {
    const swrAt = percentile(swrPerPath, s.percentile);
    const pwrAt = percentile(pwrPerPath, s.percentile);
    return {
      label: s.label,
      key: s.key,
      percentile: s.percentile,
      successRatePct: 100 - s.percentile,
      swr: { eurPerMonth: swrAt, pctAnnual: toPctAnnual(swrAt) },
      pwr: { eurPerMonth: pwrAt, pctAnnual: toPctAnnual(pwrAt) },
    };
  });

  // Warnings paramétricos
  if (config.accumulationVol < 5) {
    warnings.push(
      "La volatilidad de la cartera de acumulación es muy baja (<5%). Para RV típica espera 12-18%."
    );
  }
  if (config.accumulationReturn > 15) {
    warnings.push(
      "Retorno esperado >15% es muy optimista a largo plazo. RV global histórica = 7-9% nominal."
    );
  }
  const nominalGoals = config.goals.filter((g) => !g.inflationAdjusted);
  if (nominalGoals.length > 0) {
    warnings.push(
      `${nominalGoals.length} objetivo(s) en cantidades NOMINALES. Con 2-3% de inflación anual, su poder adquisitivo se erosiona ~25% por década.`
    );
  }

  return {
    config,
    successProbability,
    medianFinalValueReal,
    medianDepletionAge,
    depletionProbability: (depleted.length / paths.length) * 100,
    yearByYear,
    representativeMedianPath: {
      monthlyValuesReal: representativePath.monthlyValuesReal,
    },
    sequenceRisk,
    withdrawalRates: {
      capitalAtRetirementReal,
      pathsAnalyzed: swrPerPath.length,
      scenarios,
    },
    warnings,
  };
}

// Re-exportar tipos compartidos para que la página los importe de un solo sitio
export type { FinancialGoal, GoalType, GoalStart, GoalDuration, RetirementTaxMode };
