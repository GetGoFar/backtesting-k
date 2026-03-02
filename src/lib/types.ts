// =============================================================================
// TIPOS DEL PROYECTO - Backtesting Tool El Proyecto K
// =============================================================================

// -----------------------------------------------------------------------------
// Tipos base
// -----------------------------------------------------------------------------

/** Tipo de fondo: indexado (bajo coste) o activo (gestión bancaria) */
export type FundType = "index" | "active";

/** Categoría de activo del fondo */
export type FundCategory =
  | "RV Global"
  | "RV EEUU"
  | "RV Europa"
  | "RV España"
  | "RV Emergentes"
  | "RV Sectorial"
  | "RV REITs"
  | "RF EUR Gov"
  | "RF EUR Gov Corto"
  | "RF EUR Gov Medio"
  | "RF EUR Gov Largo"
  | "RF EUR Corp"
  | "RF EUR"
  | "RF Flexible"
  | "Oro";

/** Frecuencia de rebalanceo de la cartera */
export type RebalanceFrequency = "monthly" | "quarterly" | "annual" | "none";

// -----------------------------------------------------------------------------
// Fondos
// -----------------------------------------------------------------------------

/** Definición completa de un fondo de inversión */
export interface Fund {
  /** Identificador único interno */
  id: string;
  /** Nombre completo del fondo */
  name: string;
  /** Nombre corto para mostrar en gráficos */
  shortName: string;
  /** Código ISIN del fondo */
  isin: string;
  /** Ticker de Yahoo Finance (solo para fondos con datos disponibles) */
  yahooTicker?: string;
  /** Total Expense Ratio - comisión anual en porcentaje (ej: 0.20 para 0.20%) */
  ter: number;
  /** Categoría de activo */
  category: FundCategory;
  /** Tipo: indexado o gestión activa */
  type: FundType;
  /** Banco comercializador (solo para fondos bancarios españoles) */
  bank?: string;
  /** Divisa del fondo */
  currency: string;
}

// -----------------------------------------------------------------------------
// Carteras
// -----------------------------------------------------------------------------

/** Posición individual en una cartera */
export interface PortfolioHolding {
  /** ID del fondo */
  fundId: string;
  /** Peso en la cartera (porcentaje, ej: 30 para 30%) */
  weight: number;
  /** Datos completos del fondo (opcional, para fondos dinámicos de Yahoo Finance) */
  fund?: Fund;
}

/** Definición de una cartera de inversión */
export interface Portfolio {
  /** Nombre de la cartera */
  name: string;
  /** Lista de posiciones con sus pesos */
  holdings: PortfolioHolding[];
}

// -----------------------------------------------------------------------------
// Configuración del Backtest
// -----------------------------------------------------------------------------

/** Configuración completa para ejecutar un backtest */
export interface BacktestConfig {
  /** Primera cartera a comparar (opcional) */
  portfolioA?: Portfolio;
  /** Segunda cartera a comparar (opcional) */
  portfolioB?: Portfolio;
  /** Fecha de inicio (formato YYYY-MM-DD) */
  startDate: string;
  /** Fecha de fin (formato YYYY-MM-DD) */
  endDate: string;
  /** Inversión inicial en EUR */
  initialAmount: number;
  /** Frecuencia de rebalanceo */
  rebalanceFrequency: RebalanceFrequency;
  /** Aportación mensual opcional en EUR */
  monthlyContribution?: number;
  /** Usar rango de fechas común donde ambas carteras tienen datos */
  useCommonDateRange?: boolean;
}

// -----------------------------------------------------------------------------
// Resultados del Backtest
// -----------------------------------------------------------------------------

/** Punto en la serie temporal de valores */
export interface TimeSeriesPoint {
  /** Fecha en formato YYYY-MM */
  date: string;
  /** Valor del patrimonio en EUR */
  value: number;
}

/** Rentabilidad anual */
export interface AnnualReturn {
  /** Año */
  year: number;
  /** Rentabilidad en porcentaje (ej: 12.5 para +12.5%) */
  returnPct: number;
}

/** Punto de drawdown en el tiempo */
export interface DrawdownPoint {
  /** Fecha en formato YYYY-MM */
  date: string;
  /** Drawdown en porcentaje (valor negativo, ej: -15.3 para -15.3%) */
  drawdown: number;
}

/** Métricas de rendimiento de una cartera */
export interface Metrics {
  /** Rentabilidad total acumulada (decimal, ej: 0.85 para +85%) */
  totalReturn: number;
  /** Tasa de Crecimiento Anual Compuesto (decimal) */
  cagr: number;
  /** Volatilidad anualizada (decimal) */
  volatility: number;
  /** Ratio de Sharpe */
  sharpe: number;
  /** Ratio de Sortino */
  sortino: number;
  /** Máximo drawdown (decimal negativo, ej: -0.25 para -25%) */
  maxDrawdown: number;
  /** Mejor mes (decimal, ej: 0.08 para +8%) */
  bestMonth: number;
  /** Peor mes (decimal, ej: -0.12 para -12%) */
  worstMonth: number;
  /** Ratio de meses positivos (decimal, ej: 0.65 para 65%) */
  positiveMonthsRatio: number;
}

/** Rolling returns para diferentes periodos */
export interface RollingReturns {
  /** Rentabilidades anualizadas en ventanas de 1 año */
  oneYear: Array<{ date: string; value: number }>;
  /** Rentabilidades anualizadas en ventanas de 3 años */
  threeYear: Array<{ date: string; value: number }>;
  /** Rentabilidades anualizadas en ventanas de 5 años */
  fiveYear: Array<{ date: string; value: number }>;
}

/** Desglose de comisiones pagadas */
export interface FeesSummary {
  /** Total de comisiones pagadas en EUR */
  totalFees: number;
  /** Comisiones como porcentaje del valor final */
  feesAsPercentage: number;
  /** TER promedio ponderado de la cartera */
  weightedTer: number;
}

/** Resultado completo del backtest para una cartera */
export interface BacktestResult {
  /** Nombre de la cartera */
  portfolioName: string;
  /** Tipo predominante de la cartera */
  portfolioType: FundType;
  /** Serie temporal de valores del patrimonio */
  timeSeries: TimeSeriesPoint[];
  /** Métricas de rendimiento */
  metrics: Metrics;
  /** Rentabilidades anuales desglosadas */
  annualReturns: AnnualReturn[];
  /** Serie temporal de drawdowns */
  drawdowns: DrawdownPoint[];
  /** Rolling returns a 1, 3 y 5 años */
  rollingReturns: RollingReturns;
  /** Resumen de comisiones */
  fees: FeesSummary;
  /** Aportaciones totales realizadas */
  totalContributions: number;
  /** Valor final del patrimonio */
  finalValue: number;
}

/** Aviso sobre datos o configuración */
export interface BacktestWarning {
  /** Tipo de aviso */
  type: "data_range" | "weight_normalized" | "info";
  /** Mensaje descriptivo */
  message: string;
}

/** Entrada de correlación entre dos activos */
export interface CorrelationEntry {
  /** ID del primer fondo */
  fundId1: string;
  /** ID del segundo fondo */
  fundId2: string;
  /** Nombre corto del primer fondo */
  name1: string;
  /** Nombre corto del segundo fondo */
  name2: string;
  /** Coeficiente de correlación (-1 a 1) */
  correlation: number;
}

/** Métricas individuales de un activo */
export interface AssetMetrics {
  /** ID del fondo */
  fundId: string;
  /** Nombre del fondo */
  name: string;
  /** ISIN del fondo (si disponible) */
  isin?: string;
  /** Ticker de Yahoo Finance */
  yahooTicker?: string;
  /** TER del fondo (porcentaje, ej: 0.20 para 0.20%) */
  ter: number;
  /** Rentabilidad anualizada (CAGR) */
  cagr: number;
  /** Volatilidad anualizada */
  volatility: number;
  /** Máximo drawdown */
  maxDrawdown: number;
  /** Ratio de Sharpe */
  sharpe: number;
  /** Rentabilidad total acumulada */
  totalReturn: number;
  /** Número de meses de datos */
  months: number;
}

/** Matriz de correlaciones entre activos */
export interface CorrelationMatrix {
  /** Lista de fondos incluidos (IDs) */
  fundIds: string[];
  /** Nombres cortos de los fondos (mismo orden que fundIds) */
  fundNames: string[];
  /** Matriz de correlaciones (array 2D, mismo orden que fundIds) */
  matrix: number[][];
  /** Lista plana de correlaciones para acceso fácil */
  entries: CorrelationEntry[];
}

/** Respuesta completa del API de backtest */
export interface BacktestResponse {
  /** Resultado de la cartera A (null si no hay datos suficientes) */
  resultA: BacktestResult | null;
  /** Resultado de la cartera B (null si no hay datos suficientes) */
  resultB: BacktestResult | null;
  /** Configuración utilizada */
  config: BacktestConfig;
  /** Rango efectivo de datos usado (puede diferir del solicitado) */
  effectiveDateRange?: {
    startDate: string;
    endDate: string;
  };
  /** Avisos para el usuario */
  warnings?: BacktestWarning[];
  /** Correlación entre las dos carteras (-1 a 1) */
  correlation?: number;
  /** Matriz de correlaciones entre todos los activos */
  correlationMatrix?: CorrelationMatrix;
  /** Métricas individuales de cada activo */
  assetMetrics?: AssetMetrics[];
}

// -----------------------------------------------------------------------------
// Datos de precios
// -----------------------------------------------------------------------------

/** Datos de precio histórico de un fondo */
export interface PriceData {
  /** Fecha en formato YYYY-MM-DD */
  date: string;
  /** Valor liquidativo (NAV) */
  nav: number;
}

/** Precios mensuales agregados */
export interface MonthlyPrice {
  /** Fecha en formato YYYY-MM */
  month: string;
  /** Precio de cierre del mes */
  closePrice: number;
}

// -----------------------------------------------------------------------------
// Presets de carteras
// -----------------------------------------------------------------------------

/** Cartera predefinida */
export interface PortfolioPreset {
  /** Identificador único del preset */
  id: string;
  /** Nombre del preset */
  name: string;
  /** Descripción breve */
  description: string;
  /** Tipo predominante */
  type: FundType;
  /** Posiciones predefinidas */
  holdings: PortfolioHolding[];
}

// -----------------------------------------------------------------------------
// UI y componentes
// -----------------------------------------------------------------------------

/** Estado de carga para componentes async */
export type LoadingState = "idle" | "loading" | "success" | "error";

/** Tooltips informativos para métricas */
export const METRIC_TOOLTIPS: Readonly<Record<keyof Metrics, string>> = {
  totalReturn:
    "Rentabilidad total acumulada desde el inicio hasta el final del periodo.",
  cagr:
    "Tasa de Crecimiento Anual Compuesto. Rentabilidad anualizada equivalente.",
  volatility:
    "Desviación estándar de los retornos mensuales, anualizada (×√12). Mide el riesgo.",
  sharpe:
    "Rentabilidad ajustada por riesgo. (Retorno - Tasa libre de riesgo) / Volatilidad. Valores >1 son buenos.",
  sortino:
    "Similar al Sharpe, pero solo penaliza la volatilidad negativa (caídas).",
  maxDrawdown:
    "Máxima caída desde un pico hasta el siguiente valle. El peor momento para haber invertido.",
  bestMonth: "Mejor rentabilidad mensual obtenida durante el periodo.",
  worstMonth: "Peor rentabilidad mensual sufrida durante el periodo.",
  positiveMonthsRatio: "Porcentaje de meses con rentabilidad positiva.",
} as const;

// -----------------------------------------------------------------------------
// Utilidades de tipos
// -----------------------------------------------------------------------------

/** Extrae el tipo de un array */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/** Hace opcionales todas las propiedades de un tipo */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Tipo para respuestas de API con error */
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

/** Tipo para respuestas de API exitosas o con error */
export type ApiResponse<T> = T | ApiError;

/** Type guard para verificar si es un error de API */
export function isApiError(response: unknown): response is ApiError {
  return (
    typeof response === "object" &&
    response !== null &&
    "error" in response &&
    "statusCode" in response
  );
}
