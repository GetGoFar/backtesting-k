// =============================================================================
// WHITELIST CAMPUS — universo de instrumentos permitido en el backtester
// embebido en elproyectok.com/campus (modo ?campus=1).
// =============================================================================
//
// Fuente: Excel oficial "Cartera Core El Proyecto K v3" (hojas Fondos indexados
// + ETFs). En modo campus, /api/search y /api/funds SOLO devuelven instrumentos
// cuyo ISIN esté en esta lista, para que el backtester del campus sea un uso
// limitado a los productos de El Proyecto K y no un backtester universal.
//
// El uso PERSONAL de Pablo (acceso directo a la app, sin ?campus=1) NO se ve
// afectado: mantiene la búsqueda completa de cualquier instrumento.
// =============================================================================

const ISINS: string[] = [
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

export const CAMPUS_ISINS: Set<string> = new Set(
  ISINS.map((s) => s.toUpperCase())
);

/** ¿El ISIN está en el universo permitido del campus? */
export function isInCampusWhitelist(isin: string | null | undefined): boolean {
  if (!isin) return false;
  return CAMPUS_ISINS.has(isin.toUpperCase().trim());
}

/** Lee el flag ?campus=1 (o campus=true) de los searchParams de una request. */
export function isCampusRequest(searchParams: URLSearchParams): boolean {
  const v = searchParams.get("campus");
  return v === "1" || v === "true";
}
