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
    name: "Vanguard FTSE All-World UCITS ETF Acc",
    shortName: "Vanguard Global Acc",
    isin: "IE00BK5BQT80",
    yahooTicker: "VWCE.DE", // Acumulación (VWRL.AS era distribución — no capturaba dividendos)
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
    name: "iShares Core S&P 500 UCITS ETF Acc",
    shortName: "iShares S&P500 Acc",
    isin: "IE00B5BMR087",
    yahooTicker: "SXR8.DE", // Xetra — datos desde 2010 (VUAA.DE solo desde 2020)
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
    name: "Xtrackers Eurozone Government Bond UCITS ETF 1C",
    shortName: "Xtrackers Gov EUR Acc",
    isin: "LU0290355717",
    yahooTicker: "DBXN.DE", // Acumulación (VETY.AS era distribución — no capturaba cupones)
    ter: 0.15,
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
    distributing: true, // IEGA reparte dividendos
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "ishares-europe",
    name: "iShares Core MSCI Europe UCITS ETF Acc",
    shortName: "iShares Europa Acc",
    isin: "IE00B4K48X80",
    yahooTicker: "IMAE.AS", // Acumulación (IMEU.AS era distribución — no capturaba dividendos)
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
    yahooTicker: "MTD.PA", // X710 era Xtrackers (LU0290357259, fondo distinto)
    ter: 0.15,
    category: "RF EUR Gov Medio",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "xtrackers-gov-5-7y",
    name: "Xtrackers II Eurozone Government Bond 5-7 UCITS ETF 1C",
    shortName: "Xtrackers Gov 5-7Y",
    isin: "LU0290357176",
    yahooTicker: "X57E.DE", // X57E.XETRA — ticker correcto (DBXF era el 15-30Y!)
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
    yahooTicker: "IBTE.L", // IBTS era el USD distrib non-hedged (IE00B14X4S71); IBTE es el EUR Hedged Acc correcto
    ter: 0.10,
    category: "RF EUR Gov Corto",
    type: "index",
    currency: "USD",
    terSource: "curated",
    terConfirmed: true,
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
    name: "Xtrackers II EUR Corporate Bond UCITS ETF 1C",
    shortName: "Xtrackers Corp EUR",
    isin: "LU0478205379",
    yahooTicker: "XBLC.DE", // XBLC.XETRA — Acumulación 1C, datos desde 2010-03 (vs 2019-02 del VECA Vanguard). +9 años de histórico
    ter: 0.12,
    category: "RF EUR Corp",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "ishares-hy-esg",
    name: "Xtrackers II EUR High Yield Corporate Bond UCITS ETF 1C",
    shortName: "Xtrackers HY EUR",
    isin: "LU1109943388",
    yahooTicker: "XHYA.DE", // XHYA.XETRA — Acumulación 1C, datos desde 2017-03 (vs 2019-11 del EHYA ESG). Sin ESG pero con +2.5 años de histórico
    ter: 0.20,
    category: "RF EUR Corp",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  // ---------------------------------------------------------------------------
  // ETFs Carteras Indexa Capital - Proxies
  // ---------------------------------------------------------------------------
  {
    id: "indexa-japan",
    name: "Xtrackers MSCI Japan UCITS ETF 1C",
    shortName: "Xtrackers Japan",
    isin: "LU0274209740",
    yahooTicker: "DBXJ.DE", // Acumulación 1C (XDJP.DE era Nikkei 225 distribución 1D — fondo diferente)
    ter: 0.12,
    category: "RV Japón",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "indexa-small-cap",
    name: "Vanguard Global Small Cap Index Fund EUR Acc",
    shortName: "Vanguard Small Cap",
    isin: "IE00BFRTDD83", // Fondo institucional Vanguard (el que usa Indexa Capital) — EUFUND desde 2013-12
    ter: 0.29,
    category: "RV Small Cap",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "indexa-eur-inflation",
    name: "Xtrackers II Eurozone Inflation-Linked Bond UCITS ETF 1C",
    shortName: "Xtrackers Inflation EUR Acc",
    isin: "LU0290358224",
    yahooTicker: "DBXK.DE", // DBXK.XETRA — ticker original con ISIN registrado en EODHD (XEIN aparece sin ISIN)
    ter: 0.20,
    category: "RF Inflation EUR",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "indexa-us-gov-hedged",
    name: "Vanguard US Government Bond Index Fund EUR Hedged Acc",
    shortName: "Vanguard US Gov Hdg",
    isin: "IE00BF6T7R10", // Fondo institucional Vanguard (el que usa Indexa Capital) — EUFUND desde 2017-11
    ter: 0.10,
    category: "RF USD Gov",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "indexa-us-corp-hedged",
    name: "Vanguard US Investment Grade Bond Index Fund EUR Hedged Acc",
    shortName: "Vanguard US Corp Hdg",
    isin: "IE00BZ04LQ92", // Fondo institucional Vanguard (el que usa Indexa Capital) — EUFUND desde 2015-09. ISIN anterior IE00BZ163K21 era la versión USD non-hedged
    ter: 0.12,
    category: "RF USD Corp",
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
    yahooTicker: "8PSG.F", // Frankfurt (EUR) — datos desde 2012 (Xetra solo desde 2020)
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
// Fondos Banca Privada (cartera multigestor)
// Datos obtenidos por ISIN vía EODHD (.EUFUND) — no tienen Yahoo ticker estándar
// TER estimados (fuente: fichas Morningstar / gestoras). Marcar terConfirmed cuando se verifique.
// -----------------------------------------------------------------------------

const BANCA_PRIVADA_FUNDS: Fund[] = [
  // --- Renta Variable ---
  {
    id: "bp-bgf-energy",
    name: "BGF World Energy Hedged A2 EUR",
    shortName: "BGF Energy Hdg",
    isin: "LU0326422176",
    // EODHD EUFUND funciona con ISIN directamente — sin yahooTicker para evitar 404 innecesario
    ter: 1.83,
    category: "RV Sectorial",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-bl-japan",
    name: "BL-Equities Japan B EUR Hedged Acc",
    shortName: "BL Japan Hdg",
    isin: "LU0887931292",
    ter: 1.70,
    category: "RV Japón",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-bnp-smallcap",
    name: "BNP Paribas US Small Cap Classic H EUR",
    shortName: "BNP US Small Cap",
    isin: "LU0251806666",
    ter: 2.22,
    category: "RV Small Cap",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-exane-europe",
    name: "Exane Funds 2 Exane Equity Select Europe B",
    shortName: "Exane Europe",
    isin: "LU0719899097",
    ter: 2.00,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-fidelity-asia",
    name: "Fidelity Asia Pacific Opportunities A-Acc-EUR",
    shortName: "Fidelity Asia Pac",
    isin: "LU0345361124",
    ter: 1.93,
    category: "RV Emergentes",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-franklin-tech",
    name: "Franklin Technology A Acc EUR",
    shortName: "Franklin Tech",
    isin: "LU0260870158",
    // EODHD EUFUND funciona con ISIN directamente — sin yahooTicker para evitar 404 innecesario
    ter: 1.82,
    category: "RV Sectorial",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-gqg-global",
    name: "GQG Partners Global Equity Fund A EUR Acc",
    shortName: "GQG Global",
    isin: "IE00BH481053",
    ter: 1.18,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-heptagon-us",
    name: "Heptagon Yacktman US Equity AEH EUR Acc",
    shortName: "Heptagon US",
    isin: "IE00BYNG3695",
    ter: 1.55,
    category: "RV EEUU",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-ishares-stoxx50",
    name: "iShares Core Euro Stoxx 50 ETF EUR Acc",
    shortName: "iShares EuroStoxx50",
    isin: "IE00B53L3W79",
    yahooTicker: "SXRT.DE",
    ter: 0.10,
    category: "RV Europa",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bp-ishares-sp500",
    name: "iShares Core S&P 500 UCITS ETF USD Acc",
    shortName: "iShares S&P500",
    isin: "IE00B5BMR087",
    yahooTicker: "CSPX.AS",
    ter: 0.07,
    category: "RV EEUU",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bp-magallanes-europe",
    name: "Magallanes V.I. UCITS European Equity R EUR",
    shortName: "Magallanes Europa",
    isin: "LU1330191542",
    ter: 1.79,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-pictet-water",
    name: "Pictet-Water P EUR",
    shortName: "Pictet Water",
    isin: "LU0104884860",
    ter: 1.98,
    category: "RV Sectorial",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-robeco-conservative",
    name: "Robeco QI Global Developed Conservative Equities D EUR",
    shortName: "Robeco Conserv",
    isin: "LU1274519823",
    ter: 0.92,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  // --- Renta Fija ---
  {
    id: "bp-aegon-abs",
    name: "Aegon European ABS A EUR Acc",
    shortName: "Aegon ABS EUR",
    isin: "IE00BG226Z29",
    yahooTicker: "0P0001DD2M.F", // Frankfurt Morningstar ID — ISIN no existe en EODHD EUFUND
    ter: 1.10,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-eurizon-short",
    name: "Eurizon Fund - Bond EUR Short Term LTE R EUR",
    shortName: "Eurizon RF Corto",
    isin: "LU0097116437",
    ter: 0.66,
    category: "RF EUR Gov Corto",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-eurizon-medium",
    name: "Eurizon Fund Bond EUR Medium Term LTE R EUR Acc",
    shortName: "Eurizon RF Medio",
    isin: "LU0012017942",
    ter: 0.56,
    category: "RF EUR Gov Medio",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-groupama-ust",
    name: "Groupama Ultra Short Term Bond N",
    shortName: "Groupama UST Bond",
    isin: "FR0013346079",
    ter: 0.20,
    category: "RF EUR Gov Corto",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-lord-abbett",
    name: "Lord Abbett Short Duration Income A EUR H Acc",
    shortName: "Lord Abbett SDI",
    isin: "IE00BYP0Y993",
    ter: 0.95,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-mfs-usgov",
    name: "MFS Meridian Funds - U.S. Government Bond AH1 EUR",
    shortName: "MFS US Gov Bond",
    isin: "LU1964705062",
    ter: 1.05,
    category: "RF USD Gov",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-natixis-credit",
    name: "Natixis AM Fds - Ostrum Euro Short Term Credit R/A EUR",
    shortName: "Ostrum ST Credit",
    isin: "LU0935222066",
    ter: 0.79,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-nordea-lowdur",
    name: "Nordea 1 - Low Duration European Covered Bond BP EUR",
    shortName: "Nordea Low Dur Cov",
    isin: "LU1694212348",
    ter: 0.60,
    category: "RF EUR Gov Corto",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-nordea-covered",
    name: "Nordea 1 - European Covered Bond BP EUR",
    shortName: "Nordea Covered Bond",
    isin: "LU0076315455",
    ter: 0.65,
    category: "RF EUR",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-pimco-credit",
    name: "PIMCO GIS Global Investment Grade Credit E EUR Hedged Acc",
    shortName: "PIMCO Inv Grade",
    isin: "IE00B11XZ434",
    // EODHD EUFUND funciona con ISIN directamente — sin yahooTicker para evitar 404 innecesario
    ter: 0.79,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-robeco-fibd",
    name: "Robeco Financial Institutions Bonds DH EUR",
    shortName: "Robeco Fin Inst",
    isin: "LU0622663176",
    ter: 0.72,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-schroder-catbond",
    name: "Schroder GAIA Cat Bond A Acc EUR Hedged",
    shortName: "Schroder Cat Bond",
    isin: "LU2399869788",
    ter: 1.45,
    category: "RF Flexible",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bp-schroder-eurocorp",
    name: "Schroder ISF Euro Corporate Bond A Acc EUR",
    shortName: "Schroder Corp EUR",
    isin: "LU0113257694",
    ter: 1.31,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
];

// -----------------------------------------------------------------------------
// Fondos Alternativos — Cartera Cañigueral SL
// Estrategias alternativas (long-short, market-neutral, volatility, multi-strategy,
// alpha bonds, precious metals equity). Todos via EODHD .EUFUND
// -----------------------------------------------------------------------------

const ALTERNATIVOS_CANIGUERAL_FUNDS: Fund[] = [
  {
    id: "alt-dunas-valor-flexible",
    name: "Dunas Valor Flexible I FI",
    shortName: "Dunas Valor Flexible",
    isin: "ES0175316001",
    ter: 0.90,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "alt-aqr-apex",
    name: "AQR Apex UCITS Fund RAEFT EUR Acc",
    shortName: "AQR Apex",
    isin: "LU1662496279",
    ter: 1.60,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "alt-man-alpha-select",
    name: "Man Funds VI – Man Alpha Select Alternative IL H EUR",
    shortName: "Man Alpha Select",
    isin: "IE00B3LJVG97",
    ter: 1.50,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "alt-jpm-europe-absolute-alpha",
    name: "JPMorgan Funds – Europe Equity Absolute Alpha C EUR Acc",
    shortName: "JPM Europe Abs Alpha",
    isin: "LU1001748398",
    ter: 1.20,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "alt-gs-alternative-beta",
    name: "Goldman Sachs Alternative Beta P Cap EUR",
    shortName: "GS Alternative Beta",
    isin: "LU0370038167",
    ter: 1.40,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "alt-amundi-volatility-world",
    name: "Amundi Funds Volatility World A EUR (C)",
    shortName: "Amundi Volatility World",
    isin: "LU0557872479",
    ter: 1.80,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "alt-helium-selection",
    name: "Helium Fund – Helium Selection B-EUR",
    shortName: "Helium Selection",
    isin: "LU1112771503",
    ter: 1.85,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "alt-pictet-atlas-titan",
    name: "Pictet TR – Atlas I EUR",
    shortName: "Pictet Atlas I",
    isin: "LU1433232698", // Clase institucional 'I' — datos desde 2016-11 (vs 2020-10 de la clase P 'Titan')
    ter: 1.10,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "alt-ofi-precious-metals",
    name: "Ofi Invest Precious Metals R",
    shortName: "Ofi Precious Metals",
    isin: "FR0011170182",
    ter: 1.95,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "alt-dnca-alpha-bonds",
    name: "DNCA Invest Alpha Bonds N EUR",
    shortName: "DNCA Alpha Bonds",
    isin: "LU1694789709",
    ter: 0.65,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
];

// -----------------------------------------------------------------------------
// Todos los fondos combinados
// -----------------------------------------------------------------------------

const ALL_FUNDS: Fund[] = [
  ...INDEXED_FUNDS,
  ...ACTIVE_FUNDS,
  ...BANCA_PRIVADA_FUNDS,
  ...ALTERNATIVOS_CANIGUERAL_FUNDS,
];

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
 * Registra un fondo ad-hoc (no curado en la BD) para que pueda ser usado
 * como holding en runBacktest. Útil para informes personalizados donde
 * el fondo del usuario no está en la BD pero sí tiene datos en EODHD vía
 * el sufijo .EUFUND. Idempotente — si ya está registrado, no duplica.
 *
 * El fondo registrado tiene type "active" y sin TER conocido (0%) — el
 * NAV de EODHD ya viene neto del TER del propio fondo, así que el motor
 * no necesita descontarlo otra vez.
 */
export function registrarFondoAdHoc(isin: string, name: string): Fund {
  const existing = FUNDS_BY_ISIN.get(isin);
  if (existing) return existing;
  const fund: Fund = {
    id: `adhoc-${isin}`,
    name: name || isin,
    shortName: (name || isin).slice(0, 30),
    isin,
    ter: 0,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  };
  FUNDS_BY_ID.set(fund.id, fund);
  FUNDS_BY_ISIN.set(fund.isin, fund);
  return fund;
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
