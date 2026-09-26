// Mi cartera → cartera del Backtest, lado cliente.
//
// REGLA DURA: al Backtest solo van PESOS (porcentajes), nunca euros. Aquí es
// donde los euros de cada posición se convierten en su peso sobre el total de
// lo que tiene ISIN; a /api/cartera/backtest ya viajan solo pesos. Y nada de
// esto escribe en Mi cartera: solo la lee.
//
// La respuesta (holdings resueltos por el servidor) se cachea en localStorage
// por firma de la cartera (isin:peso de cada posición) durante 7 días, para no
// gastar EODHD cada vez que el socio entra al Backtest.

import type { PortfolioHolding } from "@/lib/types";
import type { Posicion } from "./cartera";

export type ActivoBacktest = { isin: string; nombre: string; peso: number };

export type SpecBacktest = {
  name: string;
  holdings: PortfolioHolding[];
  excluidos: { nombre: string; motivo: string }[];
};

// Subir la versión invalida lo cacheado cuando cambia el formato o el método.
const CLAVE_CACHE = "cartera-k:backtest-spec:v1";
const DIAS_CACHE = 7;

const redondear = (x: number) => Math.round(x * 100) / 100;

/**
 * Posiciones con ISIN y valor > 0, de todas las partes (Núcleo, Satélite y Play
 * Money), convertidas a pesos sobre su total. Lo que no tiene ISIN (la liquidez,
 * lo pendiente) queda fuera y se devuelve por su nombre en `excluidos`.
 */
export function activosParaBacktest(posiciones: Posicion[]): { activos: ActivoBacktest[]; excluidos: string[] } {
  const conValor = posiciones.filter((p) => (p.valor || 0) > 0);
  const conIsin = conValor.filter((p) => p.isin.trim() !== "");
  const excluidos = conValor.filter((p) => p.isin.trim() === "").map((p) => p.nombre);
  const total = conIsin.reduce((s, p) => s + p.valor, 0);
  if (total <= 0) return { activos: [], excluidos };
  const activos = conIsin.map((p) => ({ isin: p.isin.trim().toUpperCase(), nombre: p.nombre, peso: redondear((p.valor / total) * 100) }));
  return { activos, excluidos };
}

/** Firma de la cartera para la caché: isin:peso de cada posición con ISIN, ordenadas. Vacía si no hay ninguna. */
export function firmaBacktest(posiciones: Posicion[]): string {
  return activosParaBacktest(posiciones)
    .activos.map((a) => `${a.isin}:${a.peso}`)
    .sort()
    .join("|");
}

function leerCache(clave: string): SpecBacktest | undefined {
  try {
    const raw = window.localStorage.getItem(CLAVE_CACHE);
    if (!raw) return undefined;
    const c = JSON.parse(raw) as { clave: string; fecha: string; spec: SpecBacktest };
    if (c.clave !== clave) return undefined;
    if (Date.now() - new Date(c.fecha).getTime() > DIAS_CACHE * 86400000) return undefined;
    if (!Array.isArray(c.spec?.holdings)) return undefined;
    return c.spec;
  } catch {
    return undefined;
  }
}

function guardarCache(clave: string, spec: SpecBacktest): void {
  try {
    window.localStorage.setItem(CLAVE_CACHE, JSON.stringify({ clave, fecha: new Date().toISOString(), spec }));
  } catch {
    /* sin almacenamiento: se vuelve a pedir la próxima vez */
  }
}

/**
 * Pide al servidor la cartera del Backtest equivalente a estas posiciones.
 * Devuelve undefined si no hay nada con ISIN. Con 422 (nada resoluble) devuelve
 * la spec sin holdings y con los excluidos; cualquier otro fallo lanza.
 * Solo se cachea una respuesta con holdings: un fallo pasajero de EODHD no
 * debe quedarse guardado una semana.
 */
export async function pedirSpecBacktest(posiciones: Posicion[], signal?: AbortSignal): Promise<SpecBacktest | undefined> {
  const { activos, excluidos } = activosParaBacktest(posiciones);
  if (activos.length === 0) return undefined;
  const clave = firmaBacktest(posiciones);
  const locales = excluidos.map((nombre) => ({ nombre, motivo: "sin ISIN" }));
  const cacheado = leerCache(clave);
  if (cacheado) return { ...cacheado, excluidos: [...locales, ...cacheado.excluidos] };

  const res = await fetch("/api/cartera/backtest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ activos }),
    signal,
  });
  if (res.status === 422) {
    let cuerpo: { excluidos?: SpecBacktest["excluidos"] } = {};
    try {
      cuerpo = (await res.json()) as typeof cuerpo;
    } catch {
      /* sin cuerpo */
    }
    return { name: "Mi cartera", holdings: [], excluidos: [...locales, ...(cuerpo.excluidos ?? [])] };
  }
  if (!res.ok) throw new Error(`backtest-spec ${res.status}`);
  const r = (await res.json()) as SpecBacktest;
  const spec: SpecBacktest = { name: r.name || "Mi cartera", holdings: r.holdings ?? [], excluidos: r.excluidos ?? [] };
  if (spec.holdings.length > 0) guardarCache(clave, spec);
  return { ...spec, excluidos: [...locales, ...spec.excluidos] };
}
