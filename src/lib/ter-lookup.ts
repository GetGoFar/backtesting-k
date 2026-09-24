// =============================================================================
// TER-LOOKUP — de dónde sale el TER de cada instrumento
// =============================================================================
//
// Regla pedida por Pablo (sep-2026): el TER lo trae EODHD si es un ETF y
// Financial Times si es un fondo de inversión. En la práctica esa decisión ya
// la toma `getFundComposition()`, que prueba en este orden:
//
//   1. Listados de EODHD (ISIN.EUFUND → /search/{ISIN} → ticker → fundId):
//      · ETF europeo  → ETF_Data.Ongoing_Charge      (en %)
//      · ETF de EEUU  → ETF_Data.NetExpenseRatio     (en fracción; se pasa a %)
//      · Fondo de EEUU → MutualFund_Data.Expense_Ratio (en %)
//   2. Si EODHD no tiene datos y el ISIN es europeo (los UCITS devuelven 404 o
//      vacío), cae a FT.com y lee "Ongoing charge" de la tearsheet.
//
// Este módulo solo envuelve esa llamada para quedarse con el TER y decir de
// DÓNDE salió, que es lo que la interfaz enseña al usuario. La caché (memoria +
// Redis, 90 días) la pone `getFundComposition`, así que repetir es barato.
//
// SOLO SERVIDOR: usa la API key de EODHD y hace scraping de FT. No importar
// desde un componente de cliente — se consume vía POST /api/ter.
// =============================================================================

import { getFundComposition } from "./eodhd-fundamentals";

export interface TerEncontrado {
  fundId: string;
  /** Gastos corrientes en % (0.07 = 0,07 %). Ausente si no se encontró. */
  ter?: number;
  /** Quién dio el dato. */
  fuente?: "eodhd" | "ft";
  /** Listado concreto que respondió ("SXR8.XETRA", "FT", …), para el tooltip. */
  listado?: string;
}

/** Un TER de 0 o por encima del 5 % anual no es creíble: se descarta antes que
 *  meter basura en la caja (algunos fondos activos rozan el 2-3 %). El 0 se trata
 *  como "sin dato" a propósito: ningún fondo real cobra 0 %, y escribirlo dejaría
 *  la caja aparentemente vacía pero marcada como confirmada. */
const TER_MAX_PLAUSIBLE = 5;

export async function buscarTer(args: {
  fundId: string;
  ticker?: string;
  isin?: string;
}): Promise<TerEncontrado> {
  try {
    const comp = await getFundComposition(args);
    const bruto = comp.ficha?.ter ?? comp.ter;
    if (bruto === undefined || !Number.isFinite(bruto) || bruto <= 0 || bruto > TER_MAX_PLAUSIBLE) {
      return { fundId: args.fundId };
    }
    const listado = comp.ficha?.listado;
    return {
      fundId: args.fundId,
      ter: Math.round(bruto * 100) / 100,
      fuente: listado === "FT" ? "ft" : "eodhd",
      listado,
    };
  } catch {
    // Nunca romper la interfaz por esto: sin dato, la caja se queda como estaba.
    return { fundId: args.fundId };
  }
}

/** Varios fondos a la vez, en tandas para no castigar a EODHD/FT (FT tarda ~1 s). */
export async function buscarTerVarios(
  fondos: Array<{ fundId: string; ticker?: string; isin?: string }>,
  tanda = 5
): Promise<TerEncontrado[]> {
  const salida: TerEncontrado[] = [];
  for (let i = 0; i < fondos.length; i += tanda) {
    const trozo = fondos.slice(i, i + tanda);
    salida.push(...(await Promise.all(trozo.map(buscarTer))));
  }
  return salida;
}
