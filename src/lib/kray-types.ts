// =============================================================================
// K-RAY — Tipos del análisis radiográfico de cartera
// =============================================================================

export interface KrayInputHolding {
  fundId: string;
  /** Peso en % en la cartera (0-100). */
  weight: number;
}

export interface KrayInput {
  /** Nombre legible de la cartera (mostrado en cabeceras). */
  name?: string;
  /** Composición de la cartera a analizar. */
  holdings: KrayInputHolding[];
}

/** Una porción de un breakdown (sector, país, región, asset class). */
export interface KraySlice {
  /** Etiqueta de la categoría ("Technology", "United States", "Bond", ...). */
  label: string;
  /** Peso AGREGADO en la cartera (% sobre 100). */
  weight: number;
  /** Fondos que aportan a esta categoría — con su contribución individual. */
  contributors: Array<{
    fundId: string;
    fundName: string;
    fundWeight: number;     // peso del fondo en la cartera (0-100)
    weightInFund: number;   // % de la categoría dentro del fondo (0-100)
    contribution: number;   // fundWeight × weightInFund / 100 = aporte al total
  }>;
}

/** Posición individual agregada (e.g. AAPL aparece en 3 fondos). */
export interface KrayHolding {
  /** Nombre del activo. */
  name: string;
  /** Ticker / código si se conoce. */
  code?: string;
  /** Sector del activo (si EODHD lo provee). */
  sector?: string;
  /** Región / país del activo. */
  region?: string;
  /** Peso TOTAL en la cartera (0-100, % sobre el patrimonio total). */
  totalWeight: number;
  /** Lista de fondos que la sostienen, con su aporte cada uno. */
  inFunds: Array<{
    fundId: string;
    fundName: string;
    /** Peso del fondo en la cartera (0-100). */
    fundWeight: number;
    /** Peso del activo DENTRO del fondo (0-100). */
    weightInFund: number;
    /** Contribución al peso total: fundWeight × weightInFund / 100. */
    contribution: number;
  }>;
}

/** Una duplicidad detectada: posición presente en 2+ fondos. */
export interface KrayDuplicate extends KrayHolding {
  /** Número de fondos en los que aparece (>= 2). */
  fundCount: number;
}

/** Aviso no fatal del análisis (e.g. un fondo sin datos en EODHD). */
export interface KrayWarning {
  fundId: string;
  fundName: string;
  message: string;
}

/** Resultado completo del análisis K-Ray. */
export interface KrayResult {
  portfolioName: string;
  /** Suma TOTAL de pesos analizados (debería ser ~100 si todo OK). */
  totalCoverage: number;
  /** Pesos NO cubiertos: fondos sin datos EODHD. */
  uncoveredWeight: number;
  /** Lista de fondos analizados con su composición individual. */
  funds: Array<{
    fundId: string;
    fundName: string;
    weight: number;
    isin?: string;
    available: boolean;
    /** Top 10 holdings DEL FONDO con su peso interno (para el dropdown). */
    topHoldings: Array<{
      name: string;
      code?: string;
      sector?: string;
      weight: number; // peso dentro del fondo (0-100)
    }>;
  }>;
  /** Desglose por asset class agregado (Equity / Bond / Cash / Other). */
  byAssetClass: KraySlice[];
  /** Desglose sectorial agregado. */
  bySector: KraySlice[];
  /** Desglose por región / continente. */
  byRegion: KraySlice[];
  /** Desglose por país. */
  byCountry: KraySlice[];
  /** Top 10 posiciones individuales agregadas (mayor peso → menor). */
  topHoldings: KrayHolding[];
  /** Posiciones que aparecen en 2+ fondos. */
  duplicates: KrayDuplicate[];
  /** Avisos no fatales. */
  warnings: KrayWarning[];
}
