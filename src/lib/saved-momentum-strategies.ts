"use client";

// =============================================================================
// SAVED MOMENTUM STRATEGIES — Persistencia local de configuraciones momentum
// =============================================================================
//
// Equivalente a saved-portfolios.ts pero para las configuraciones completas de
// la estrategia momentum (universo + lookback + ranking + etc.). Permite al
// usuario guardar una configuración bajo un nombre y recuperarla más tarde.
//
// Almacenamiento: localStorage del navegador bajo la clave
// "epk-saved-momentum-strategies". NO sincronizado entre dispositivos.
// =============================================================================

import type { MomentumConfig } from "./momentum-types";

const STORAGE_KEY = "epk-saved-momentum-strategies";
const CHANGE_EVENT = "epk-saved-momentum-strategies-changed";

export interface SavedMomentumStrategy {
  /** ID único interno */
  id: string;
  /** Nombre dado por el usuario */
  name: string;
  /** Timestamp de creación (ms) */
  createdAt: number;
  /** Configuración completa de la estrategia */
  config: MomentumConfig;
}

export type NewSavedMomentumStrategy = Omit<SavedMomentumStrategy, "id" | "createdAt">;

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

/** Guarda una estrategia nueva. Devuelve la SavedMomentumStrategy creada. */
export function saveMomentumStrategy(
  data: NewSavedMomentumStrategy
): SavedMomentumStrategy {
  const strategies = getSavedMomentumStrategies();
  const newStrategy: SavedMomentumStrategy = {
    id: `momentum-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    name: data.name.trim() || "Estrategia sin nombre",
    config: data.config,
  };
  strategies.push(newStrategy);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // localStorage lleno o no disponible — no-op
  }
  return newStrategy;
}

/** Elimina una estrategia por su ID. */
export function deleteMomentumStrategy(id: string): void {
  const strategies = getSavedMomentumStrategies().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // no-op
  }
}

/** Renombra una estrategia (devuelve true si se encontró y renombró). */
export function renameMomentumStrategy(id: string, newName: string): boolean {
  const strategies = getSavedMomentumStrategies();
  const target = strategies.find((s) => s.id === id);
  if (!target) return false;
  target.name = newName.trim() || target.name;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // no-op
  }
  return true;
}

/** Nombre del evento que se dispara cuando cambia el storage. */
export const SAVED_MOMENTUM_CHANGE_EVENT = CHANGE_EVENT;
