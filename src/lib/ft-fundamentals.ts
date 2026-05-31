// =============================================================================
// FT.COM FUNDAMENTALS — Fallback de composición para UCITS europeos
// =============================================================================
//
// EODHD oficialmente no tiene fundamentals para fondos mutuos europeos UCITS
// (`.EUFUND`): /api/fundamentals devuelve {} y los filtros devuelven "NA"
// para todos los fondos que probamos. Su `/bulk-fundamentals` requiere un
// add-on adicional que devuelve 403.
//
// Como alternativa, Financial Times publica las tablas de composición de
// estos fondos en `markets.ft.com/data/funds/tearsheet/holdings?s={ISIN}`.
// Las páginas son HTML público, sin auth ni WAF, y contienen 5 tablas:
//
//   Table 0: Asset allocation (Non-UK stock 77.84%, UK stock 21.88%, …)
//   Table 1: Sectores (Financial Services 23.10%, Industrials 19.76%, …)
//   Table 2: Regiones + países (Americas 1.78%, US 1.71%, Greater Europe 97.39%, …)
//   Table 3: Resumen "Top 10 holdings as a per cent of portfolio"
//   Table 4: Top 10 holdings con company name + ticker + portfolio weight
//
// Este módulo descarga la página, extrae cada tabla con regex y devuelve un
// `FundComposition` compatible con el resto del pipeline de K-Ray.
//
// Limitaciones aceptadas:
//   - Scraping: si FT cambia el HTML, dejará de funcionar hasta actualizar.
//   - Tiempo de respuesta: ~500-1500ms por fondo (vs ~100ms de EODHD).
//   - Sólo top 10 holdings (FT no expone más en la tearsheet pública).
//   - Cache agresiva (24h TTL) porque la composición cambia mensual.
// =============================================================================

import type { FundComposition, FundHolding } from "./eodhd-fundamentals";

const FT_BASE_URL = "https://markets.ft.com/data/funds/tearsheet/holdings";

// Cache en memoria (TTL 24h — la composición de fondos cambia mensual).
const memCache = new Map<string, { data: FundComposition; ts: number }>();
const MEM_TTL_MS = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// Tipos auxiliares
// -----------------------------------------------------------------------------

interface ParsedTable {
  rows: string[][];
}

// -----------------------------------------------------------------------------
// Parsing helpers
// -----------------------------------------------------------------------------

/** Extrae todas las tablas <table>…</table> del HTML y devuelve sus filas
 *  troceadas como matriz de celdas en texto plano. */
function parseTables(html: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1]!;
    const rows: string[][] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1]!;
      const cells: string[] = [];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const cellHtml = cellMatch[1]!;
        // Limpiar tags HTML internos y espacios redundantes
        const text = cellHtml
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim();
        cells.push(text);
      }
      if (cells.length > 0) rows.push(cells);
    }
    tables.push({ rows });
  }
  return tables;
}

/** Parsea un porcentaje en formato string ("23.10%", "1.78%", "+12.5%").
 *  Devuelve NaN si no es válido. */
function parsePct(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[%+,\s]/g, "").trim();
  return parseFloat(cleaned);
}

// -----------------------------------------------------------------------------
// Lógica de extracción
// -----------------------------------------------------------------------------

/** Las 3 "super-regiones" que FT usa como agrupador a alto nivel. El resto de
 *  filas en la tabla de regions son países / sub-regiones. Para K-Ray
 *  asignamos las super-regiones a `worldRegions` y los países a
 *  `countryWeights` para evitar doble-conteo. */
const FT_SUPER_REGIONS = new Set([
  "Americas",
  "Greater Asia",
  "Greater Europe",
]);

/** Nombres de sectores que FT usa. Detectamos qué tabla es de sectores vs
 *  regiones mirando si la primera fila no-header coincide con alguno. */
const FT_SECTOR_NAMES = new Set([
  "Financial Services",
  "Industrials",
  "Healthcare",
  "Technology",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Communication Services",
  "Energy",
  "Utilities",
  "Basic Materials",
  "Real Estate",
  "Other",
]);

/** Devuelve la primera fila de datos (no header) de la tabla. */
function firstDataRow(t: ParsedTable): string[] | undefined {
  for (const row of t.rows) {
    if (row.length < 2) continue;
    const label = row[0];
    if (!label) continue;
    // Saltar headers obvios
    if (
      label === "Type" ||
      label === "Sector" ||
      label === "Company" ||
      label === "% Net assets"
    )
      continue;
    return row;
  }
  return undefined;
}

/** Clasifica una tabla según el contenido de su primera fila de datos. */
function classifyTable(
  t: ParsedTable
): "assetAllocation" | "sectors" | "regions" | "topHoldings" | "unknown" {
  const head = firstDataRow(t);
  if (!head || !head[0]) return "unknown";
  const label = head[0];

  // Asset allocation: tipos como "Non-UK stock", "UK bond", "Cash"
  if (
    /\bstock\b/i.test(label) ||
    /\bbond\b/i.test(label) ||
    label === "Cash" ||
    label === "Other"
  ) {
    // Distinguimos de top10 detail (que también puede empezar por nombre raro)
    // por número de columnas: asset allocation tiene 4 cols (Type/Net/Short/Long).
    if (head.length === 4) return "assetAllocation";
  }
  // Sectors
  if (FT_SECTOR_NAMES.has(label)) return "sectors";
  // Regions / countries (super-regions)
  if (FT_SUPER_REGIONS.has(label)) return "regions";
  if (
    label === "United States" ||
    label === "Canada" ||
    label === "Eurozone" ||
    label === "United Kingdom" ||
    label === "Japan"
  )
    return "regions";

  // Top holdings: el label suele tener un company name. Si la tabla tiene
  // filas con porcentajes < 20 % y nombres, asumimos top holdings.
  // Heurística: si head[2] o head[1] contiene "%" y head[0] es un texto largo
  // que no coincide con ninguna categoría conocida.
  const w2 = head[2] ? parsePct(head[2]) : NaN;
  const w1 = parsePct(head[1]);
  if (!isNaN(w2) || !isNaN(w1)) {
    return "topHoldings";
  }
  return "unknown";
}

function extractAssetAllocation(table: ParsedTable | undefined): Record<string, number> {
  const result: Record<string, number> = {};
  if (!table) return result;
  for (const row of table.rows) {
    if (row.length < 2) continue;
    const type = row[0];
    if (!type || type === "Type" || type === "% Net assets") continue;
    const pct = parsePct(row[1]);
    if (!isNaN(pct) && pct !== 0) result[type] = pct;
  }
  return result;
}

function extractSimpleWeights(
  table: ParsedTable | undefined
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!table) return result;
  for (const row of table.rows) {
    if (row.length < 2) continue;
    const name = row[0];
    if (!name || name === "Sector" || name === "% Net assets" || name === "--") continue;
    const pct = parsePct(row[1]);
    if (!isNaN(pct) && pct !== 0) result[name] = pct;
  }
  return result;
}

function splitRegions(
  flat: Record<string, number>
): { worldRegions: Record<string, number>; countryWeights: Record<string, number> } {
  const worldRegions: Record<string, number> = {};
  const countryWeights: Record<string, number> = {};
  for (const [name, pct] of Object.entries(flat)) {
    if (FT_SUPER_REGIONS.has(name)) worldRegions[name] = pct;
    else countryWeights[name] = pct;
  }
  return { worldRegions, countryWeights };
}

function extractTopHoldings(table: ParsedTable | undefined): FundHolding[] {
  // Filas como "ASML Holding NVASML:AEX | +108.08% | 3.98% | "
  // o para bonos sin ticker: "Adler Financing S.a r.l. | -- | 1.12% | "
  // El portfolio weight suele ser la columna 2 (si hay 4 cols) o la 1 (si hay 3).
  if (!table) return [];
  const result: FundHolding[] = [];
  for (const row of table.rows) {
    if (row.length < 2) continue;
    const nameWithTicker = row[0];
    if (!nameWithTicker) continue;
    if (nameWithTicker === "Company") continue;
    if (nameWithTicker.toLowerCase().includes("per cent")) continue;
    if (nameWithTicker.toLowerCase().includes("category average")) continue;
    if (nameWithTicker === "--") continue;

    // Buscar el porcentaje en columnas 2, luego 1
    let weight = NaN;
    for (const idx of [2, 1, 3]) {
      if (idx >= row.length) continue;
      const cell = row[idx];
      if (!cell || cell === "--") continue;
      const p = parsePct(cell);
      if (!isNaN(p) && p > 0 && p < 50) {
        // < 50 porque ningún holding individual suele ser más; evita
        // capturar cifras como "+108%" del "1 year change"
        weight = p;
        break;
      }
    }
    if (isNaN(weight) || weight <= 0) continue;

    // Separar nombre y ticker tipo "XXX:YYY"
    let name = nameWithTicker;
    let code: string | undefined;
    const tickerMatch = nameWithTicker.match(/([A-Z0-9.]+:[A-Z0-9.]+)$/);
    if (tickerMatch && tickerMatch[1]) {
      code = tickerMatch[1];
      name = nameWithTicker.slice(0, -code.length).trim();
    }

    result.push({ name, code, assetsPercent: weight });
  }
  return result.sort((a, b) => b.assetsPercent - a.assetsPercent);
}

/** Detecta el nombre del fondo desde el `<title>` de la página o un meta tag.
 *  No es crítico — si falla, usamos un nombre genérico. */
function extractFundName(html: string, isin: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const title = titleMatch[1].trim();
    // El title típico es "FUND NAME, ISIN — Holdings | FT.com" — quedarnos
    // con la parte antes de la coma
    const beforeComma = title.split(",")[0]?.trim();
    if (beforeComma) return beforeComma;
    return title;
  }
  return isin;
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

/**
 * Obtiene la composición de un fondo desde FT.com a partir de su ISIN.
 * Devuelve null si la página no se puede descargar o no contiene tablas de
 * holdings (caso típico: ISIN no reconocido por FT, o fondo retirado).
 */
export async function getFundCompositionFromFT(
  isin: string,
  fallbackName?: string
): Promise<FundComposition | null> {
  if (!isin) return null;
  const cacheKey = `ft:${isin}`;
  const cached = memCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MEM_TTL_MS) {
    return cached.data;
  }

  let html: string;
  try {
    const url = `${FT_BASE_URL}?s=${encodeURIComponent(isin)}`;
    const res = await fetch(url, {
      headers: {
        // FT no parece bloquear pero ponemos un UA real por si acaso
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[FT-fundamentals] HTTP ${res.status} para ${isin}`);
      return null;
    }
    html = await res.text();
  } catch (err) {
    console.warn(`[FT-fundamentals] Error fetching ${isin}:`, err);
    return null;
  }

  // Si FT no encuentra el fondo, devuelve la página de búsqueda sin tablas
  // de holdings. Detectamos esto por ausencia del marker "Top 10 holdings".
  if (!html.includes("Top 10 holdings") && !html.includes("top 10 holdings")) {
    console.warn(`[FT-fundamentals] FT no tiene holdings para ${isin}`);
    return null;
  }

  const tables = parseTables(html);
  if (tables.length < 2) {
    console.warn(
      `[FT-fundamentals] HTML de ${isin} no tiene tablas suficientes (${tables.length})`
    );
    return null;
  }

  // Clasificamos cada tabla por contenido. Diferentes fondos pueden tener un
  // número distinto de tablas (bonos suelen omitir el sector breakdown), así
  // que es más robusto que fijar índices.
  let assetAllocTable: ParsedTable | undefined;
  let sectorsTable: ParsedTable | undefined;
  let regionsTable: ParsedTable | undefined;
  let topHoldingsTable: ParsedTable | undefined;

  for (const t of tables) {
    const kind = classifyTable(t);
    if (kind === "assetAllocation" && !assetAllocTable) assetAllocTable = t;
    else if (kind === "sectors" && !sectorsTable) sectorsTable = t;
    else if (kind === "regions" && !regionsTable) regionsTable = t;
    else if (kind === "topHoldings") {
      // Preferimos la tabla con MÁS filas (siempre la última de top holdings
      // suele ser la detail, las anteriores son summary con 1-2 filas).
      if (!topHoldingsTable || t.rows.length > topHoldingsTable.rows.length) {
        topHoldingsTable = t;
      }
    }
  }

  const assetAllocation = extractAssetAllocation(assetAllocTable);
  const sectorWeights = extractSimpleWeights(sectorsTable);
  const regionsFlat = extractSimpleWeights(regionsTable);
  const { worldRegions, countryWeights } = splitRegions(regionsFlat);
  const holdings = extractTopHoldings(topHoldingsTable);

  // Si todas las extracciones están vacías, considerar que falló
  if (
    Object.keys(assetAllocation).length === 0 &&
    Object.keys(sectorWeights).length === 0 &&
    holdings.length === 0
  ) {
    console.warn(`[FT-fundamentals] Sin datos parseables en ${isin}`);
    return null;
  }

  const name = extractFundName(html, isin) || fallbackName || isin;

  const composition: FundComposition = {
    isin,
    name,
    type: "FUND",
    sectorWeights,
    worldRegions,
    countryWeights,
    assetAllocation,
    holdings: holdings.slice(0, 10),
    available: true,
  };

  memCache.set(cacheKey, { data: composition, ts: Date.now() });
  console.log(
    `[FT-fundamentals] Composición obtenida para ${isin}: ${holdings.length} holdings, ${Object.keys(sectorWeights).length} sectors`
  );
  return composition;
}
