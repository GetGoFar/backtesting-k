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
