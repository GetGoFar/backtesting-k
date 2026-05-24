import type { CorrelationMatrix } from "./types";

// =============================================================================
// MOMENTUM — Tipos para estrategia de Relative Strength (tactical asset allocation)
// =============================================================================
//
// Diseñado para replicar el modelo "Relative Strength" de Portfoliovisualizer:
// cada N períodos se rankean los activos por retorno acumulado en el lookback
// (excluyendo opcionalmente el último mes), se seleccionan los top-N y se
// rebalancea con equal-weight. Métricas idénticas al backtest existente para
// facilitar la comparación directa.
// =============================================================================

/** Activo seleccionable: un ticker individual (no una cartera con pesos). */
export interface MomentumAsset {
  /** Identificador del fondo en fund-database (si existe). Permite TER y categoría. */
  fundId?: string;
  /** Ticker Yahoo (p.ej. "SPY", "NVDA"). Si fundId existe, se ignora. */
  ticker: string;
  /** Nombre legible para mostrar en gráficos. */
  displayName?: string;
}

/** Frecuencia de re-evaluación / rebalanceo del momentum. */
export type MomentumFrequency = "monthly" | "quarterly";

/** Esquema de ponderación cuando se seleccionan varios activos top-N. */
export type MomentumWeighting = "equal" | "rank" | "volatility";

/**
 * Método de ranking del universo:
 * - "momentum": retorno acumulado en el lookback (relative strength clásico)
 * - "sharpe":   retorno / volatilidad → rentabilidad ajustada al riesgo
 *               (penaliza activos con buena rentabilidad pero muy volátiles)
 */
export type MomentumRankingMethod = "momentum" | "sharpe";

/**
 * Momento exacto en el que se ejecuta el rebalanceo dentro del calendario diario:
 * - "lastClose": al cierre del ÚLTIMO día hábil del mes (mismo día que se calcula
 *   la señal). Ejecución instantánea, "trade at last close".
 * - "nextClose": al cierre del PRIMER día hábil del mes siguiente. La señal se
 *   calcula al cierre del último día del mes, pero la orden se ejecuta el
 *   siguiente día hábil. Es el default de Portfoliovisualizer.
 */
export type MomentumTradeExecution = "lastClose" | "nextClose";

export interface MomentumConfig {
  /** Lista de activos candidatos (universo). */
  assets: MomentumAsset[];
  /** "YYYY-MM-DD" — fecha de inicio del backtest. */
  startDate: string;
  /** "YYYY-MM-DD" — fecha fin del backtest. */
  endDate: string;
  /** Capital inicial en la divisa de los activos (mezclar divisas no se convierte FX). */
  initialAmount: number;

  // === Parámetros del modelo Relative Strength ===
  /** Periodo de lookback en MESES para calcular el momentum acumulado. Por defecto 12. */
  lookbackMonths: number;
  /** Si true, el momento ignora el ÚLTIMO mes (anti reversal corto plazo). Default: true. */
  excludePreviousMonth: boolean;
  /** Cuántos activos top-N mantener cada periodo. Por defecto 1. */
  assetsToHold: number;
  /** Cómo ponderar los top-N: equal/rank/volatility. */
  weighting: MomentumWeighting;
  /** Frecuencia de re-evaluación. */
  frequency: MomentumFrequency;

  // === Ranking ===
  /** Método de ranking: "momentum" (solo retorno) o "sharpe" (ret/vol). Default: "momentum". */
  rankingMethod?: MomentumRankingMethod;
  /**
   * Ventana en meses para calcular la volatilidad usada en:
   *   - el ratio Sharpe-like del ranking (si rankingMethod = "sharpe")
   *   - la ponderación inverse-volatility (si weighting = "volatility")
   * Por defecto: 3 meses (como en Portfoliovisualizer).
   */
  volatilityPeriodMonths?: number;
  /**
   * Cuándo se materializa la rotación dentro del calendario diario. Default:
   * "lastClose" (cierre del último día del mes, ejecución instantánea).
   * "nextClose" replica el comportamiento por defecto de Portfoliovisualizer.
   */
  tradeExecution?: MomentumTradeExecution;

  // === Filtros opcionales ===
  /**
   * Si > 0, solo entra en un activo si su precio actual está por encima de su
   * media móvil de N meses (filtro tendencial clásico). Si todos los top-N
   * están por debajo, se va a CASH. Default: 0 (sin filtro).
   */
  movingAverageMonths?: number;
  /**
   * Slippage estimado por trade (% sobre el valor de la operación). Aplicado
   * cada rebalanceo a la parte rotada. Default: 0.
   */
  slippagePercent?: number;

  /** Benchmark opcional para comparar (ticker individual). */
  benchmarkTicker?: string;
}

// -----------------------------------------------------------------------------
// Resultado
// -----------------------------------------------------------------------------

/** Punto de la curva de equity. */
export interface MomentumEquityPoint {
  /** "YYYY-MM-DD" — fecha del día hábil al que corresponde el valor. */
  date: string;
  /** Valor del portfolio al cierre de ese día. */
  value: number;
  /** Tickers que se sostienen ESE día. */
  holdings: string[];
}

/** Una rotación / rebalanceo realizado. */
export interface MomentumRebalance {
  date: string;            // "YYYY-MM-DD" — día hábil exacto en que se ejecuta
  previousHoldings: string[];
  newHoldings: string[];
  /**
   * Ranking en el momento del rebalanceo (sorted desc por el criterio elegido).
   * - momentumPercent: retorno acumulado en el lookback (siempre presente)
   * - volatilityPercent: volatilidad anualizada en volatilityPeriod (solo si se calculó)
   * - score: el valor por el que realmente se ordenó (= momentum si rankingMethod=momentum,
   *   = momentum/volatility si rankingMethod=sharpe)
   */
  ranking: Array<{
    ticker: string;
    momentumPercent: number;
    volatilityPercent?: number;
    score: number;
    aboveMA: boolean;
  }>;
  /** Indica si se forzó CASH por filtro MA. */
  forcedCash: boolean;
}

/** Métricas resumen — formato compatible con MetricsTable. */
export interface MomentumMetrics {
  totalReturn: number;     // %
  cagr: number;            // %
  volatility: number;      // anualizada %
  sharpe: number;
  sortino: number;
  maxDrawdown: number;     // % (negativo)
  bestMonth: number;       // %
  worstMonth: number;      // %
  positiveMonths: number;  // % de meses positivos
  /** Operaciones por año (turnover bruto / 2). */
  tradesPerYear: number;
  /** Nº total de cambios de holdings durante el periodo. */
  totalRebalances: number;
}

/** Rendimiento por año natural. */
export interface MomentumAnnualReturn {
  year: number;
  returnPercent: number;
  finalValue: number;
}

/**
 * Ranking provisional — qué decidiría el modelo si rebalanceara AHORA usando
 * los datos más recientes disponibles, independientemente del endDate del
 * backtest. Útil cuando el endDate es del pasado o cuando la frecuencia es
 * trimestral/anual y estamos en mitad del periodo.
 */
export interface ProvisionalRanking {
  /** Mes señal usado para el cálculo (último mes con datos para TODOS los activos). */
  signalMonth: string;
  /** Fecha calendario hasta la que se incluyeron datos. */
  asOfDate: string;
  /** Ranking equivalente al de un rebalanceo, pero recalculado con datos de hoy. */
  ranking: Array<{
    ticker: string;
    momentumPercent: number;
    volatilityPercent?: number;
    score: number;
    aboveMA: boolean;
  }>;
  /** Si el modelo forzaría CASH por filtro MA. */
  wouldForceCash: boolean;
  /** Tickers que mantendría el modelo si rebalanceara AHORA. */
  wouldHold: string[];
}

export interface MomentumResponse {
  config: MomentumConfig;
  equityCurve: MomentumEquityPoint[];
  rebalances: MomentumRebalance[];
  metrics: MomentumMetrics;
  annualReturns: MomentumAnnualReturn[];
  /** Benchmark equity curve si benchmarkTicker está definido. */
  benchmarkCurve?: MomentumEquityPoint[];
  benchmarkMetrics?: MomentumMetrics;
  /** Avisos no fatales — p.ej. ticker sin datos, lookback ajustado, etc. */
  warnings: string[];
  /**
   * Matriz de correlaciones entre la propia estrategia y cada activo del
   * universo. La primera fila/columna corresponde a la estrategia (id sintético
   * "__momentum_strategy__"). Calculada sobre retornos mensuales del rango
   * efectivo. Ausente si no hay datos suficientes (<3 meses).
   */
  correlationMatrix?: CorrelationMatrix;
  /**
   * Ranking que el modelo elegiría AHORA con los datos más recientes
   * disponibles. Ausente si no hay histórico suficiente para el lookback.
   */
  provisionalRanking?: ProvisionalRanking;
}
