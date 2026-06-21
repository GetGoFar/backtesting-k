// =============================================================================
// PROVEEDORES DE DATOS — registro y selección por env var
// =============================================================================
//
// El proveedor activo se elige con la env var DATA_PROVIDER (default: "eodhd").
// Así el app-alumnos puede usar otra fuente sin tocar el motor ni la UI: basta
// otro deploy en Vercel con DATA_PROVIDER=<id> + la API key del proveedor.
// =============================================================================

import type { DataProvider } from "./types";
import { eodhdProvider } from "./eodhd";
import { twelveDataProvider } from "./twelvedata";

export type { DataProvider, FetchPricesArgs } from "./types";

const PROVIDERS: Record<string, DataProvider> = {
  eodhd: eodhdProvider,
  twelvedata: twelveDataProvider,
};

/** Devuelve el proveedor de datos activo según DATA_PROVIDER (default: eodhd).
 *  Si el id es desconocido, avisa y cae a EODHD para no romper el servicio. */
export function getProvider(): DataProvider {
  const id = (process.env.DATA_PROVIDER || "eodhd").toLowerCase();
  const provider = PROVIDERS[id];
  if (!provider) {
    console.warn(
      `[providers] DATA_PROVIDER="${id}" desconocido; usando "eodhd". ` +
        `Disponibles: ${Object.keys(PROVIDERS).join(", ")}`
    );
    return eodhdProvider;
  }
  return provider;
}
