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
    yahooTicker: "VHVE.AS", // ETF equivalente: Vanguard FTSE Developed World
    ter: 0.18,
    category: "RV Global",
    type: "index",
    currency: "EUR",
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
  },
  {
    id: "vanguard-eurozone-bond",
    name: "Vanguard EUR Eurozone Gov Bond",
    shortName: "Vanguard Eurozona",
    isin: "IE00BH04GL39",
    yahooTicker: "VGEA.AS",
    ter: 0.1,
    category: "RF EUR Gov",
    type: "index",
    currency: "EUR",
  },
  {
    id: "ishares-euro-bond",
    name: "iShares Core Euro Govt Bond",
    shortName: "iShares RF EUR",
    isin: "IE00B4WXJJ64",
    yahooTicker: "IEGA.AS",
    ter: 0.09,
    category: "RF EUR Gov",
    type: "index",
    currency: "EUR",
  },
  {
    id: "amundi-europe",
    name: "Amundi Index MSCI Europe",
    shortName: "Amundi Europa",
    isin: "LU0389811885",
    yahooTicker: "CEUE.PA",
    ter: 0.15,
    category: "RV Europa",
    type: "index",
    currency: "EUR",
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
