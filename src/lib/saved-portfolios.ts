"use client";

// =============================================================================
// SAVED PORTFOLIOS — Persistencia local de carteras del usuario
// =============================================================================
//
// Permite al usuario guardar sus propias composiciones (fondos + pesos) bajo
// un nombre, y recuperarlas más tarde desde el dropdown de presets.
//
// Almacenamiento: localStorage del navegador. NO sincronizado entre
// dispositivos — es uso personal local. Si se limpia la caché del navegador,
// se pierden. Estructura simple: array JSON bajo una única clave.
// =============================================================================

import type { Fund } from "./types";

const STORAGE_KEY = "epk-saved-portfolios";

export type SavedTaxMode = "none" | "flat" | "spain-irpf";
export type SavedRebalanceFrequency = "monthly" | "quarterly" | "annual" | "none";

/** Holding guardado: incluye el objeto Fund COMPLETO para que los fondos
 *  añadidos por búsqueda dinámica (Yahoo / EODHD search) — y que NO están
 *  en fund-database — se restauren correctamente al recargar. El campo
 *  `fund` es opcional para mantener compatibilidad retro con carteras
 *  guardadas con un esquema antiguo que sólo tenía `fundId`. */
export interface SavedHolding {
  fundId: string;
  weight: number;
  fund?: Fund;
}

export interface SavedPortfolio {
  /** ID único interno, p.ej. "saved-1715000000000-abc" */
  id: string;
  /** Nombre dado por el usuario */
  name: string;
  /** Timestamp de creación (ms) */
  createdAt: number;
  /** Composición de la cartera */
  holdings: SavedHolding[];
  // === Ajustes propios de la cartera (opcionales para compat. retro) ===
  /** Comisión de gestión adicional aplicada por la cartera (%) */
  managementFee?: number;
  /** Modo fiscal: sin impuestos / tasa fija / IRPF español */
  taxMode?: SavedTaxMode;
  /** Tasa fija en % (solo si taxMode = "flat") */
  taxRatePct?: number;
  /** Frecuencia de rebalanceo */
  rebalanceFrequency?: SavedRebalanceFrequency;
  /** Banda RELATIVA de drift (%) — 0 = desactivada */
  rebalanceBandRelativePct?: number;
  /** Banda ABSOLUTA de drift (puntos %) — 0 = desactivada */
  rebalanceBandAbsolutePct?: number;
}

/** Datos que se reciben al crear / guardar una cartera. */
export type NewSavedPortfolio = Omit<SavedPortfolio, "id" | "createdAt">;

/**
 * Migra al vuelo cualquier campo legacy en los Fund snapshots de holdings
 * guardados con esquemas antiguos. Concretamente: `yahooTicker` → `ticker`
 * (el campo se renombró al eliminar Yahoo como fuente de datos). Modifica el
 * objeto in-place y lo devuelve.
 */
function migrateLegacyFundFields(portfolio: SavedPortfolio): SavedPortfolio {
  for (const h of portfolio.holdings) {
    const fund = h.fund as (typeof h.fund & { yahooTicker?: string }) | undefined;
    if (fund && fund.yahooTicker && !fund.ticker) {
      fund.ticker = fund.yahooTicker;
      delete fund.yahooTicker;
    }
  }
  return portfolio;
}

/** Lee la lista actual desde localStorage. */
export function getSavedPortfolios(): SavedPortfolio[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Migrar cualquier yahooTicker → ticker en los Fund snapshots guardados
    // antes del rename (mantiene retrocompat sin pedir re-importar carteras).
    return (parsed as SavedPortfolio[]).map(migrateLegacyFundFields);
  } catch {
    return [];
  }
}

/** Guarda una nueva cartera con todos sus ajustes. Devuelve el SavedPortfolio creado. */
export function savePortfolio(data: NewSavedPortfolio): SavedPortfolio {
  const portfolios = getSavedPortfolios();
  const newPortfolio: SavedPortfolio = {
    id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    name: data.name.trim() || "Cartera sin nombre",
    holdings: data.holdings.map((h) => ({
      fundId: h.fundId,
      weight: h.weight,
      // Snapshot del Fund completo — clave para que los fondos añadidos vía
      // búsqueda dinámica (no presentes en fund-database) se restauren bien.
      ...(h.fund ? { fund: h.fund } : {}),
    })),
    managementFee: data.managementFee,
    taxMode: data.taxMode,
    taxRatePct: data.taxRatePct,
    rebalanceFrequency: data.rebalanceFrequency,
    rebalanceBandRelativePct: data.rebalanceBandRelativePct,
    rebalanceBandAbsolutePct: data.rebalanceBandAbsolutePct,
  };
  portfolios.push(newPortfolio);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
    window.dispatchEvent(new CustomEvent("epk-saved-portfolios-changed"));
  } catch {
    // localStorage lleno o no disponible — no-op
  }
  return newPortfolio;
}

/** Elimina una cartera guardada por su ID. */
export function deleteSavedPortfolio(id: string): void {
  const portfolios = getSavedPortfolios().filter((p) => p.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
    window.dispatchEvent(new CustomEvent("epk-saved-portfolios-changed"));
  } catch {
    // no-op
  }
}

/** Renombra una cartera guardada (devuelve true si se encontró y renombró). */
export function renameSavedPortfolio(id: string, newName: string): boolean {
  const portfolios = getSavedPortfolios();
  const target = portfolios.find((p) => p.id === id);
  if (!target) return false;
  target.name = newName.trim() || target.name;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
    window.dispatchEvent(new CustomEvent("epk-saved-portfolios-changed"));
  } catch {
    // no-op
  }
  return true;
}

// =============================================================================
// EXPORT / IMPORT — Para llevar las carteras entre navegadores / dispositivos
// =============================================================================
//
// Las carteras viven en localStorage, así que son locales al navegador. Estas
// utilidades permiten descargarlas como JSON y volver a cargarlas en otro
// navegador. El JSON resultante es un objeto con `version` (por si cambia el
// esquema en el futuro), `exportedAt` y `portfolios` (el array completo).
// =============================================================================

/** Formato del archivo de exportación. La `version` permite detectar archivos
 *  futuros con esquema diferente. */
export interface SavedPortfoliosExport {
  version: 1;
  exportedAt: number;
  portfolios: SavedPortfolio[];
}

/** Devuelve el contenido del export como JSON string (UTF-8, indentado). */
export function buildSavedPortfoliosExport(): string {
  const data: SavedPortfoliosExport = {
    version: 1,
    exportedAt: Date.now(),
    portfolios: getSavedPortfolios(),
  };
  return JSON.stringify(data, null, 2);
}

/** Descarga el export como archivo .json desde el navegador. */
export function downloadSavedPortfoliosExport(): void {
  if (typeof window === "undefined") return;
  const json = buildSavedPortfoliosExport();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `epk-carteras-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Resultado de una importación: cuántas se añadieron, cuántas se saltaron
 *  (por duplicado de ID/nombre) y cualquier error. */
export interface ImportResult {
  added: number;
  skipped: number;
  total: number;
  error?: string;
}

/** Importa carteras desde un JSON string. Estrategia: MERGE — añade las nuevas
 *  manteniendo las existentes; si una cartera importada tiene el mismo ID que
 *  una local, se le asigna un ID nuevo para evitar colisiones; si tiene el
 *  mismo nombre, se sufija " (importada)" para que el usuario las distinga. */
export function importSavedPortfolios(jsonString: string): ImportResult {
  if (typeof window === "undefined") {
    return { added: 0, skipped: 0, total: 0, error: "No disponible en servidor" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { added: 0, skipped: 0, total: 0, error: "El archivo no es un JSON válido" };
  }
  // Permitimos dos formatos: el objeto con metadata, o directamente el array
  // (por si alguien edita a mano).
  let incoming: SavedPortfolio[] = [];
  if (Array.isArray(parsed)) {
    incoming = parsed as SavedPortfolio[];
  } else if (parsed && typeof parsed === "object" && "portfolios" in parsed) {
    const obj = parsed as SavedPortfoliosExport;
    if (!Array.isArray(obj.portfolios)) {
      return { added: 0, skipped: 0, total: 0, error: "Formato no reconocido" };
    }
    incoming = obj.portfolios;
  } else {
    return { added: 0, skipped: 0, total: 0, error: "Formato no reconocido" };
  }

  const existing = getSavedPortfolios();
  const existingIds = new Set(existing.map((p) => p.id));
  const existingNames = new Set(existing.map((p) => p.name));

  let added = 0;
  let skipped = 0;
  for (const p of incoming) {
    // Validación mínima — un objeto sin nombre o sin holdings no es importable
    if (!p || typeof p !== "object" || !Array.isArray(p.holdings) || !p.name) {
      skipped++;
      continue;
    }
    // Resolver colisión de ID
    let id = p.id;
    if (!id || existingIds.has(id)) {
      id = `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    // Resolver colisión de nombre (sufijo " (importada)" si ya existe)
    let name = p.name;
    if (existingNames.has(name)) {
      name = `${name} (importada)`;
      let n = 2;
      while (existingNames.has(name)) {
        name = `${p.name} (importada ${n++})`;
      }
    }
    existing.push({
      ...p,
      id,
      name,
      createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
    });
    existingIds.add(id);
    existingNames.add(name);
    added++;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    window.dispatchEvent(new CustomEvent("epk-saved-portfolios-changed"));
  } catch {
    return {
      added,
      skipped,
      total: incoming.length,
      error: "No se pudo guardar — espacio insuficiente en localStorage",
    };
  }

  return { added, skipped, total: incoming.length };
}
