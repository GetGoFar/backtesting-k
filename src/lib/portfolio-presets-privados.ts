// =============================================================================
// CARTERAS PRIVADAS — clientes de consultoría y extractos reales
// =============================================================================
//
// Este fichero NO se importa desde ningún componente de cliente: solo lo lee
// /api/presets/privados, que las entrega únicamente al código personal de Pablo.
// Así no viajan en el JavaScript que descarga un socio de Ataraxia o un alumno
// del Campus (decisión de Pablo, 15-sep-2026). Para añadir una cartera de
// cliente: aquí, nunca en portfolio-presets.ts.
// =============================================================================

import type { PortfolioPreset } from "./types";

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

const PABLO_CASTRO_PRESETS: PortfolioPreset[] = [
  {
    id: "pablo-castro-cartera",
    name: "Cartera PC",
    description:
      "Cartera real del cliente PC (consultoría K) — 15 holdings líquidos: ETFs (SPDR ACWI IMI, Bitcoin ETP, oro físico), Plan Pensiones CaixaBank RV Internacional (proxy SXR8), acciones IBEX (Colonial, Iberdrola, Repsol, Viscofan, Merlin) y 6 fondos UCITS activos (Fidelity Tech, MSS Global Brands, Bestinfond, Capital Group, DWS, Pictet). Capital líquido ~2.34M€.",
    type: "active",
    holdings: [
      // Pasivo / ETFs (37.95%)
      { fundId: "spdr-msci-acwi-imi", weight: 25.46 },
      { fundId: "xbt-bitcoin-tracker-eur", weight: 11.00 },
      { fundId: "ishares-gold", weight: 1.49 },
      // Plan de pensiones (5.54%) — proxy S&P 500 EUR con TER 1.5%
      { fundId: "pablo-castro-pp-cabk-rv-internacional", weight: 5.54 },
      // Acciones individuales (17.96%)
      { fundId: "stock-colonial", weight: 5.66 },
      { fundId: "stock-iberdrola", weight: 5.26 },
      { fundId: "stock-repsol", weight: 2.81 },
      { fundId: "stock-viscofan", weight: 2.79 },
      { fundId: "stock-merlin", weight: 1.44 },
      // Fondos UCITS activos (38.55%)
      { fundId: "fidelity-global-technology", weight: 22.39 },
      { fundId: "mss-global-brands-zh", weight: 4.83 },
      { fundId: "bestinfond-fi", weight: 4.24 },
      { fundId: "capital-group-new-perspective-bh-eur", weight: 3.06 },
      { fundId: "dws-invest-top-dividend-ld", weight: 2.12 },
      { fundId: "pictet-smartcity-p-eur", weight: 1.91 },
    ],
  },
];

const CAIXABANK_SMART_PRESETS: PortfolioPreset[] = [
  {
    id: "caixabank-smartmoney-5",
    name: "Caixabank SmartMoney 5",
    description:
      "Cartera gestionada CaixaBank Smart Money 5 (perfil más agresivo). 13 fondos CaixaBank Smart FI. ~72% RV (USA + Europa + Emergente + Japón + REITs) y ~28% RF (deuda pública, privada, corto, HY, inflación, emergente).",
    type: "index",
    holdings: [
      // RV — 72.1%
      { fundId: "caixa-smart-rv-usa", weight: 34.4 },
      { fundId: "caixa-smart-rv-europa", weight: 15.3 },
      { fundId: "caixa-smart-rv-emergente", weight: 11.5 },
      { fundId: "caixa-smart-rv-japon", weight: 7.6 },
      { fundId: "caixa-smart-rv-real-estate", weight: 3.3 },
      // RF — 27.9%
      { fundId: "caixa-smart-rf-deuda-1-3", weight: 7.6 },
      { fundId: "caixa-smart-rf-privada", weight: 6.6 },
      { fundId: "caixa-smart-rf-corto-plazo", weight: 3.8 },
      { fundId: "caixa-smart-rf-deuda-7-10", weight: 2.8 },
      { fundId: "caixa-smart-rf-internacional", weight: 2.8 },
      { fundId: "caixa-smart-rf-high-yield", weight: 1.9 },
      { fundId: "caixa-smart-rf-inflacion", weight: 1.4 },
      { fundId: "caixa-smart-rf-emergente", weight: 1.0 },
    ],
  },
];

const PINAES_PRESETS: PortfolioPreset[] = [
  {
    id: "cartera-pinaes",
    name: "Cartera PINAES",
    description:
      "Cartera indexada perfil 4 — 35% RV (S&P 500, Europa, Japón, Pacífico exJapón, Emergentes), 50% RF (Treasury 20+y, US Gov hedged, Global Short-Term Bond 37%, TIPS eurozona, bonos emergentes hedged) y 15% oro físico. 11 fondos UCITS de acumulación. Histórico común limitado por el EM Bond (desde 2019-12).",
    type: "index",
    holdings: [
      // Renta Variable (35%)
      { fundId: "fidelity-sp500-index-p-eur", weight: 24.5 },
      { fundId: "vanguard-european-stock-inv", weight: 6.65 },
      { fundId: "vanguard-japan-stock-inv", weight: 1.75 },
      { fundId: "vanguard-pacific-exjapan-inv", weight: 1.05 },
      { fundId: "vanguard-em-stock-inv", weight: 1.05 },
      // Renta Fija (50%)
      { fundId: "vanguard-20y-euro-treasury", weight: 1.5 },
      { fundId: "vanguard-us-gov-bond-inv-hedged", weight: 4.0 },
      { fundId: "vanguard-global-short-term-bond-eurh", weight: 37.0 },
      { fundId: "vanguard-eurozone-inflation-linked", weight: 2.5 },
      { fundId: "vanguard-em-bond-eurh", weight: 5.0 },
      // Oro (15%)
      { fundId: "ishares-gold", weight: 15.0 },
    ],
  },
];

const JL_PRESETS: PortfolioPreset[] = [
  {
    id: "cartera-jl-bkt-20260614",
    name: "2026.06.14_Cartera_JL_Bkt",
    description:
      "Cartera real de banca privada (valoración 09/06/2026): 20 fondos, ~40,6% RV y ~59,4% RF. RV: índices Pictet USA + selección activa US (Putnam, AB), Europa (Eleva, M&G, Aperture), emergentes (Amundi idx, Invesco), tecnología (DNB) y small cap (Neuberger). RF: crédito euro (R-co, Morgan Stanley, Pictet), flexible/global (PIMCO, Muzinich, DNCA), gobierno EMU 3-5y y monetario (AXA). OJO: el rango común queda limitado a 2026 por dos clases RV recién lanzadas (Putnam, Neuberger); desactiva 'rango común' o quítalas para ver histórico largo.",
    type: "active",
    holdings: [
      // Renta Variable (40.63%)
      { fundId: "jl-ftgf-putnam-us-lcg", weight: 0.88 },
      { fundId: "jl-neuberger-smcap-intrinsic", weight: 2.85 },
      { fundId: "jl-pictet-usa-index-i", weight: 10.46 },
      { fundId: "jl-pictet-usa-index-hi", weight: 3.54 },
      { fundId: "jl-ab-select-us-equity-s1", weight: 4.87 },
      { fundId: "jl-amundi-msci-em-iec", weight: 4.03 },
      { fundId: "jl-dnb-technology-a", weight: 2.47 },
      { fundId: "jl-eleva-european-selection-r", weight: 3.59 },
      { fundId: "jl-mg-lux-euro-strategic-value", weight: 3.19 },
      { fundId: "jl-mfs-meridian-contrarian-value", weight: 1.65 },
      { fundId: "jl-aperture-european-innovation", weight: 2.22 },
      { fundId: "jl-invesco-em-equity-z", weight: 0.88 },
      // Renta Fija (59.37%)
      { fundId: "jl-rco-conviction-credit-euro-p", weight: 13.25 },
      { fundId: "jl-axa-court-terme-v", weight: 2.07 },
      { fundId: "jl-pimco-low-dur-glb-ig-credit", weight: 7.67 },
      { fundId: "jl-muzinich-enhanced-yield-st", weight: 8.75 },
      { fundId: "jl-yis-3-5-emu-govt-bond-z", weight: 9.47 },
      { fundId: "jl-morgan-stanley-euro-corp-z", weight: 3.1 },
      { fundId: "bbvac-pictet-eur-short-term", weight: 9.24 },
      { fundId: "jl-dnca-invest-alpha-bonds", weight: 5.82 },
    ],
  },
  {
    id: "cartera-jl-bkt-20260614-hist",
    name: "2026.06.14_Cartera_JL_Bkt_Hist",
    description:
      "Variante de histórico largo de la cartera JL (18 fondos). Se ELIMINARON Putnam (IE0009DMFOP6) y Neuberger US Small Cap (IE000EVIOG79) — las dos clases nuevas de 2026 sin equivalente EUR de histórico largo — y su peso conjunto (3,73%) se redistribuyó proporcionalmente entre el resto. Invesco EM usa la clase USD larga (LU1775953141, 1999) y AXA el monetario Trésor Court Terme C (FR0000447823, 1995). El backtest llega hasta ~nov-2020; el muro lo pone ahora Aperture European Innovation (fondo nuevo de 2020, sin clases anteriores). Salvedad: Invesco va en clase USD (el motor no convierte divisa). La cartera original '2026.06.14_Cartera_JL_Bkt' se mantiene intacta con los 20 fondos reales.",
    type: "active",
    holdings: [
      // Renta Variable (38.34%) — sin Putnam ni Neuberger; pesos redistribuidos
      { fundId: "jl-pictet-usa-index-i", weight: 10.87 },
      { fundId: "jl-pictet-usa-index-hi", weight: 3.68 },
      { fundId: "jl-ab-select-us-equity-s1", weight: 5.06 },
      { fundId: "jl-amundi-msci-em-iec", weight: 4.19 },
      { fundId: "jl-dnb-technology-a", weight: 2.57 },
      { fundId: "jl-eleva-european-selection-r", weight: 3.73 },
      { fundId: "jl-mg-lux-euro-strategic-value", weight: 3.31 },
      { fundId: "jl-mfs-meridian-contrarian-value", weight: 1.71 },
      { fundId: "jl-aperture-european-innovation", weight: 2.31 }, // muro 2020-10
      { fundId: "jl-invesco-em-equity-usd", weight: 0.91 },        // clase USD 1999
      // Renta Fija (61.66%)
      { fundId: "jl-rco-conviction-credit-euro-p", weight: 13.74 },
      { fundId: "jl-axa-tresor-court-terme-c", weight: 2.15 },     // Trésor C EUR 1995
      { fundId: "jl-pimco-low-dur-glb-ig-credit", weight: 7.97 },
      { fundId: "jl-muzinich-enhanced-yield-st", weight: 9.09 },
      { fundId: "jl-yis-3-5-emu-govt-bond-z", weight: 9.84 },
      { fundId: "jl-morgan-stanley-euro-corp-z", weight: 3.22 },
      { fundId: "bbvac-pictet-eur-short-term", weight: 9.6 },
      { fundId: "jl-dnca-invest-alpha-bonds", weight: 6.05 },
    ],
  },
];

// Cartera RF (Ruben Fraile) — cartera real de activos reales / cobertura:
// muy concentrada en oro físico (48,2%) y bitcoin (23,1%), con una cola de
// gestión activa value/recursos (Cobas, Azvalor, Kopernik, Goehring,
// Wellington, Argonaut) + plata y China A. Sin renta fija. El peso se ajustó
// 48,2→48,0 en el oro para que sume exactamente 100 (la captura sumaba 100,2
// por redondeo). El rango común lo limita Kopernik (desde 2017-11).
const RF_PRESETS: PortfolioPreset[] = [
  {
    id: "cartera-rf",
    name: "Cartera RF",
    description:
      "Cartera real de activos reales y cobertura: 48% oro físico (Invesco) + 23% bitcoin (XBT) como núcleo, y una cola de gestión activa — value (Cobas, Azvalor, Kopernik), recursos naturales (Goehring & Rozencwajg), absolute return (Argonaut), enduring assets (Wellington) — más plata y China A. Sin renta fija. 10 posiciones. Histórico común limitado por Kopernik (desde nov-2017). Aviso: la plata va en clase USD (SSLV) y G&R en USD (el motor no convierte divisa), pesos pequeños (1% y 6,5%).",
    type: "active",
    holdings: [
      // Núcleo activos reales / cobertura (71,1%)
      { fundId: "ishares-gold", weight: 48.0 }, // oro físico (48,2 en la captura, −0,2 para sumar 100)
      { fundId: "xbt-bitcoin-tracker-eur", weight: 23.1 }, // bitcoin
      // Gestión activa value / recursos (20,7%)
      { fundId: "rf-goehring-rozencwajg-resources", weight: 6.5 },
      { fundId: "rf-azvalor-internacional", weight: 5.1 },
      { fundId: "rf-kopernik-global-allcap", weight: 3.9 },
      { fundId: "rf-argonaut-absolute-return", weight: 3.2 },
      { fundId: "rf-cobas-seleccion", weight: 1.9 },
      // RV temática / emergentes (7,3%)
      { fundId: "rf-ishares-china-a", weight: 6.0 },
      { fundId: "rf-wellington-enduring-assets", weight: 1.3 },
      // Plata (1%)
      { fundId: "rf-invesco-silver", weight: 1.0 },
    ],
  },
];

// Carteras LNE (Luis Navarro Estrada) — dos carteras reales de cliente (perfil
// de riesgo 5): una GEOGRÁFICA implementada con fondos y otra SECTORIAL con
// ETFs. Estructura RV 45% / RF 35% / Oro 20%. Pesos del Excel del cliente
// (actualizado 2026-06-23). En la geográfica se ajustó −0,15 en Fidelity
// (42→41,85) para sumar 100; el ISIN Global Short-Term Bond aparecía dos veces
// (16%+5% = 21%, combinado).
const LNE_PRESETS: PortfolioPreset[] = [
  {
    id: "cartera-lne-geografica",
    name: "Cartera LNE Geográfica",
    description:
      "Cartera real (perfil 5) con FONDOS indexados, enfoque geográfico: RV global (Fidelity MSCI World 42% + Vanguard Emergentes 3,15%), RF 35% (Vanguard Euro Gov, Treasury 20+, Global Short-Term Bond hedged, EM Bond hedged) y 20% oro físico. RV 45 / RF 35 / Oro 20.",
    type: "index",
    holdings: [
      // Renta Variable (45,15%)
      { fundId: "pablo-fidelity-msci-world", weight: 41.85 },
      { fundId: "vanguard-em-stock-inv", weight: 3.15 },
      // Renta Fija (35%)
      { fundId: "lne-vanguard-euro-gov-bond", weight: 9.0 },
      { fundId: "vanguard-20y-euro-treasury", weight: 3.0 },
      { fundId: "vanguard-global-short-term-bond-eurh", weight: 21.0 }, // 16% + 5% del Excel
      { fundId: "vanguard-em-bond-eurh", weight: 2.0 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20.0 },
    ],
  },
  {
    id: "cartera-lne-sectorial",
    name: "Cartera LNE Sectorial",
    description:
      "Cartera real (perfil 5) con ETFs, enfoque sectorial: RV 45% por sectores MSCI World (Salud y Tecnología 11,25% c/u; Consumo Básico, Utilities, Energía e Inmobiliario global 5,625% c/u), RF 35% (Xtrackers Global Gov, iShares USD Treasury hedged, Amundi Gov 10-15y, Vanguard EUR Corp, iShares HY ESG) y 20% oro físico.",
    type: "index",
    holdings: [
      // Renta Variable sectorial (45%)
      { fundId: "xtrackers-staples", weight: 5.625 },
      { fundId: "xtrackers-utilities", weight: 5.625 },
      { fundId: "xtrackers-healthcare", weight: 11.25 },
      { fundId: "xtrackers-technology", weight: 11.25 },
      { fundId: "xtrackers-energy", weight: 5.625 },
      { fundId: "hsbc-reits", weight: 5.625 },
      // Renta Fija (35%)
      { fundId: "lne-xtrackers-global-gov-hedged", weight: 15.0 },
      { fundId: "ishares-usd-treasury-hedged", weight: 8.0 },
      { fundId: "amundi-gov-10-15y", weight: 5.0 },
      { fundId: "lne-vanguard-eur-corp-etf", weight: 5.0 },
      { fundId: "lne-ishares-eur-hy-esg", weight: 2.0 },
      // Oro (20%)
      { fundId: "ishares-gold", weight: 20.0 },
    ],
  },
];

export const PRESETS_PRIVADOS: PortfolioPreset[] = [
  ...BANCA_PRIVADA_PRESETS,
  ...ALTERNATIVOS_CANIGUERAL_PRESETS,
  ...CAIXABANK_SMART_PRESETS,
  ...PABLO_CASTRO_PRESETS,
  ...PINAES_PRESETS,
  ...JL_PRESETS,
  ...RF_PRESETS,
  ...LNE_PRESETS,
];
