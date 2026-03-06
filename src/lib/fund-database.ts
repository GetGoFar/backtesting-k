// =============================================================================
// BASE DE DATOS DE FONDOS - Backtesting Tool El Proyecto K
// =============================================================================

import type { Fund, FundType, FundCategory } from "./types";

// -----------------------------------------------------------------------------
// ETFs y Fondos Indexados (datos de Yahoo Finance)
// -----------------------------------------------------------------------------

const INDEXED_FUNDS: Fund[] = [
  {
    id: "vanguard-global",
    name: "Vanguard Global Stock Index Fund",
    shortName: "Vanguard Global",
    isin: "IE00B03HCZ61",
    yahooTicker: "VWRL.AS", // ETF equivalente: Vanguard FTSE All-World
    ter: 0.22,
    category: "RV Global",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "ishares-msci-world",
    name: "iShares Core MSCI World UCITS ETF",
    shortName: "iShares World",
    isin: "IE00B4L5Y983",
    yahooTicker: "IWDA.AS",
    ter: 0.2,
    category: "RV Global",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-sp500",
    name: "Vanguard S&P 500 UCITS ETF",
    shortName: "Vanguard S&P500",
    isin: "IE00B3XXRP09",
    yahooTicker: "VUSA.AS",
    ter: 0.07,
    category: "RV EEUU",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "amundi-emerging",
    name: "Amundi MSCI Emerging Markets",
    shortName: "Amundi Emergentes",
    isin: "LU1681045370",
    yahooTicker: "AEEM.PA",
    ter: 0.2,
    category: "RV Emergentes",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-eur-bond",
    name: "Vanguard EUR Government Bond",
    shortName: "Vanguard RF EUR",
    isin: "IE00B04GQQ17",
    yahooTicker: "VETY.AS", // ETF equivalente: Vanguard EUR Eurozone Gov Bond
    ter: 0.12,
    category: "RF EUR Gov",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  // VGEA.AS no funciona en Yahoo Finance, usamos VETY.AS como alternativa
  // El fondo vanguard-eur-bond ya cubre esta categoría
  {
    id: "ishares-euro-bond",
    name: "iShares Core Euro Govt Bond",
    shortName: "iShares RF EUR",
    isin: "IE00B4WXJJ64",
    yahooTicker: "IEGA.AS",
    ter: 0.07,
    category: "RF EUR Gov",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "ishares-europe",
    name: "iShares Core MSCI Europe UCITS ETF",
    shortName: "iShares Europa",
    isin: "IE00B4K48X80",
    yahooTicker: "IMEU.AS",
    ter: 0.12,
    category: "RV Europa",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  // ---------------------------------------------------------------------------
  // ETFs Carteras K Inbestme - Renta Variable Sectorial
  // ---------------------------------------------------------------------------
  {
    id: "xtrackers-staples",
    name: "Xtrackers MSCI World Consumer Staples UCITS ETF 1C",
    shortName: "Xtrackers Staples",
    isin: "IE00BM67HN09",
    yahooTicker: "XDWS.DE",
    ter: 0.25,
    category: "RV Sectorial",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "xtrackers-utilities",
    name: "Xtrackers MSCI World Utilities UCITS ETF 1C",
    shortName: "Xtrackers Utilities",
    isin: "IE00BM67HQ30",
    yahooTicker: "XDWU.DE",
    ter: 0.25,
    category: "RV Sectorial",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "xtrackers-healthcare",
    name: "Xtrackers MSCI World Health Care UCITS ETF 1C",
    shortName: "Xtrackers Healthcare",
    isin: "IE00BM67HK77",
    yahooTicker: "XDWH.DE",
    ter: 0.25,
    category: "RV Sectorial",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "xtrackers-technology",
    name: "Xtrackers MSCI World Information Technology UCITS ETF 1C",
    shortName: "Xtrackers Technology",
    isin: "IE00BM67HT60",
    yahooTicker: "XDWT.DE",
    ter: 0.25,
    category: "RV Sectorial",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "xtrackers-energy",
    name: "Xtrackers MSCI World Energy UCITS ETF 1C",
    shortName: "Xtrackers Energy",
    isin: "IE00BM67HM91",
    yahooTicker: "XDW0.DE",
    ter: 0.25,
    category: "RV Sectorial",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "hsbc-reits",
    name: "Amundi Index FTSE EPRA NAREIT Global UCITS ETF DR",
    shortName: "Amundi REITs Global",
    isin: "LU1437018838",
    yahooTicker: "EPRA.PA",
    ter: 0.24,
    category: "RV REITs",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  // ---------------------------------------------------------------------------
  // ETFs Carteras K Inbestme - Renta Fija
  // ---------------------------------------------------------------------------
  {
    id: "amundi-gov-10-15y",
    name: "Amundi Euro Government Bond 10-15Y UCITS ETF Acc",
    shortName: "Amundi Gov 10-15Y",
    isin: "LU1650489385",
    yahooTicker: "MTE.PA",
    ter: 0.15,
    category: "RF EUR Gov Largo",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "amundi-gov-7-10y",
    name: "Amundi Euro Government Bond 7-10Y UCITS ETF Acc",
    shortName: "Amundi Gov 7-10Y",
    isin: "LU1287023185",
    yahooTicker: "X710.DE",
    ter: 0.15,
    category: "RF EUR Gov Medio",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "xtrackers-gov-5-7y",
    name: "Xtrackers Eurozone Government Bond 5-7 UCITS ETF 1C",
    shortName: "Xtrackers Gov 5-7Y",
    isin: "LU0290357176",
    yahooTicker: "DBXF.DE",
    ter: 0.15,
    category: "RF EUR Gov Medio",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "ishares-usd-treasury-hedged",
    name: "iShares USD Treasury Bond 1-3yr UCITS ETF EUR Hedged (Acc)",
    shortName: "iShares Treasury 1-3Y",
    isin: "IE00BDFK1573",
    yahooTicker: "IBTS.L",
    ter: 0.10,
    category: "RF EUR Gov Corto",
    type: "index",
    currency: "USD",
  },
  {
    id: "xtrackers-gov-1-3y",
    name: "Xtrackers II Eurozone Government Bond 1-3 UCITS ETF 1C",
    shortName: "Xtrackers Gov 1-3Y",
    isin: "LU0290356871",
    yahooTicker: "DBXM.DE",
    ter: 0.15,
    category: "RF EUR Gov Corto",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "amundi-gov-0-1y",
    name: "Amundi Prime Euro Government Bond 0-1Y UCITS ETF Acc",
    shortName: "Amundi Gov 0-1Y",
    isin: "LU2233156582",
    yahooTicker: "PRAB.DE",
    ter: 0.05,
    category: "RF EUR Gov Corto",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-eur-corp",
    name: "Vanguard EUR Corporate Bond UCITS ETF Accumulating",
    shortName: "Vanguard Corp EUR",
    isin: "IE00BGYWT403",
    yahooTicker: "VECP.DE",
    ter: 0.09,
    category: "RF EUR Corp",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "ishares-hy-esg",
    name: "iShares EUR High Yield Corporate Bond ESG UCITS ETF EUR (Acc)",
    shortName: "iShares HY ESG",
    isin: "IE00BJK55C48",
    yahooTicker: "IHYG.L",
    ter: 0.25,
    category: "RF EUR Corp",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  // ---------------------------------------------------------------------------
  // ETFs Carteras K Inbestme - Oro
  // ---------------------------------------------------------------------------
  {
    id: "ishares-gold",
    name: "Invesco Physical Gold ETC",
    shortName: "Invesco Gold EUR",
    isin: "IE00B579F325",
    yahooTicker: "SGLD.MI",
    ter: 0.12,
    category: "Oro",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
];

// -----------------------------------------------------------------------------
// Fondos de Gestión Activa Bancaria (datos manuales CSV)
// -----------------------------------------------------------------------------

const ACTIVE_FUNDS: Fund[] = [
  {
    id: "caixabank-global",
    name: "CaixaBank Bolsa Selección Global",
    shortName: "CaixaBank Global",
    isin: "ES0114768030",
    ter: 1.79,
    category: "RV Global",
    type: "active",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "santander-espana",
    name: "Santander Acciones Españolas",
    shortName: "Santander España",
    isin: "ES0175279036",
    ter: 1.68,
    category: "RV España",
    type: "active",
    bank: "Santander",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbva-sostenible",
    name: "BBVA Bolsa Desarrollo Sostenible",
    shortName: "BBVA Sostenible",
    isin: "ES0113536034",
    ter: 1.45,
    category: "RV Global",
    type: "active",
    bank: "BBVA",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "santander-rf",
    name: "Santander Renta Fija Privada",
    shortName: "Santander RF",
    isin: "ES0138883035",
    ter: 0.82,
    category: "RF EUR",
    type: "active",
    bank: "Santander",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "caixabank-rf",
    name: "CaixaBank RF Flexible",
    shortName: "CaixaBank RF",
    isin: "ES0164803033",
    ter: 0.98,
    category: "RF Flexible",
    type: "active",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bankinter-espana",
    name: "Bankinter Bolsa España",
    shortName: "Bankinter España",
    isin: "ES0114105036",
    ter: 1.37,
    category: "RV España",
    type: "active",
    bank: "Bankinter",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
];

// -----------------------------------------------------------------------------
// Todos los fondos combinados
// -----------------------------------------------------------------------------

const ALL_FUNDS: Fund[] = [...INDEXED_FUNDS, ...ACTIVE_FUNDS];

// Mapa para búsqueda rápida por ID
const FUNDS_BY_ID = new Map<string, Fund>(
  ALL_FUNDS.map((fund) => [fund.id, fund])
);

// Mapa para búsqueda rápida por ISIN
const FUNDS_BY_ISIN = new Map<string, Fund>(
  ALL_FUNDS.map((fund) => [fund.isin, fund])
);

// -----------------------------------------------------------------------------
// Funciones de acceso a datos
// -----------------------------------------------------------------------------

/**
 * Obtiene todos los fondos disponibles
 */
export function getAllFunds(): Fund[] {
  return ALL_FUNDS;
}

/**
 * Obtiene la lista de fondos, opcionalmente filtrada por query de búsqueda
 */
export function searchFunds(query?: string): Fund[] {
  if (!query || query.trim() === "") {
    return ALL_FUNDS;
  }

  const lowerQuery = query.toLowerCase().trim();
  return ALL_FUNDS.filter(
    (fund) =>
      fund.name.toLowerCase().includes(lowerQuery) ||
      fund.shortName.toLowerCase().includes(lowerQuery) ||
      fund.isin.toLowerCase().includes(lowerQuery) ||
      fund.category.toLowerCase().includes(lowerQuery) ||
      fund.bank?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Obtiene un fondo por su ID
 */
export function getFundById(id: string): Fund | undefined {
  return FUNDS_BY_ID.get(id);
}

/**
 * Obtiene un fondo por su ISIN
 */
export function getFundByIsin(isin: string): Fund | undefined {
  return FUNDS_BY_ISIN.get(isin);
}

/**
 * Obtiene todos los fondos indexados
 */
export function getIndexedFunds(): Fund[] {
  return INDEXED_FUNDS;
}

/**
 * Obtiene todos los fondos de gestión activa
 */
export function getActiveFunds(): Fund[] {
  return ACTIVE_FUNDS;
}

/**
 * Obtiene fondos por tipo
 */
export function getFundsByType(type: FundType): Fund[] {
  return ALL_FUNDS.filter((fund) => fund.type === type);
}

/**
 * Obtiene fondos por categoría
 */
export function getFundsByCategory(category: FundCategory): Fund[] {
  return ALL_FUNDS.filter((fund) => fund.category === category);
}

/**
 * Obtiene fondos por banco
 */
export function getFundsByBank(bank: string): Fund[] {
  return ALL_FUNDS.filter(
    (fund) => fund.bank?.toLowerCase() === bank.toLowerCase()
  );
}

/**
 * Verifica si un ID de fondo existe
 */
export function fundExists(id: string): boolean {
  return FUNDS_BY_ID.has(id);
}

/**
 * Obtiene múltiples fondos por sus IDs
 */
export function getFundsByIds(ids: string[]): Fund[] {
  return ids
    .map((id) => FUNDS_BY_ID.get(id))
    .filter((fund): fund is Fund => fund !== undefined);
}

/**
 * Calcula el TER promedio ponderado de una lista de holdings
 */
export function calculateWeightedTer(
  holdings: Array<{ fundId: string; weight: number }>
): number {
  let totalTer = 0;
  let totalWeight = 0;

  for (const holding of holdings) {
    const fund = FUNDS_BY_ID.get(holding.fundId);
    if (fund) {
      totalTer += fund.ter * holding.weight;
      totalWeight += holding.weight;
    }
  }

  return totalWeight > 0 ? totalTer / totalWeight : 0;
}
