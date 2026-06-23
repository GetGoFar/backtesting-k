// =============================================================================
// REPORT TYPES — Definiciones de secciones del informe PDF
// =============================================================================

export type ReportSectionId =
  | "cover"
  | "score"
  | "summary"
  | "metricsFull"
  | "evolution"
  | "annualReturns"
  | "monthlyHeatmap"
  | "crisis"
  | "topDrawdowns"
  | "rolling"
  | "histogram"
  | "taxes"
  | "comparison"
  | "stress"
  | "composition"
  | "correlations"
  | "assetMetrics"
  | "contributions"
  | "rebalances"
  | "recommendation"
  | "disclaimer";

export interface ReportSectionMeta {
  id: ReportSectionId;
  title: string;
  emoji: string;
  description: string;
  /** Si true, se incluye siempre (no se puede desactivar) */
  required?: boolean;
  /** Si true, se incluye por defecto en el preset "estándar" */
  defaultEnabled?: boolean;
  /** Tamaño aproximado en páginas */
  pages?: number;
}

export const REPORT_SECTIONS: ReportSectionMeta[] = [
  {
    id: "cover",
    title: "Portada",
    emoji: "📄",
    description: "Identificación del informe, periodo analizado y datos de la cartera.",
    required: true,
    defaultEnabled: true,
    pages: 1,
  },
  {
    id: "score",
    title: "Tu cartera de 0 a 10",
    emoji: "🏆",
    description: "Nota global más seis sub-notas por dimensión: rentabilidad, eficiencia, resistencia, estabilidad, coste y diversificación.",
    defaultEnabled: true,
    pages: 1,
  },
  {
    id: "summary",
    title: "Resumen en 30 segundos",
    emoji: "📊",
    description: "Tres cifras clave y un párrafo de conclusión rápida.",
    defaultEnabled: true,
    pages: 1,
  },
  {
    id: "evolution",
    title: "Cómo crece tu dinero",
    emoji: "📈",
    description: "Gráfico de evolución del patrimonio con valor final desglosado.",
    defaultEnabled: true,
    pages: 1,
  },
  {
    id: "crisis",
    title: "¿Cuánto sufrirías en una crisis?",
    emoji: "😰",
    description: "Peor caída y peor periodo traducidos a lenguaje claro, sin tecnicismos.",
    defaultEnabled: true,
    pages: 1,
  },
  {
    id: "taxes",
    title: "Cómo afectan los impuestos",
    emoji: "🧾",
    description: "Las tres rentabilidades: bruta, neta del camino y neta al liquidar.",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "comparison",
    title: "Comparativa con alternativas",
    emoji: "⚖️",
    description: "Comparación vs benchmark de referencia (si está activo).",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "stress",
    title: "Resistencia en crisis históricas",
    emoji: "🌪️",
    description: "Cómo se habría comportado durante 2008, COVID 2020 y bajada 2022.",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "composition",
    title: "De qué está hecha tu cartera",
    emoji: "🥧",
    description: "Reparto por tipo de activo, región y estilo de gestión.",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "contributions",
    title: "El poder de las aportaciones",
    emoji: "💰",
    description: "Cuánto del valor final viene de aportar cada mes vs del crecimiento.",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "rebalances",
    title: "Historial de movimientos",
    emoji: "🔁",
    description: "Listado de rebalanceos, plusvalías cristalizadas e impuestos pagados.",
    defaultEnabled: false,
    pages: 2,
  },
  // --- Secciones que reproducen el backtest completo de pantalla ---
  {
    id: "metricsFull",
    title: "Todas las métricas",
    emoji: "📐",
    description: "Tabla completa: CAGR, volatilidad, Sharpe, Sortino, drawdown, mejor/peor mes, % meses positivos (vs benchmark si está).",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "annualReturns",
    title: "Rentabilidad año a año",
    emoji: "📅",
    description: "Cada año natural en verde/rojo: cuándo ganó y cuándo perdió tu cartera.",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "monthlyHeatmap",
    title: "Mapa de calor mensual",
    emoji: "🗓️",
    description: "Rejilla mes a mes coloreada por rentabilidad — la textura real del camino.",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "topDrawdowns",
    title: "Las peores caídas",
    emoji: "📉",
    description: "Las 5 mayores caídas: cuánto, cuándo y cuánto tardó en recuperarse.",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "rolling",
    title: "Rentabilidad en ventanas móviles",
    emoji: "🪟",
    description: "Rentabilidad anualizada a 1, 3 y 5 años según el momento de entrada — el mejor antídoto contra el 'market timing'.",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "histogram",
    title: "Distribución de rentabilidades",
    emoji: "📊",
    description: "Con qué frecuencia se repiten meses buenos y malos (forma de la distribución).",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "correlations",
    title: "Correlación entre activos",
    emoji: "🔗",
    description: "Qué activos se mueven juntos y cuáles te diversifican de verdad.",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "assetMetrics",
    title: "Métricas por activo",
    emoji: "🧩",
    description: "Rentabilidad, volatilidad y peso de cada fondo de la cartera por separado.",
    defaultEnabled: false,
    pages: 1,
  },
  {
    id: "recommendation",
    title: "Conclusiones",
    emoji: "🎯",
    description: "Lectura final de los datos y puntos a observar (sin prescripción).",
    defaultEnabled: true,
    pages: 1,
  },
  {
    id: "disclaimer",
    title: "Aviso legal",
    emoji: "⚠️",
    description: "Disclaimer educativo obligatorio.",
    required: true,
    defaultEnabled: true,
    pages: 0,
  },
];

// -----------------------------------------------------------------------------
// Presets
// -----------------------------------------------------------------------------

export type ReportPreset = "basico" | "estandar" | "completo" | "personalizado";

// Orden canónico = orden de la pantalla de resultados del backtest.
export const FULL_BACKTEST_ORDER: ReportSectionId[] = [
  "cover",
  "score",
  "summary",
  "metricsFull",
  "evolution",
  "annualReturns",
  "monthlyHeatmap",
  "crisis",
  "topDrawdowns",
  "rolling",
  "histogram",
  "composition",
  "correlations",
  "assetMetrics",
  "stress",
  "taxes",
  "comparison",
  "contributions",
  "rebalances",
  "recommendation",
  "disclaimer",
];

export const PRESET_SECTIONS: Record<Exclude<ReportPreset, "personalizado">, ReportSectionId[]> = {
  basico: ["cover", "score", "summary", "recommendation", "disclaimer"],
  estandar: ["cover", "score", "summary", "evolution", "crisis", "taxes", "recommendation", "disclaimer"],
  // "Backtest completo": reproduce TODO lo de la pantalla de resultados, en orden.
  completo: FULL_BACKTEST_ORDER,
};

export const PRESET_LABELS: Record<ReportPreset, string> = {
  basico: "Básico (5 páginas)",
  estandar: "Estándar (8 páginas)",
  completo: "Backtest completo (todo)",
  personalizado: "Personalizado",
};

// -----------------------------------------------------------------------------
// Configuración de un informe
// -----------------------------------------------------------------------------

export interface ReportConfig {
  /** Secciones seleccionadas (en orden de aparición) */
  sections: ReportSectionId[];
  /** Cartera de la que se genera el informe ("a" o "b" — la otra y el benchmark se usan como contraste) */
  primaryPortfolio: "a" | "b";
  /** Si true (y hay dos carteras), el informe es COMPARATIVO A vs B en vez de
   *  centrarse en una sola. La pantalla lo activa por defecto cuando hay A y B. */
  comparative?: boolean;
  /** Nombre del cliente opcional (aparece en portada) */
  clientName?: string;
  /** Fecha del informe (default: hoy) */
  reportDate?: string;
  /**
   * Base sobre la que se expresan las RENTABILIDADES PRINCIPALES (valor final,
   * rentabilidad total y CAGR) en todo el informe:
   *  - "bruto":    antes de impuestos (rentabilidad de folleto).
   *  - "camino":   neta del camino — lo que ves hoy en cuenta (default).
   *  - "liquidar": neta al liquidar — lo que de verdad te llevas tras Hacienda
   *                (incluye el impuesto pendiente; hipotético si la cartera no
   *                tributa por el camino pero la comparada sí).
   * Las métricas de riesgo (volatilidad, Sharpe, drawdown…) no cambian: son del
   * camino. La sección de impuestos siempre muestra los tres escenarios.
   */
  valueMode?: "bruto" | "camino" | "liquidar";
}
