// =============================================================================
// PROVEEDOR TWELVE DATA — STUB (pendiente de implementar)
// =============================================================================
//
// Candidato para el app-alumnos (otro deploy con DATA_PROVIDER=twelvedata).
// Investigación 2026-06 (ver memoria productizar-backtesting-tool):
//   - Cobertura: ETFs/acciones USA, fondos mutuos USA (VBMFX verificado) y
//     UCITS europeos (Xetra/Euronext/Milán; VWCE verificado). Oro XAU/USD.
//   - Símbolo: formato "SYMBOL" + parámetro &exchange=XETRA o &mic_code=...
//   - EOD /time_series devuelve OHLC SIN ajustar → para DISTRIBUCIÓN hay que
//     aplicar dividendos/splits aparte (endpoints /dividends y /splits), igual
//     que hace eodhd.ts con los splits para acumulación.
//   - Licencia de DISPLAY (app pública): requiere plan Venture (~450€/mes).
//
// PARA IMPLEMENTARLO: rellena fetchDailyPrices llamando a la API de Twelve Data
// (token en TWELVEDATA_API_TOKEN), mapeando el ticker ".DE→exchange=XETRA" etc.
// y devolviendo DailyPrice[] (TOTAL RETURN si distributing, close+splits si no).
// Usa eodhd.ts como plantilla. Mientras tanto, lanza error para fallar en claro.
// =============================================================================

import type { DailyPrice } from "../types";
import type { DataProvider, FetchPricesArgs } from "./types";

const TWELVEDATA_API_TOKEN = process.env.TWELVEDATA_API_TOKEN || "";

export const twelveDataProvider: DataProvider = {
  name: "twelvedata",
  async fetchDailyPrices(args: FetchPricesArgs): Promise<DailyPrice[]> {
    throw new Error(
      `[providers] El proveedor "twelvedata" todavía no está implementado ` +
        `(token configurado: ${TWELVEDATA_API_TOKEN ? "sí" : "no"}). ` +
        `Implementa fetchDailyPrices en src/lib/providers/twelvedata.ts usando eodhd.ts como referencia. ` +
        `Petición recibida: ${JSON.stringify(args)}. Mientras tanto, usa DATA_PROVIDER=eodhd.`
    );
  },
};
