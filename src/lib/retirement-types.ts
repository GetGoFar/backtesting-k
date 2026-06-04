// =============================================================================
// RETIREMENT TYPES — Simulador de jubilación (Financial Goals)
// =============================================================================
//
// Tipos para el simulador estilo Portfolio Visualizer "Financial Goals":
// dado un capital inicial, aportaciones, retiradas y un horizonte temporal,
// estimar la PROBABILIDAD de éxito (= que el dinero dure hasta `endAge`)
// usando block bootstrap mensual con bloques contiguos de 12 meses.
//
// Block bootstrap: preserva autocorrelación intra-anual y el "sequence of
// returns risk" — un crash en los primeros años de retirada puede arruinar
// un plan que la media a largo plazo aprobaría con creces.
// =============================================================================

import type { Portfolio } from "./types";

/** Modo fiscal aplicado a las retiradas durante la jubilación. */
export type RetirementTaxMode = "none" | "spain-irpf" | "flat";

// -----------------------------------------------------------------------------
// Objetivos financieros (lista de cash-flows configurables)
// -----------------------------------------------------------------------------

/** Tipo de cash flow del objetivo. */
export type GoalType =
  | "contribution" // aportación mensual a la cartera
  | "fixedWithdrawal" // retirada mensual de cantidad fija
  | "percentageWithdrawal"; // retirada mensual = porcentaje anual / 12 del patrimonio actual

/** Cuándo arranca el objetivo. */
export type GoalStart = "immediately" | "atRetirement" | "yearsFromNow";

/** Hasta cuándo se aplica el objetivo. */
export type GoalDuration =
  | "untilEnd" // hasta el fin del plan
  | "untilRetirement" // hasta la edad de jubilación
  | "yearsAfterStart"; // X años desde el inicio del propio objetivo

export interface FinancialGoal {
  /** ID único para tracking en UI. */
  id: string;
  /** Etiqueta libre opcional (e.g. "ingresos para vivir", "viaje anual"). */
  purpose?: string;
  type: GoalType;
  /** EUR/mes para "contribution" y "fixedWithdrawal". */
  amount?: number;
  /** % ANUAL del patrimonio para "percentageWithdrawal" (se divide entre 12
   *  internamente para aplicar como retirada mensual). */
  percentagePct?: number;
  start: GoalStart;
  /** Sólo si start = "yearsFromNow". */
  startYearsFromNow?: number;
  durationType: GoalDuration;
  /** Sólo si durationType = "yearsAfterStart". */
  durationYears?: number;
  /** Si true (recomendado), las cantidades se interpretan como € REALES y se
   *  multiplican por inflación acumulada cada mes. Si false, son nominales
   *  fijos (su poder adquisitivo cae con el tiempo). */
  inflationAdjusted: boolean;
}

export interface RetirementConfig {
  // === Edades ===
  /** Edad del usuario hoy. */
  currentAge: number;
  /** Edad a la que empiezan las retiradas (fin de la fase de acumulación). */
  retirementAge: number;
  /** Edad de fin del plan (esperanza de vida, ej. 90). */
  endAge: number;

  // === Capital y flujos ===
  /** Capital ya invertido al inicio del plan. */
  initialCapital: number;
  /**
   * Lista de objetivos financieros (aportaciones, retiradas fijas, retiradas
   * porcentuales). Cada uno se aplica como cash flow mensual según su
   * start/duración. Si está vacía, se reconstruye desde los campos legacy
   * `monthlyContributionReal` / `monthlyWithdrawalReal`.
   */
  goals?: FinancialGoal[];
  /** @deprecated Se mantiene para compat. Si `goals` viene vacío, se
   *  reconstruye un goal "contribution from now until retirement" con esta
   *  cantidad ajustada por inflación. */
  monthlyContributionReal: number;
  /** @deprecated Se mantiene para compat. Si `goals` viene vacío, se
   *  reconstruye un goal "fixedWithdrawal from retirement until end" con
   *  esta cantidad ajustada por inflación. */
  monthlyWithdrawalReal: number;

  // === Carteras (glide path A → B en los últimos glidePathYears antes de jubilación) ===
  /** Cartera de la fase de acumulación. */
  portfolioAccumulation: Portfolio;
  /**
   * Cartera de la fase de distribución (jubilación). Si tiene los mismos
   * holdings que la de acumulación, no hay glide path.
   */
  portfolioDistribution: Portfolio;
  /**
   * Años antes de la jubilación en los que se interpola linealmente entre
   * cartera A y B. Por defecto 5 (interpolación entre retirementAge-5 y
   * retirementAge). 0 = transición instantánea el día de la jubilación.
   */
  glidePathYears: number;

  // === Parámetros macro ===
  /** Inflación anual asumida (%, ej. 2.5). */
  inflationAnnualPct: number;
  /** Modo fiscal sobre las plusvalías al retirar dinero. */
  taxMode: RetirementTaxMode;
  /** Tasa fija en % cuando taxMode = "flat". */
  flatTaxRatePct?: number;

  // === Configuración de la simulación ===
  /** Número de paths a generar. Por defecto 1000. */
  numPaths: number;
  /** Tamaño del bloque en meses para el block bootstrap. Por defecto 12. */
  blockSizeMonths: number;

  // === Rango histórico ===
  /** Mes inicial del histórico que alimenta el bootstrap. "YYYY-MM". */
  histStartMonth?: string;
  /** Mes final del histórico. "YYYY-MM". */
  histEndMonth?: string;
}

/** Punto agregado año-a-año del fan chart. Todos los valores en € REALES de hoy. */
export interface RetirementYearPoint {
  /** Edad del usuario al final de este año. */
  age: number;
  /** Año calendario absoluto (currentYear + offset). */
  year: number;
  /** Percentiles del valor del patrimonio a fin del año, en € reales. */
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** Acumulado de aportaciones (€ reales) desde el inicio del plan. */
  contributionsCumulativeReal: number;
  /** Acumulado de retiradas (€ reales) desde el inicio del plan. */
  withdrawalsCumulativeReal: number;
  /** % de paths con valor > 0 al final de este año. */
  survivalRate: number;
}

/** Un cohorte histórico = una simulación determinista empezando en `startMonth`. */
export interface RetirementHistoricalCohort {
  /** Mes inicial del cohorte ("YYYY-MM"). */
  startMonth: string;
  /** Año inicial (para etiquetado en UI). */
  startYear: number;
  /** Valor final en € reales (negativo o 0 = agotado). */
  finalValueReal: number;
  /** Edad a la que se agotó el dinero (undefined si llegó al final). */
  depletionAge?: number;
  /** true si el dinero duró hasta endAge. */
  success: boolean;
  /** Total retirado en € reales hasta agotarse o hasta endAge. */
  totalWithdrawnReal: number;
}

/** Un escenario de tasa de retirada (uno por etiqueta: agorero, conservador,
 *  medio, optimista). El percentil indica QUÉ tasa, y `successRatePct`
 *  cuántas secuencias históricas la soportan. */
export interface WithdrawalScenario {
  /** Etiqueta humana: "Agorero", "Conservador", "Medio", "Optimista". */
  label: string;
  /** Identificador estable: "agorero" | "conservador" | "medio" | "optimista". */
  key: string;
  /** Percentil de las tasas (5 = sólo los peores 5%; 75 = sólo los mejores 25%). */
  percentile: number;
  /** % de secuencias históricas en que esta tasa sobrevive. */
  successRatePct: number;
  swr: { eurPerMonth: number; pctAnnual: number };
  pwr: { eurPerMonth: number; pctAnnual: number };
}

export interface RetirementResult {
  config: RetirementConfig;

  // === Probabilidad y métricas agregadas ===
  /** % de paths que terminan con valor > 0 al cumplir endAge. */
  successProbability: number;
  /** Valor final mediano en € reales. */
  medianFinalValueReal: number;
  /** Edad mediana de agotamiento entre los paths que se agotaron. */
  medianDepletionAge?: number;
  /** % de paths que se agotan antes de endAge. */
  depletionProbability: number;

  // === Fan chart año a año ===
  yearByYear: RetirementYearPoint[];

  // === Cohortes históricos (uno por cada mes de inicio posible en el histórico) ===
  historicalCohorts: RetirementHistoricalCohort[];

  // === Resumen de los cohortes históricos ===
  historicalSuccessRate: number;
  worstHistoricalCohort?: RetirementHistoricalCohort;
  bestHistoricalCohort?: RetirementHistoricalCohort;

  // === Tasas de retirada (SWR / PWR) por escenario ===
  /**
   * Retiros mensuales máximos en € reales bajo dos criterios:
   *  - SWR (Safe Withdrawal Rate): retiro máx. tal que el dinero NO se agota
   *    antes de endAge (puede acabar en 0).
   *  - PWR (Perpetual Withdrawal Rate): retiro máx. tal que capital final
   *    en € REALES ≥ capital al jubilarse (poder adquisitivo intacto).
   *
   * Se computan sobre `capitalAtRetirementReal` (mediana del bootstrap al
   * cumplir retirementAge) y N ventanas históricas contiguas de
   * `retirement_months`. Para cada escenario se reporta el percentil de
   * retiros que funciona en X% de las secuencias.
   */
  withdrawalRates: {
    /** Capital REAL al jubilarse usado como referencia para mostrar (mediana
     *  de los paths SIN retiros pre-jubilación). Las tasas YA integran la
     *  variabilidad del capital al jubilarse de los demás paths. */
    capitalAtRetirementReal: number;
    /** Número de paths del bootstrap usados para calcular las tasas. */
    pathsAnalyzed: number;
    /** @deprecated alias retrocompat de pathsAnalyzed. */
    windowsAnalyzed: number;
    scenarios: WithdrawalScenario[];
  };

  // === Path representativo del bootstrap normal (mediana, NO un percentil) ===
  /**
   * Trayectoria mensual completa de UN path REAL del bootstrap — el que cae
   * más cerca del p50 del valor final. Sirve para graficar una curva "típica"
   * comparable directamente con el path del sequence risk (ambos son
   * trayectorias reales mes a mes, no agregaciones cruzando paths).
   */
  representativeMedianPath: {
    monthlyValuesReal: number[];
  };

  // === Sequence-of-returns risk: peor escenario al jubilarse ===
  /**
   * Resultado del "stress test" de riesgo de secuencia: tomamos la peor
   * ventana de N años (default 5) del histórico y la inyectamos justo al
   * inicio de la jubilación. Mide el caso peor "sequence risk" — un crash
   * en los primeros años de retirada puede arruinar un plan que la media
   * a largo plazo aprobaría con creces.
   */
  sequenceRisk: {
    /** Tamaño de la ventana usada (meses). */
    windowMonths: number;
    /** Mes del histórico donde arranca la peor ventana (YYYY-MM). */
    worstWindowStartMonth: string;
    /** Rentabilidad total acumulada en esa ventana (%). */
    worstWindowCumulativeReturn: number;
    /** Patrimonio final real bajo este escenario (€). */
    finalValueReal: number;
    /** ¿Se agota el dinero antes del fin del plan? */
    success: boolean;
    /** Edad a la que se agota (si se agota). */
    depletionAge?: number;
    /** Valor mensual real para graficar (€). */
    monthlyValuesReal: number[];
  };

  // === Metadata del bootstrap (para que el usuario sepa la fiabilidad) ===
  /** Diagnóstico de la fuente histórica usada por el bootstrap. */
  bootstrapSource: {
    /** Meses comunes entre las dos carteras (longitud del histórico usable). */
    historicalMonths: number;
    /** Mes inicial del histórico común (YYYY-MM). */
    historicalStartMonth: string;
    /** Mes final del histórico común (YYYY-MM). */
    historicalEndMonth: string;
    /** Meses totales del plan (endAge − currentAge) × 12. */
    planMonths: number;
    /** Ratio plan/histórico — cuántas veces se "recicla" el histórico. */
    recyclingFactor: number;
    /** Block size que el usuario pidió (input). */
    requestedBlockSize: number;
    /** Block size efectivamente usado (puede haberse reducido por histórico corto). */
    effectiveBlockSize: number;
    /** Número de puntos de inicio posibles para los bloques (= histórico − blockSize). */
    blockStartPoints: number;
  };

  // === Avisos ===
  warnings: string[];
}
