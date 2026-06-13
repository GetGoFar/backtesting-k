// =============================================================================
// WHITELIST CAMPUS — universo de instrumentos permitido en el backtester
// embebido en elproyectok.com/campus (modo ?campus=1).
// =============================================================================
//
// En modo campus, /api/search y /api/funds SOLO devuelven instrumentos cuyo
// ISIN (o, en local, cuyo fundId) esté en estas listas. Así el backtester del
// campus se limita a los productos de El Proyecto K y no es un backtester
// universal. El uso PERSONAL de Pablo (acceso directo sin ?campus=1) NO se ve
// afectado: mantiene la búsqueda completa de cualquier instrumento.
//
// El universo es la UNIÓN de tres fuentes (dedup automática vía Set):
//   1. Excel "Cartera Core El Proyecto K v3" (hojas Fondos indexados + ETFs)
//   2. Excel "Carteras K Inbestme" (hoja TER por ETF y Cartera)
//   3. Instrumentos de 6 familias de carteras predefinidas: Indexa, Indexa USA,
//      K Sectorial USA, K Sectorial UCIT (K Inbestme), K Geográfica (UCIT),
//      K Geográfica USA.
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Excel Cartera Core v3 (fondos indexados + ETFs)
// -----------------------------------------------------------------------------
const CORE_V3: string[] = [
  // ---- Fondos indexados ----
  "IE0032126645", // Vanguard U.S. 500 Stock Index
  "IE00BYX5MX64", // Fidelity S&P 500 Index (ISIN corregido; en el Excel venía truncado)
  "IE0007987690", // Vanguard European Stock Index
  "IE00BYX5MD61", // Fidelity MSCI Europe Index
  "IE0007281425", // Vanguard Japan Stock Index
  "IE00BYX5N771", // Fidelity MSCI Japan Index
  "IE0007201266", // Vanguard Pacific ex-Japan Stock Index
  "IE00BYWYCC39", // iShares Emerging Markets Index D Acc
  "IE0031786696", // Vanguard Emerging Markets Stock Index
  "IE000QAZP7L2", // iShares Emerging Markets Index Acc clase S
  "IE00B42W3S00", // Vanguard Global Small-Cap Index
  "IE00B03HD191", // Vanguard Global Stock Index
  "IE00BYX5NX33", // Fidelity MSCI World Index
  "IE000ZYRH0Q7", // iShares Dev Wld Idx S Acc
  "IE000N51F726", // iShares Developed World ESG Screened
  "IE00B246KL88", // Vanguard 20+ Year Euro Treasury
  "IE0007471471", // Vanguard US Government Bond EUR Hedged
  "IE00BH65QK91", // Vanguard Global Short Term Bond EURH
  "IE00B04GQQ17", // Vanguard Eurozone Inflation-Linked Bond
  "IE0007472990", // Vanguard Euro Government Bond Index
  "IE00B4XCK338", // iShares Ultra High Quality Euro Gov Bond
  "IE00BDFB5N63", // Vanguard Global Corporate Bond EUR Hedged
  "IE00BKLWXS37", // Vanguard Emerging Markets Bond EUR Hedged
  "LU1373035580", // iShares Emerging Markets Government Bond
  // ---- ETFs ----
  "IE00BFMXXD54", // Vanguard S&P 500 (VUAA)
  "IE00B4K48X80", // iShares Core MSCI Europe (EUNK)
  "IE00BFMXYX26", // Vanguard FTSE Japan (VJPA)
  "IE00B52MJY50", // iShares Core MSCI Pacific ex Japan (SXR1)
  "IE00BKM4GZ66", // iShares Core MSCI EM IMI (IS3N)
  "IE00BCBJG560", // SPDR MSCI World Small Cap (ZPRS)
  "IE00B4L5Y983", // iShares Core MSCI World (EUNL)
  "IE00BFY0GT14", // SPDR MSCI World (SPPW)
  "IE00B44Z5B48", // SPDR MSCI ACWI (SPYY)
  "IE00B6R52259", // iShares MSCI ACWI (IUSQ)
  "IE00BM67HN09", // Xtrackers MSCI World Consumer Staples (XDWS)
  "IE00BM67HK77", // Xtrackers MSCI World Health Care (XDWH)
  "LU0533033238", // Amundi MSCI World Health Care (LYPE)
  "IE00BM67HT60", // Xtrackers MSCI World Information Technology (XDWT)
  "IE00BM67HM91", // Xtrackers MSCI World Energy (XDW0)
  "LU1437018838", // Amundi Index FTSE EPRA NAREIT Global (A4H5)
  "LU0378818131", // Xtrackers II Global Government Bond EUR Hedged (DBZB)
  "LU1686832194", // Amundi Euro Government Bond 25+Y (LMTH)
  "LU1650489385", // Amundi Euro Government Bond 10-15Y (LYQ6)
  "LU1287023185", // Amundi Euro Government Bond 7-10Y (LYXD)
  "LU0290357176", // Xtrackers Eurozone Government Bond 5-7 (X57E)
  "IE00B3VTML14", // iShares Euro Government Bond 3-7yr (SXRP)
  "LU1650488494", // Amundi Euro Government Bond 3-5Y (LYQ3)
  "LU1650487413", // Amundi Euro Government Bond 1-3Y (LYQ2)
  "LU1407888137", // Amundi US Treasury 7-10Y EUR Hedged (7USH)
  "IE00BDFK1573", // iShares USD Treasury 1-3yr EUR Hedged (2B7S)
  "IE00BMX0B631", // Vanguard USD Treasury EUR Hedged (VDTE)
  "IE00BGYWT403", // Vanguard EUR Corporate Bond (VECA)
  "LU0478205379", // Xtrackers II EUR Corporate Bond (D5BG)
  "LU2178481649", // Xtrackers II EUR Corp Bond Short Duration SRI PAB (XZE5)
  "LU1437018168", // Amundi Index Euro Corporate SRI (A4H8)
  "LU1048315243", // UBS Bloomberg US Liquid Corporates 1-5Y EUR Hedged (UEF8)
  "IE00BF3N7094", // iShares EUR High Yield Corporate Bond (SXRI)
  "LU1109943388", // Xtrackers EUR High Yield Corporate Bond (XHYA)
  "IE00BJK55C48", // iShares EUR High Yield Corporate Bond ESG (AYE2)
  "IE00BDBRDM35", // iShares Core Global Aggregate Bond EUR Hedged (EUNA)
  "IE00BG47KH54", // Vanguard Global Aggregate Bond EUR Hedged (VAGF)
  "IE00B0M62X26", // iShares Euro Inflation Linked Gov Bond (IBCI)
  "LU1650491282", // Amundi Euro Government Inflation-Linked Bond (LYQ7)
  "IE00B579F325", // Invesco Physical Gold (8PSG)
  "IE00B4ND3602", // iShares Physical Gold ETC (PPFB)
];

// -----------------------------------------------------------------------------
// 2. Excel "Carteras K Inbestme" (hoja TER por ETF y Cartera) — 15 ETFs.
//    Varios coinciden con Core v3; los nuevos respecto a Core v3 van marcados.
// -----------------------------------------------------------------------------
const INBESTME_EXCEL: string[] = [
  "IE00BM67HN09", // Xtrackers MSCI World Consumer Staples
  "IE00BM67HQ30", // Xtrackers MSCI World Utilities  (NUEVO vs Core v3)
  "IE00BM67HK77", // Xtrackers MSCI World Health Care
  "IE00BM67HT60", // Xtrackers MSCI World Info Technology
  "IE00BM67HM91", // Xtrackers MSCI World Energy
  "IE000G6GSP88", // HSBC FTSE EPRA NAREIT Developed  (NUEVO)
  "LU1650489385", // Amundi Euro Government Bond 10-15Y
  "LU1287023185", // Amundi Euro Government Bond 7-10Y
  "LU0290357176", // Xtrackers Eurozone Government Bond 5-7
  "IE00BDFK1573", // iShares USD Treasury 1-3yr EUR Hedged
  "LU0290356871", // Xtrackers II Eurozone Government Bond 1-3  (NUEVO)
  "LU2233156582", // Amundi Prime Euro Government Bond 0-1Y  (NUEVO)
  "IE00BGYWT403", // Vanguard EUR Corporate Bond
  "IE00BJK55C48", // iShares EUR High Yield Corporate Bond ESG
  "IE00B4ND3602", // iShares Physical Gold ETC
];

// -----------------------------------------------------------------------------
// 3. Instrumentos de las 6 familias de carteras predefinidas (resueltos
//    fundId -> ISIN contra fund-database.ts y verificados de forma independiente).
//    43 ISINs únicos + el ISIN real de VFINX (ver nota del bug abajo).
// -----------------------------------------------------------------------------
const FAMILIAS: string[] = [
  // UCITS (Indexa / K Geográfica UCIT / K Inbestme — los que no estaban ya arriba)
  "IE00B5BMR087", // iShares Core S&P 500 Acc (fundId vanguard-sp500)
  "LU1681045370", // Amundi MSCI Emerging Markets (amundi-emerging)
  "LU0290355717", // Xtrackers Eurozone Government Bond (vanguard-eur-bond)
  "LU0290358224", // Xtrackers II Eurozone Inflation-Linked (indexa-eur-inflation)
  "IE00BF6T7R10", // Vanguard US Government Bond Index EUR Hedged (indexa-us-gov-hedged)
  "IE00BZ04LQ92", // Vanguard US Investment Grade Bond EUR Hedged (indexa-us-corp-hedged)
  "LU0274209740", // Xtrackers MSCI Japan (indexa-japan)
  "IE00BFRTDD83", // Vanguard Global Small Cap Index EUR Acc (indexa-small-cap)
  "IE00BM67HQ30", // Xtrackers MSCI World Utilities (xtrackers-utilities)
  // Indexa USA (mutual funds / ETFs USD)
  "US78462F1030", // SPDR S&P 500 ETF Trust (SPY)
  "US9220428406", // Vanguard European Stock Investor (VEURX)
  "US9219371078", // Vanguard Total Bond Market Investor (VBMFX)
  "US9220428588", // Vanguard Emerging Markets Stock Investor (VEIEX)
  "US4642868487", // iShares MSCI Japan ETF (EWJ)
  "US9229087682", // Vanguard Small-Cap Index Investor (NAESX)
  // K Sectorial USA (Select Sector SPDR + Vanguard treasuries + gold)
  "US81369Y3080", // Consumer Staples Select Sector SPDR (XLP)
  "US81369Y2090", // Health Care Select Sector SPDR (XLV)
  "US81369Y8030", // Technology Select Sector SPDR (XLK)
  "US81369Y5069", // Energy Select Sector SPDR (XLE)
  "US81369Y8865", // Utilities Select Sector SPDR (XLU)
  "US9229085538", // Vanguard Real Estate Index Investor (VGSIX)
  "US9219085101", // Vanguard Short-Term Treasury Investor (VFISX)
  "US78468R6633", // SPDR Bloomberg 1-3M T-Bill (BIL)
  "US4642872422", // iShares iBoxx $ IG Corporate Bond (LQD)
  "US9219084153", // Vanguard High-Yield Corporate Investor (VWEHX)
  "US9219086208", // Vanguard Intermediate-Term Treasury (VFITX)
  "US9219086547", // Vanguard Long-Term Treasury (VUSTX)
  // K Geográfica USA
  "US9229087286", // Vanguard 500 Index Investor (VFINX) — ISIN REAL correcto
  "US9219091257", // Vanguard Developed Markets Index Admiral (VTMGX)
  // (spot-gold no tiene ISIN real: se permite por fundId, ver CAMPUS_FUND_IDS)
];

export const CAMPUS_ISINS: Set<string> = new Set(
  [...CORE_V3, ...INBESTME_EXCEL, ...FAMILIAS].map((s) => s.toUpperCase())
);

// -----------------------------------------------------------------------------
// Whitelist por fundId — para el catálogo LOCAL (/api/funds). Permite que TODOS
// los instrumentos de las 6 familias aparezcan en el buscador del campus aunque
// su ISIN no sea estándar (p.ej. oro spot XAUUSD.FOREX) o aunque el ISIN del
// catálogo difiera del real. 45 fundIds.
// -----------------------------------------------------------------------------
export const CAMPUS_FUND_IDS: Set<string> = new Set([
  "amundi-emerging", "amundi-gov-0-1y", "amundi-gov-10-15y", "amundi-gov-7-10y",
  "hsbc-reits", "indexa-eur-inflation", "indexa-japan", "indexa-small-cap",
  "indexa-us-corp-hedged", "indexa-us-gov-hedged", "ishares-europe", "ishares-ewj",
  "ishares-gold", "ishares-hy-esg", "ishares-lqd", "ishares-usd-treasury-hedged",
  "spdr-bil", "spdr-spy", "spdr-xle", "spdr-xlk", "spdr-xlp", "spdr-xlu", "spdr-xlv",
  "spot-gold", "vanguard-eur-bond", "vanguard-eur-corp", "vanguard-naesx",
  "vanguard-sp500", "vanguard-vbmfx", "vanguard-veiex", "vanguard-veurx",
  "vanguard-vfinx", "vanguard-vfisx", "vanguard-vfitx", "vanguard-vgsix",
  "vanguard-vtmgx", "vanguard-vustx", "vanguard-vwehx", "xtrackers-energy",
  "xtrackers-gov-1-3y", "xtrackers-gov-5-7y", "xtrackers-healthcare",
  "xtrackers-staples", "xtrackers-technology", "xtrackers-utilities",
]);

/** ¿El ISIN está en el universo permitido del campus? */
export function isInCampusWhitelist(isin: string | null | undefined): boolean {
  if (!isin) return false;
  return CAMPUS_ISINS.has(isin.toUpperCase().trim());
}

/** ¿El fundId del catálogo local está permitido en el campus? */
export function isInCampusFundIds(id: string | null | undefined): boolean {
  if (!id) return false;
  return CAMPUS_FUND_IDS.has(id.trim());
}

/** Lee el flag ?campus=1 (o campus=true) de los searchParams de una request. */
export function isCampusRequest(searchParams: URLSearchParams): boolean {
  const v = searchParams.get("campus");
  return v === "1" || v === "true";
}
