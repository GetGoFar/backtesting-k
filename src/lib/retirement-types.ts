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

export interface RetirementConfig {
  // === Edades ===
  /** Edad del usuario hoy. */
  currentAge: number;
  /** Edad a la que empiezan las retiradas (fin de la fase de acumulación). */
  retirementAge: number;
  /** Edad de fin del plan (esperanza de vida, ej. 90). */
  endAge: number;

  // === Capital y flujos (en € de hoy, ajustados por inflación dentro del motor) ===
  /** Capital ya invertido al inicio del plan. */
  initialCapital: number;
  /** Aportación mensual durante la acumulación, en € de hoy. */
  monthlyContributionReal: number;
  /** Retirada mensual deseada durante la jubilación, en € de hoy. */
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

  // === Avisos ===
  warnings: string[];
}
