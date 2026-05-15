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
  /** "YYYY-MM" — fin de mes representativo. */
  date: string;
  /** Valor del portfolio. */
  value: number;
  /** Tickers que se sostienen ESE mes. */
  holdings: string[];
}

/** Una rotación / rebalanceo realizado. */
export interface MomentumRebalance {
  date: string;            // "YYYY-MM"
  previousHoldings: string[];
  newHoldings: string[];
  /** Ranking en el momento del rebalanceo (sorted desc por momentum). */
  ranking: Array<{ ticker: string; momentumPercent: number; aboveMA: boolean }>;
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
}
