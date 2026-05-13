// =============================================================================
// REPORT TYPES — Definiciones de secciones del informe PDF
// =============================================================================

export type ReportSectionId =
  | "cover"
  | "score"
  | "summary"
  | "evolution"
  | "crisis"
  | "taxes"
  | "comparison"
  | "stress"
  | "composition"
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
  {
    id: "recommendation",
    title: "Recomendación y siguientes pasos",
    emoji: "🎯",
    description: "Conclusión personalizada según la nota global y CTA al Taller K.",
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

export const PRESET_SECTIONS: Record<Exclude<ReportPreset, "personalizado">, ReportSectionId[]> = {
  basico: ["cover", "score", "summary", "recommendation", "disclaimer"],
  estandar: ["cover", "score", "summary", "evolution", "crisis", "taxes", "recommendation", "disclaimer"],
  completo: REPORT_SECTIONS.map((s) => s.id),
};

export const PRESET_LABELS: Record<ReportPreset, string> = {
  basico: "Básico (5 páginas)",
  estandar: "Estándar (8 páginas)",
  completo: "Completo (13 páginas)",
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
  /** Nombre del cliente opcional (aparece en portada) */
  clientName?: string;
  /** Fecha del informe (default: hoy) */
  reportDate?: string;
}
