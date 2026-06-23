// =============================================================================
// BASE DE DATOS DE FONDOS - Backtesting Tool El Proyecto K
// =============================================================================

import type { Fund, FundType, FundCategory } from "./types";

// -----------------------------------------------------------------------------
// ETFs y Fondos Indexados (datos de EODHD vía el ticker base)
// -----------------------------------------------------------------------------

const INDEXED_FUNDS: Fund[] = [
  {
    id: "vanguard-global",
    name: "Vanguard FTSE All-World UCITS ETF Acc",
    shortName: "Vanguard Global Acc",
    isin: "IE00BK5BQT80",
    ticker: "VWCE.DE", // Acumulación (VWRL.AS era distribución — no capturaba dividendos)
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
    ticker: "IWDA.AS",
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
    ticker: "SXR8.DE", // Xetra — datos desde 2010 (VUAA.DE solo desde 2020)
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
    ticker: "AEEM.PA",
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
    ticker: "DBXN.DE", // Acumulación (VETY.AS era distribución — no capturaba cupones)
    ter: 0.15,
    category: "RF EUR Gov",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  // VGEA.AS no devolvía datos, usamos VETY.AS como alternativa.
  // El fondo vanguard-eur-bond ya cubre esta categoría.
  {
    id: "ishares-euro-bond",
    name: "iShares Core Euro Govt Bond",
    shortName: "iShares RF EUR",
    isin: "IE00B4WXJJ64",
    ticker: "IEGA.AS",
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
    ticker: "IMAE.AS", // Acumulación (IMEU.AS era distribución — no capturaba dividendos)
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
    ticker: "XDWS.DE",
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
    ticker: "XDWU.DE",
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
    ticker: "XDWH.DE",
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
    ticker: "XDWT.DE",
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
    ticker: "XDW0.DE",
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
    ticker: "EPRA.PA",
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
    ticker: "MTE.PA",
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
    ticker: "MTD.PA", // X710 era Xtrackers (LU0290357259, fondo distinto)
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
    ticker: "X57E.DE", // X57E.XETRA — ticker correcto (DBXF era el 15-30Y!)
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
    ticker: "IBTE.L", // IBTS era el USD distrib non-hedged (IE00B14X4S71); IBTE es el EUR Hedged Acc correcto
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
    ticker: "DBXM.DE",
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
    ticker: "PRAB.DE",
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
    ticker: "XBLC.DE", // XBLC.XETRA — Acumulación 1C, datos desde 2010-03 (vs 2019-02 del VECA Vanguard). +9 años de histórico
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
    ticker: "XHYA.DE", // XHYA.XETRA — Acumulación 1C, datos desde 2017-03 (vs 2019-11 del EHYA ESG). Sin ESG pero con +2.5 años de histórico
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
    ticker: "DBXJ.DE", // Acumulación 1C (XDJP.DE era Nikkei 225 distribución 1D — fondo diferente)
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
    ticker: "DBXK.DE", // DBXK.XETRA — ticker original con ISIN registrado en EODHD (XEIN aparece sin ISIN)
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
    ticker: "8PSG.F", // Frankfurt (EUR) — datos desde 2012 (Xetra solo desde 2020)
    ter: 0.12,
    category: "Oro",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  // ---------------------------------------------------------------------------
  // ETFs y fondos USA (denominados en USD) — usados en las "K Sectorial USA"
  // Los precios se mantienen en USD (sin conversión a EUR). El motor los trata
  // numéricamente y las cifras del resultado aparecerán con símbolo "€" pero
  // realmente son USD. Ver aviso en FundSearch al añadirlos manualmente.
  // ---------------------------------------------------------------------------
  {
    id: "spdr-xlp",
    name: "Consumer Staples Select Sector SPDR ETF",
    shortName: "XLP Consumer Staples",
    isin: "US81369Y3080",
    ticker: "XLP",
    ter: 0.08,
    category: "RV Sectorial",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "spdr-xlv",
    name: "Health Care Select Sector SPDR ETF",
    shortName: "XLV Health Care",
    isin: "US81369Y2090",
    ticker: "XLV",
    ter: 0.08,
    category: "RV Sectorial",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "invesco-qqq",
    name: "Invesco QQQ Trust",
    shortName: "QQQ Nasdaq-100",
    isin: "US46090E1038",
    ticker: "QQQ",
    ter: 0.20,
    category: "RV Sectorial",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "spdr-xlk",
    name: "Technology Select Sector SPDR ETF",
    shortName: "XLK Tecnología",
    isin: "US81369Y8030",
    ticker: "XLK",
    ter: 0.08,
    category: "RV Sectorial",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "spdr-xle",
    name: "Energy Select Sector SPDR ETF",
    shortName: "XLE Energy",
    isin: "US81369Y5069",
    ticker: "XLE",
    ter: 0.08,
    category: "RV Sectorial",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "spdr-xlu",
    name: "Utilities Select Sector SPDR ETF",
    shortName: "XLU Utilities",
    isin: "US81369Y8865",
    ticker: "XLU",
    ter: 0.08,
    category: "RV Sectorial",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-vgsix",
    name: "Vanguard Real Estate Index Investor",
    shortName: "VGSIX REIT",
    isin: "US9229085538",
    ticker: "VGSIX",
    ter: 0.27,
    category: "RV REITs",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "spdr-gld",
    name: "SPDR Gold Shares",
    shortName: "GLD Oro",
    isin: "US78463V1070",
    ticker: "GLD",
    ter: 0.40,
    category: "Oro",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    // Oro spot (XAUUSD) — precio spot del oro en USD. Histórico desde 1979-12-26
    // (46+ años). Equivalente a ^GOLD de portfoliovisualizer. TER 0 porque es
    // el índice del precio del oro, no un ETF (los costes de custodia se
    // ignoran, como hace portfoliovisualizer).
    id: "spot-gold",
    name: "Oro spot (XAUUSD)",
    shortName: "Oro spot",
    isin: "XAUUSD",
    ticker: "XAUUSD.FOREX",
    ter: 0,
    category: "Oro",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-vustx",
    name: "Vanguard Long-Term Treasury Investor",
    shortName: "VUSTX Long Treasury",
    isin: "US9219086547",
    ticker: "VUSTX",
    ter: 0.20,
    category: "RF USD Gov",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-vfitx",
    name: "Vanguard Intermediate-Term Treasury Investor",
    shortName: "VFITX Intermediate Treasury",
    isin: "US9219086208",
    ticker: "VFITX",
    ter: 0.20,
    category: "RF USD Gov",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-vfisx",
    name: "Vanguard Short-Term Treasury Investor",
    shortName: "VFISX Short Treasury",
    isin: "US9219085101",
    ticker: "VFISX",
    ter: 0.20,
    category: "RF USD Gov",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "ishares-lqd",
    name: "iShares iBoxx $ Investment Grade Corporate Bond ETF",
    shortName: "LQD Corp IG",
    isin: "US4642872422",
    ticker: "LQD",
    ter: 0.14,
    category: "RF USD Corp",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-vwehx",
    name: "Vanguard High-Yield Corporate Investor",
    shortName: "VWEHX High Yield",
    isin: "US9219084153",
    ticker: "VWEHX",
    ter: 0.22,
    category: "RF USD Corp",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "spdr-bil",
    name: "SPDR Bloomberg 1-3 Month T-Bill ETF",
    shortName: "BIL Cash (T-Bill 1-3M)",
    isin: "US78468R6633",
    ticker: "BIL",
    ter: 0.14,
    category: "RF USD Gov",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  // ---------------------------------------------------------------------------
  // RV GLOBAL/REGIONAL — fondos Vanguard mutual funds + iShares Japan ETF.
  // Usados en presets K Geográfica USA. Mismos patrones de cobertura que
  // Vanguard usa internamente (S&P500, ex-US Developed, Emerging, Europe, Japan).
  // ---------------------------------------------------------------------------
  {
    id: "vanguard-vfinx",
    name: "Vanguard 500 Index Investor",
    shortName: "VFINX S&P 500",
    isin: "US9229085538",
    ticker: "VFINX",
    ter: 0.14,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-vtmgx",
    name: "Vanguard Developed Markets Index Admiral",
    shortName: "VTMGX Desarrollados ex-US",
    isin: "US9219091257",
    ticker: "VTMGX",
    ter: 0.07,
    category: "RV Global",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-veiex",
    name: "Vanguard Emerging Markets Stock Index Investor",
    shortName: "VEIEX Emergentes",
    isin: "US9220428588",
    ticker: "VEIEX",
    ter: 0.32,
    category: "RV Emergentes",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-veurx",
    name: "Vanguard European Stock Investor",
    shortName: "VEURX Europa",
    isin: "US9220428406",
    ticker: "VEURX",
    ter: 0.30,
    category: "RV Europa",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "ishares-ewj",
    name: "iShares MSCI Japan ETF",
    shortName: "EWJ Japón",
    isin: "US4642868487",
    ticker: "EWJ",
    ter: 0.50,
    category: "RV Japón",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  // ---------------------------------------------------------------------------
  // Fondos USA usados en presets Indexa USA ETFs (replica de Portfoliovisualizer).
  // SPY: ETF S&P 500 de SPDR. VBMFX: bond fund agregado USA. NAESX: small caps.
  // ---------------------------------------------------------------------------
  {
    id: "spdr-spy",
    name: "SPDR S&P 500 ETF Trust",
    shortName: "SPY S&P 500",
    isin: "US78462F1030",
    ticker: "SPY",
    ter: 0.09,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-vbmfx",
    name: "Vanguard Total Bond Market Index Investor",
    shortName: "VBMFX RF USA Agregada",
    isin: "US9219371078",
    ticker: "VBMFX",
    ter: 0.15,
    category: "RF USD Gov",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-naesx",
    name: "Vanguard Small-Cap Index Investor",
    shortName: "NAESX Small Caps USA",
    isin: "US9229087682",
    ticker: "NAESX",
    ter: 0.17,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  // ---------------------------------------------------------------------------
  // ACCIONES INDIVIDUALES — usadas en preset "Participantes Primeras Ediciones".
  // TER = 0% (las acciones no tienen TER). Mezcla de USD y EUR — recordar al
  // usuario que el motor no convierte FX.
  // ---------------------------------------------------------------------------
  {
    id: "stock-aapl",
    name: "Apple Inc.",
    shortName: "Apple (AAPL)",
    isin: "US0378331005",
    ticker: "AAPL",
    ter: 0,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "stock-nvda",
    name: "NVIDIA Corporation",
    shortName: "NVIDIA (NVDA)",
    isin: "US67066G1040",
    ticker: "NVDA",
    ter: 0,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "stock-amzn",
    name: "Amazon.com Inc.",
    shortName: "Amazon (AMZN)",
    isin: "US0231351067",
    ticker: "AMZN",
    ter: 0,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "stock-tsla",
    name: "Tesla Inc.",
    shortName: "Tesla (TSLA)",
    isin: "US88160R1014",
    ticker: "TSLA",
    ter: 0,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "stock-googl",
    name: "Alphabet Inc. Class A",
    shortName: "Alphabet/Google (GOOGL)",
    isin: "US02079K3059",
    ticker: "GOOGL",
    ter: 0,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "stock-ko",
    name: "The Coca-Cola Company",
    shortName: "Coca-Cola (KO)",
    isin: "US1912161007",
    ticker: "KO",
    ter: 0,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "stock-brk-a",
    name: "Berkshire Hathaway Inc. Class A",
    shortName: "Berkshire A (BRK-A)",
    isin: "US0846701086",
    ticker: "BRK-A",
    ter: 0,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "stock-msft",
    name: "Microsoft Corporation",
    shortName: "Microsoft (MSFT)",
    isin: "US5949181045",
    ticker: "MSFT",
    ter: 0,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "stock-itx",
    name: "Industria de Diseño Textil S.A. (Inditex)",
    shortName: "Inditex (ITX.MC)",
    isin: "ES0148396007",
    ticker: "ITX.MC",
    ter: 0,
    category: "RV España",
    type: "index",
    currency: "EUR",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "stock-mc",
    name: "LVMH Moët Hennessy - Louis Vuitton",
    shortName: "LVMH (MC.PA)",
    isin: "FR0000121014",
    ticker: "MC.PA",
    ter: 0,
    category: "RV Europa",
    type: "index",
    currency: "EUR",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
];

// -----------------------------------------------------------------------------
// Fondos de Gestión Activa Bancaria (datos manuales CSV)
// -----------------------------------------------------------------------------

const ACTIVE_FUNDS: Fund[] = [
  {
    // Fondo más antiguo de RV Global de la banca española disponible en EODHD:
    // datos desde 1997-08-04 (28+ años). Útil para backtests muy largos contra
    // carteras indexadas y mostrar el efecto del coste de gestión activa.
    id: "ibercaja-internacional",
    name: "Ibercaja Bolsa Internacional FI",
    shortName: "Ibercaja Internacional",
    isin: "ES0147641031",
    ter: 1.75,
    category: "RV Global",
    type: "active",
    bank: "Ibercaja",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
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
// Datos obtenidos por ISIN vía EODHD (.EUFUND) — no tienen ticker en bolsa estándar
// TER estimados (fuente: fichas Morningstar / gestoras). Marcar terConfirmed cuando se verifique.
// -----------------------------------------------------------------------------

const BANCA_PRIVADA_FUNDS: Fund[] = [
  // --- Renta Variable ---
  {
    id: "bp-bgf-energy",
    name: "BGF World Energy Hedged A2 EUR",
    shortName: "BGF Energy Hdg",
    isin: "LU0326422176",
    // EODHD EUFUND funciona con ISIN directamente — sin ticker para evitar 404 innecesario
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
    // EODHD EUFUND funciona con ISIN directamente — sin ticker para evitar 404 innecesario
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
    ticker: "SXRT.DE",
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
    ticker: "CSPX.AS",
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
    ticker: "0P0001DD2M.F", // Frankfurt Morningstar ID — ISIN no existe en EODHD EUFUND
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
    // EODHD EUFUND funciona con ISIN directamente — sin ticker para evitar 404 innecesario
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
// Fondos Cartera Gestionada BBVA Capital
// 11 fondos de RF (corta duración + credit) + 3 fondos alternativos.
// La mayoría son LU* (Luxemburgo, requieren EUFUND de EODHD); BBVA Crédito
// Europa es ES* (mutual fund español). ISINs marcados como "estimated"
// requieren verificación contra los ISINs reales del extracto BBVA.
// -----------------------------------------------------------------------------

const BBVA_CAPITAL_FUNDS: Fund[] = [
  // --- Renta Fija (corta duración + credit + liquidez) ---
  {
    id: "bbvac-ishares-eur-govt-1-3",
    name: "iShares Euro Government Bond 1-3yr UCITS ETF",
    shortName: "iShares Govt 1-3y",
    isin: "IE00B14X4Q57",
    ticker: "IBGS.AS",
    ter: 0.20,
    category: "RF EUR Gov Corto",
    type: "active",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbvac-blackrock-euro-ultrashort",
    name: "BlackRock Euro Ultra Short Bond",
    shortName: "BlackRock Ultra Short",
    isin: "LU1191877379",
    ter: 0.20,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-franklin-eur-short",
    name: "Franklin Euro Short Duration Bond A EUR",
    shortName: "Franklin EUR Short",
    isin: "LU1022658667",
    ter: 0.55,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-ms-short-maturity",
    name: "Morgan Stanley INVF Short Maturity Euro Bond A",
    shortName: "MS Short Maturity EUR",
    isin: "LU0073235904",
    ter: 0.40,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-axa-euro-credit-short",
    name: "AXA World Funds - Euro Credit Short Duration A Cap EUR",
    shortName: "AXA Credit Short",
    isin: "LU0251661756",
    ter: 0.40,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-invesco-euro-short-term",
    name: "Invesco Euro Short Term Bond Z Acc EUR",
    shortName: "Invesco EUR Short Term",
    isin: "LU1590491913",
    ter: 0.45,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-amundi-eur-liquidity",
    name: "Amundi Funds Euro Liquidity Rated SRI",
    shortName: "Amundi EUR Liquidity",
    isin: "LU0568621618",
    ter: 0.20,
    category: "RF EUR",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-amundi-euro-corp-sri",
    name: "Amundi Index Solutions - Amundi Index Euro AGG Corporate SRI Fund",
    shortName: "Amundi Idx EUR Corp SRI",
    isin: "LU1437018168",
    ter: 0.18,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-jpm-euro-govt",
    name: "JPM Euro Government Short Duration Bond D Acc EUR",
    shortName: "JPM EUR Govt Short",
    isin: "LU0408877842",
    ter: 0.40,
    category: "RF EUR Gov Corto",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-bbva-credito-europa",
    name: "BBVA Crédito Europa FI",
    shortName: "BBVA Crédito Europa",
    isin: "ES0117091035",
    ter: 0.85,
    category: "RF EUR Corp",
    type: "active",
    bank: "BBVA",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-pictet-eur-short-term",
    name: "Pictet EUR Short Term Corporate Bond I",
    shortName: "Pictet EUR S/T Corp",
    isin: "LU0954602677",
    ter: 0.45,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  // --- Inversión Alternativa ---
  {
    id: "bbvac-pictet-tr-diversified",
    name: "Pictet TR - Diversified Alpha P EUR",
    shortName: "Pictet TR Diversified",
    isin: "LU1055714452",
    ter: 1.50,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-bluebay-ig-absolute",
    name: "BlueBay Investment Grade Absolute Return Bond I EUR",
    shortName: "BlueBay IG Absolute",
    isin: "LU0627763740",
    ter: 1.00,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvac-candriam-long-short-credit",
    name: "Candriam Long Short Credit Classique",
    shortName: "Candriam LS Credit",
    isin: "FR0010760694",
    ter: 1.20,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
];

// -----------------------------------------------------------------------------
// Cartera BBVA Inversión Renta Variable — Réplica del extracto del cliente
// 19 fondos / ETFs de RV global (USA, Europa, Japón, Emergentes, small caps,
// factor value, ISR español). ISINs reales facilitados por el cliente. Mezcla
// indexados (ETFs) + activos (mutual funds).
// -----------------------------------------------------------------------------

const BBVA_INVERSION_RV_FUNDS: Fund[] = [
  // === ETFs indexados ===
  {
    id: "bbvar-invesco-msci-usa",
    name: "Invesco MSCI USA UCITS ETF EUR",
    shortName: "Invesco MSCI USA ETF",
    isin: "IE00B60SX170",
    ter: 0.05,
    category: "RV EEUU",
    type: "index",
    currency: "EUR",
    distributing: false,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbvar-ishares-msci-europe",
    name: "iShares Core MSCI Europe UCITS ETF EUR (Acc)",
    shortName: "iShares MSCI Europe Acc",
    isin: "IE00B4K48X80",
    ter: 0.12,
    category: "RV Europa",
    type: "index",
    currency: "EUR",
    distributing: false,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbvar-amundi-msci-em",
    name: "Amundi Index MSCI Emerging Markets",
    shortName: "Amundi Idx MSCI EM",
    isin: "LU0996177134",
    ter: 0.45,
    category: "RV Emergentes",
    type: "index",
    currency: "EUR",
    distributing: false,
    terSource: "estimated",
  },
  {
    id: "bbvar-ossiam-us-sector-value",
    name: "Ossiam Shiller Barclays Cape US Sector Value TR 1C (EUR)",
    shortName: "Ossiam US Sector Value",
    isin: "LU1079841273",
    ter: 0.65,
    category: "RV EEUU",
    type: "index",
    currency: "EUR",
    distributing: false,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbvar-xtrackers-msci-em",
    name: "Xtrackers MSCI Emerging Markets UCITS ETF 1C",
    shortName: "Xtrackers MSCI EM",
    isin: "IE00BTJRMP35",
    ter: 0.18,
    category: "RV Emergentes",
    type: "index",
    currency: "USD",
    distributing: false,
    terSource: "estimated",
  },
  // === Mutual funds activos ===
  {
    id: "bbvar-jpm-eur-equity",
    name: "JPMorgan Funds - Europe Equity Fund",
    shortName: "JPM Europe Equity",
    isin: "LU0053685029",
    ter: 1.50,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvar-schroder-em",
    name: "Schroder ISF Emerging Markets",
    shortName: "Schroder EM",
    isin: "LU0106252389",
    ter: 1.85,
    category: "RV Emergentes",
    type: "active",
    currency: "USD",
    terSource: "estimated",
  },
  {
    id: "bbvar-jpm-us-select",
    name: "JPMorgan Funds - US Select Equity Fund",
    shortName: "JPM US Select Equity",
    isin: "LU0210526637",
    ter: 1.50,
    category: "RV EEUU",
    type: "active",
    currency: "USD",
    terSource: "estimated",
  },
  {
    id: "bbvar-mfs-european-research",
    name: "MFS Meridian Funds - European Research Fund A1 EUR",
    shortName: "MFS European Research A1",
    isin: "LU0094557526",
    ter: 1.98,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbvar-invesco-pan-european",
    name: "Invesco Pan European Equity Fund",
    shortName: "Invesco Pan European",
    isin: "LU0119750205",
    ter: 1.45,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvar-ab-select-us",
    name: "AB SICAV I Select US Equity Portfolio",
    shortName: "AB Select US Equity",
    isin: "LU0079474960",
    ter: 1.50,
    category: "RV EEUU",
    type: "active",
    currency: "USD",
    terSource: "estimated",
  },
  {
    id: "bbvar-gs-europe-core",
    name: "Goldman Sachs Europe CORE Equity Portfolio E Acc EUR",
    shortName: "GS Europe CORE E Acc",
    isin: "LU0133265339",
    ter: 1.91,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbvar-vontobel-us-equity",
    name: "Vontobel Fund - US Equity",
    shortName: "Vontobel US Equity",
    isin: "LU0136412771",
    ter: 1.65,
    category: "RV EEUU",
    type: "active",
    currency: "USD",
    terSource: "estimated",
  },
  {
    id: "bbvar-amundi-us-equity",
    name: "Amundi Funds US Equity",
    shortName: "Amundi US Equity",
    isin: "LU1883320993",
    ter: 1.30,
    category: "RV EEUU",
    type: "active",
    currency: "USD",
    terSource: "estimated",
  },
  {
    id: "bbvar-nomura-japan-value",
    name: "Nomura Funds Ireland plc - Japan Strategic Value Fund Class A EUR",
    shortName: "Nomura Japan Value A EUR",
    isin: "IE00B3XFBR64",
    ter: 1.55,
    category: "RV Japón",
    type: "active",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbvar-gs-japan-equity",
    name: "Goldman Sachs Japan Equity Portfolio",
    shortName: "GS Japan Equity",
    isin: "LU0234572450",
    ter: 1.40,
    category: "RV Japón",
    type: "active",
    currency: "JPY",
    terSource: "estimated",
  },
  {
    id: "bbvar-threadneedle-smaller",
    name: "Threadneedle Lux Pan European Smaller Companies Ae",
    shortName: "Threadneedle Pan Eur Smaller",
    isin: "LU0282719219",
    ter: 1.85,
    category: "RV Small Cap",
    type: "active",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  // === Fondos españoles BBVA (vía EUFUND o CSV) ===
  {
    id: "bbvar-bbva-bolsa-euro",
    name: "BBVA Bolsa Euro FI",
    shortName: "BBVA Bolsa Euro",
    isin: "ES0110101039",
    ter: 2.37,
    category: "RV Europa",
    type: "active",
    bank: "BBVA",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbvar-bbva-usa-isr",
    name: "BBVA Bolsa USA Desarrollo ISR FI",
    shortName: "BBVA USA Desarrollo ISR",
    isin: "ES0114205034",
    ter: 1.80,
    category: "RV EEUU",
    type: "active",
    bank: "BBVA",
    currency: "EUR",
    terSource: "estimated",
  },
];

// -----------------------------------------------------------------------------
// Cartera BBVA Acumulación — Estrategia Acumulación (BBVA Gestión Discrecional)
// 20 fondos: 13 RF (30.67%) + 4 RV (4.96%) + 3 Alternativos (resto hasta 100%).
// ISINs reales del extracto del cliente. Prefijo "bbvaa-" para no colisionar.
// -----------------------------------------------------------------------------

const BBVA_ACUMULACION_FUNDS: Fund[] = [
  // === Renta Fija (13 fondos) ===
  {
    id: "bbvaa-ms-euro-corp",
    name: "Morgan Stanley Euro Corporate Bond Fund",
    shortName: "MS Euro Corporate Bond",
    isin: "LU0073232471",
    ter: 0.65,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-mg-euro-credit",
    name: "M&G (Lux) Euro Credit Fund",
    shortName: "M&G Lux Euro Credit",
    isin: "LU1670724373",
    ter: 0.55,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-bluebay-euro-govt",
    name: "BlueBay Funds - BlueBay Euro Government Bond Fund",
    shortName: "BlueBay Euro Govt Bond",
    isin: "LU0434109764",
    ter: 0.50,
    category: "RF EUR Gov",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-pimco-em-bond",
    name: "PIMCO GIS Emerging Markets Bond Fund",
    shortName: "PIMCO Emerging Markets Bond",
    isin: "IE00B11XZ103",
    ter: 0.95,
    category: "RF Flexible",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-invesco-eur-corp",
    name: "Invesco Euro Corporate Bond Fund",
    shortName: "Invesco EUR Corporate Bond",
    isin: "LU0243957239",
    ter: 0.55,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-bnp-euro-govt",
    name: "BNP Paribas Euro Government Bond",
    shortName: "BNP Euro Government Bond",
    isin: "LU0823411888",
    ter: 0.45,
    category: "RF EUR Gov",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-dws-euro-hy",
    name: "DWS Invest Euro High Yield Corporates",
    shortName: "DWS Euro HY Corporates",
    isin: "LU0145655824",
    ter: 0.85,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-amundi-euro-govt",
    name: "Amundi Funds Euro Government Bond",
    shortName: "Amundi Euro Government Bond",
    isin: "LU1882440842",
    ter: 0.40,
    category: "RF EUR Gov",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-gs-em-debt",
    name: "Goldman Sachs Emerging Markets Debt Portfolio",
    shortName: "GS Emerging Markets Debt",
    isin: "LU0119195377",
    ter: 0.95,
    category: "RF Flexible",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-fidelity-eur-hy",
    name: "Fidelity Funds - European High Yield Fund",
    shortName: "Fidelity European HY",
    isin: "LU0261948227",
    ter: 0.90,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-ishares-china-bond",
    name: "iShares China CNY Bond UCITS ETF",
    shortName: "iShares China Bond ETF",
    isin: "IE00BYPC1H27",
    ter: 0.35,
    category: "RF Flexible",
    type: "index",
    currency: "EUR",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbvaa-muzinich-em-sd",
    name: "Muzinich EmergingMarketsShortDuration Fund",
    shortName: "Muzinich EM Short Duration",
    isin: "IE00B4Z6HC18",
    ter: 0.85,
    category: "RF Flexible",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-blackrock-asia-hy",
    name: "BlackRock Global Funds - Asian High Yield Bond Fund",
    shortName: "BlackRock Asian HY Bond",
    isin: "LU0408222510",
    ter: 0.95,
    category: "RF Flexible",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  // === Renta Variable (4 fondos) ===
  {
    id: "bbvaa-janus-eur-focus",
    name: "Janus Henderson Horizon European Focus Fund",
    shortName: "Janus Henderson Euro Focus",
    isin: "LU0200080918",
    ter: 1.00,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-xtrackers-eu-reit",
    name: "Xtrackers FTSE EPRA/NAREIT Developed Europe Real Estate UCITS ETF",
    shortName: "Xtrackers Europe REIT ETF",
    isin: "LU0489337690",
    ter: 0.33,
    category: "RV REITs",
    type: "index",
    currency: "EUR",
    distributing: true,
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "bbvaa-dws-top-dividend",
    name: "DWS Invest Top Dividend",
    shortName: "DWS Top Dividend",
    isin: "LU0507265923",
    ter: 1.45,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-gs-eurozone-equity",
    name: "Goldman Sachs Eurozone Equity",
    shortName: "GS Eurozone Equity",
    isin: "LU0119258803",
    ter: 1.45,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  // === Inversión Alternativa (3 fondos) ===
  {
    id: "bbvaa-betaminer",
    name: "BetaMiner I A EUR ACC",
    shortName: "BetaMiner",
    isin: "ES0111965036",
    ter: 1.50,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-janus-uk-abs-return",
    name: "Janus Henderson UK Absolute Return Fund",
    shortName: "Janus UK Absolute Return",
    isin: "IE00B4P7Q881",
    ter: 1.10,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "bbvaa-lumyna-market-neutral",
    name: "Lumyna - MW TOPS Market Neutral UCITS Fund",
    shortName: "Lumyna Market Neutral",
    isin: "LU0834815101",
    ter: 1.20,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
];

// -----------------------------------------------------------------------------
// Fondos de las carteras personales y sociedad de Pablo (Excel cartera SOSL/FSO/AMR)
// Los TER son estimados de fichas Morningstar/gestoras; marcar terConfirmed
// cuando se verifiquen.
// -----------------------------------------------------------------------------

const PABLO_FUNDS: Fund[] = [
  // --- ETFs indexados ---
  {
    id: "pablo-ishares-world-value-factor",
    name: "iShares Edge MSCI World Value Factor UCITS ETF USD Acc",
    shortName: "iShares World Value Factor",
    isin: "IE00BP3QZB59",
    ticker: "IS3S.DE", // Xetra — mejor cobertura histórica que LSE
    ter: 0.3,
    category: "RV Global",
    type: "index",
    currency: "USD",
    terSource: "curated",
  },
  {
    id: "pablo-amundi-stoxx-europe-600",
    name: "Amundi Stoxx Europe 600 UCITS ETF C EUR",
    shortName: "Amundi Stoxx Europe 600",
    isin: "LU0908500753",
    ticker: "MEUD.PA",
    ter: 0.07,
    category: "RV Europa",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "pablo-amundi-msci-em-acc",
    name: "Amundi Index Solutions - Amundi Index MSCI Emerging Markets",
    shortName: "Amundi Index MSCI EM",
    isin: "LU1437017350",
    ticker: "AEME.PA",
    ter: 0.20,
    category: "RV Emergentes",
    type: "index",
    currency: "USD",
    terSource: "curated",
  },
  {
    id: "pablo-ishares-ultrashort-eur",
    name: "iShares € Ultrashort Bond UCITS ETF EUR Acc",
    shortName: "iShares EUR Ultrashort",
    isin: "IE000RHYOR04",
    ticker: "ERNX.DE",
    ter: 0.09,
    category: "RF EUR Gov Corto",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "pablo-abante-rf-corto",
    name: "Abante Renta Fija Corto Plazo FI",
    shortName: "Abante RF Corto Plazo",
    isin: "ES0190051039",
    // EUFUND directo. Histórico desde 2002 (24 años) — sustituye al
    // iShares Ultrashort (sólo desde 2022) para análisis a largo plazo.
    ter: 0.85,
    category: "RF EUR Gov Corto",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "pablo-xtrackers-sp500-eq-weight",
    name: "Xtrackers S&P 500 Equal Weight UCITS ETF 1C",
    shortName: "Xtrackers S&P 500 EW",
    isin: "IE00BLNMYC90",
    ticker: "XDEW.DE",
    ter: 0.20,
    category: "RV EEUU",
    type: "index",
    currency: "USD",
    terSource: "curated",
  },
  {
    id: "pablo-vaneck-world-eq-weight",
    name: "VanEck Sustainable World Equal Weight UCITS ETF",
    shortName: "VanEck World EW",
    isin: "NL0010408704",
    ticker: "TSWE.AS",
    ter: 0.20,
    category: "RV Global",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "pablo-fidelity-bitcoin-etp",
    name: "Fidelity Physical Bitcoin ETP",
    shortName: "Fidelity Bitcoin ETP",
    isin: "XS2434891219",
    ticker: "FBTC.DE",
    ter: 0.75,
    category: "Alternativo",
    type: "index",
    currency: "USD",
    terSource: "estimated",
  },
  // --- Fondos UCITS (.EUFUND) ---
  {
    id: "pablo-fidelity-msci-world",
    name: "Fidelity MSCI World Index P EUR Acc",
    shortName: "Fidelity MSCI World",
    isin: "IE00BYX5NX33",
    // EUFUND directo (sin ticker físico de bolsa)
    ter: 0.12,
    category: "RV Global",
    type: "index",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "pablo-carmignac-securite",
    name: "Carmignac Sécurité A EUR Acc",
    shortName: "Carmignac Sécurité",
    isin: "FR0010149120",
    ter: 1.13,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "pablo-bankinter-capital-1",
    name: "Bankinter Capital 1 FI",
    shortName: "Bankinter Capital 1",
    isin: "ES0113921037",
    ter: 0.76,
    category: "RF EUR Gov Corto",
    type: "active",
    bank: "Bankinter",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "pablo-bh-bonds-lux",
    name: "Buy & Hold Luxembourg B&H Bonds Class 1",
    shortName: "B&H Bonds LUX",
    isin: "LU1988110927",
    ter: 1.05,
    category: "RF Flexible",
    type: "active",
    currency: "USD",
    terSource: "estimated",
  },
  {
    id: "pablo-dnca-alpha-bonds",
    name: "DNCA Invest Alpha Bonds B EUR",
    shortName: "DNCA Alpha Bonds",
    isin: "LU1694789535",
    ter: 1.40,
    category: "RF Flexible",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
];

// -----------------------------------------------------------------------------
// CaixaBank Smart — fondos de la cartera gestionada Smart Money
// 13 fondos UCITS de CaixaBank Asset Management. Cada uno replica un índice
// concreto vía ETFs/futuros + gestión activa marginal. TERs sobre los reales
// publicados por CaixaBank AM (mgmt + dep + extras ≈ ongoing charge).
// -----------------------------------------------------------------------------

const CAIXABANK_SMART_FUNDS: Fund[] = [
  // --- Renta Variable ---
  {
    id: "caixa-smart-rv-usa",
    name: "CaixaBank Smart Renta Variable USA, FI",
    shortName: "CaixaBank Smart RV USA",
    isin: "ES0115663009",
    ter: 0.40,
    category: "RV EEUU",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "caixa-smart-rv-europa",
    name: "CaixaBank Smart Renta Variable Europa, FI",
    shortName: "CaixaBank Smart RV Europa",
    isin: "ES0137509008",
    ter: 0.36,
    category: "RV Europa",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "caixa-smart-rv-emergente",
    name: "CaixaBank Smart Renta Variable Emergente, FI",
    shortName: "CaixaBank Smart RV Emergente",
    isin: "ES0137657005",
    ter: 0.61,
    category: "RV Emergentes",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "caixa-smart-rv-japon",
    name: "CaixaBank Smart Renta Variable Japón, FI",
    shortName: "CaixaBank Smart RV Japón",
    isin: "ES0180966006",
    ter: 0.36,
    category: "RV Japón",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "caixa-smart-rv-real-estate",
    name: "CaixaBank Smart Renta Variable Real Estate, FI",
    shortName: "CaixaBank Smart RV Real Estate",
    isin: "ES0137510006",
    ter: 0.22,
    category: "RV REITs",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  // --- Renta Fija ---
  {
    id: "caixa-smart-rf-deuda-1-3",
    name: "CaixaBank Smart Renta Fija Deuda Pública 1-3, FI",
    shortName: "CaixaBank Smart RF Deuda 1-3",
    isin: "ES0180967004",
    ter: 0.22,
    category: "RF EUR Gov Corto",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "caixa-smart-rf-privada",
    name: "CaixaBank Smart Renta Fija Privada, FI",
    shortName: "CaixaBank Smart RF Privada",
    isin: "ES0170741005",
    ter: 0.45,
    category: "RF EUR Corp",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "caixa-smart-rf-corto-plazo",
    name: "CaixaBank Smart Renta Fija Corto Plazo, FI",
    shortName: "CaixaBank Smart RF Corto Plazo",
    isin: "ES0137609006",
    ter: 0.13,
    category: "RF EUR Gov Corto",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "caixa-smart-rf-deuda-7-10",
    name: "CaixaBank Smart Renta Fija Deuda Pública 7-10, FI",
    shortName: "CaixaBank Smart RF Deuda 7-10",
    isin: "ES0137627008",
    ter: 0.22,
    category: "RF EUR Gov Largo",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "caixa-smart-rf-internacional",
    name: "CaixaBank Smart Renta Fija Internacional, FI",
    shortName: "CaixaBank Smart RF Internacional",
    isin: "ES0115654008",
    ter: 0.40,
    category: "RF Flexible",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "caixa-smart-rf-high-yield",
    name: "CaixaBank Smart Renta Fija High Yield, FI",
    shortName: "CaixaBank Smart RF High Yield",
    isin: "ES0137414001",
    ter: 0.22,
    category: "RF EUR Corp",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "caixa-smart-rf-inflacion",
    name: "CaixaBank Smart Renta Fija Inflación, FI",
    shortName: "CaixaBank Smart RF Inflación",
    isin: "ES0115653000",
    ter: 0.36,
    category: "RF Inflation EUR",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "caixa-smart-rf-emergente",
    name: "CaixaBank Smart Renta Fija Emergente, FI",
    shortName: "CaixaBank Smart RF Emergente",
    isin: "ES0137475002",
    ter: 0.40,
    category: "RF Flexible",
    type: "index",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "estimated",
  },
];

// -----------------------------------------------------------------------------
// Cartera Pablo Castro — 14 holdings líquidos extraídos del Excel look-through
// (excluyendo Unit Linked, Smart Money, Plan Pensiones, Private Equity).
// Mezcla ETFs UCITS + acciones españolas individuales + fondos UCITS activos.
// -----------------------------------------------------------------------------

const PABLO_CASTRO_FUNDS: Fund[] = [
  // --- ETFs e instrumentos cotizados ---
  {
    id: "spdr-msci-acwi-imi",
    name: "SPDR MSCI ACWI IMI UCITS ETF",
    shortName: "SPDR MSCI ACWI IMI",
    isin: "IE00B3YLTY66",
    ticker: "SPYI.DE", // Xetra
    ter: 0.17,
    category: "RV Global",
    type: "index",
    currency: "USD",
    terSource: "curated",
  },
  {
    id: "xbt-bitcoin-tracker-eur",
    name: "Bitcoin Tracker EUR XBT Provider",
    shortName: "Bitcoin Tracker EUR (XBT)",
    isin: "SE0007525332",
    ticker: "BITCOIN-XBTE.ST",
    ter: 0.95,
    category: "Alternativo",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  // --- Acciones españolas individuales (sin TER) ---
  {
    id: "stock-colonial",
    name: "Inmobiliaria Colonial SOCIMI SA",
    shortName: "Colonial",
    isin: "ES0139140174",
    ticker: "COL.MC",
    ter: 0,
    category: "RV REITs",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "stock-iberdrola",
    name: "Iberdrola S.A.",
    shortName: "Iberdrola",
    isin: "ES0144580Y14",
    ticker: "IBE.MC",
    ter: 0,
    category: "RV España",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "stock-repsol",
    name: "Repsol S.A.",
    shortName: "Repsol",
    isin: "ES0173516115",
    ticker: "REP.MC",
    ter: 0,
    category: "RV España",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "stock-viscofan",
    name: "Viscofan S.A.",
    shortName: "Viscofan",
    isin: "ES0184262212",
    ticker: "VIS.MC",
    ter: 0,
    category: "RV España",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "stock-merlin",
    name: "Merlin Properties SOCIMI SA",
    shortName: "Merlin Properties",
    isin: "ES0105025003",
    ticker: "MRL.MC",
    ter: 0,
    category: "RV REITs",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  // --- Fondos UCITS activos (.EUFUND) ---
  {
    id: "fidelity-global-technology",
    name: "Fidelity Global Technology A-EUR",
    shortName: "Fidelity Global Technology",
    isin: "LU0099574567",
    ter: 1.02,
    category: "RV Sectorial",
    type: "active",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "mss-global-brands-zh",
    name: "Morgan Stanley Global Brands Z Hedged",
    shortName: "MSS Global Brands Zh",
    isin: "LU0360483019",
    ter: 1.65,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "bestinfond-fi",
    name: "Bestinfond FI",
    shortName: "Bestinfond",
    isin: "ES0114673033",
    ter: 1.80,
    category: "RV Global",
    type: "active",
    bank: "Bestinver",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "capital-group-new-perspective-bh-eur",
    name: "Capital Group New Perspective Fund (LUX) Bh-EUR",
    shortName: "Capital Group New Perspective",
    isin: "LU1295552621",
    ter: 1.40,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "dws-invest-top-dividend-ld",
    name: "DWS Invest Top Dividend LD",
    shortName: "DWS Top Dividend",
    isin: "LU0507266061",
    ter: 1.50,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "pictet-smartcity-p-eur",
    name: "Pictet - SmartCity P EUR",
    shortName: "Pictet SmartCity",
    isin: "LU0503634221",
    ter: 1.97,
    category: "RV Sectorial",
    type: "active",
    currency: "EUR",
    terSource: "curated",
  },
  // --- Proxy: Plan de Pensiones CaixaBank RV Internacional ---
  // El cliente tiene un PP CaixaBank RV Internacional que en su composición
  // efectiva es prácticamente S&P 500 en euros. Lo modelamos como SXR8 (mismo
  // ISIN/ticker que iShares Core S&P 500) pero con TER 1.5% para reflejar
  // los costes reales del envoltorio de plan de pensiones. El FUNDS_BY_ISIN
  // map prioriza la entrada original `vanguard-sp500` (TER 0.07%) cuando se
  // busca por ISIN externamente, así que no contamina el lookup principal.
  {
    id: "pablo-castro-pp-cabk-rv-internacional",
    name: "Plan Pensiones CaixaBank RV Internacional (proxy S&P 500)",
    shortName: "PP CaixaBank RV Intl",
    isin: "IE00B5BMR087",
    ticker: "SXR8.DE",
    ter: 1.5,
    category: "RV EEUU",
    type: "active",
    bank: "CaixaBank",
    currency: "EUR",
    terSource: "estimated",
  },
];

// -----------------------------------------------------------------------------
// Cartera PINAES — fondos indexados UCITS (clases Investor/P, EUR Acc).
// Todos sin ticker: el data-fetcher los resuelve vía {ISIN}.EUFUND en EODHD
// (disponibilidad verificada 2026-06: ver fechas de inicio en cada entrada).
// TERs de las clases retail según folletos (curated).
// -----------------------------------------------------------------------------

const PINAES_FUNDS: Fund[] = [
  {
    id: "fidelity-sp500-index-p-eur",
    name: "Fidelity S&P 500 Index Fund P-ACC-EUR",
    shortName: "Fidelity S&P 500 Idx",
    isin: "IE00BYX5MX67", // EUFUND desde 2018-03
    ter: 0.06,
    category: "RV EEUU",
    type: "index",
    currency: "EUR",
    terSource: "curated",
    terConfirmed: true,
  },
  {
    id: "vanguard-european-stock-inv",
    name: "Vanguard European Stock Index Fund Investor EUR Acc",
    shortName: "Vanguard Europa Idx",
    isin: "IE0007987690", // EUFUND desde 1999-10
    ter: 0.12,
    category: "RV Europa",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "vanguard-japan-stock-inv",
    name: "Vanguard Japan Stock Index Fund Investor EUR Acc",
    shortName: "Vanguard Japón Idx",
    isin: "IE0007281425", // EUFUND desde 2008-08
    ter: 0.16,
    category: "RV Japón",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "vanguard-pacific-exjapan-inv",
    name: "Vanguard Pacific ex-Japan Stock Index Fund EUR Acc",
    shortName: "Vanguard Pacífico exJP",
    isin: "IE0007201266", // EUFUND desde 2014-02
    ter: 0.16,
    category: "RV Global",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "vanguard-em-stock-inv",
    name: "Vanguard Emerging Markets Stock Index Fund Investor EUR Acc",
    shortName: "Vanguard Emergentes Idx",
    isin: "IE0031786696", // EUFUND desde 2014-02
    ter: 0.23,
    category: "RV Emergentes",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "vanguard-20y-euro-treasury",
    name: "Vanguard 20+ Year Euro Treasury Index Fund EUR Acc",
    shortName: "Vanguard Treasury 20+y",
    isin: "IE00B246KL88", // EUFUND desde 2007-08
    ter: 0.12,
    category: "RF EUR Gov Largo",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "vanguard-us-gov-bond-inv-hedged",
    name: "Vanguard US Government Bond Index Fund Investor EUR Hedged Acc",
    shortName: "Vanguard US Gov Hdg Inv",
    isin: "IE0007471471", // EUFUND desde 2016-03 (clase Investor; la institucional IE00BF6T7R10 ya existe aparte)
    ter: 0.12,
    category: "RF USD Gov",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "vanguard-global-short-term-bond-eurh",
    name: "Vanguard Global Short-Term Bond Index Fund Investor EUR Hedged Acc",
    shortName: "Vanguard Global ST Bond",
    isin: "IE00BH65QK91", // EUFUND desde 2014-03
    ter: 0.15,
    category: "RF EUR Gov Corto",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "vanguard-eurozone-inflation-linked",
    name: "Vanguard Eurozone Inflation-Linked Bond Index Fund EUR Acc",
    shortName: "Vanguard TIPS EUR",
    isin: "IE00B04GQQ17", // EUFUND desde 2009-04
    ter: 0.12,
    category: "RF Inflation EUR",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "vanguard-em-bond-eurh",
    name: "Vanguard Emerging Markets Bond Fund Investor EUR Hedged Accumulation",
    shortName: "Vanguard EM Bond Hdg",
    isin: "IE00BKLWXS37", // EUFUND desde 2019-12 — es el fondo que limita el histórico común de la cartera
    ter: 0.31,
    category: "RF Flexible",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
];

// -----------------------------------------------------------------------------
// Cartera JL — fondos de la cartera real de un cliente (banca privada, mezcla
// de fondos indexados y de gestión activa). Datos vía EODHD .EUFUND.
// TER estimados (informativos: el motor NO los descuenta del NAV, que ya viene
// neto). El fondo Pictet EUR Short Term (LU0954602677) ya existe en la BD y se
// reutiliza en el preset (id "bbvac-pictet-eur-short-term").
// OJO histórico: dos clases RV son de creación muy reciente — FTGF Putnam
// (IE0009DMFOP6) desde 2026-03 y Neuberger Small Cap (IE000EVIOG79) desde
// 2026-01 — así que el "rango común" queda limitado a 2026. El resto tiene
// histórico largo (M&G y YIS desde 2008).
// -----------------------------------------------------------------------------

const JL_FUNDS: Fund[] = [
  {
    id: "jl-ftgf-putnam-us-lcg",
    name: "FTGF Putnam US Large Cap Growth Fund",
    shortName: "FTGF Putnam US LCG",
    isin: "IE0009DMFOP6",
    ter: 0.85,
    category: "RV EEUU",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-neuberger-smcap-intrinsic",
    name: "Neuberger Berman Small Cap Intrinsic Value",
    shortName: "Neuberger SmCap Val",
    isin: "IE000EVIOG79",
    ter: 1.0,
    category: "RV Small Cap",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-pictet-usa-index-i",
    name: "Pictet USA Index I EUR",
    shortName: "Pictet USA Index",
    isin: "LU0474966081",
    ter: 0.3,
    category: "RV EEUU",
    type: "index",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-pictet-usa-index-hi",
    name: "Pictet USA Index HI EUR (Hedged)",
    shortName: "Pictet USA Idx Hdg",
    isin: "LU0592905094",
    ter: 0.3,
    category: "RV EEUU",
    type: "index",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-ab-select-us-equity-s1",
    name: "AB SICAV I - Select US Equity Portfolio S1 EUR",
    shortName: "AB Select US Equity",
    isin: "LU0683601701",
    ter: 0.65,
    category: "RV EEUU",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-amundi-msci-em-iec",
    name: "Amundi Index MSCI Emerging Markets IE-C",
    shortName: "Amundi MSCI EM Idx",
    isin: "LU0996175948",
    ter: 0.45,
    category: "RV Emergentes",
    type: "index",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-dnb-technology-a",
    name: "DNB Fund Technology A",
    shortName: "DNB Technology",
    isin: "LU1047850778",
    ter: 1.3,
    category: "RV Sectorial",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-eleva-european-selection-r",
    name: "Eleva UCITS - Eleva European Selection R EUR",
    shortName: "Eleva European Sel",
    isin: "LU1111643711",
    ter: 1.75,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-mg-lux-euro-strategic-value",
    name: "M&G (Lux) Euro Strategic Value Fund CI",
    shortName: "M&G Euro Strat Value",
    isin: "LU1797811236",
    ter: 1.0,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-mfs-meridian-contrarian-value",
    name: "MFS Meridian Contrarian Value I1 EUR",
    shortName: "MFS Contrarian Val",
    isin: "LU1985812830",
    ter: 0.95,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-aperture-european-innovation",
    name: "Aperture - European Innovation IEUR A",
    shortName: "Aperture Euro Innov",
    isin: "LU2077747074",
    ter: 1.4,
    category: "RV Europa",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-invesco-em-equity-z",
    name: "Invesco Emerging Markets Equity Z EUR Acc",
    shortName: "Invesco EM Equity",
    isin: "LU2658256644",
    ter: 1.0,
    category: "RV Emergentes",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-rco-conviction-credit-euro-p",
    name: "R-co Conviction Credit Euro P EUR",
    shortName: "R-co Credit Euro",
    isin: "FR0011839901",
    ter: 0.65,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-axa-court-terme-v",
    name: "AXA Court Terme V (monetario)",
    shortName: "AXA Court Terme",
    isin: "FR001400NUH5",
    ter: 0.15,
    category: "RF EUR Gov Corto",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-pimco-low-dur-glb-ig-credit",
    name: "PIMCO GIS Low Duration Global IG Credit Inst EUR Hgd Acc",
    shortName: "PIMCO Low Dur Glb IG",
    isin: "IE00BJTCNZ54",
    ter: 0.49,
    category: "RF Flexible",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-muzinich-enhanced-yield-st",
    name: "Muzinich Enhancedyield Short-Term HAH EUR",
    shortName: "Muzinich Enh Yld ST",
    isin: "IE00BYXHR262",
    ter: 0.85,
    category: "RF Flexible",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-yis-3-5-emu-govt-bond-z",
    name: "YIS 3-5 EMU Government Bond Z EUR",
    shortName: "YIS 3-5y EMU Gov",
    isin: "LU0335987698",
    ter: 0.2,
    category: "RF EUR Gov Medio",
    type: "index",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-morgan-stanley-euro-corp-z",
    name: "Morgan Stanley INVF Euro Corporate Bond Z",
    shortName: "MS Euro Corp Bond",
    isin: "LU0360483100",
    ter: 0.55,
    category: "RF EUR Corp",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
  {
    id: "jl-dnca-invest-alpha-bonds",
    name: "DNCA Invest Alpha Bonds I EUR",
    shortName: "DNCA Alpha Bonds",
    isin: "LU1694789378",
    ter: 0.85,
    category: "RF Flexible",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },

  // --- Clases alternativas de histórico largo (para el preset "_Hist") ---
  // El usuario decidió ELIMINAR Putnam y Neuberger de la variante histórica
  // (no quería ni el proxy ClearBridge ni la clase USD del small cap), y usar
  // estas dos clases largas para Invesco y AXA:
  {
    // MISMO fondo Invesco Emerging Markets Equity, clase USD elegida por el
    // usuario (LU1775953141, desde 1999). El motor NO convierte divisa, así que
    // los retornos van en USD (sin el efecto EUR/USD).
    id: "jl-invesco-em-equity-usd",
    name: "Invesco Emerging Markets Equity USD (clase histórica 1999)",
    shortName: "Invesco EM Eq USD",
    isin: "LU1775953141",
    ter: 1.0,
    category: "RV Emergentes",
    type: "active",
    currency: "USD",
    terSource: "estimated",
  },
  {
    // Fondo monetario AXA Trésor Court Terme, clase C (EUR, desde 1995),
    // elegido por el usuario.
    id: "jl-axa-tresor-court-terme-c",
    name: "AXA Trésor Court Terme C (monetario, clase histórica 1995)",
    shortName: "AXA Trésor CT C",
    isin: "FR0000447823",
    ter: 0.15,
    category: "RF EUR Gov Corto",
    type: "active",
    currency: "EUR",
    terSource: "estimated",
  },
];

// -----------------------------------------------------------------------------
// Cartera RF (Ruben Fraile) — fondos reales de una cartera de activos reales /
// cobertura: oro físico (48%), bitcoin (23%), gestión activa value (Cobas,
// Azvalor, Kopernik), recursos naturales (Goehring), absolute return
// (Argonaut), enduring assets (Wellington), plata y China A. Símbolos EODHD
// verificados 2026-06 (rangos coinciden con la cartera del cliente):
//  · Fondos UCITS sin ticker → resuelven por ISIN.EUFUND.
//  · Goehring (US mutual fund) → ticker GRHIX (.US).
//  · Silver → SSLV.LSE (USD; única clase con histórico desde 2011, como en la
//    cartera del cliente. El motor NO convierte FX, pero pesa solo 1%).
//  · China A → 36BZ.F (Frankfurt EUR, desde 2015-04).
// -----------------------------------------------------------------------------
const RF_FUNDS: Fund[] = [
  {
    id: "rf-argonaut-absolute-return",
    name: "VT Argonaut Absolute Return A Acc EUR",
    shortName: "Argonaut Abs Return",
    isin: "GB00B7K37282", // EUFUND desde 2012-07
    ter: 1.6,
    category: "Alternativo",
    type: "active",
    currency: "EUR",
    terSource: "user",
  },
  {
    id: "rf-kopernik-global-allcap",
    name: "Heptagon Fund ICAV – Kopernik Global All-Cap Equity AE EUR Acc",
    shortName: "Kopernik Global",
    isin: "IE00BH6XSF26", // EUFUND desde 2017-11
    ter: 1.6,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "user",
  },
  {
    id: "rf-cobas-seleccion",
    name: "Cobas Lux SICAV – Cobas Selection Fund",
    shortName: "Cobas Selección",
    isin: "LU1372006947", // EUFUND desde 2016-03
    ter: 1.59,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "user",
  },
  {
    id: "rf-goehring-rozencwajg-resources",
    name: "Goehring & Rozencwajg Resources Fund Retail Class",
    shortName: "G&R Resources",
    isin: "US38035R1095",
    ticker: "GRHIX", // US mutual fund → GRHIX.US, desde 2016-12
    ter: 1.55,
    category: "RV Sectorial",
    type: "active",
    currency: "USD",
    terSource: "user",
  },
  {
    id: "rf-wellington-enduring-assets",
    name: "Wellington Enduring Assets Fund EUR G Acc",
    shortName: "Wellington Enduring",
    isin: "IE00B906ZW71", // EUFUND desde 2013-05
    ter: 1.69,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "user",
  },
  {
    id: "rf-invesco-silver",
    name: "Invesco Physical Silver ETC",
    shortName: "Invesco Silver",
    isin: "IE00B43VDT70",
    ticker: "SSLV.LSE", // USD, histórico desde 2011-04 (clase con histórico largo)
    ter: 0.19,
    category: "Alternativo",
    type: "index",
    currency: "USD",
    terSource: "curated",
  },
  {
    id: "rf-ishares-china-a",
    name: "iShares MSCI China A UCITS ETF USD Acc",
    shortName: "iShares China A",
    isin: "IE00BQT3WG13",
    ticker: "36BZ.F", // Frankfurt (EUR) — datos desde 2015-04
    ter: 0.4,
    category: "RV Emergentes",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "rf-azvalor-internacional",
    name: "Azvalor Internacional FI",
    shortName: "Azvalor Internacional",
    isin: "ES0112611001", // EUFUND desde 2015-10
    ter: 1.59,
    category: "RV Global",
    type: "active",
    currency: "EUR",
    terSource: "user",
  },
];

// -----------------------------------------------------------------------------
// Carteras LNE (Luis Navarro Estrada) — fondos de RF que faltaban para sus
// dos carteras (geográfica de fondos + sectorial de ETFs). El resto de
// posiciones ya existían en la BD. Símbolos EODHD verificados 2026-06.
// -----------------------------------------------------------------------------
const LNE_FUNDS: Fund[] = [
  {
    id: "lne-vanguard-euro-gov-bond",
    name: "Vanguard Euro Government Bond Index Fund EUR Acc",
    shortName: "Vanguard Euro Gov Bond",
    isin: "IE0007472990", // EUFUND desde 2000-09
    ter: 0.12,
    category: "RF EUR Gov",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "lne-xtrackers-global-gov-hedged",
    name: "Xtrackers II Global Government Bond UCITS ETF 1C",
    shortName: "Xtrackers Global Gov",
    isin: "LU0378818131",
    ticker: "DBZB.XETRA", // datos desde 2009-01
    ter: 0.2,
    category: "RF EUR Gov",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "lne-vanguard-eur-corp-etf",
    name: "Vanguard EUR Corporate Bond UCITS ETF",
    shortName: "Vanguard EUR Corp",
    isin: "IE00BGYWT403",
    ticker: "VECA.XETRA", // datos desde 2019-02
    ter: 0.09,
    category: "RF EUR Corp",
    type: "index",
    currency: "EUR",
    terSource: "curated",
  },
  {
    id: "lne-ishares-eur-hy-esg",
    name: "iShares € High Yield Corp Bond ESG UCITS ETF",
    shortName: "iShares EUR HY ESG",
    isin: "IE00BJK55C48",
    ticker: "EHYA.AS", // datos desde 2019-11
    ter: 0.45,
    category: "RF EUR Corp",
    type: "index",
    currency: "EUR",
    terSource: "curated",
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
  ...BBVA_CAPITAL_FUNDS,
  ...BBVA_INVERSION_RV_FUNDS,
  ...BBVA_ACUMULACION_FUNDS,
  ...PABLO_FUNDS,
  ...CAIXABANK_SMART_FUNDS,
  ...PABLO_CASTRO_FUNDS,
  ...PINAES_FUNDS,
  ...JL_FUNDS,
  ...RF_FUNDS,
  ...LNE_FUNDS,
];

// Mapa para búsqueda rápida por ID
const FUNDS_BY_ID = new Map<string, Fund>(
  ALL_FUNDS.map((fund) => [fund.id, fund])
);

// Mapa para búsqueda rápida por ISIN
// Lookup por ISIN — si dos fondos comparten el mismo ISIN (e.g. un proxy
// sintético con TER distinto al original), el PRIMERO en el array gana.
// El orden de ALL_FUNDS coloca INDEXED_FUNDS al principio, así que los
// fondos curados "fiables" (terConfirmed=true) prevalecen sobre proxies
// con el mismo ISIN añadidos posteriormente.
const FUNDS_BY_ISIN = new Map<string, Fund>();
for (const fund of ALL_FUNDS) {
  if (!FUNDS_BY_ISIN.has(fund.isin)) {
    FUNDS_BY_ISIN.set(fund.isin, fund);
  }
}

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
