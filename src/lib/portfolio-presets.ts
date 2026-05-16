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
    name: "Cartera K1 Inbestme",
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
    name: "Cartera K2 Inbestme",
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
    name: "Cartera K3 Inbestme",
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
    name: "Cartera K4 Inbestme",
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
    name: "Cartera K5 Inbestme",
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
    name: "Cartera K6 Inbestme",
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
    name: "Cartera K7 Inbestme",
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
    name: "Cartera K8 Inbestme",
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
    name: "Cartera K9 Inbestme",
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
    name: "Cartera K10 Inbestme",
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
// Carteras K Sectorial USA (1-9, X) — versión "USA" con ETFs cotizados en USD
// Fuente: Pablo González Vidal (portfoliovisualizer.com), niveles de riesgo 1-9 + X (máx).
// IMPORTANTE: estos ETFs cotizan en USD. El motor procesa los precios sin
// convertir a EUR, las cifras del resultado aparecerán con símbolo "€" pero
// realmente serán USD. Útil para alumnos con broker US o para análisis histórico
// con datos largos (los Vanguard treasuries y XL* tienen histórico desde 2000+).
//
// Sustituciones realizadas vs portfoliovisualizer:
//   ^GOLD (spot oro) → XAUUSD.FOREX (oro spot, mismo histórico desde 1979, TER 0)
//   ^CASHUS (cash)   → BIL (SPDR Bloomberg 1-3M T-Bill, TER 0,14%)
// -----------------------------------------------------------------------------

const K_SECTORIAL_USA_PRESETS: PortfolioPreset[] = [
  {
    id: "k-sectorial-usa-1",
    name: "K1 Sectorial USA",
    description: "Riesgo 1 (muy conservadora): 45% Cash + 30% Treasury + 10% Corp + 15% Oro + sectores",
    type: "index",
    holdings: [
      { fundId: "spdr-xlp", weight: 1.25 },
      { fundId: "spdr-xlv", weight: 2.50 },
      { fundId: "invesco-qqq", weight: 2.50 },
      { fundId: "spdr-xle", weight: 1.25 },
      { fundId: "vanguard-vgsix", weight: 1.25 },
      { fundId: "spot-gold", weight: 15 },
      { fundId: "vanguard-vfisx", weight: 20 },
      { fundId: "spdr-xlu", weight: 1.25 },
      { fundId: "spdr-bil", weight: 45 },
      { fundId: "ishares-lqd", weight: 8 },
      { fundId: "vanguard-vwehx", weight: 2 },
    ],
  },
  {
    id: "k-sectorial-usa-2",
    name: "K2 Sectorial USA",
    description: "Riesgo 2: 30% Cash + 12% VFISX + 28% Bonds + 15% Oro + 15% sectores",
    type: "index",
    holdings: [
      { fundId: "vanguard-vfisx", weight: 12 },
      { fundId: "ishares-lqd", weight: 18 },
      { fundId: "vanguard-vwehx", weight: 10 },
      { fundId: "spot-gold", weight: 15 },
      { fundId: "spdr-xlp", weight: 1.88 },
      { fundId: "spdr-xlv", weight: 3.75 },
      { fundId: "invesco-qqq", weight: 3.75 },
      { fundId: "spdr-xle", weight: 1.88 },
      { fundId: "vanguard-vgsix", weight: 1.88 },
      { fundId: "spdr-xlu", weight: 1.88 },
      { fundId: "spdr-bil", weight: 30 },
    ],
  },
  {
    id: "k-sectorial-usa-3",
    name: "K3 Sectorial USA",
    description: "Riesgo 3: 35,8% VFISX + 24% Corp + 15% Oro + 25,2% sectores",
    type: "index",
    holdings: [
      { fundId: "spdr-xlp", weight: 3.15 },
      { fundId: "spdr-xlv", weight: 6.30 },
      { fundId: "invesco-qqq", weight: 6.30 },
      { fundId: "spdr-xle", weight: 3.15 },
      { fundId: "vanguard-vgsix", weight: 3.15 },
      { fundId: "spot-gold", weight: 15 },
      { fundId: "vanguard-vfisx", weight: 35.80 },
      { fundId: "ishares-lqd", weight: 15 },
      { fundId: "vanguard-vwehx", weight: 9 },
      { fundId: "spdr-xlu", weight: 3.15 },
    ],
  },
  {
    id: "k-sectorial-usa-4",
    name: "K4 Sectorial USA",
    description: "Riesgo 4: 34,8% Treasury (corto/medio/largo) + 15% Corp + 15% Oro + 35,2% sectores",
    type: "index",
    holdings: [
      { fundId: "spdr-xlp", weight: 8.80 },
      { fundId: "spdr-xlv", weight: 8.80 },
      { fundId: "invesco-qqq", weight: 8.80 },
      { fundId: "spdr-xle", weight: 4.40 },
      { fundId: "vanguard-vgsix", weight: 4.40 },
      { fundId: "vanguard-vfitx", weight: 9 },
      { fundId: "vanguard-vustx", weight: 5 },
      { fundId: "vanguard-vfisx", weight: 20.80 },
      { fundId: "ishares-lqd", weight: 10 },
      { fundId: "vanguard-vwehx", weight: 5 },
      { fundId: "spot-gold", weight: 15 },
    ],
  },
  {
    id: "k-sectorial-usa-5",
    name: "K5 Sectorial USA",
    description: "Riesgo 5 (equilibrada): 27,9% Treasury + 7% Corp + 20% Oro + 45,1% sectores",
    type: "index",
    holdings: [
      { fundId: "spdr-xlu", weight: 5.65 },
      { fundId: "spdr-xlp", weight: 5.65 },
      { fundId: "spdr-xlv", weight: 11.30 },
      { fundId: "invesco-qqq", weight: 11.30 },
      { fundId: "spdr-xle", weight: 5.60 },
      { fundId: "vanguard-vgsix", weight: 5.60 },
      { fundId: "spot-gold", weight: 20 },
      { fundId: "vanguard-vfitx", weight: 8 },
      { fundId: "vanguard-vustx", weight: 3 },
      { fundId: "vanguard-vfisx", weight: 16.90 },
      { fundId: "ishares-lqd", weight: 5 },
      { fundId: "vanguard-vwehx", weight: 2 },
    ],
  },
  {
    id: "k-sectorial-usa-6",
    name: "K6 Sectorial USA",
    description: "Riesgo 6: 20% VFITX + 20% Oro + 60% sectores (XLV/QQQ 15% + XLP/XLE/VGSIX/XLU 7,5%)",
    type: "index",
    holdings: [
      { fundId: "spdr-xlp", weight: 7.50 },
      { fundId: "spdr-xlv", weight: 15.00 },
      { fundId: "invesco-qqq", weight: 15.00 },
      { fundId: "spdr-xle", weight: 7.50 },
      { fundId: "vanguard-vgsix", weight: 7.50 },
      { fundId: "spot-gold", weight: 20 },
      { fundId: "vanguard-vfitx", weight: 20 },
      { fundId: "spdr-xlu", weight: 7.50 },
    ],
  },
  {
    id: "k-sectorial-usa-7",
    name: "K7 Sectorial USA",
    description: "Riesgo 7: 15% VUSTX + 20% Oro + 65% sectores",
    type: "index",
    holdings: [
      { fundId: "vanguard-vustx", weight: 15 },
      { fundId: "spot-gold", weight: 20 },
      { fundId: "spdr-xlp", weight: 8.10 },
      { fundId: "spdr-xlv", weight: 16.30 },
      { fundId: "invesco-qqq", weight: 16.30 },
      { fundId: "spdr-xle", weight: 8.10 },
      { fundId: "vanguard-vgsix", weight: 8.10 },
      { fundId: "spdr-xlu", weight: 8.10 },
    ],
  },
  {
    id: "k-sectorial-usa-8",
    name: "K8 Sectorial USA",
    description: "Riesgo 8: 10% VUSTX + 20% Oro + 70% sectores",
    type: "index",
    holdings: [
      { fundId: "vanguard-vustx", weight: 10 },
      { fundId: "spot-gold", weight: 20 },
      { fundId: "spdr-xlp", weight: 8.75 },
      { fundId: "spdr-xlv", weight: 17.50 },
      { fundId: "invesco-qqq", weight: 17.50 },
      { fundId: "spdr-xle", weight: 8.75 },
      { fundId: "vanguard-vgsix", weight: 8.75 },
      { fundId: "spdr-xlu", weight: 8.75 },
    ],
  },
  {
    id: "k-sectorial-usa-9",
    name: "K9 Sectorial USA",
    description: "Riesgo 9: 5% VUSTX + 20% Oro + 75% sectores",
    type: "index",
    holdings: [
      { fundId: "spot-gold", weight: 20 },
      { fundId: "vanguard-vustx", weight: 5 },
      { fundId: "spdr-xlp", weight: 9.38 },
      { fundId: "spdr-xlv", weight: 18.75 },
      { fundId: "invesco-qqq", weight: 18.75 },
      { fundId: "spdr-xle", weight: 9.38 },
      { fundId: "vanguard-vgsix", weight: 9.38 },
      { fundId: "spdr-xlu", weight: 9.38 },
    ],
  },
  {
    id: "k-sectorial-usa-x",
    name: "KX Sectorial USA",
    description: "Riesgo máximo: 80% sectores + 20% Oro (sin bonos ni cash)",
    type: "index",
    holdings: [
      { fundId: "spdr-xlp", weight: 20 },
      { fundId: "spdr-xlv", weight: 20 },
      { fundId: "invesco-qqq", weight: 20 },
      { fundId: "spdr-xle", weight: 10 },
      { fundId: "vanguard-vgsix", weight: 10 },
      { fundId: "spot-gold", weight: 20 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Carteras K Geográfica USA (1-9, X) — versión "USA" con fondos Vanguard +
// EWJ (Japón) cotizados en USD. Comparten EXACTAMENTE la misma RF y Oro que
// las K Sectorial USA, pero la RV se distribuye por GEOGRAFÍA (USA +
// Desarrollados ex-US + Emergentes + Europa + Japón) en lugar de por sectores.
//
// Razón de la elección: el usuario quiso garantizar que ambas familias
// (Sectorial y Geográfica) sean comparables en el componente defensivo —
// solo cambia la asignación de RV. Así se aísla el efecto de la estrategia
// (sectores vs geografía) sin ruido de RF distinta.
//
// La RV mantiene las PROPORCIONES geográficas de portfoliovisualizer
// (~66% USA + 26% Desarrollados ex-US + 8% Emergentes para K1-K6, K8-KX;
// K7 añade Europa y Japón por separado) escaladas al peso RV total que
// dicta la K Sectorial USA correspondiente.
//
// IMPORTANTE: cotizan en USD. El motor procesa los precios sin convertir
// a EUR (las cifras del resultado aparecerán con símbolo "€" pero realmente
// serán USD).
// -----------------------------------------------------------------------------

const K_GEOGRAFICA_USA_PRESETS: PortfolioPreset[] = [
  {
    id: "k-geografica-usa-1",
    name: "K1 Geográfica USA",
    description: "Riesgo 1: 10% RV geográfica + 75% RF (BIL + treasuries + corp) + 15% Oro",
    type: "index",
    holdings: [
      // RV geográfica (10% total, ~66/26/8 USA/Desarrollados/EM)
      { fundId: "vanguard-vfinx", weight: 6.65 },
      { fundId: "vanguard-vtmgx", weight: 2.55 },
      { fundId: "vanguard-veiex", weight: 0.80 },
      // RF + Cash + Oro (idéntico a K1 Sectorial USA)
      { fundId: "spdr-bil", weight: 45 },
      { fundId: "vanguard-vfisx", weight: 20 },
      { fundId: "ishares-lqd", weight: 8 },
      { fundId: "vanguard-vwehx", weight: 2 },
      { fundId: "spot-gold", weight: 15 },
    ],
  },
  {
    id: "k-geografica-usa-2",
    name: "K2 Geográfica USA",
    description: "Riesgo 2: 15% RV geográfica + 70% RF (BIL + corp + HY + VFISX) + 15% Oro",
    type: "index",
    holdings: [
      { fundId: "vanguard-vfinx", weight: 10 },
      { fundId: "vanguard-vtmgx", weight: 4 },
      { fundId: "vanguard-veiex", weight: 1 },
      { fundId: "spdr-bil", weight: 30 },
      { fundId: "vanguard-vfisx", weight: 12 },
      { fundId: "ishares-lqd", weight: 18 },
      { fundId: "vanguard-vwehx", weight: 10 },
      { fundId: "spot-gold", weight: 15 },
    ],
  },
  {
    id: "k-geografica-usa-3",
    name: "K3 Geográfica USA",
    description: "Riesgo 3: 25,2% RV geográfica + 59,8% RF + 15% Oro",
    type: "index",
    holdings: [
      { fundId: "vanguard-vfinx", weight: 16.85 },
      { fundId: "vanguard-vtmgx", weight: 6.55 },
      { fundId: "vanguard-veiex", weight: 1.80 },
      { fundId: "vanguard-vfisx", weight: 35.80 },
      { fundId: "ishares-lqd", weight: 15 },
      { fundId: "vanguard-vwehx", weight: 9 },
      { fundId: "spot-gold", weight: 15 },
    ],
  },
  {
    id: "k-geografica-usa-4",
    name: "K4 Geográfica USA",
    description: "Riesgo 4: 35,2% RV geográfica + 49,8% RF + 15% Oro",
    type: "index",
    holdings: [
      { fundId: "vanguard-vfinx", weight: 23.65 },
      { fundId: "vanguard-vtmgx", weight: 9.05 },
      { fundId: "vanguard-veiex", weight: 2.50 },
      { fundId: "vanguard-vfitx", weight: 9 },
      { fundId: "vanguard-vustx", weight: 5 },
      { fundId: "vanguard-vfisx", weight: 20.80 },
      { fundId: "ishares-lqd", weight: 10 },
      { fundId: "vanguard-vwehx", weight: 5 },
      { fundId: "spot-gold", weight: 15 },
    ],
  },
  {
    id: "k-geografica-usa-5",
    name: "K5 Geográfica USA",
    description: "Riesgo 5 (equilibrada): 45,1% RV geográfica + 34,9% RF + 20% Oro",
    type: "index",
    holdings: [
      { fundId: "vanguard-vfinx", weight: 30.10 },
      { fundId: "vanguard-vtmgx", weight: 12 },
      { fundId: "vanguard-veiex", weight: 3 },
      { fundId: "vanguard-vfitx", weight: 8 },
      { fundId: "vanguard-vustx", weight: 3 },
      { fundId: "vanguard-vfisx", weight: 16.90 },
      { fundId: "ishares-lqd", weight: 5 },
      { fundId: "vanguard-vwehx", weight: 2 },
      { fundId: "spot-gold", weight: 20 },
    ],
  },
  {
    id: "k-geografica-usa-6",
    name: "K6 Geográfica USA",
    description: "Riesgo 6: 60% RV geográfica + 20% VFITX + 20% Oro",
    type: "index",
    holdings: [
      { fundId: "vanguard-vfinx", weight: 40.15 },
      { fundId: "vanguard-vtmgx", weight: 15.60 },
      { fundId: "vanguard-veiex", weight: 4.25 },
      { fundId: "vanguard-vfitx", weight: 20 },
      { fundId: "spot-gold", weight: 20 },
    ],
  },
  {
    id: "k-geografica-usa-7",
    name: "K7 Geográfica USA",
    description: "Riesgo 7: 65% RV geográfica (USA + Desarrollados + EM) + 15% VUSTX + 20% Oro",
    type: "index",
    holdings: [
      // Mismo patrón que el resto: ~67% USA + 26% Desarrollados ex-US + 7% EM
      { fundId: "vanguard-vfinx", weight: 43.55 },
      { fundId: "vanguard-vtmgx", weight: 16.90 },
      { fundId: "vanguard-veiex", weight: 4.55 },
      { fundId: "vanguard-vustx", weight: 15 },
      { fundId: "spot-gold", weight: 20 },
    ],
  },
  {
    id: "k-geografica-usa-8",
    name: "K8 Geográfica USA",
    description: "Riesgo 8: 70% RV geográfica + 10% VUSTX + 20% Oro",
    type: "index",
    holdings: [
      { fundId: "vanguard-vfinx", weight: 46.90 },
      { fundId: "vanguard-vtmgx", weight: 18.20 },
      { fundId: "vanguard-veiex", weight: 4.90 },
      { fundId: "vanguard-vustx", weight: 10 },
      { fundId: "spot-gold", weight: 20 },
    ],
  },
  {
    id: "k-geografica-usa-9",
    name: "K9 Geográfica USA",
    description: "Riesgo 9: 75% RV geográfica + 5% VUSTX + 20% Oro",
    type: "index",
    holdings: [
      { fundId: "vanguard-vfinx", weight: 50.25 },
      { fundId: "vanguard-vtmgx", weight: 19.45 },
      { fundId: "vanguard-veiex", weight: 5.30 },
      { fundId: "vanguard-vustx", weight: 5 },
      { fundId: "spot-gold", weight: 20 },
    ],
  },
  {
    id: "k-geografica-usa-x",
    name: "KX Geográfica USA",
    description: "Riesgo máximo: 80% RV geográfica (USA + Desarrollados + EM) + 20% Oro (sin bonos)",
    type: "index",
    holdings: [
      { fundId: "vanguard-vfinx", weight: 53.60 },
      { fundId: "vanguard-vtmgx", weight: 20.80 },
      { fundId: "vanguard-veiex", weight: 5.60 },
      { fundId: "spot-gold", weight: 20 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Cartera de los participantes de las primeras ediciones del Taller K.
// 10 acciones individuales equiponderadas (10% cada una). Mezcla USD/EUR —
// el motor no convierte FX, las cifras quedarán en una mezcla de divisas. Útil
// como caso pedagógico para enseñar stock-picking, concentración y
// survivorship bias.
// -----------------------------------------------------------------------------

const PARTICIPANTES_PRIMERAS_PRESETS: PortfolioPreset[] = [
  {
    id: "participantes-primeras-ediciones",
    name: "Cartera Participantes Primeras Ediciones",
    description: "10 acciones equiponderadas (10% c/u): AAPL, NVDA, AMZN, TSLA, GOOGL, KO, BRK-A, MSFT (USD) + ITX, LVMH (EUR)",
    type: "index",
    holdings: [
      { fundId: "stock-aapl",  weight: 10 },
      { fundId: "stock-nvda",  weight: 10 },
      { fundId: "stock-amzn",  weight: 10 },
      { fundId: "stock-tsla",  weight: 10 },
      { fundId: "stock-googl", weight: 10 },
      { fundId: "stock-ko",    weight: 10 },
      { fundId: "stock-brk-a", weight: 10 },
      { fundId: "stock-msft",  weight: 10 },
      { fundId: "stock-itx",   weight: 10 },
      { fundId: "stock-mc",    weight: 10 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Carteras Indexa Capital UCITS (1-10) — Cartera mediana (10k-100k)
// Proxies ETF de los fondos Vanguard Ins Plus que usa Indexa
// Fuente: https://indexacapital.com/es/esp/model
// -----------------------------------------------------------------------------

const INDEXA_PRESETS: PortfolioPreset[] = [
  {
    id: "indexa-1",
    name: "Indexa 1/10",
    description: "10% RV / 90% RF — Muy conservadora",
    type: "index",
    holdings: [
      // RV (10%)
      { fundId: "ishares-europe", weight: 4 },
      { fundId: "vanguard-sp500", weight: 6 },
      // RF (90%)
      { fundId: "vanguard-eur-corp", weight: 16 },
      { fundId: "vanguard-eur-bond", weight: 25 },
      { fundId: "indexa-eur-inflation", weight: 9 },
      { fundId: "indexa-us-gov-hedged", weight: 24 },
      { fundId: "indexa-us-corp-hedged", weight: 16 },
    ],
  },
  {
    id: "indexa-2",
    name: "Indexa 2/10",
    description: "20% RV / 80% RF — Conservadora",
    type: "index",
    holdings: [
      // RV (20%)
      { fundId: "ishares-europe", weight: 7 },
      { fundId: "vanguard-sp500", weight: 10 },
      { fundId: "amundi-emerging", weight: 3 },
      // RF (80%)
      { fundId: "vanguard-eur-corp", weight: 14 },
      { fundId: "vanguard-eur-bond", weight: 22 },
      { fundId: "indexa-eur-inflation", weight: 8 },
      { fundId: "indexa-us-gov-hedged", weight: 22 },
      { fundId: "indexa-us-corp-hedged", weight: 14 },
    ],
  },
  {
    id: "indexa-3",
    name: "Indexa 3/10",
    description: "30% RV / 70% RF — Moderada-conservadora",
    type: "index",
    holdings: [
      // RV (30%)
      { fundId: "ishares-europe", weight: 8 },
      { fundId: "vanguard-sp500", weight: 13 },
      { fundId: "amundi-emerging", weight: 3 },
      { fundId: "indexa-japan", weight: 3 },
      { fundId: "indexa-small-cap", weight: 3 },
      // RF (70%)
      { fundId: "vanguard-eur-corp", weight: 13 },
      { fundId: "vanguard-eur-bond", weight: 19 },
      { fundId: "indexa-eur-inflation", weight: 7 },
      { fundId: "indexa-us-gov-hedged", weight: 19 },
      { fundId: "indexa-us-corp-hedged", weight: 12 },
    ],
  },
  {
    id: "indexa-4",
    name: "Indexa 4/10",
    description: "40% RV / 60% RF — Moderada",
    type: "index",
    holdings: [
      // RV (40%)
      { fundId: "ishares-europe", weight: 11 },
      { fundId: "vanguard-sp500", weight: 18 },
      { fundId: "amundi-emerging", weight: 4 },
      { fundId: "indexa-japan", weight: 3 },
      { fundId: "indexa-small-cap", weight: 4 },
      // RF (60%)
      { fundId: "vanguard-eur-corp", weight: 11 },
      { fundId: "vanguard-eur-bond", weight: 16 },
      { fundId: "indexa-eur-inflation", weight: 6 },
      { fundId: "indexa-us-gov-hedged", weight: 16 },
      { fundId: "indexa-us-corp-hedged", weight: 11 },
    ],
  },
  {
    id: "indexa-5",
    name: "Indexa 5/10",
    description: "50% RV / 50% RF — Equilibrada",
    type: "index",
    holdings: [
      // RV (50%)
      { fundId: "ishares-europe", weight: 14 },
      { fundId: "vanguard-sp500", weight: 22 },
      { fundId: "amundi-emerging", weight: 5 },
      { fundId: "indexa-japan", weight: 4 },
      { fundId: "indexa-small-cap", weight: 5 },
      // RF (50%)
      { fundId: "vanguard-eur-corp", weight: 9 },
      { fundId: "vanguard-eur-bond", weight: 14 },
      { fundId: "indexa-eur-inflation", weight: 5 },
      { fundId: "indexa-us-gov-hedged", weight: 14 },
      { fundId: "indexa-us-corp-hedged", weight: 8 },
    ],
  },
  {
    id: "indexa-6",
    name: "Indexa 6/10",
    description: "60% RV / 40% RF — Moderada-agresiva",
    type: "index",
    holdings: [
      // RV (60%)
      { fundId: "ishares-europe", weight: 16 },
      { fundId: "vanguard-sp500", weight: 27 },
      { fundId: "amundi-emerging", weight: 6 },
      { fundId: "indexa-japan", weight: 5 },
      { fundId: "indexa-small-cap", weight: 6 },
      // RF (40%)
      { fundId: "vanguard-eur-corp", weight: 7 },
      { fundId: "vanguard-eur-bond", weight: 11 },
      { fundId: "indexa-eur-inflation", weight: 4 },
      { fundId: "indexa-us-gov-hedged", weight: 11 },
      { fundId: "indexa-us-corp-hedged", weight: 7 },
    ],
  },
  {
    id: "indexa-7",
    name: "Indexa 7/10",
    description: "70% RV / 30% RF — Agresiva",
    type: "index",
    holdings: [
      // RV (70%)
      { fundId: "ishares-europe", weight: 19 },
      { fundId: "vanguard-sp500", weight: 31 },
      { fundId: "amundi-emerging", weight: 7 },
      { fundId: "indexa-japan", weight: 6 },
      { fundId: "indexa-small-cap", weight: 7 },
      // RF (30%)
      { fundId: "vanguard-eur-corp", weight: 5 },
      { fundId: "vanguard-eur-bond", weight: 9 },
      { fundId: "indexa-eur-inflation", weight: 3 },
      { fundId: "indexa-us-gov-hedged", weight: 8 },
      { fundId: "indexa-us-corp-hedged", weight: 5 },
    ],
  },
  {
    id: "indexa-8",
    name: "Indexa 8/10",
    description: "80% RV / 20% RF — Muy agresiva",
    type: "index",
    holdings: [
      // RV (80%)
      { fundId: "ishares-europe", weight: 22 },
      { fundId: "vanguard-sp500", weight: 35 },
      { fundId: "amundi-emerging", weight: 9 },
      { fundId: "indexa-japan", weight: 6 },
      { fundId: "indexa-small-cap", weight: 8 },
      // RF (20%)
      { fundId: "vanguard-eur-corp", weight: 4 },
      { fundId: "vanguard-eur-bond", weight: 5 },
      { fundId: "indexa-eur-inflation", weight: 3 },
      { fundId: "indexa-us-gov-hedged", weight: 4 },
      { fundId: "indexa-us-corp-hedged", weight: 4 },
    ],
  },
  {
    id: "indexa-9",
    name: "Indexa 9/10",
    description: "90% RV / 10% RF — Máxima agresividad con RF",
    type: "index",
    holdings: [
      // RV (90%)
      { fundId: "ishares-europe", weight: 24 },
      { fundId: "vanguard-sp500", weight: 40 },
      { fundId: "amundi-emerging", weight: 10 },
      { fundId: "indexa-japan", weight: 7 },
      { fundId: "indexa-small-cap", weight: 9 },
      // RF (10%)
      { fundId: "vanguard-eur-corp", weight: 3 },
      { fundId: "vanguard-eur-bond", weight: 4 },
      { fundId: "indexa-eur-inflation", weight: 3 },
    ],
  },
  {
    id: "indexa-10",
    name: "Indexa 10/10",
    description: "100% RV — Máxima agresividad",
    type: "index",
    holdings: [
      // RV (100%)
      { fundId: "ishares-europe", weight: 27 },
      { fundId: "vanguard-sp500", weight: 44 },
      { fundId: "amundi-emerging", weight: 11 },
      { fundId: "indexa-japan", weight: 8 },
      { fundId: "indexa-small-cap", weight: 10 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Carteras Indexa USA ETFs (USD) — Réplica desde Portfoliovisualizer
// Mismas asignaciones porcentuales que Indexa 1-10, pero ejecutadas con
// fondos USA (mutual funds Vanguard) en lugar de UCITS europeos.
// Sirve para comparar a largo plazo (≥1990s) con datos de Yahoo Finance.
// SPY (S&P 500 ETF) — VEURX (Europa) — VEIEX (Emergentes) — EWJ (Japón) —
// NAESX (Small Caps USA) — VBMFX (Total Bond Market USA).
// -----------------------------------------------------------------------------

const INDEXA_USA_PRESETS: PortfolioPreset[] = [
  {
    id: "indexa-usa-1",
    name: "Indexa USA 1/10",
    description: "10% RV / 90% RF — Muy conservadora (USD)",
    type: "index",
    holdings: [
      { fundId: "spdr-spy", weight: 6 },
      { fundId: "vanguard-veurx", weight: 4 },
      { fundId: "vanguard-vbmfx", weight: 90 },
    ],
  },
  {
    id: "indexa-usa-2",
    name: "Indexa USA 2/10",
    description: "20% RV / 80% RF — Conservadora (USD)",
    type: "index",
    holdings: [
      { fundId: "spdr-spy", weight: 10 },
      { fundId: "vanguard-veurx", weight: 7 },
      { fundId: "vanguard-veiex", weight: 3 },
      { fundId: "vanguard-vbmfx", weight: 80 },
    ],
  },
  {
    id: "indexa-usa-3",
    name: "Indexa USA 3/10",
    description: "30% RV / 70% RF — Moderada-conservadora (USD)",
    type: "index",
    holdings: [
      { fundId: "spdr-spy", weight: 13 },
      { fundId: "vanguard-veurx", weight: 8 },
      { fundId: "vanguard-veiex", weight: 3 },
      { fundId: "ishares-ewj", weight: 3 },
      { fundId: "vanguard-naesx", weight: 3 },
      { fundId: "vanguard-vbmfx", weight: 70 },
    ],
  },
  {
    id: "indexa-usa-4",
    name: "Indexa USA 4/10",
    description: "40% RV / 60% RF — Moderada (USD)",
    type: "index",
    holdings: [
      { fundId: "spdr-spy", weight: 18 },
      { fundId: "vanguard-veurx", weight: 11 },
      { fundId: "vanguard-veiex", weight: 4 },
      { fundId: "ishares-ewj", weight: 3 },
      { fundId: "vanguard-naesx", weight: 4 },
      { fundId: "vanguard-vbmfx", weight: 60 },
    ],
  },
  {
    id: "indexa-usa-5",
    name: "Indexa USA 5/10",
    description: "50% RV / 50% RF — Equilibrada (USD)",
    type: "index",
    holdings: [
      { fundId: "spdr-spy", weight: 22 },
      { fundId: "vanguard-veurx", weight: 14 },
      { fundId: "vanguard-veiex", weight: 5 },
      { fundId: "ishares-ewj", weight: 4 },
      { fundId: "vanguard-naesx", weight: 5 },
      { fundId: "vanguard-vbmfx", weight: 50 },
    ],
  },
  {
    id: "indexa-usa-6",
    name: "Indexa USA 6/10",
    description: "60% RV / 40% RF — Moderada-agresiva (USD)",
    type: "index",
    holdings: [
      { fundId: "spdr-spy", weight: 27 },
      { fundId: "vanguard-veurx", weight: 16 },
      { fundId: "vanguard-veiex", weight: 6 },
      { fundId: "ishares-ewj", weight: 5 },
      { fundId: "vanguard-naesx", weight: 6 },
      { fundId: "vanguard-vbmfx", weight: 40 },
    ],
  },
  {
    id: "indexa-usa-7",
    name: "Indexa USA 7/10",
    description: "70% RV / 30% RF — Agresiva (USD)",
    type: "index",
    holdings: [
      { fundId: "spdr-spy", weight: 31 },
      { fundId: "vanguard-veurx", weight: 19 },
      { fundId: "vanguard-veiex", weight: 7 },
      { fundId: "ishares-ewj", weight: 6 },
      { fundId: "vanguard-naesx", weight: 7 },
      { fundId: "vanguard-vbmfx", weight: 30 },
    ],
  },
  {
    id: "indexa-usa-8",
    name: "Indexa USA 8/10",
    description: "80% RV / 20% RF — Muy agresiva (USD)",
    type: "index",
    holdings: [
      { fundId: "spdr-spy", weight: 35 },
      { fundId: "vanguard-veurx", weight: 22 },
      { fundId: "vanguard-veiex", weight: 9 },
      { fundId: "ishares-ewj", weight: 6 },
      { fundId: "vanguard-naesx", weight: 8 },
      { fundId: "vanguard-vbmfx", weight: 20 },
    ],
  },
  {
    id: "indexa-usa-9",
    name: "Indexa USA 9/10",
    description: "90% RV / 10% RF — Máxima agresividad con RF (USD)",
    type: "index",
    holdings: [
      { fundId: "spdr-spy", weight: 40 },
      { fundId: "vanguard-veurx", weight: 24 },
      { fundId: "vanguard-veiex", weight: 10 },
      { fundId: "ishares-ewj", weight: 7 },
      { fundId: "vanguard-naesx", weight: 9 },
      { fundId: "vanguard-vbmfx", weight: 10 },
    ],
  },
  {
    id: "indexa-usa-10",
    name: "Indexa USA 10/10",
    description: "100% RV — Máxima agresividad (USD)",
    type: "index",
    holdings: [
      { fundId: "spdr-spy", weight: 44 },
      { fundId: "vanguard-veurx", weight: 27 },
      { fundId: "vanguard-veiex", weight: 11 },
      { fundId: "ishares-ewj", weight: 8 },
      { fundId: "vanguard-naesx", weight: 10 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Carteras Tradicionales (para comparación)
// -----------------------------------------------------------------------------

const K_PRESETS: PortfolioPreset[] = [
  {
    id: "k-conservadora",
    name: "Tradicional Conservadora",
    description: "30% RV Global Indexada + 70% RF EUR Indexada",
    type: "index",
    holdings: [
      { fundId: "vanguard-global", weight: 30 },
      { fundId: "vanguard-eur-bond", weight: 70 },
    ],
  },
  {
    id: "k-moderada",
    name: "Tradicional Moderada",
    description: "60% RV Global Indexada + 40% RF EUR Indexada",
    type: "index",
    holdings: [
      { fundId: "vanguard-global", weight: 60 },
      { fundId: "vanguard-eur-bond", weight: 40 },
    ],
  },
  {
    id: "k-agresiva",
    name: "Tradicional Agresiva",
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
    name: "Tradicional 100% RV",
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
    name: "Tradicional Banco Conservadora",
    description: "30% CaixaBank Global + 70% Santander RF",
    type: "active",
    holdings: [
      { fundId: "caixabank-global", weight: 30 },
      { fundId: "santander-rf", weight: 70 },
    ],
  },
  {
    id: "banco-moderada",
    name: "Tradicional Banco Moderada",
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
    name: "Tradicional Banco Agresiva",
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
// Cartera Banca Privada (multigestor activo)
// Pesos originales (~62% total — el resto era liquidez/otros)
// El motor normaliza a 100% para el backtest
// -----------------------------------------------------------------------------

const BANCA_PRIVADA_PRESETS: PortfolioPreset[] = [
  {
    id: "banca-privada",
    name: "Banca Privada",
    description: "25% RV activa + 37% RF activa — Cartera multigestor conservadora",
    type: "active",
    holdings: [
      // Renta Variable (24.88%)
      { fundId: "bp-bgf-energy", weight: 1.86 },
      { fundId: "bp-bl-japan", weight: 1.95 },
      { fundId: "bp-bnp-smallcap", weight: 1.83 },
      { fundId: "bp-exane-europe", weight: 2.25 },
      { fundId: "bp-fidelity-asia", weight: 1.42 },
      { fundId: "bp-franklin-tech", weight: 2.41 },
      { fundId: "bp-gqg-global", weight: 1.68 },
      { fundId: "bp-heptagon-us", weight: 1.61 },
      { fundId: "bp-ishares-stoxx50", weight: 0.71 },
      { fundId: "bp-ishares-sp500", weight: 0.69 },
      { fundId: "bp-magallanes-europe", weight: 3.64 },
      { fundId: "bp-pictet-water", weight: 1.55 },
      { fundId: "bp-robeco-conservative", weight: 3.29 },
      // Renta Fija (37.10%)
      { fundId: "bp-aegon-abs", weight: 2.13 },
      { fundId: "bp-eurizon-short", weight: 4.62 },
      { fundId: "bp-eurizon-medium", weight: 3.94 },
      { fundId: "bp-groupama-ust", weight: 0.96 },
      { fundId: "bp-lord-abbett", weight: 2.48 },
      { fundId: "bp-mfs-usgov", weight: 3.01 },
      { fundId: "bp-natixis-credit", weight: 1.89 },
      { fundId: "bp-nordea-lowdur", weight: 2.37 },
      { fundId: "bp-nordea-covered", weight: 3.50 },
      { fundId: "bp-pimco-credit", weight: 2.93 },
      { fundId: "bp-robeco-fibd", weight: 2.70 },
      { fundId: "bp-schroder-catbond", weight: 3.01 },
      { fundId: "bp-schroder-eurocorp", weight: 3.56 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Carteras K Geográfica UCIT (1-10) — Misma RF que K Inbestme, RV geográfica
// La ÚNICA diferencia con K Inbestme es la diversificación de la RV:
//   - K Inbestme: sectores MSCI World (Healthcare, Tech, Energy, Staples, Utilities, REITs)
//   - K Geográfica UCIT: regiones (US Large Cap, Europe, Emerging Markets)
// La parte de RF y Oro es IDÉNTICA en ambas. Pesos RV adaptados (Portfolio Visualizer).
// -----------------------------------------------------------------------------

const K_GEOGRAFICA_UCIT_PRESETS: PortfolioPreset[] = [
  {
    id: "k-geografica-ucit-1",
    name: "Cartera K1 Geográfica UCIT",
    description: "10% RV Geográfica + 75% RF + 15% Oro",
    type: "index",
    holdings: [
      // RV Geográfica (10%)
      { fundId: "vanguard-sp500", weight: 6.70 },
      { fundId: "ishares-europe", weight: 2.60 },
      { fundId: "amundi-emerging", weight: 0.70 },
      // RF (75%) — idéntica a K1 Inbestme
      { fundId: "ishares-usd-treasury-hedged", weight: 20 },
      { fundId: "amundi-gov-0-1y", weight: 45 },
      { fundId: "vanguard-eur-corp", weight: 8 },
      { fundId: "ishares-hy-esg", weight: 2 },
      // Oro (15%)
      { fundId: "ishares-gold", weight: 15 },
    ],
  },
  {
    id: "k-geografica-ucit-2",
    name: "Cartera K2 Geográfica UCIT",
    description: "15% RV Geográfica + 70% RF + 15% Oro",
    type: "index",
    holdings: [
      // RV Geográfica (15%)
      { fundId: "vanguard-sp500", weight: 10.00 },
      { fundId: "ishares-europe", weight: 3.90 },
      { fundId: "amundi-emerging", weight: 1.10 },
      // RF (70%) — idéntica a K2 Inbestme
      { fundId: "ishares-usd-treasury-hedged", weight: 35 },
      { fundId: "xtrackers-gov-1-3y", weight: 20 },
      { fundId: "vanguard-eur-corp", weight: 11 },
      { fundId: "ishares-hy-esg", weight: 4 },
      // Oro (15%)
      { fundId: "ishares-gold", weight: 15 },
    ],
  },
  {
    id: "k-geografica-ucit-3",
    name: "Cartera K3 Geográfica UCIT",
    description: "25% RV Geográfica + 60% RF + 15% Oro",
    type: "index",
    holdings: [
      // RV Geográfica (25%)
      { fundId: "vanguard-sp500", weight: 16.70 },
      { fundId: "ishares-europe", weight: 6.50 },
      { fundId: "amundi-emerging", weight: 1.80 },
      // RF (60%) — idéntica a K3 Inbestme
      { fundId: "ishares-usd-treasury-hedged", weight: 30 },
      { fundId: "xtrackers-gov-5-7y", weight: 15 },
      { fundId: "vanguard-eur-corp", weight: 10 },
      { fundId: "ishares-hy-esg", weight: 5 },
      // Oro (15%)
      { fundId: "ishares-gold", weight: 15 },
    ],
  },
  {
    id: "k-geografica-ucit-4",
    name: "Cartera K4 Geográfica UCIT",
    description: "35% RV Geográfica + 50% RF + 15% Oro",
    type: "index",
    holdings: [
      // RV Geográfica (35%)
      { fundId: "vanguard-sp500", weight: 23.50 },
      { fundId: "ishares-europe", weight: 9.00 },
      { fundId: "amundi-emerging", weight: 2.50 },
      // RF (50%) — idéntica a K4 Inbestme
      { fundId: "ishares-usd-treasury-hedged", weight: 10 },
      { fundId: "xtrackers-gov-5-7y", weight: 25 },
      { fundId: "vanguard-eur-corp", weight: 9 },
      { fundId: "ishares-hy-esg", weight: 6 },
      // Oro (15%)
      { fundId: "ishares-gold", weight: 15 },
    ],
  },
  {
    id: "k-geografica-ucit-5",
    name: "Cartera K5 Geográfica UCIT",
    description: "45% RV Geográfica + 35% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Geográfica (45%)
      { fundId: "vanguard-sp500", weight: 30.00 },
      { fundId: "ishares-europe", weight: 12.00 },
      { fundId: "amundi-emerging", weight: 3.00 },
      // RF (35%) — idéntica a K5 Inbestme
      { fundId: "xtrackers-gov-5-7y", weight: 25 },
      { fundId: "vanguard-eur-corp", weight: 6 },
      { fundId: "ishares-hy-esg", weight: 4 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
  {
    id: "k-geografica-ucit-6",
    name: "Cartera K6 Geográfica UCIT",
    description: "60% RV Geográfica + 20% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Geográfica (60%) — pesos PV escalados ×60/55 para alinear con K6 Inbestme
      { fundId: "vanguard-sp500", weight: 40.00 },
      { fundId: "ishares-europe", weight: 15.60 },
      { fundId: "amundi-emerging", weight: 4.40 },
      // RF (20%) — idéntica a K6 Inbestme
      { fundId: "amundi-gov-7-10y", weight: 20 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
  {
    id: "k-geografica-ucit-7",
    name: "Cartera K7 Geográfica UCIT",
    description: "65% RV Geográfica + 15% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Geográfica (65%)
      { fundId: "vanguard-sp500", weight: 43.60 },
      { fundId: "ishares-europe", weight: 16.80 },
      { fundId: "amundi-emerging", weight: 4.60 },
      // RF (15%) — idéntica a K7 Inbestme
      { fundId: "amundi-gov-7-10y", weight: 15 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
  {
    id: "k-geografica-ucit-8",
    name: "Cartera K8 Geográfica UCIT",
    description: "70% RV Geográfica + 10% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Geográfica (70%)
      { fundId: "vanguard-sp500", weight: 47.00 },
      { fundId: "ishares-europe", weight: 18.00 },
      { fundId: "amundi-emerging", weight: 5.00 },
      // RF (10%) — idéntica a K8 Inbestme
      { fundId: "amundi-gov-10-15y", weight: 10 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
  {
    id: "k-geografica-ucit-9",
    name: "Cartera K9 Geográfica UCIT",
    description: "75% RV Geográfica + 5% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Geográfica (75%) — pesos PV escalados ×75/74 para alinear con K9 Inbestme
      { fundId: "vanguard-sp500", weight: 50.70 },
      { fundId: "ishares-europe", weight: 19.30 },
      { fundId: "amundi-emerging", weight: 5.00 },
      // RF (5%) — idéntica a K9 Inbestme
      { fundId: "amundi-gov-10-15y", weight: 5 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
  {
    id: "k-geografica-ucit-10",
    name: "Cartera K10 Geográfica UCIT",
    description: "80% RV Geográfica + 0% RF + 20% Oro",
    type: "index",
    holdings: [
      // RV Geográfica (80%)
      { fundId: "vanguard-sp500", weight: 53.60 },
      { fundId: "ishares-europe", weight: 20.80 },
      { fundId: "amundi-emerging", weight: 5.60 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Cartera Fondos Alternativos Cañigueral SL — 10 fondos alternativos equiponderados
// -----------------------------------------------------------------------------

const ALTERNATIVOS_CANIGUERAL_PRESETS: PortfolioPreset[] = [
  {
    id: "alternativos-canigueral",
    name: "Fondos Alternativos Cañigueral SL",
    description: "10 fondos alternativos equiponderados (10% c/u)",
    type: "active",
    holdings: [
      { fundId: "alt-dunas-valor-flexible", weight: 10 },
      { fundId: "alt-aqr-apex", weight: 10 },
      { fundId: "alt-man-alpha-select", weight: 10 },
      { fundId: "alt-jpm-europe-absolute-alpha", weight: 10 },
      { fundId: "alt-gs-alternative-beta", weight: 10 },
      { fundId: "alt-amundi-volatility-world", weight: 10 },
      { fundId: "alt-helium-selection", weight: 10 },
      { fundId: "alt-pictet-atlas-titan", weight: 10 },
      { fundId: "alt-ofi-precious-metals", weight: 10 },
      { fundId: "alt-dnca-alpha-bonds", weight: 10 },
    ],
  },
];

// -----------------------------------------------------------------------------
// Cartera gestionada BBVA Capital — Réplica del extracto del cliente
// 11 fondos de RF (corta duración + credit) + 3 fondos alternativos.
// Los pesos del extracto original suman 20.94% (era una sub-estrategia del
// portfolio total del cliente). Aquí los normalizamos a 100% para usarla
// como portfolio independiente.
// -----------------------------------------------------------------------------

const BBVA_CAPITAL_PRESETS: PortfolioPreset[] = [
  {
    id: "bbva-capital",
    name: "Cartera gestionada BBVA Capital",
    description: "RF corta duración + credit + 3 alternativos (gestión activa, sustitutos por categoría)",
    type: "active",
    holdings: [
      // === RF Corta Duración / Credit (89%) ===
      // Fondos del extracto BBVA originales (ISINs reales facilitados por el cliente):
      { fundId: "bbvac-ishares-eur-govt-1-3", weight: 12.93 },        // iShares Govt 1-3y (ETF, IE00B14X4Q57)
      { fundId: "bbvac-blackrock-euro-ultrashort", weight: 10.41 },   // BlackRock Euro Ultra Short
      { fundId: "bbvac-franklin-eur-short", weight: 9.64 },           // Franklin EUR Short Duration A — LU1022658667
      { fundId: "bbvac-ms-short-maturity", weight: 9.06 },            // MS Short Maturity Euro Bond A — LU0073235904
      { fundId: "bbvac-axa-euro-credit-short", weight: 8.91 },        // AXA WF Euro Credit Short Duration A — LU0251661756
      { fundId: "bbvac-invesco-euro-short-term", weight: 7.55 },      // Invesco Euro Short Term Bond Z — LU1590491913
      { fundId: "bbvac-amundi-eur-liquidity", weight: 7.07 },         // Amundi EUR Liquidity Rated SRI
      { fundId: "bbvac-amundi-euro-corp-sri", weight: 7.02 },         // Amundi Index Euro AGG Corp SRI — LU1437018168
      // Sustitutos por categoría (ISINs originales aún sin facilitar):
      { fundId: "bp-eurizon-medium", weight: 6.59 },          // ← JPMorgan Euro Government Short
      { fundId: "bp-robeco-fibd", weight: 5.52 },             // ← BBVA Crédito Europa
      { fundId: "bp-nordea-covered", weight: 5.52 },          // ← Pictet EUR Short Term
      // === Inversión Alternativa (10%) ===
      { fundId: "alt-pictet-atlas-titan", weight: 3.44 },     // ← Pictet TR Diversified Alpha (mismo gestor)
      { fundId: "alt-dnca-alpha-bonds", weight: 3.39 },       // ← BlueBay IG Absolute Return
      { fundId: "alt-helium-selection", weight: 2.95 },       // ← Candriam Long Short Credit
    ],
  },
];

// -----------------------------------------------------------------------------
// Todos los presets combinados
// -----------------------------------------------------------------------------

const ALL_PRESETS: PortfolioPreset[] = [
  ...K_INBESTME_PRESETS,
  ...K_SECTORIAL_USA_PRESETS,
  ...K_GEOGRAFICA_USA_PRESETS,
  ...K_GEOGRAFICA_UCIT_PRESETS,
  ...INDEXA_PRESETS,
  ...INDEXA_USA_PRESETS,
  ...K_PRESETS,
  ...PARTICIPANTES_PRIMERAS_PRESETS,
  ...BANK_PRESETS,
  ...BANCA_PRIVADA_PRESETS,
  ...ALTERNATIVOS_CANIGUERAL_PRESETS,
  ...BBVA_CAPITAL_PRESETS,
];

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
 * Obtiene presets de carteras K Geográfica UCIT (1-10)
 */
export function getKGeograficaUCITPresets(): PortfolioPreset[] {
  return K_GEOGRAFICA_UCIT_PRESETS;
}

/**
 * Obtiene presets de carteras Indexa Capital (1-10)
 */
export function getIndexaPresets(): PortfolioPreset[] {
  return INDEXA_PRESETS;
}

/**
 * Obtiene presets de carteras Indexa USA ETFs (1-10) — réplica desde
 * Portfoliovisualizer usando mutual funds Vanguard USD para histórico ≥1990s.
 */
export function getIndexaUSAPresets(): PortfolioPreset[] {
  return INDEXA_USA_PRESETS;
}

/**
 * Obtiene presets de carteras bancarias (activas)
 */
export function getBankPresets(): PortfolioPreset[] {
  return BANK_PRESETS;
}
