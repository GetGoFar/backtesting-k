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

const STORAGE_KEY = "epk-saved-portfolios";

export interface SavedPortfolio {
  /** ID único interno, p.ej. "saved-1715000000000-abc" */
  id: string;
  /** Nombre dado por el usuario */
  name: string;
  /** Timestamp de creación (ms) */
  createdAt: number;
  /** Composición de la cartera */
  holdings: Array<{ fundId: string; weight: number }>;
}

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

/** Guarda una nueva cartera con el nombre dado. Devuelve el SavedPortfolio creado. */
export function savePortfolio(
  name: string,
  holdings: Array<{ fundId: string; weight: number }>
): SavedPortfolio {
  const portfolios = getSavedPortfolios();
  const newPortfolio: SavedPortfolio = {
    id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Cartera sin nombre",
    createdAt: Date.now(),
    holdings: holdings.map((h) => ({ fundId: h.fundId, weight: h.weight })),
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
