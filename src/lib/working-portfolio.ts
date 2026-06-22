// =============================================================================
// CARTERA DE TRABAJO — autoguardado en localStorage
// =============================================================================
//
// Persiste la cartera que el usuario está montando en cada lado (A/B) para que
// NO se pierda al cambiar de pestaña/sección (Backtest → Momentum → …) ni al
// recargar. Es la cartera "en curso", distinta de las carteras guardadas a mano
// ([[saved-portfolios]]). Se guarda el objeto Fund completo en cada holding para
// poder restaurar también fondos buscados dinámicamente (no presentes en la BD).
// =============================================================================

import type { PortfolioHolding, RebalanceFrequency } from "./types";

export interface WorkingPortfolio {
  name: string;
  nameManuallyEdited?: boolean;
  holdings: PortfolioHolding[];
  managementFee: number;
  taxMode: "none" | "flat" | "spain-irpf";
  /** Tasa fiscal en % (UI), no decimal. */
  taxRatePct: number;
  rebalanceFrequency: RebalanceFrequency;
  rebalanceBandRelativePct: number;
  rebalanceBandAbsolutePct: number;
}

const key = (side: "a" | "b") => `epk:working-cartera:v1:${side}`;

export function saveWorkingPortfolio(side: "a" | "b", data: WorkingPortfolio): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(side), JSON.stringify(data));
  } catch {
    /* localStorage lleno o no disponible — se ignora */
  }
}

export function loadWorkingPortfolio(side: "a" | "b"): WorkingPortfolio | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(side));
    return raw ? (JSON.parse(raw) as WorkingPortfolio) : null;
  } catch {
    return null;
  }
}

export function clearWorkingPortfolio(side: "a" | "b"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key(side));
  } catch {
    /* no-op */
  }
}
