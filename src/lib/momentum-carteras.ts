// =============================================================================
// MOMENTUM CARTERAS — Estrategias de momentum como "carteras" para el backtest
// =============================================================================
//
// Cada entrada aquí es una estrategia de momentum NOMBRADA que el usuario
// puede seleccionar en el dropdown de presets del PortfolioBuilder. Cuando
// se carga, se inyecta como UN ÚNICO holding al 100 % con un `momentumConfig`
// adjunto — el motor del backtest la ejecuta dinámicamente y la trata como
// un fondo sintético más.
//
// Usadas típicamente en MODO SATÉLITE: el usuario tiene una cartera estática
// (ej. 100 % MSCI World) y le añade una de estas estrategias al 10 % para
// ver cómo se correlaciona / si suaviza el drawdown.
// =============================================================================

import type { MomentumConfig, MomentumAsset } from "./momentum-types";
import type { Fund, PortfolioPreset } from "./types";

// -----------------------------------------------------------------------------
// Configs de cada estrategia
// -----------------------------------------------------------------------------

// KX Sectorial — la misma que el preset del MomentumConfigPanel: 5 sectores
// SPDR + VNQ + GLD como activos defensivos. Top-1 mensual con momentum 12-1
// y filtro MA opcional desactivado.
const KX_SECTORIAL_ASSETS: MomentumAsset[] = [
  { ticker: "XLK", displayName: "Tecnología" },
  { ticker: "XLV", displayName: "Salud" },
  { ticker: "XLP", displayName: "Consumo Bás." },
  { ticker: "XLU", displayName: "Utilities" },
  { ticker: "XLE", displayName: "Energía" },
  { ticker: "VNQ", displayName: "Real Estate" },
  { ticker: "GLD", displayName: "Oro" },
];

// Global Tactical — universo más amplio: equities globales + RF + oro + REITs.
// Pensada como satélite "balanceado" que rota entre clases de activos.
const GLOBAL_TACTICAL_ASSETS: MomentumAsset[] = [
  { ticker: "SPY", displayName: "S&P 500" },
  { ticker: "EFA", displayName: "Desarrollados ex-US" },
  { ticker: "EEM", displayName: "Emergentes" },
  { ticker: "AGG", displayName: "RF USA Agregada" },
  { ticker: "GLD", displayName: "Oro" },
  { ticker: "VNQ", displayName: "REITs USA" },
];

// Sectores SPDR — los 11 sectores S&P puros (sin activos defensivos).
// Más agresiva: ningún refugio en oro o RF, sólo equity sectorial USA.
const SPDR_SECTORS_ASSETS: MomentumAsset[] = [
  { ticker: "XLK", displayName: "Tecnología" },
  { ticker: "XLF", displayName: "Financiero" },
  { ticker: "XLV", displayName: "Salud" },
  { ticker: "XLI", displayName: "Industrial" },
  { ticker: "XLP", displayName: "Consumo Bás." },
  { ticker: "XLY", displayName: "Consumo Disc." },
  { ticker: "XLE", displayName: "Energía" },
  { ticker: "XLU", displayName: "Utilities" },
  { ticker: "XLB", displayName: "Materiales" },
  { ticker: "XLRE", displayName: "Real Estate" },
  { ticker: "XLC", displayName: "Comunicaciones" },
];

// Acciones caídas en desgracia — experimento de SESGO DE SUPERVIVENCIA con
// universo EVOLUTIVO (allowPartialUniverse): mezcla ángeles caídos modernos,
// caídos históricos que siguen vivos y empresas DESAPARECIDAS de verdad
// (series truncadas al deslistarse). Verificado contra EODHD 2026-06:
//  · Modernos: PTON -96%, TDOC -97%, PYPL -86%, ZM -80%, ROKU -69%, BABA -61%,
//    BA -49%, DIS -46%, PFE -44%.
//  · Históricos vivos: GE (desde 1962, caída épica 2000-2018 y recuperada),
//    C -62% (desde 1977), NOK -46% (ADR, desde 1994), AIG -93% (desde 1973),
//    F -15% (desde 1972).
//  · Desaparecidas: ENRNQ Enron -100% (muere 2004), SIVB SVB -85% (muere
//    2023-03), FRC First Republic -98% (muere 2023-05). BBBY y SHLD se
//    descartaron: sus tickers fueron REUTILIZADOS por otras empresas en EODHD.
// Comportamiento con muertas: el desplome previo está en la serie; el mes
// final sin datos contribuye 0% y el siguiente rebalanceo la rota fuera.
// OJO (sesgo retrospectivo): la lista se elige HOY sabiendo qué pasó.
// Con universo evolutivo el histórico arranca ~1973 (2º activo más antiguo
// + lookback) y los demás van entrando según nacen.
const ACCIONES_CAIDAS_ASSETS: MomentumAsset[] = [
  // Modernos (entran 2014-2020)
  { ticker: "PTON", displayName: "Peloton" },
  { ticker: "ZM", displayName: "Zoom" },
  { ticker: "PYPL", displayName: "PayPal" },
  { ticker: "TDOC", displayName: "Teladoc" },
  { ticker: "ROKU", displayName: "Roku" },
  { ticker: "BABA", displayName: "Alibaba" },
  // Históricos vivos (desde 1962-1994)
  { ticker: "BA", displayName: "Boeing" },
  { ticker: "DIS", displayName: "Disney" },
  { ticker: "PFE", displayName: "Pfizer" },
  { ticker: "GE", displayName: "General Electric" },
  { ticker: "C", displayName: "Citigroup" },
  { ticker: "NOK", displayName: "Nokia" },
  { ticker: "AIG", displayName: "AIG" },
  { ticker: "F", displayName: "Ford" },
  // Desaparecidas (series truncadas — sesgo de supervivencia real)
  { ticker: "ENRNQ", displayName: "Enron †2004" },
  { ticker: "SIVB", displayName: "SVB †2023" },
  { ticker: "FRC", displayName: "First Republic †2023" },
];

// Caídas del S&P 500 — versión PURA del experimento de sesgo de supervivencia:
// 20 empresas que SÍ estuvieron en el S&P 500 y salieron del índice NO por ser
// compradas, sino por QUIEBRA (10) o por PERDER TAMAÑO (10). Verificado 2026-06
// doblemente: (1) membresía real en el S&P 500 + motivo de salida (≠ adquisición)
// vía búsqueda web; (2) ticker EODHD correcto + serie de precios real (cuidado con
// los tickers reutilizados: aquí el código histórico lleva sufijo `_old`/`Q`).
//
//  · Salieron por QUIEBRA (la acción se fue a ~0, serie truncada):
//    Lehman †08, Washington Mutual †08, General Motors †09, Enron †01,
//    WorldCom †02, Adelphia †02, Conseco †02, Kmart †02, Delphi †05,
//    Circuit City †08. Drawdowns verificados: todos −98% a −100%.
//  · Salieron por TAMAÑO (el índice las expulsó por bajo valor; varias
//    quebraron AÑOS DESPUÉS): Bethlehem Steel †01, AMR/American Airlines †11,
//    RadioShack †15, Eastman Kodak †12, Sears †18, J.C. Penney †20,
//    Frontier †20, Unisys ↓ (sigue viva, marchita), Office Depot ↓,
//    Genworth ↓. Drawdowns −75% a −100%.
//
// Códigos EODHD con sufijo histórico para evitar tickers reutilizados:
// GM_old (no la GM nueva), AMR_old, SHLD_old, EK (no la KODK post-quiebra),
// DPHIQ, ADELQ, CNCEQ, WAMUQ, MCWEQ, ENRNQ, CCTYQ, RSH...
// Universo evolutivo (allowPartialUniverse): el histórico arranca ~1973 (Unisys)
// y cada acción entra al nacer / sale al morir; el momentum afronta las quiebras
// en tiempo real. OJO sesgo retrospectivo: la lista se elige HOY sabiendo el final.
const CAIDAS_SP500_ASSETS: MomentumAsset[] = [
  // --- Salieron por QUIEBRA (acción a ~0) ---
  { ticker: "LEH", displayName: "Lehman Brothers †08" },
  { ticker: "WAMUQ", displayName: "Washington Mutual †08" },
  { ticker: "GM_old", displayName: "General Motors †09" },
  { ticker: "ENRNQ", displayName: "Enron †01" },
  { ticker: "MCWEQ", displayName: "WorldCom †02" },
  { ticker: "ADELQ", displayName: "Adelphia †02" },
  { ticker: "CNCEQ", displayName: "Conseco †02" },
  { ticker: "KM", displayName: "Kmart †02" },
  { ticker: "DPHIQ", displayName: "Delphi †05" },
  { ticker: "CCTYQ", displayName: "Circuit City †08" },
  // --- Salieron por TAMAÑO (el índice las expulsó por bajo valor) ---
  { ticker: "BS", displayName: "Bethlehem Steel †01" },
  { ticker: "AMR_old", displayName: "AMR / American Airlines †11" },
  { ticker: "RSH", displayName: "RadioShack †15" },
  { ticker: "EK", displayName: "Eastman Kodak †12" },
  { ticker: "SHLD_old", displayName: "Sears †18" },
  { ticker: "JCP", displayName: "J.C. Penney †20" },
  { ticker: "FTR", displayName: "Frontier †20" },
  { ticker: "UIS", displayName: "Unisys ↓" },
  { ticker: "ODP", displayName: "Office Depot ↓" },
  { ticker: "GNW", displayName: "Genworth ↓" },
];

// Config base compartida por todas: parámetros estilo Portfolio Visualizer
// por defecto (12-1 momentum, top-1, mensual, nextClose, sin slippage). Las
// fechas se OVERRIDEAN en el motor con las del backtest, así que aquí dan
// igual los valores — los ponemos a un rango razonable como placeholder.
function baseConfig(assets: MomentumAsset[]): MomentumConfig {
  return {
    assets,
    startDate: "2005-01-01",
    endDate: new Date().toISOString().substring(0, 10),
    initialAmount: 10_000,
    lookbackMonths: 12,
    excludePreviousMonth: true,
    assetsToHold: 1,
    weighting: "equal",
    frequency: "monthly",
    rankingMethod: "momentum",
    volatilityPeriodMonths: 3,
    movingAverageMonths: 0,
    slippagePercent: 0,
    tradeExecution: "nextClose",
  };
}

// -----------------------------------------------------------------------------
// Fondos sintéticos correspondientes (uno por estrategia)
//
// El motor usa `getFundById(holding.fundId) || holding.fund`. Como queremos
// que el momentum sea RESUELTO DINÁMICAMENTE (corriendo runMomentum) y no
// confundido con un fondo de la BD, NO los registramos en ALL_FUNDS — sólo
// los exportamos para que la cartera los lleve en `holding.fund`.
// -----------------------------------------------------------------------------

function syntheticFund(id: string, name: string, shortName: string): Fund {
  return {
    id,
    name,
    shortName,
    isin: id.toUpperCase(),
    ter: 0, // el momentum no cobra TER propio; los TER subyacentes ya están en los precios diarios de cada ETF
    category: "Alternativo",
    type: "active",
    currency: "USD",
    terSource: "curated",
    terConfirmed: true,
  };
}

// -----------------------------------------------------------------------------
// Presets exportados — se inyectan en ALL_PRESETS desde portfolio-presets.ts
// -----------------------------------------------------------------------------

export const MOMENTUM_CARTERA_PRESETS: PortfolioPreset[] = [
  {
    id: "momentum-kx-sectorial",
    name: "Momentum · KX Sectorial",
    description:
      "Rotación mensual top-1 entre 7 ETFs: 5 sectores SPDR + REITs + Oro. Ideal como satélite descorrelacionado.",
    type: "active",
    holdings: [
      {
        fundId: "momentum-kx-sectorial",
        weight: 100,
        fund: syntheticFund(
          "momentum-kx-sectorial",
          "Estrategia Momentum: KX Sectorial (7 ETFs)",
          "Momentum KX Sectorial"
        ),
        momentumConfig: baseConfig(KX_SECTORIAL_ASSETS),
      },
    ],
  },
  {
    id: "momentum-global-tactical",
    name: "Momentum · Global Tactical",
    description:
      "Rotación mensual top-1 entre 6 ETFs: equity USA/desarrollados/EM + RF agregada + Oro + REITs. Diversificación entre clases de activo.",
    type: "active",
    holdings: [
      {
        fundId: "momentum-global-tactical",
        weight: 100,
        fund: syntheticFund(
          "momentum-global-tactical",
          "Estrategia Momentum: Global Tactical (6 clases de activo)",
          "Momentum Global Tactical"
        ),
        momentumConfig: baseConfig(GLOBAL_TACTICAL_ASSETS),
      },
    ],
  },
  {
    id: "momentum-acciones-caidas",
    name: "Cartera acciones caídas",
    description:
      "Experimento de sesgo de supervivencia: rotación mensual top-1 entre 17 acciones — ángeles caídos modernos (Peloton, Zoom, PayPal, Teladoc, Roku, Alibaba), caídos históricos vivos (Boeing, Disney, Pfizer, GE, Citigroup, Nokia, AIG, Ford) y DESAPARECIDAS de verdad (Enron †2004, SVB †2023, First Republic †2023). Universo evolutivo: cada acción entra cuando nace y sale cuando muere — el momentum tiene que sobrevivir a las quiebras en tiempo real. Histórico desde ~1973. La lista se elige sabiendo qué pasó (sesgo retrospectivo): valor didáctico, no consejo.",
    type: "active",
    holdings: [
      {
        fundId: "momentum-acciones-caidas",
        weight: 100,
        fund: syntheticFund(
          "momentum-acciones-caidas",
          "Estrategia Momentum: Acciones caídas en desgracia (17 valores, universo evolutivo)",
          "Momentum Acciones Caídas"
        ),
        momentumConfig: { ...baseConfig(ACCIONES_CAIDAS_ASSETS), allowPartialUniverse: true },
      },
    ],
  },
  {
    id: "momentum-caidas-sp500",
    name: "Cartera caídas del S&P 500",
    description:
      "Sesgo de supervivencia en estado puro: 20 empresas que estuvieron en el S&P 500 y salieron del índice NO por ser compradas, sino por QUIEBRA (Lehman, General Motors, Enron, WorldCom, Adelphia, Conseco, Kmart, Delphi, Circuit City, Washington Mutual) o por PERDER TAMAÑO y quedar expulsadas (Bethlehem Steel, AMR/American Airlines, RadioShack, Kodak, Sears, J.C. Penney, Frontier, Unisys, Office Depot, Genworth). 10 quiebras + 10 expulsadas por tamaño; caídas verificadas del −75 % al −100 %. Universo evolutivo: cada acción entra cuando cotiza y sale cuando muere, así que el momentum tiene que sobrevivir a las quiebras en tiempo real. Demuestra que el S&P 500 que ves hoy ya ha expulsado a todos estos perdedores: su rentabilidad histórica exagera lo que habría ganado quien comprara «las 500 de entonces». La lista se elige sabiendo el final (sesgo retrospectivo): valor didáctico, no consejo.",
    type: "active",
    holdings: [
      {
        fundId: "momentum-caidas-sp500",
        weight: 100,
        fund: syntheticFund(
          "momentum-caidas-sp500",
          "Estrategia Momentum: Caídas del S&P 500 (20 ex-miembros por quiebra o tamaño)",
          "Momentum Caídas S&P 500"
        ),
        momentumConfig: { ...baseConfig(CAIDAS_SP500_ASSETS), allowPartialUniverse: true },
      },
    ],
  },
  {
    id: "momentum-spdr-sectors",
    name: "Momentum · 11 Sectores SPDR",
    description:
      "Rotación mensual top-1 entre los 11 sectores del S&P 500. Más agresiva — sin activos defensivos.",
    type: "active",
    holdings: [
      {
        fundId: "momentum-spdr-sectors",
        weight: 100,
        fund: syntheticFund(
          "momentum-spdr-sectors",
          "Estrategia Momentum: 11 Sectores SPDR",
          "Momentum SPDR Sectors"
        ),
        momentumConfig: baseConfig(SPDR_SECTORS_ASSETS),
      },
    ],
  },
];
