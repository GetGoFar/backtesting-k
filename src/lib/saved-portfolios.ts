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

/** Lee la lista actual desde localStorage. */
export function getSavedPortfolios(): SavedPortfolio[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedPortfolio[];
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
