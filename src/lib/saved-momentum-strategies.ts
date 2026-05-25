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
//
// PUBLICACIÓN COMO ACTIVO DEL BACKTEST
// ------------------------------------
// Una estrategia puede tener además un `snapshot` con su curva de equity
// MENSUAL congelada y normalizada a base 1. Si el snapshot existe, la
// estrategia se puede usar como un activo más en una cartera del backtest:
// se trata como un fondo virtual cuyo "precio" en cada mes viene del snapshot,
// y se descorrelaciona/correlaciona con cualquier otro activo de la cartera.
// El botón "Actualizar a hoy" del PortfolioBuilder regenera el snapshot.
// =============================================================================

import type { MomentumConfig, MomentumResponse } from "./momentum-types";

const STORAGE_KEY = "epk-saved-momentum-strategies";
const CHANGE_EVENT = "epk-saved-momentum-strategies-changed";

/** Prefijo de fundId usado cuando una estrategia se incorpora como activo del backtest. */
export const MOMENTUM_FUND_PREFIX = "momentum-strategy-";

/** Convierte un id de estrategia en un fundId estable para el backtest. */
export function strategyToFundId(strategyId: string): string {
  return strategyId.startsWith(MOMENTUM_FUND_PREFIX)
    ? strategyId
    : `${MOMENTUM_FUND_PREFIX}${strategyId}`;
}

/** Recupera el id de la estrategia a partir de un fundId, si aplica. */
export function fundIdToStrategyId(fundId: string): string | null {
  return fundId.startsWith(MOMENTUM_FUND_PREFIX)
    ? fundId.slice(MOMENTUM_FUND_PREFIX.length)
    : null;
}

/**
 * Snapshot congelado de la equity curve de una estrategia. Permite usar la
 * estrategia como un activo del backtest sin recalcular el momentum cada vez.
 *
 * Los precios están NORMALIZADOS a base 1.0 al primer punto del snapshot —
 * lo único que importa para el backtest es la rentabilidad relativa, no el
 * valor absoluto en EUR. Esto permite mezclar la estrategia con cualquier
 * otro fondo independientemente del capital inicial elegido en la cartera.
 */
export interface MomentumSnapshot {
  /** Timestamp de generación (ms). */
  generatedAt: number;
  /**
   * Serie de NAVs mensuales: clave "YYYY-MM-DD" (fecha exacta del último día
   * hábil del mes), valor relativo base 1.0 al inicio.
   */
  monthlyNAVs: Record<string, number>;
  /** Primer mes con dato en el snapshot (formato "YYYY-MM"). */
  startMonth: string;
  /** Último mes con dato en el snapshot (formato "YYYY-MM"). */
  endMonth: string;
  /** CAGR de la curva (para mostrar en UI sin recalcular). */
  cagrPercent: number;
  /** Rentabilidad total acumulada (%) para mostrar en UI. */
  totalReturnPercent: number;
}

export interface SavedMomentumStrategy {
  /** ID único interno */
  id: string;
  /** Nombre dado por el usuario */
  name: string;
  /** Timestamp de creación (ms) */
  createdAt: number;
  /** Configuración completa de la estrategia */
  config: MomentumConfig;
  /**
   * Snapshot opcional. Cuando está presente, la estrategia se puede usar
   * como activo en una cartera del backtest. Se regenera con el botón
   * "Actualizar a hoy" o cada vez que se vuelve a ejecutar la estrategia.
   */
  snapshot?: MomentumSnapshot;
}

export type NewSavedMomentumStrategy = Omit<SavedMomentumStrategy, "id" | "createdAt">;

/**
 * Construye un snapshot a partir del resultado de una ejecución de la estrategia.
 * Normaliza la equity curve a base 1.0 al primer punto.
 *
 * En modo `tradeExecution = "nextClose"`, el motor publica cada punto de
 * equity con la fecha del PRIMER día del mes siguiente al iterado (cuando se
 * ejecuta el trade), pero el valor refleja el retorno del mes ITERADO. Como
 * el backtest engine indexa los NAVs por mes (substring 0,7), si dejamos las
 * fechas originales el NAV del retorno de "2025-04" se atribuye a "2025-05".
 * Compensamos restando 1 mes al monthKey para nextClose.
 */
export function buildSnapshotFromResponse(
  results: MomentumResponse
): MomentumSnapshot | null {
  if (results.equityCurve.length < 2) return null;
  const firstValue = results.equityCurve[0]!.value;
  if (firstValue <= 0) return null;

  const isNextClose = results.config.tradeExecution === "nextClose";

  // Devuelve la fecha shift-eada al mes anterior si es nextClose, manteniendo
  // el día. Se conserva la clave "YYYY-MM-DD" porque el resto del sistema
  // espera ese formato; lo único que cambia es el componente "MM".
  function shiftDate(date: string): string {
    if (!isNextClose) return date;
    const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
    if (!y || !m) return date;
    const dt = new Date(Date.UTC(y, m - 1 - 1, d || 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }

  const monthlyNAVs: Record<string, number> = {};
  for (const point of results.equityCurve) {
    monthlyNAVs[shiftDate(point.date)] = point.value / firstValue;
  }

  const startMonth = shiftDate(results.equityCurve[0]!.date).substring(0, 7);
  const endMonth = shiftDate(
    results.equityCurve[results.equityCurve.length - 1]!.date
  ).substring(0, 7);

  return {
    generatedAt: Date.now(),
    monthlyNAVs,
    startMonth,
    endMonth,
    cagrPercent: results.metrics.cagr,
    totalReturnPercent: results.metrics.totalReturn,
  };
}

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
    // Si se pasa un snapshot al guardar (estrategia publicada de una sola
    // vez), se persiste junto a la config. Si no, queda como undefined y la
    // estrategia se puede usar en /momentum pero no como activo del backtest
    // hasta que se "publique" (regenere snapshot).
    ...(data.snapshot ? { snapshot: data.snapshot } : {}),
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

/**
 * Actualiza solo el snapshot de una estrategia existente (sin tocar config ni
 * nombre). Útil para el botón "Actualizar a hoy" del PortfolioBuilder.
 * Devuelve true si la estrategia se encontró y se actualizó.
 */
export function updateMomentumSnapshot(
  id: string,
  snapshot: MomentumSnapshot
): boolean {
  const strategies = getSavedMomentumStrategies();
  const target = strategies.find((s) => s.id === id);
  if (!target) return false;
  target.snapshot = snapshot;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // no-op
  }
  return true;
}

/**
 * Devuelve solo las estrategias que tienen snapshot y por tanto se pueden
 * usar como activo en una cartera del backtest.
 */
export function getPublishedMomentumStrategies(): SavedMomentumStrategy[] {
  return getSavedMomentumStrategies().filter((s) => !!s.snapshot);
}

/** Busca una estrategia por su id sintético de fondo (momentum-strategy-XXX). */
export function findStrategyByFundId(
  fundId: string
): SavedMomentumStrategy | null {
  const id = fundIdToStrategyId(fundId);
  if (!id) return null;
  return getSavedMomentumStrategies().find((s) => s.id === id) ?? null;
}

/** Nombre del evento que se dispara cuando cambia el storage. */
export const SAVED_MOMENTUM_CHANGE_EVENT = CHANGE_EVENT;
