// =============================================================================
// PROVEEDORES DE DATOS — interfaz común
// =============================================================================
//
// El acceso a la fuente de precios está detrás de esta interfaz para poder
// CAMBIAR de proveedor sin tocar el motor de backtest, los gráficos ni el PDF.
// El proveedor activo se elige con la env var DATA_PROVIDER (ver ./index.ts).
//
// Para añadir un proveedor nuevo: crea un fichero que exporte un objeto que
// cumpla `DataProvider` (usa ./eodhd.ts como referencia) y regístralo en
// ./index.ts. El data-fetcher hace por su cuenta: caché, validación, limpieza
// y el fallback a CSV de fondos españoles.
// =============================================================================

import type { DailyPrice } from "../types";

/** Lo que el data-fetcher pide a un proveedor para resolver un fondo. */
export interface FetchPricesArgs {
  /** Ticker en formato "símbolo.exchange" (sufijos clásicos: .DE, .L, .AS…) o
   *  símbolo USA sin sufijo (AAPL). Cada proveedor lo traduce a SU formato. */
  ticker?: string;
  /** ISIN del fondo (para resolver fondos que no tienen ticker de bolsa). */
  isin?: string;
  /** true = ETF/fondo de DISTRIBUCIÓN → el proveedor debe devolver TOTAL RETURN
   *  (close ajustado con dividendos). false = ACUMULACIÓN → close ajustado solo
   *  por splits (el dividendo ya está reinvertido en el NAV). */
  distributing: boolean;
}

/** Adaptador de una fuente de datos de precios. */
export interface DataProvider {
  /** Id del proveedor (para logs y selección por DATA_PROVIDER). */
  readonly name: string;
  /** Descarga precios diarios de un fondo. Devuelve [] si no hay datos
   *  (el data-fetcher hará el fallback a CSV y la validación/caché). */
  fetchDailyPrices(args: FetchPricesArgs): Promise<DailyPrice[]>;
}
