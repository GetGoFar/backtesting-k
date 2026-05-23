"use client";

// =============================================================================
// SAVED MOMENTUM STRATEGIES — Persistencia local de estrategias momentum del
// usuario para reutilizar en el backtest como satélite
// =============================================================================
//
// El usuario configura una estrategia en /momentum (universo de activos,
// lookback, ranking, frecuencia, ...), la guarda con un nombre, y la
// encuentra en el dropdown del PortfolioBuilder bajo "Momentum guardadas".
// Al seleccionarla allí se inserta como holding con su MomentumConfig
// adjunto — el motor la ejecuta dinámicamente y la trata como un fondo.
//
// Almacenamiento: localStorage del navegador. NO sincronizado entre
// dispositivos (usa Exportar/Importar de carteras si quieres llevarlas a
// otro browser — TODO en una iteración aparte si hace falta para momentum).
// =============================================================================

import type { MomentumConfig } from "./momentum-types";

const STORAGE_KEY = "epk-saved-momentum-strategies";

export interface SavedMomentumStrategy {
  /** ID único interno, p.ej. "savedmom-1715000000000-abc". */
  id: string;
  /** Nombre dado por el usuario (mostrado en la UI). */
  name: string;
  /** Timestamp de creación (ms). */
  createdAt: number;
  /** Config completa de la estrategia. Las fechas / initialAmount se
   *  OVERRIDEAN al ejecutarla en el backtest, así que aquí se guardan
   *  los valores con los que se probó originalmente — sólo informativos. */
  config: MomentumConfig;
}

/** Datos que se reciben al crear una estrategia guardada. */
export type NewSavedMomentumStrategy = Omit<
  SavedMomentumStrategy,
  "id" | "createdAt"
>;

/** Lee la lista actual desde localStorage. */
export function getSavedMomentumStrategies(): SavedMomentumStrategy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedMomentumStrategy[];
  } catch {
    return [];
  }
}

/** Guarda una nueva estrategia momentum. Devuelve la entry creada. */
export function saveMomentumStrategy(
  data: NewSavedMomentumStrategy
): SavedMomentumStrategy {
  const existing = getSavedMomentumStrategies();
  const entry: SavedMomentumStrategy = {
    id: `savedmom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    name: data.name.trim() || "Estrategia sin nombre",
    config: data.config,
  };
  existing.push(entry);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    window.dispatchEvent(new CustomEvent("epk-saved-momentum-strategies-changed"));
  } catch {
    // localStorage lleno o no disponible — no-op
  }
  return entry;
}

/** Elimina una estrategia guardada por su ID. */
export function deleteSavedMomentumStrategy(id: string): void {
  const filtered = getSavedMomentumStrategies().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent("epk-saved-momentum-strategies-changed"));
  } catch {
    // no-op
  }
}
