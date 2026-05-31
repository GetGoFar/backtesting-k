"use client";

// =============================================================================
// LAST BACKTEST PORTFOLIOS — Persistencia para pasar carteras entre pestañas
// =============================================================================
//
// La página /kray necesita la "última cartera ejecutada" en /backtest para no
// pedirle al usuario re-seleccionarla. Guardamos en localStorage cada vez que
// se lanza un backtest las dos carteras (A y B) con su nombre y holdings.
//
// Almacenamiento: localStorage, clave única, JSON simple. No sincroniza entre
// dispositivos — la cartera vive ahí hasta que el usuario lance otro backtest.
// =============================================================================

import type { PortfolioHolding } from "./types";

const STORAGE_KEY = "epk-last-backtest-portfolios";

export interface SavedBacktestPortfolio {
  name: string;
  holdings: PortfolioHolding[];
}

export interface LastBacktestPortfolios {
  portfolioA?: SavedBacktestPortfolio;
  portfolioB?: SavedBacktestPortfolio;
  /** Timestamp de cuándo se guardó (ms desde epoch). */
  savedAt: number;
}

export function setLastBacktestPortfolios(data: LastBacktestPortfolios): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("epk-last-backtest-portfolios-changed"));
  } catch {
    // localStorage lleno / privacidad — no-op
  }
}

export function getLastBacktestPortfolios(): LastBacktestPortfolios | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.savedAt === "number"
    ) {
      return parsed as LastBacktestPortfolios;
    }
    return null;
  } catch {
    return null;
  }
}
