// =============================================================================
// CARTERAS PREDEFINIDAS - Backtesting Tool El Proyecto K
// =============================================================================

import type { PortfolioPreset, FundType } from "./types";

// -----------------------------------------------------------------------------
// Carteras K (Indexadas)
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

const ALL_PRESETS: PortfolioPreset[] = [...K_PRESETS, ...BANK_PRESETS];

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
 * Obtiene presets de carteras bancarias (activas)
 */
export function getBankPresets(): PortfolioPreset[] {
  return BANK_PRESETS;
}
