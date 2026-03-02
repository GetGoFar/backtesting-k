// =============================================================================
// CARTERAS PREDEFINIDAS - Backtesting Tool El Proyecto K
// =============================================================================

import type { PortfolioPreset, FundType } from "./types";

// -----------------------------------------------------------------------------
// Carteras K (Indexadas)
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Carteras K Inbestme (1-10) - Sectoriales con Oro
// -----------------------------------------------------------------------------

const K_INBESTME_PRESETS: PortfolioPreset[] = [
  {
    id: "k-inbestme-1",
    name: "Cartera K Inbestme 1",
    description: "10% RV Sectorial + 75% RF + 15% Oro",
    type: "index",
    holdings: [
      // RV Sectorial (10%)
      { fundId: "xtrackers-staples", weight: 1.25 },
      { fundId: "xtrackers-utilities", weight: 1.25 },
      { fundId: "xtrackers-healthcare", weight: 2.5 },
      { fundId: "xtrackers-technology", weight: 2.5 },
      { fundId: "xtrackers-energy", weight: 1.25 },
      { fundId: "hsbc-reits", weight: 1.25 },
      // RF (75%)
      { fundId: "ishares-usd-treasury-hedged", weight: 20 },
      { fundId: "amundi-gov-0-1y", weight: 45 },
      { fundId: "vanguard-eur-corp", weight: 8 },
      { fundId: "ishares-hy-esg", weight: 2 },
      // Oro (15%)
      { fundId: "ishares-gold", weight: 15 },
    ],
  },
  {
    id: "k-inbestme-2",
    name: "Cartera K Inbestme 2",
    description: "15% RV Sectorial + 70% RF + 15% Oro",
    type: "index",
    holdings: [
      // RV Sectorial (15%)
      { fundId: "xtrackers-staples", weight: 1.875 },
      { fundId: "xtrackers-utilities", weight: 1.875 },
      { fundId: "xtrackers-healthcare", weight: 3.75 },
      { fundId: "xtrackers-technology", weight: 3.75 },
      { fundId: "xtrackers-energy", weight: 1.875 },
      { fundId: "hsbc-reits", weight: 1.875 },
      // RF (70%)
      { fundId: "ishares-usd-treasury-hedged", weight: 35 },
      { fundId: "xtrackers-gov-1-3y", weight: 20 },
      { fundId: "vanguard-eur-corp", weight: 11 },
      { fundId: "ishares-hy-esg", weight: 4 },
      // Oro (15%)
      { fundId: "ishares-gold", weight: 15 },
    ],
  },
  {
    id: "k-inbestme-3",
    name: "Cartera K Inbestme 3",
    description: "25% RV Sectorial + 60% RF + 15% Oro",
    type: "index",
    holdings: [
      // RV Sectorial (25%)
      { fundId: "xtrackers-staples", weight: 3.125 },
      { fundId: "xtrackers-utilities", weight: 3.125 },
      { fundId: "xtrackers-healthcare", weight: 6.25 },
      { fundId: "xtrackers-technology", weight: 6.25 },
      { fundId: "xtrackers-energy", weight: 3.125 },
      { fundId: "hsbc-reits", weight: 3.125 },
      // RF (60%)
      { fundId: "ishares-usd-treasury-hedged", weight: 30 },
      { fundId: "xtrackers-gov-5-7y", weight: 15 },
      { fundId: "vanguard-eur-corp", weight: 10 },
      { fundId: "ishares-hy-esg", weight: 5 },
      // Oro (15%)
      { fundId: "ishares-gold", weight: 15 },
    ],
  },
  {
    id: "k-inbestme-4",
    name: "Cartera K Inbestme 4",
    description: "35% RV Sectorial + 50% RF + 15% Oro",
    type: "index",
    holdings: [
      // RV Sectorial (35%)
      { fundId: "xtrackers-staples", weight: 4.375 },
      { fundId: "xtrackers-utilities", weight: 4.375 },
      { fundId: "xtrackers-healthcare", weight: 8.75 },
      { fundId: "xtrackers-technology", weight: 8.75 },
      { fundId: "xtrackers-energy", weight: 4.375 },
      { fundId: "hsbc-reits", weight: 4.375 },
      // RF (50%)
      { fundId: "ishares-usd-treasury-hedged", weight: 10 },
      { fundId: "xtrackers-gov-5-7y", weight: 25 },
      { fundId: "vanguard-eur-corp", weight: 9 },
      { fundId: "ishares-hy-esg", weight: 6 },
      // Oro (15%)
      { fundId: "ishares-gold", weight: 15 },
    ],
  },
  {
    id: "k-inbestme-5",
    name: "Cartera K Inbestme 5",
    description: "45% RV Sectorial + 35% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Sectorial (45%)
      { fundId: "xtrackers-staples", weight: 5.625 },
      { fundId: "xtrackers-utilities", weight: 5.625 },
      { fundId: "xtrackers-healthcare", weight: 11.25 },
      { fundId: "xtrackers-technology", weight: 11.25 },
      { fundId: "xtrackers-energy", weight: 5.625 },
      { fundId: "hsbc-reits", weight: 5.625 },
      // RF (35%)
      { fundId: "xtrackers-gov-5-7y", weight: 25 },
      { fundId: "vanguard-eur-corp", weight: 6 },
      { fundId: "ishares-hy-esg", weight: 4 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
  {
    id: "k-inbestme-6",
    name: "Cartera K Inbestme 6",
    description: "60% RV Sectorial + 20% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Sectorial (60%)
      { fundId: "xtrackers-staples", weight: 7.5 },
      { fundId: "xtrackers-utilities", weight: 7.5 },
      { fundId: "xtrackers-healthcare", weight: 15 },
      { fundId: "xtrackers-technology", weight: 15 },
      { fundId: "xtrackers-energy", weight: 7.5 },
      { fundId: "hsbc-reits", weight: 7.5 },
      // RF (20%)
      { fundId: "amundi-gov-7-10y", weight: 20 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
  {
    id: "k-inbestme-7",
    name: "Cartera K Inbestme 7",
    description: "65% RV Sectorial + 15% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Sectorial (65%)
      { fundId: "xtrackers-staples", weight: 8.125 },
      { fundId: "xtrackers-utilities", weight: 8.125 },
      { fundId: "xtrackers-healthcare", weight: 16.25 },
      { fundId: "xtrackers-technology", weight: 16.25 },
      { fundId: "xtrackers-energy", weight: 8.125 },
      { fundId: "hsbc-reits", weight: 8.125 },
      // RF (15%)
      { fundId: "amundi-gov-7-10y", weight: 15 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
  {
    id: "k-inbestme-8",
    name: "Cartera K Inbestme 8",
    description: "70% RV Sectorial + 10% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Sectorial (70%)
      { fundId: "xtrackers-staples", weight: 8.75 },
      { fundId: "xtrackers-utilities", weight: 8.75 },
      { fundId: "xtrackers-healthcare", weight: 17.5 },
      { fundId: "xtrackers-technology", weight: 17.5 },
      { fundId: "xtrackers-energy", weight: 8.75 },
      { fundId: "hsbc-reits", weight: 8.75 },
      // RF (10%)
      { fundId: "amundi-gov-10-15y", weight: 10 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
  {
    id: "k-inbestme-9",
    name: "Cartera K Inbestme 9",
    description: "75% RV Sectorial + 5% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Sectorial (75%)
      { fundId: "xtrackers-staples", weight: 9.375 },
      { fundId: "xtrackers-utilities", weight: 9.375 },
      { fundId: "xtrackers-healthcare", weight: 18.75 },
      { fundId: "xtrackers-technology", weight: 18.75 },
      { fundId: "xtrackers-energy", weight: 9.375 },
      { fundId: "hsbc-reits", weight: 9.375 },
      // RF (5%)
      { fundId: "amundi-gov-10-15y", weight: 5 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
  {
    id: "k-inbestme-10",
    name: "Cartera K Inbestme 10",
    description: "80% RV Sectorial + 0% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Sectorial (80%)
      { fundId: "xtrackers-staples", weight: 10 },
      { fundId: "xtrackers-utilities", weight: 10 },
      { fundId: "xtrackers-healthcare", weight: 20 },
      { fundId: "xtrackers-technology", weight: 20 },
      { fundId: "xtrackers-energy", weight: 10 },
      { fundId: "hsbc-reits", weight: 10 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Carteras K Simples (para comparación)
// -----------------------------------------------------------------------------

const K_PRESETS: PortfolioPreset[] = [
  {
    id: "k-conservadora",
    name: "Cartera K Conservadora",
    description: "30% RV Global Indexada + 70% RF EUR Indexada",
    type: "index",
    holdings: [
      { fundId: "vanguard-global", weight: 30 },
      { fundId: "vanguard-eur-bond", weight: 70 },
    ],
  },
  {
    id: "k-moderada",
    name: "Cartera K Moderada",
    description: "60% RV Global Indexada + 40% RF EUR Indexada",
    type: "index",
    holdings: [
      { fundId: "vanguard-global", weight: 60 },
      { fundId: "vanguard-eur-bond", weight: 40 },
    ],
  },
  {
    id: "k-agresiva",
    name: "Cartera K Agresiva",
    description: "80% RV Global + 10% RV EEUU + 10% RF EUR",
    type: "index",
    holdings: [
      { fundId: "vanguard-global", weight: 80 },
      { fundId: "vanguard-sp500", weight: 10 },
      { fundId: "ishares-euro-bond", weight: 10 },
    ],
  },
  {
    id: "k-100rv",
    name: "Cartera K 100% RV",
    description: "70% RV Global + 20% RV EEUU + 10% RV Emergentes",
    type: "index",
    holdings: [
      { fundId: "vanguard-global", weight: 70 },
      { fundId: "vanguard-sp500", weight: 20 },
      { fundId: "amundi-emerging", weight: 10 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Carteras Bancarias (Gestión Activa)
// -----------------------------------------------------------------------------

const BANK_PRESETS: PortfolioPreset[] = [
  {
    id: "banco-conservadora",
    name: "Cartera Banco Conservadora",
    description: "30% CaixaBank Global + 70% Santander RF",
    type: "active",
    holdings: [
      { fundId: "caixabank-global", weight: 30 },
      { fundId: "santander-rf", weight: 70 },
    ],
  },
  {
    id: "banco-moderada",
    name: "Cartera Banco Moderada",
    description: "50% CaixaBank Global + 20% Santander España + 30% Santander RF",
    type: "active",
    holdings: [
      { fundId: "caixabank-global", weight: 50 },
      { fundId: "santander-espana", weight: 20 },
      { fundId: "santander-rf", weight: 30 },
    ],
  },
  {
    id: "banco-agresiva",
    name: "Cartera Banco Agresiva",
    description: "60% CaixaBank Global + 25% Santander España + 15% BBVA Sostenible",
    type: "active",
    holdings: [
      { fundId: "caixabank-global", weight: 60 },
      { fundId: "santander-espana", weight: 25 },
      { fundId: "bbva-sostenible", weight: 15 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Todos los presets combinados
// -----------------------------------------------------------------------------

const ALL_PRESETS: PortfolioPreset[] = [...K_INBESTME_PRESETS, ...K_PRESETS, ...BANK_PRESETS];

// Mapa para búsqueda rápida por ID
const PRESETS_BY_ID = new Map<string, PortfolioPreset>(
  ALL_PRESETS.map((preset) => [preset.id, preset])
);

// -----------------------------------------------------------------------------
// Funciones de acceso a datos
// -----------------------------------------------------------------------------

/**
 * Obtiene todos los presets disponibles
 */
export function getAllPresets(): PortfolioPreset[] {
  return ALL_PRESETS;
}

/**
 * Obtiene un preset por su ID
 */
export function getPresetById(id: string): PortfolioPreset | undefined {
  return PRESETS_BY_ID.get(id);
}

/**
 * Obtiene presets por tipo (index o active)
 */
export function getPresetsByType(type: FundType): PortfolioPreset[] {
  return ALL_PRESETS.filter((preset) => preset.type === type);
}

/**
 * Obtiene presets de carteras K (indexadas)
 */
export function getKPresets(): PortfolioPreset[] {
  return K_PRESETS;
}

/**
 * Obtiene presets de carteras K Inbestme (1-10)
 */
export function getKInbestmePresets(): PortfolioPreset[] {
  return K_INBESTME_PRESETS;
}

/**
 * Obtiene presets de carteras bancarias (activas)
 */
export function getBankPresets(): PortfolioPreset[] {
  return BANK_PRESETS;
}
