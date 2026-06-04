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
  | "RV Japón"
  | "RV Small Cap"
  | "RV Sectorial"
  | "RV REITs"
  | "RF EUR Gov"
  | "RF EUR Gov Corto"
  | "RF EUR Gov Medio"
  | "RF EUR Gov Largo"
  | "RF EUR Corp"
  | "RF EUR"
  | "RF Inflation EUR"
  | "RF USD Gov"
  | "RF USD Corp"
  | "RF Flexible"
  | "Oro"
  | "Alternativo"
  | "Momentum";

/** Frecuencia de rebalanceo de la cartera */
export type RebalanceFrequency = "monthly" | "quarterly" | "annual" | "none";

/** Granularidad de visualización de datos */
export type DisplayGranularity = "daily" | "monthly" | "quarterly";

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
  /**
   * Ticker base del fondo en formato "símbolo.exchange" (ej. "IWDA.AS",
   * "XDWS.DE"). Usado por el data-fetcher para construir el ticker EODHD —
   * los sufijos .DE/.L se mapean automáticamente a .XETRA/.LSE.
   * (Antes este campo se llamaba `yahooTicker`; renombrado al eliminar Yahoo
   * como fuente. Carteras guardadas viejas se migran al leer del localStorage.)
   */
  ticker?: string;
  /** @deprecated Alias legacy de `ticker` — sólo presente en datos guardados
   *  de versiones anteriores. NO usar en código nuevo. */
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
  /** Si el ETF/fondo reparte dividendos (distributing vs accumulating) */
  distributing?: boolean;
  /** Fuente del valor TER */
  terSource?: "curated" | "morningstar" | "user" | "estimated";
  /** Si el TER esta verificado como correcto */
  terConfirmed?: boolean;
  /**
   * Cuando este fondo es un "activo virtual" derivado de una estrategia
   * momentum guardada, contiene el snapshot mensual de su curva de equity
   * normalizado a base 1.0. Si está presente, el backtest engine NO llama
   * a EODHD/Yahoo para este fondo — lee los precios directamente del snapshot.
   * El campo `id` del fondo debe empezar por "momentum-strategy-".
   */
  momentumSnapshot?: {
    /** Serie de NAVs mensuales: clave "YYYY-MM-DD", valor base 1.0 al inicio. */
    monthlyNAVs: Record<string, number>;
    /** Primer mes con dato ("YYYY-MM"). */
    startMonth: string;
    /** Último mes con dato ("YYYY-MM"). */
    endMonth: string;
    /** Timestamp de generación del snapshot. */
    generatedAt: number;
  };
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
  /** Datos completos del fondo (opcional, para fondos dinámicos añadidos vía buscador externo) */
  fund?: Fund;
  /** Si está definido, este holding NO es un fondo normal sino una ESTRATEGIA
   *  DE MOMENTUM dinámica: el motor del backtest ejecuta la estrategia primero
   *  con las fechas del backtest, convierte su equity curve mensual en una
   *  serie de precios diarios (normalizada a 100), y la usa como serie de
   *  precios de este holding. Permite combinar carteras estáticas con
   *  estrategias dinámicas (p.ej. 90 % indexado + 10 % momentum como
   *  satélite) y ver correlaciones cruzadas. */
  momentumConfig?: import("./momentum-types").MomentumConfig;
}

/** Definición de una cartera de inversión */
export interface Portfolio {
  /** Nombre de la cartera */
  name: string;
  /** Lista de posiciones con sus pesos */
  holdings: PortfolioHolding[];
  /** Comisión de gestión adicional anual en % (ej: 0.40 para 0.40%) — se descuenta del valor de la cartera */
  managementFee?: number;
  /** Modo de cálculo de impuestos al rebalancear:
   *   - "none" (default): sin impuestos (fondos de inversión con traspaso)
   *   - "flat": tasa fija (taxRate)
   *   - "spain-irpf": tramos progresivos del IRPF español sobre el ahorro
   *      (19%/21%/23%/27%/28%), aplicados sobre las plusvalías anuales acumuladas. */
  taxMode?: "none" | "flat" | "spain-irpf";
  /** Tasa fija a aplicar cuando taxMode = "flat" (decimal, ej: 0.21 para 21%) */
  taxRate?: number;
  /** Frecuencia de rebalanceo específica de esta cartera. Si undefined,
   *  se usa la frecuencia global de BacktestConfig. */
  rebalanceFrequency?: RebalanceFrequency;
  /** Banda RELATIVA de drift específica de esta cartera (decimal, ej: 0.25 = 25%).
   *  Si undefined, se usa el valor global. 0 = desactivada. */
  rebalanceBandRelative?: number;
  /** Banda ABSOLUTA de drift específica de esta cartera (decimal, ej: 0.05 = 5pp).
   *  Si undefined, se usa el valor global. 0 = desactivada. */
  rebalanceBandAbsolute?: number;
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
  /** Granularidad de visualización: daily, monthly (default), quarterly */
  displayGranularity?: DisplayGranularity;
  /** Benchmark a comparar (opcional). Si se incluye, se calcula alpha/beta/IR/etc. */
  benchmarkId?: BenchmarkId | null;
  /** Benchmark a medida (alternativa a benchmarkId). Permite usar cualquier
   *  composición de fondos como referencia: una cartera preset, una cartera
   *  custom del usuario, o cualquier mix arbitrario. Si está definido, tiene
   *  prioridad sobre benchmarkId. */
  customBenchmark?: {
    name: string;
    shortName?: string;
    description?: string;
    composition: Array<{ fundId: string; weight: number; fund?: Fund }>;
  } | null;
  /** Tasa impositiva sobre plusvalías realizadas en cada rebalanceo (decimal,
   *  ej: 0.21 para 21%). 0 = sin impuestos (fondos de inversión con traspaso).
   *  Aplicable solo a carteras de ETFs en España. */
  taxRate?: number;
  /** Banda RELATIVA de drift (decimal, ej: 0.25 = 25%). Si algún activo se
   *  desvía más de este % respecto a su peso objetivo, se rebalancea. 0 o
   *  undefined = desactivado. Funciona en paralelo al rebalanceo periódico. */
  rebalanceBandRelative?: number;
  /** Banda ABSOLUTA de drift (decimal, ej: 0.05 = 5 puntos porcentuales).
   *  Si algún activo se desvía más de X pp del peso objetivo, se rebalancea.
   *  0 o undefined = desactivado. */
  rebalanceBandAbsolute?: number;
  /** Rebalanceo con aportaciones: si true, las aportaciones mensuales se
   *  dirigen primero a los activos por debajo del peso objetivo, evitando
   *  realizar plusvalías. Solo aplica si hay monthlyContribution > 0. */
  contributionRebalance?: boolean;
  /** Fuente de precios. Sólo EODHD — el campo se mantiene en el tipo por
   *  compatibilidad con código existente. */
  dataSource?: "eodhd";
}

// -----------------------------------------------------------------------------
// Resultados del Backtest
// -----------------------------------------------------------------------------

/** Punto en la serie temporal de valores */
export interface TimeSeriesPoint {
  /** Fecha en formato YYYY-MM (para cálculos y ejes) */
  date: string;
  /** Valor del patrimonio en EUR */
  value: number;
  /** Fecha exacta en formato YYYY-MM-DD (día real de cotización, para tooltips) */
  exactDate?: string;
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
  /** Fecha exacta en formato YYYY-MM-DD (para tooltips) */
  exactDate?: string;
}

/** Opciones de benchmark predefinidas para comparación */
export type BenchmarkId =
  | "msci-world"
  | "msci-acwi"
  | "sp500-eur"
  | "msci-em"
  | "euro-stoxx"
  | "global-60-40"
  | "global-80-20"
  | "vanguard-global"
  | "cash-eur";

/** Definición de un benchmark */
export interface BenchmarkDefinition {
  id: BenchmarkId;
  name: string;
  shortName: string;
  description: string;
  /** fundIds o construcción manual */
  composition: Array<{ fundId: string; weight: number }>;
}

/** Métricas relativas vs benchmark */
export interface BenchmarkComparison {
  /** ID del benchmark utilizado */
  benchmarkId: BenchmarkId;
  /** Nombre del benchmark */
  benchmarkName: string;
  /** Alpha de Jensen anualizado (decimal). Rentabilidad excesiva sobre el benchmark ajustada por beta. */
  alpha: number;
  /** Beta vs el benchmark. >1 = más volátil que el mercado, <1 = menos volátil */
  beta: number;
  /** Tracking error anualizado: desviación estándar de (retorno cartera - retorno benchmark) */
  trackingError: number;
  /** Information Ratio = (Retorno cartera - Retorno benchmark) / Tracking Error */
  informationRatio: number;
  /** Correlación con el benchmark */
  correlation: number;
  /** R² (coeficiente de determinación): % de varianza explicada por el benchmark */
  rSquared: number;
  /** Up Capture Ratio: % del benchmark capturado cuando el benchmark sube */
  upCapture: number;
  /** Down Capture Ratio: % del benchmark capturado cuando el benchmark baja (menor = mejor protección) */
  downCapture: number;
  /** Rentabilidad total del benchmark en el periodo */
  benchmarkTotalReturn: number;
  /** CAGR del benchmark */
  benchmarkCagr: number;
  /** Volatilidad del benchmark */
  benchmarkVolatility: number;
  /** Serie temporal del benchmark normalizada al mismo punto de partida */
  benchmarkTimeSeries: TimeSeriesPoint[];
  /** Comportamiento del benchmark durante los periodos de estrés */
  benchmarkStressPeriods?: StressPeriodResult[];
  /** Métricas completas del benchmark (para columna de referencia en la tabla) */
  benchmarkMetrics?: Metrics;
  /** Valor final del benchmark al final del periodo */
  benchmarkFinalValue?: number;
  /** Aportaciones totales del benchmark (inicial + mensuales) — necesario para
   *  cálculos de % sobre lo aportado, igual que en las carteras. */
  benchmarkTotalContributions?: number;
  /** Resumen de comisiones del benchmark (TER del ETF que lo replica) */
  benchmarkFees?: FeesSummary;
}

/** Resultado de la cartera durante un periodo histórico de estrés */
export interface StressPeriodResult {
  /** Identificador del periodo */
  id: string;
  /** Nombre legible del periodo */
  name: string;
  /** Descripción corta del evento */
  description: string;
  /** Inicio del periodo (YYYY-MM) */
  start: string;
  /** Fin del periodo (YYYY-MM) */
  end: string;
  /** Rentabilidad total de la cartera durante el periodo (decimal) — null si no hay datos */
  totalReturn: number | null;
  /** Máximo drawdown sufrido durante el periodo (decimal negativo) */
  maxDrawdown: number | null;
  /** Indica si la cartera tenía datos para todo o parte del periodo */
  hasFullData: boolean;
}

/** Una operación individual dentro de un rebalanceo */
export interface RebalanceTrade {
  /** ID del fondo */
  fundId: string;
  /** Nombre corto del fondo */
  fundName: string;
  /** "sell" = venta (puede generar plusvalía), "buy" = compra (no genera plusvalía) */
  action: "sell" | "buy";
  /** Importe en EUR */
  amount: number;
  /** Solo para sells: plusvalía o minusvalía realizada (positivo = ganancia, negativo = pérdida) */
  gain?: number;
  /** Solo para sells: porción del coste base que se realiza con la venta */
  costBasisPortion?: number;
}

/** Un evento de rebalanceo completo con su detalle */
export interface RebalanceEvent {
  /** Fecha del rebalanceo (YYYY-MM-DD) */
  date: string;
  /** Valor de la cartera ANTES del rebalanceo */
  portfolioValueBefore: number;
  /** Valor de la cartera DESPUÉS (= before - taxPaid) */
  portfolioValueAfter: number;
  /** Plusvalía/minusvalía TOTAL realizada en este rebalanceo (suma de gain de todas las sells) */
  totalGain: number;
  /** Impuesto total pagado */
  taxPaid: number;
  /** Detalle de cada operación (sells + buys) */
  trades: RebalanceTrade[];
}

/** Episodio individual de drawdown (de pico a valle y recuperación) */
export interface DrawdownEpisode {
  /** Fecha del pico antes de la caída (formato YYYY-MM) */
  peakDate: string;
  /** Fecha exacta del pico (YYYY-MM-DD) */
  peakExactDate?: string;
  /** Fecha del valle (mínimo del drawdown) en formato YYYY-MM */
  troughDate: string;
  /** Fecha exacta del valle (YYYY-MM-DD) */
  troughExactDate?: string;
  /** Fecha de recuperación al nivel del pico — null si aún no se ha recuperado */
  recoveryDate: string | null;
  /** Fecha exacta de recuperación (YYYY-MM-DD) */
  recoveryExactDate?: string;
  /** Magnitud del drawdown (decimal negativo, ej: -0.131 para -13.1%) */
  drawdownPct: number;
  /** Duración de la caída en meses (pico → valle) */
  lengthMonths: number;
  /** Tiempo de recuperación en meses (valle → recuperación), null si no recuperado */
  recoveryMonths: number | null;
  /** Periodo total underwater en meses (pico → recuperación o fin de serie) */
  underwaterMonths: number;
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
  /** Ratio Calmar = CAGR / |Max Drawdown| (rentabilidad por unidad de pérdida máxima) */
  calmar: number;
  /** Asimetría de la distribución de retornos (skewness). 0 = simétrica, <0 = cola izquierda larga, >0 = cola derecha larga */
  skewness: number;
  /** Curtosis en exceso (excess kurtosis). 0 = normal, >0 = leptocúrtica (colas gordas — más eventos extremos) */
  excessKurtosis: number;
  /** Value at Risk al 5% (decimal negativo): pérdida máxima esperada en el peor 5% de periodos */
  varHistorical: number;
  /** Conditional VaR / Expected Shortfall al 5% (decimal negativo): pérdida media en el peor 5% de periodos */
  cvar: number;
}

/** Rolling returns para diferentes periodos */
export interface RollingReturns {
  /** Rentabilidades anualizadas en ventanas de 1 año */
  oneYear: Array<{ date: string; value: number; exactDate?: string }>;
  /** Rentabilidades anualizadas en ventanas de 3 años */
  threeYear: Array<{ date: string; value: number; exactDate?: string }>;
  /** Rentabilidades anualizadas en ventanas de 5 años */
  fiveYear: Array<{ date: string; value: number; exactDate?: string }>;
}

/** Estadísticos best/worst/avg/median de un periodo rolling */
export interface RollingStatsBucket {
  /** Etiqueta del periodo (ej: "1 año", "3 años") */
  label: string;
  /** Años del periodo */
  years: number;
  /** Cuántas ventanas se han calculado */
  count: number;
  /** Mejor CAGR de todas las ventanas (decimal) */
  bestCagr: number;
  /** Fecha de la ventana con el mejor CAGR (fin de la ventana) */
  bestEndDate: string | null;
  /** Peor CAGR de todas las ventanas (decimal) */
  worstCagr: number;
  /** Fecha de la ventana con el peor CAGR */
  worstEndDate: string | null;
  /** CAGR medio aritmético de todas las ventanas */
  avgCagr: number;
  /** CAGR mediano */
  medianCagr: number;
  /** % de ventanas con CAGR >= 0 */
  positiveRatio: number;
}

/** Conjunto de estadísticos rolling: 1y, 3y, 5y, 10y */
export interface RollingStats {
  oneYear: RollingStatsBucket;
  threeYear: RollingStatsBucket;
  fiveYear: RollingStatsBucket;
  tenYear: RollingStatsBucket;
}

/** Una porción de la composición de cartera (agrupada por algún criterio) */
export interface AllocationSlice {
  /** Etiqueta de la categoría / agrupación */
  label: string;
  /** Peso total en % (decimal: 0.30 para 30%) */
  weight: number;
  /** Lista de nombres cortos de los fondos que componen esta porción */
  fundShortNames: string[];
}

/** Composición de cartera agregada por distintos criterios */
export interface PortfolioAllocation {
  /** Agrupado por FundCategory (RV Global, RF EUR Gov, etc.) */
  byCategory: AllocationSlice[];
  /** Agrupado por familia (Renta Variable / Renta Fija / Oro / Alternativos) */
  byAssetClass: AllocationSlice[];
  /** Agrupado por tipo de gestión (index vs active) */
  byManagement: AllocationSlice[];
}

/** Histograma de retornos (distribución de frecuencias) */
export interface ReturnsHistogram {
  /** Etiqueta del periodo de los retornos: "mes", "día", "trimestre" */
  periodLabel: string;
  /** Bins del histograma */
  bins: Array<{
    /** Límite inferior del bin (decimal, ej: -0.05 para -5%) */
    binStart: number;
    /** Límite superior del bin */
    binEnd: number;
    /** Punto medio del bin (para etiquetar) */
    binMid: number;
    /** Frecuencia (número de observaciones en el bin) */
    count: number;
    /** Frecuencia esperada según una distribución normal con misma media/std */
    normalExpected: number;
  }>;
  /** Media aritmética de los retornos */
  mean: number;
  /** Desviación estándar de los retornos */
  stdDev: number;
  /** Número total de observaciones */
  totalCount: number;
}

/** Desglose de comisiones pagadas */
export interface FeesSummary {
  /** Total de comisiones pagadas en EUR */
  totalFees: number;
  /** Comisiones como porcentaje del valor final */
  feesAsPercentage: number;
  /** TER promedio ponderado de la cartera */
  weightedTer: number;
  /** Comisión de gestión adicional anual en % (ej: 0.40) */
  managementFee?: number;
  /** Total pagado en comisiones de gestión en EUR */
  managementFeePaid?: number;
  /** Tasa impositiva aplicada en cada rebalanceo (decimal, ej: 0.21).
   *  En modo "spain-irpf" no aplica un único valor — la tasa varía por tramo. */
  taxRate?: number;
  /** Modo fiscal aplicado: "none" | "flat" | "spain-irpf" */
  taxMode?: "none" | "flat" | "spain-irpf";
  /** Total de impuestos pagados al rebalancear (plusvalías ya realizadas) */
  totalTaxesPaid?: number;
  /** Impuestos pendientes: lo que tributaría si liquidara la cartera al final
   *  del periodo, sobre las plusvalías latentes (no realizadas). */
  pendingTaxes?: number;
  /** Plusvalía latente al final del periodo (valor final - coste base remanente) */
  unrealizedGain?: number;
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
  /** Top 10 episodios de drawdown (de mayor a menor) */
  topDrawdowns: DrawdownEpisode[];
  /** Comportamiento durante periodos históricos de estrés */
  stressPeriods: StressPeriodResult[];
  /** Detalle de cada rebalanceo realizado (vacío si no hubo rebalanceos o no se trackeó) */
  rebalanceLog: RebalanceEvent[];
  /** Comparación vs benchmark (opcional, solo si se solicita) */
  benchmark?: BenchmarkComparison;
  /** Rolling returns a 1, 3 y 5 años */
  rollingReturns: RollingReturns;
  /** Estadísticos rolling: mejor/peor/medio/mediano por ventana (1y, 3y, 5y, 10y) */
  rollingStats: RollingStats;
  /** Histograma de la distribución de retornos del periodo */
  returnsHistogram: ReturnsHistogram;
  /** Composición de la cartera agrupada por distintos criterios */
  allocation: PortfolioAllocation;
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
  type:
    | "data_range"
    | "weight_normalized"
    | "info"
    | "ter_unknown"
    | "ter_estimated"
    | "asset_excluded"
    | "data_quality"
    | "data_gap"
    | "data_missing";
  /** Mensaje descriptivo */
  message: string;
  /** Severidad: info < warning < error */
  severity?: "info" | "warning" | "error";
  /** ID del fondo relacionado (si aplica) */
  fundId?: string;
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
  /** Ticker base del fondo. */
  ticker?: string;
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
  /** Granularidad de visualización utilizada */
  displayGranularity?: DisplayGranularity;
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
  /** Fecha exacta del dato en formato YYYY-MM-DD */
  exactDate?: string;
}

/** Precio diario de cierre */
export interface DailyPrice {
  /** Fecha en formato YYYY-MM-DD */
  date: string;
  /** Precio de cierre ajustado del día */
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
  calmar:
    "Calmar Ratio = CAGR / |Max DD|. Rentabilidad anual por unidad de pérdida máxima.",
  skewness:
    "Asimetría de la distribución. 0 = simétrica, <0 = cola izquierda larga (más pérdidas extremas).",
  excessKurtosis:
    "Curtosis en exceso. 0 = normal, >0 = colas gordas (más cisnes negros que una distribución normal).",
  varHistorical:
    "Value at Risk 5%: peor retorno del 5% de los peores periodos.",
  cvar:
    "Conditional VaR 5%: pérdida media en el peor 5% de los periodos (Expected Shortfall).",
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
