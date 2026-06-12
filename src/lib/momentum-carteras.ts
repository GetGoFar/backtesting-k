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

// Acciones caídas en desgracia — "ángeles caídos" famosos que siguen cotizando,
// con caídas brutales desde máximos (verificado contra EODHD 2026-06):
// PTON -96%, TDOC -97%, PYPL -86%, ZM -80%, ROKU -69%, BABA -61%, BA -49%,
// DIS -46%, PFE -44%. (Intel se excluyó: recuperó máximos y ya no está "caída".)
// El momentum rota mensualmente hacia la que mejor se está recuperando.
// OJO (sesgo retrospectivo): elegimos estas acciones HOY sabiendo que cayeron —
// un inversor de 2019 no podía conocer esta lista. Valor didáctico, no consejo.
// El histórico común lo limita Peloton (IPO sep-2019) → primera señal ~oct-2020.
const ACCIONES_CAIDAS_ASSETS: MomentumAsset[] = [
  { ticker: "PTON", displayName: "Peloton" },
  { ticker: "ZM", displayName: "Zoom" },
  { ticker: "PYPL", displayName: "PayPal" },
  { ticker: "TDOC", displayName: "Teladoc" },
  { ticker: "ROKU", displayName: "Roku" },
  { ticker: "BABA", displayName: "Alibaba" },
  { ticker: "BA", displayName: "Boeing" },
  { ticker: "DIS", displayName: "Disney" },
  { ticker: "PFE", displayName: "Pfizer" },
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
      "Rotación mensual top-1 entre 9 'ángeles caídos' (Peloton, Zoom, PayPal, Teladoc, Roku, Alibaba, Boeing, Disney, Pfizer) — acciones famosas con caídas del 44% al 97% desde máximos. El momentum persigue a la que mejor se recupera. Experimento didáctico: la lista se elige sabiendo que cayeron (sesgo retrospectivo). Histórico desde ~2020 (limita Peloton).",
    type: "active",
    holdings: [
      {
        fundId: "momentum-acciones-caidas",
        weight: 100,
        fund: syntheticFund(
          "momentum-acciones-caidas",
          "Estrategia Momentum: Acciones caídas en desgracia (9 ángeles caídos)",
          "Momentum Acciones Caídas"
        ),
        momentumConfig: baseConfig(ACCIONES_CAIDAS_ASSETS),
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
