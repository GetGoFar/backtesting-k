// =============================================================================
// EQUIVALENTE ENGINE — Encuentra el ETF indexado más parecido a un fondo activo
// =============================================================================
//
// El objetivo educativo del Proyecto K: demostrar que los fondos activos
// bancarios tienen un equivalente indexado de bajo coste que en 10-20 años
// ahorra decenas de miles de euros en comisiones.
//
// Flujo:
//   1. Usuario selecciona/busca un fondo activo (por nombre, ISIN o banco)
//   2. Localizamos su categoría (RV Global, RF EUR Gov, …) en la BD
//   3. Recomendamos el ETF indexado UCITS de bajo coste de esa categoría
//   4. Calculamos el impacto de comisiones a 10/20 años (TER drag compuesto)
//
// =============================================================================

import { getAllFunds, getFundById } from "./fund-database";
import type { Fund, FundCategory } from "./types";

// -----------------------------------------------------------------------------
// Mapeo categoría → ETF indexado recomendado
// -----------------------------------------------------------------------------
//
// Para cada categoría canónica, el ETF UCITS indexado de menor coste que mejor
// la replica. Todos están ya en nuestra base de datos de fondos indexados.
// Cuando la categoría no tiene un equivalente directo (RV España, RV Sectorial,
// RF Flexible, Alternativo), recomendamos un fallback razonable y mostramos
// una nota explicativa al usuario.

const RECOMMENDED_BY_CATEGORY: Record<FundCategory, string> = {
  "RV Global": "vanguard-global",       // VWCE — FTSE All-World, TER 0.22%
  "RV EEUU": "vanguard-sp500",          // iShares S&P 500 Acc, TER 0.07%
  "RV Europa": "ishares-europe",        // MSCI Europe Acc, TER 0.12%
  "RV España": "ishares-europe",        // proxy (no hay UCITS competitivo de IBEX)
  "RV Emergentes": "amundi-emerging",   // MSCI EM, TER 0.20%
  "RV Japón": "indexa-japan",           // Xtrackers MSCI Japan Acc, TER 0.12%
  "RV Small Cap": "indexa-small-cap",   // Vanguard Global Small Cap, TER 0.29%
  "RV Sectorial": "vanguard-global",    // sin equivalente 1:1 — indexa global
  "RV REITs": "hsbc-reits",             // Amundi FTSE EPRA NAREIT Global, TER 0.24%
  "RF EUR Gov": "ishares-euro-bond",    // iShares Core Euro Govt, TER 0.07%
  "RF EUR Gov Corto": "amundi-gov-0-1y",
  "RF EUR Gov Medio": "xtrackers-gov-5-7y",
  "RF EUR Gov Largo": "amundi-gov-10-15y",
  "RF EUR Corp": "vanguard-eur-corp",   // Xtrackers EUR Corp, TER 0.12%
  "RF EUR": "ishares-euro-bond",        // alias genérico
  "RF Inflation EUR": "indexa-eur-inflation",
  "RF USD Gov": "indexa-us-gov-hedged",
  "RF USD Corp": "indexa-us-corp-hedged",
  "RF Flexible": "vanguard-global",     // sin equivalente directo
  "Oro": "ishares-gold",
  "Alternativo": "vanguard-global",     // sin equivalente directo
};

const FUZZY_NOTES: Partial<Record<FundCategory, string>> = {
  "RV España": "El IBEX 35 no tiene un UCITS indexado de bajo coste verdaderamente competitivo. Recomendamos un ETF MSCI Europe como sustituto razonable; si la exposición a España es clave para ti, un Vanguard FTSE All-World ya incluye empresas españolas como parte de su composición global.",
  "RV Sectorial": "Los fondos sectoriales son por definición una apuesta concentrada. La forma indexada equivalente es comprar un ETF global y dejar la sobreponderación sectorial como decisión consciente. Si quieres mantener el sector, existen ETFs sectoriales indexados de bajo coste (Xtrackers MSCI World Sector UCITS).",
  "RF Flexible": "Los fondos de renta fija flexibles cambian de duración y crédito según las decisiones del gestor. Indexarlo es complejo; lo más prudente es una mezcla 50% RF gobierno Euro + 50% RF corporativa Euro, o aceptar la simplicidad de una cartera indexada y reducir la asignación a RF.",
  "Alternativo": "Los fondos alternativos no tienen un equivalente indexado directo. Para cubrir la parte alternativa de tu cartera, valora una mezcla simple de RV indexada + Oro, ajustando los pesos a tu tolerancia al riesgo.",
};

// -----------------------------------------------------------------------------
// Tipos públicos
// -----------------------------------------------------------------------------

export interface SavingsInput {
  /** Capital inicial invertido en EUR. */
  initialCapital: number;
  /** Aportación mensual en EUR (0 si no hay aportaciones periódicas). */
  monthlyContribution?: number;
  /** Plazo de la inversión en años. */
  years: number;
  /** Rentabilidad bruta anual asumida ANTES de comisiones (%). */
  grossAnnualReturn: number;
  /** TER del fondo activo (%). */
  activeTer: number;
  /** TER del ETF indexado (%). */
  indexedTer: number;
}

export interface YearlySnapshot {
  year: number;
  /** Valor del patrimonio en el fondo activo al cierre del año. */
  activeValue: number;
  /** Valor del patrimonio en el indexado al cierre del año. */
  indexedValue: number;
  /** Comisiones pagadas durante ese año en el fondo activo (EUR). */
  activeFees: number;
  /** Comisiones pagadas durante ese año en el indexado (EUR). */
  indexedFees: number;
}

export interface SavingsResult {
  finalActive: number;
  finalIndexed: number;
  /** Diferencia de patrimonio final = finalIndexed − finalActive. */
  savings: number;
  /** Comisiones totales pagadas al fondo activo durante todo el plazo. */
  totalFeesActive: number;
  /** Comisiones totales pagadas al ETF indexado. */
  totalFeesIndexed: number;
  /** Comisiones ahorradas = totalFeesActive − totalFeesIndexed. */
  feesAvoided: number;
  /** Total aportado (capital inicial + aportaciones). */
  totalContributed: number;
  yearly: YearlySnapshot[];
}

export interface EquivalenceResult {
  activeFund: Fund;
  recommended: Fund;
  /** Nota explicativa si la categoría no tiene equivalente 1:1. */
  note?: string;
  /** Coeficiente de "ahorro relativo" sobre el TER activo, normalizado. */
  terSavingPercentage: number;
}

// -----------------------------------------------------------------------------
// Calculadora del TER drag compuesto
// -----------------------------------------------------------------------------

/**
 * Proyecta el patrimonio final descontando el TER mensualmente (TER/12) sobre
 * el valor del fondo cada mes. Mismo método que el motor de backtesting.
 *
 * No descuenta inflación: las cifras son nominales. El usuario puede ajustar
 * la rentabilidad bruta asumida para razonar en términos reales si quiere.
 */
export function projectSavings(args: SavingsInput): SavingsResult {
  const months = args.years * 12;
  const grossMonthly = Math.pow(1 + args.grossAnnualReturn / 100, 1 / 12) - 1;
  const monthlyContribution = args.monthlyContribution ?? 0;

  let active = args.initialCapital;
  let indexed = args.initialCapital;
  let totalFeesActive = 0;
  let totalFeesIndexed = 0;
  const yearly: YearlySnapshot[] = [];
  let yearStartFeesActive = 0;
  let yearStartFeesIndexed = 0;

  for (let m = 1; m <= months; m++) {
    // 1) Crecimiento bruto del mes
    active *= 1 + grossMonthly;
    indexed *= 1 + grossMonthly;
    // 2) Comisión mensual = TER/12 aplicado sobre el patrimonio actual
    const feeA = active * (args.activeTer / 100 / 12);
    const feeI = indexed * (args.indexedTer / 100 / 12);
    active -= feeA;
    indexed -= feeI;
    totalFeesActive += feeA;
    totalFeesIndexed += feeI;
    // 3) Aportación al final del mes (si la hay)
    if (monthlyContribution > 0) {
      active += monthlyContribution;
      indexed += monthlyContribution;
    }
    // 4) Snapshot anual
    if (m % 12 === 0) {
      yearly.push({
        year: m / 12,
        activeValue: active,
        indexedValue: indexed,
        activeFees: totalFeesActive - yearStartFeesActive,
        indexedFees: totalFeesIndexed - yearStartFeesIndexed,
      });
      yearStartFeesActive = totalFeesActive;
      yearStartFeesIndexed = totalFeesIndexed;
    }
  }

  return {
    finalActive: active,
    finalIndexed: indexed,
    savings: indexed - active,
    totalFeesActive,
    totalFeesIndexed,
    feesAvoided: totalFeesActive - totalFeesIndexed,
    totalContributed: args.initialCapital + monthlyContribution * months,
    yearly,
  };
}

// -----------------------------------------------------------------------------
// Búsqueda de equivalente
// -----------------------------------------------------------------------------

export function findEquivalent(activeFund: Fund): EquivalenceResult | null {
  if (activeFund.type !== "active") return null;
  const recommendedId = RECOMMENDED_BY_CATEGORY[activeFund.category];
  if (!recommendedId) return null;
  const recommended = getFundById(recommendedId);
  if (!recommended) return null;
  const terSaving = activeFund.ter > 0
    ? ((activeFund.ter - recommended.ter) / activeFund.ter) * 100
    : 0;
  return {
    activeFund,
    recommended,
    note: FUZZY_NOTES[activeFund.category],
    terSavingPercentage: terSaving,
  };
}

/** Encuentra equivalente a partir del ID de fondo. */
export function findEquivalentById(fundId: string): EquivalenceResult | null {
  const f = getFundById(fundId);
  if (!f) return null;
  return findEquivalent(f);
}

/** Todos los fondos activos disponibles (para los pickers de la UI). */
export function getActiveFunds(): Fund[] {
  return getAllFunds().filter((f) => f.type === "active");
}

/** Todos los ETFs / fondos indexados disponibles como benchmark. Agrupados
 *  por categoría para mostrarlos como `<optgroup>` en el dropdown. */
export function getAvailableBenchmarks(): Fund[] {
  return getAllFunds()
    .filter((f) => f.type === "index")
    .sort((a, b) => {
      // Primero por categoría, luego por TER ascendente (el más barato primero)
      const catCmp = a.category.localeCompare(b.category);
      if (catCmp !== 0) return catCmp;
      return a.ter - b.ter;
    });
}

/** Agrupa los benchmarks indexados por categoría — útil para `<optgroup>`. */
export function getBenchmarksByCategory(): Map<FundCategory, Fund[]> {
  const m = new Map<FundCategory, Fund[]>();
  for (const f of getAvailableBenchmarks()) {
    const arr = m.get(f.category) ?? [];
    arr.push(f);
    m.set(f.category, arr);
  }
  return m;
}

/** Agrupa los fondos activos por banco. */
export function getActiveFundsByBank(): Map<string, Fund[]> {
  const m = new Map<string, Fund[]>();
  for (const f of getActiveFunds()) {
    const key = f.bank ?? "Banca Privada / Otros";
    const arr = m.get(key) ?? [];
    arr.push(f);
    m.set(key, arr);
  }
  // Ordenar fondos por nombre dentro de cada banco
  for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
  return m;
}

// -----------------------------------------------------------------------------
// Clasificación de fondos por nombre (heurístico) o categoría EODHD
// -----------------------------------------------------------------------------
//
// Para fondos NO presentes en nuestra base local (fondos encontrados vía la
// búsqueda EODHD), no tenemos un campo `category` curado. Hay que inferirlo
// de su nombre o de la categoría que EODHD devuelve en /fundamentals.
//
// La heurística por nombre es bastante fiable para fondos españoles porque
// suelen ser muy descriptivos ("Bolsa Internacional", "Bolsa Española", "RF
// Privada", "Bolsa Tecnológica", …).

/**
 * Infiere la `FundCategory` desde el nombre del fondo. Devuelve "RV Global"
 * como default si no se reconoce ningún patrón (los fondos de banca española
 * sin patrón claro suelen ser carteras mixtas globales).
 */
export function inferCategoryFromName(rawName: string): FundCategory {
  const n = rawName.toLowerCase();

  // Patrones de RV
  if (
    /\b(monetar|money\s*market|liqu)/.test(n)
  )
    return "RF EUR Gov Corto";

  if (/\b(oro|gold|xau)\b/.test(n)) return "Oro";

  if (
    /\b(inmobil|real\s*estate|reits?|epra|nareit)\b/.test(n) &&
    !/bond|fija/.test(n)
  )
    return "RV REITs";

  // Renta Fija primero (suele tener palabras más distintivas)
  if (/\b(renta\s*fija|rf\b|bond|fixed\s*income)/.test(n)) {
    if (/\b(usd|us\s*treas|us\s*govern|treasury|estadounid)/.test(n)) {
      return /\b(corp|investment\s*grade|high\s*yield|ig|hy)/.test(n)
        ? "RF USD Corp"
        : "RF USD Gov";
    }
    if (/\b(corp|privada|investment\s*grade|high\s*yield|ig|hy|crédito|credito)/.test(n))
      return "RF EUR Corp";
    if (/\b(inflaci|inflation|linked|indexada\s*inflaci)/.test(n))
      return "RF Inflation EUR";
    if (/\b(corto|short|0-3|0\s*-\s*3|1-3|1\s*-\s*3)/.test(n))
      return "RF EUR Gov Corto";
    if (/\b(largo|long|10-15|15-30)/.test(n)) return "RF EUR Gov Largo";
    if (/\b(medio|intermedio|5-7|7-10)/.test(n)) return "RF EUR Gov Medio";
    if (/\b(gobierno|government|gov|treasury|euro\s*govt|sober)/.test(n))
      return "RF EUR Gov";
    if (/\b(flexible|patrim|perfil|mixto|asset\s*alloc|multi)/.test(n))
      return "RF Flexible";
    return "RF EUR";
  }

  // RV España primero (más específico que Europa)
  if (
    /\b(españa|spain|iberian|ibex|acciones\s*españolas|bolsa\s*española)/.test(
      n
    )
  )
    return "RV España";

  if (
    /\b(emerging|emergent|markets\s*emerg|emerg\s*market|frontier)/.test(n)
  )
    return "RV Emergentes";

  if (/\b(jap[oó]n|japan|nikkei|topix)/.test(n)) return "RV Japón";

  if (
    /\b(ee\.?\s*uu|estadounid|american|nasdaq|s\s*&\s*p\s*500|sp\s*500|norteamer|north\s*america|us\s*equity|u\.s\.|us\s*growth)\b/.test(
      n
    )
  )
    return "RV EEUU";

  if (
    /\b(europ|eurozone|stoxx|euro\s*stoxx|euroland|eurozona)/.test(n) &&
    !/europ\s*emerg/.test(n)
  )
    return "RV Europa";

  if (/\b(small\s*cap|peque|smid)/.test(n)) return "RV Small Cap";

  // Sectoriales (tech, salud, energía, utilities, finanzas, consumo, etc.)
  if (
    /\b(tecnol|tech|software|inform[aá]tica|nasdaq\s*100|salud|health|farma|biotec|energ|petr[oó]leo|oil|materias\s*primas|materials|industrials|consum|utilities|utilities|financ|banc|bancos|telecom|media|comunicaci|defensiv|c[ií]clico|water|infrastruct|infraestruct|sosten|esg|sri|impact|tem[aá]tico|robotic|ai\b)/.test(
      n
    )
  )
    return "RV Sectorial";

  // Mixtos / Perfilados
  if (
    /\b(perfil|patrim|mixto|asset\s*alloc|multi\s*asset|target\s*date|lifestrategy|flexible)/.test(
      n
    )
  )
    return "RF Flexible";

  if (
    /\b(altern|hedge|absolute\s*return|market\s*neutral|long\s*short|comm[oó]dit)/.test(
      n
    )
  )
    return "Alternativo";

  // Fallback "global" — el caso por defecto para un fondo de RV genérico
  return "RV Global";
}

/**
 * Mapeo de la cadena `CategoryName` que devuelve EODHD `/fundamentals` →
 * `FundCategory`. EODHD usa la taxonomía Morningstar.
 */
export function mapEodhdCategory(eodhdCategory: string): FundCategory {
  const n = eodhdCategory.toLowerCase();
  if (n.includes("spain")) return "RV España";
  if (n.includes("emerging")) return "RV Emergentes";
  if (n.includes("japan")) return "RV Japón";
  if (n.includes("small")) return "RV Small Cap";
  if (n.includes("real estate") || n.includes("reit")) return "RV REITs";
  if (n.includes("technology") || n.includes("health") || n.includes("energy")
      || n.includes("financial") || n.includes("consumer") || n.includes("industrial")
      || n.includes("utilities") || n.includes("materials") || n.includes("communications"))
    return "RV Sectorial";
  if (n.includes("gold") || n.includes("precious")) return "Oro";
  if (n.includes("inflation")) return "RF Inflation EUR";
  if (n.includes("bond") || n.includes("fixed income")) {
    if (n.includes("usd") || n.includes("us "))
      return n.includes("corporate") ? "RF USD Corp" : "RF USD Gov";
    if (n.includes("corporate") || n.includes("high yield")) return "RF EUR Corp";
    if (n.includes("short") || n.includes("ultra short")) return "RF EUR Gov Corto";
    if (n.includes("long")) return "RF EUR Gov Largo";
    return "RF EUR Gov";
  }
  if (n.includes("flexible") || n.includes("allocation") || n.includes("balanced"))
    return "RF Flexible";
  if (n.includes("alternative") || n.includes("hedge")) return "Alternativo";
  if (n.includes("usa") || n.includes("us large") || n.includes("us equity"))
    return "RV EEUU";
  if (n.includes("europe")) return "RV Europa";
  return "RV Global";
}

/**
 * Encuentra el equivalente indexado para un fondo dinámico (no en BD).
 * Sólo necesitamos su TER y categoría inferida.
 */
export function findEquivalentForDynamic(args: {
  name: string;
  isin: string;
  ticker?: string;
  ter: number;
  category?: FundCategory;
}): EquivalenceResult | null {
  const category = args.category ?? inferCategoryFromName(args.name);
  const recommendedId = RECOMMENDED_BY_CATEGORY[category];
  if (!recommendedId) return null;
  const recommended = getFundById(recommendedId);
  if (!recommended) return null;
  const activeFund: Fund = {
    id: `dyn-${args.isin}`,
    name: args.name,
    shortName: args.name.length > 50 ? args.name.substring(0, 47) + "..." : args.name,
    isin: args.isin,
    ticker: args.ticker,
    ter: args.ter,
    category,
    type: "active",
    currency: "EUR",
  };
  const terSaving = args.ter > 0
    ? ((args.ter - recommended.ter) / args.ter) * 100
    : 0;
  return {
    activeFund,
    recommended,
    note: FUZZY_NOTES[category],
    terSavingPercentage: terSaving,
  };
}

/**
 * Busca fondos activos por texto libre (nombre o ISIN). Case-insensitive.
 */
export function searchActiveFunds(query: string, limit = 20): Fund[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: Fund[] = [];
  for (const f of getActiveFunds()) {
    if (
      f.name.toLowerCase().includes(q) ||
      f.shortName.toLowerCase().includes(q) ||
      f.isin.toLowerCase().includes(q) ||
      (f.bank ?? "").toLowerCase().includes(q)
    ) {
      results.push(f);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/** Ejemplos destacados para el "wow moment" inicial. */
export const EXAMPLE_FUND_IDS = [
  "caixabank-global",   // CaixaBank Global TER 1.79% — RV Global
  "santander-espana",   // Santander Acciones Españolas TER 1.68% — RV España
  "bbva-sostenible",    // BBVA Sostenible TER 1.45% — RV Global ESG
  "santander-rf",       // Santander RF Privada TER 0.82% — RF EUR
  "ibercaja-internacional", // Ibercaja Internacional TER 1.75% — RV Global
] as const;
