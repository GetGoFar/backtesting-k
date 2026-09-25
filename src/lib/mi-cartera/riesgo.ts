// Riesgo que asume el socio: volatilidad real de su cartera, calculada por el backtest
// de la ruta propia de esta app (/api/cartera/riesgo, en el mismo origen), traducida
// al perfil 1-10 con la tabla de volatilidades objetivo de la Excel (hoja CONFIG,
// "Volatilidad Objetivo (1DE)").

import type { Posicion } from "./cartera";

/** Volatilidad anual objetivo por perfil 1..10 (una desviación típica). */
export const VOLATILIDAD_OBJETIVO: readonly number[] = [0.05, 0.055, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.13];

/** Perfil cuya volatilidad objetivo está más cerca de la observada. */
export function perfilPorVolatilidad(vol: number): { perfil: number; oMas: boolean } {
  let mejor = 0;
  for (let i = 1; i < VOLATILIDAD_OBJETIVO.length; i++) {
    if (Math.abs((VOLATILIDAD_OBJETIVO[i] ?? 0) - vol) < Math.abs((VOLATILIDAD_OBJETIVO[mejor] ?? 0) - vol)) mejor = i;
  }
  return { perfil: mejor + 1, oMas: vol > (VOLATILIDAD_OBJETIVO[9] ?? 0.13) * 1.15 };
}

/** Caída extrema estimada de la Excel: tres desviaciones típicas. */
export function caidaExtrema(vol: number): number {
  return vol * 3;
}

export type ActivoRiesgo = { isin: string; nombre: string; valor: number };

/** Lo que devuelve /api/cartera/riesgo para la parte de la cartera con precios. */
export type RespuestaRiesgo = {
  volatilidad: number; // anual, decimal, de los activos con precio, todo el periodo común
  caidaMaxima: number; // decimal negativo
  desde: string;
  hasta: string;
  meses: number;
  /** Volatilidad del peor tramo de 3 años dentro del periodo (si hay al menos 3 años). */
  volatilidadPeor3a?: number;
  /** Fin de ese peor tramo. */
  peor3aHasta?: string;
  incluidos: { isin: string; nombre: string }[];
  excluidos: { isin: string; nombre: string; motivo: string }[];
};

export type Riesgo = {
  /** Volatilidad de la cartera completa (la liquidez cuenta a cero). */
  volatilidad: number;
  perfil: number;
  oMas: boolean;
  caidaExtrema: number;
  caidaMaxima: number;
  desde: string;
  hasta: string;
  meses: number;
  /** Peor tramo de 3 años: volatilidad y perfil equivalente. */
  volatilidadPeor?: number;
  perfilPeor?: number;
  peorHasta?: string;
  /** Crisis conocidas que el periodo NO incluye (para no fiarse de una década tranquila). */
  sinCrisis: string[];
  /** Fracción del patrimonio con la que se ha calculado (con precio o liquidez). */
  cobertura: number;
  sinDatos: string[]; // nombres de lo que no ha entrado
};

const CRISIS: { desde: string; nombre: string }[] = [
  { desde: "2008-09-01", nombre: "la crisis de 2008" },
  { desde: "2020-02-15", nombre: "la caída de 2020" },
  { desde: "2022-01-01", nombre: "el año 2022" },
];

/** Crisis que quedan fuera porque la serie empieza después. */
export function crisisNoIncluidas(desde: string): string[] {
  return CRISIS.filter((c) => desde > c.desde).map((c) => c.nombre);
}

// Subir la versión invalida lo cacheado cuando cambia el método de cálculo.
const CLAVE_CACHE = "cartera-k:riesgo:v2";
const DIAS_CACHE = 7;

export function esLiquidez(p: Posicion): boolean {
  return !p.isin && /liquidez|efectivo|cash|cuenta|dep[óo]sito|monetario/i.test(p.nombre);
}

export function claveDe(posiciones: Posicion[]): string {
  return posiciones
    .filter((p) => (p.valor || 0) > 0)
    .map((p) => `${p.isin || p.nombre}:${Math.round(p.valor)}`)
    .sort()
    .join("|");
}

function leerCache(clave: string): Riesgo | undefined {
  try {
    const raw = window.localStorage.getItem(CLAVE_CACHE);
    if (!raw) return undefined;
    const c = JSON.parse(raw) as { clave: string; fecha: string; riesgo: Riesgo };
    if (c.clave !== clave) return undefined;
    if (Date.now() - new Date(c.fecha).getTime() > DIAS_CACHE * 86400000) return undefined;
    return c.riesgo;
  } catch {
    return undefined;
  }
}

function guardarCache(clave: string, riesgo: Riesgo): void {
  try {
    window.localStorage.setItem(CLAVE_CACHE, JSON.stringify({ clave, fecha: new Date().toISOString(), riesgo }));
  } catch {
    /* nada */
  }
}

/** Convierte la respuesta del servidor (activos con precio) en el riesgo de toda la cartera. */
export function componerRiesgo(posiciones: Posicion[], r: RespuestaRiesgo): Riesgo {
  const con = posiciones.filter((p) => (p.valor || 0) > 0);
  const total = con.reduce((s, p) => s + p.valor, 0);
  const incluidos = new Set(r.incluidos.map((x) => x.isin));
  const valorPreciado = con.filter((p) => p.isin && incluidos.has(p.isin.toUpperCase())).reduce((s, p) => s + p.valor, 0);
  const valorLiquidez = con.filter(esLiquidez).reduce((s, p) => s + p.valor, 0);
  const base = valorPreciado + valorLiquidez;
  // La liquidez diluye la volatilidad; lo que no tiene datos no se puede saber.
  const factor = base > 0 ? valorPreciado / base : 1;
  const volatilidad = r.volatilidad * factor;
  const { perfil, oMas } = perfilPorVolatilidad(volatilidad);
  const sinDatos = con.filter((p) => !(p.isin && incluidos.has(p.isin.toUpperCase())) && !esLiquidez(p)).map((p) => p.nombre);
  const volatilidadPeor = r.volatilidadPeor3a !== undefined ? r.volatilidadPeor3a * factor : undefined;
  return {
    volatilidad,
    perfil,
    oMas,
    caidaExtrema: caidaExtrema(volatilidad),
    caidaMaxima: r.caidaMaxima * factor,
    desde: r.desde,
    hasta: r.hasta,
    meses: r.meses,
    volatilidadPeor,
    perfilPeor: volatilidadPeor !== undefined ? perfilPorVolatilidad(volatilidadPeor).perfil : undefined,
    peorHasta: r.peor3aHasta,
    sinCrisis: crisisNoIncluidas(r.desde),
    cobertura: total > 0 ? base / total : 0,
    sinDatos,
  };
}

export async function calcularRiesgo(posiciones: Posicion[], signal?: AbortSignal): Promise<Riesgo | undefined> {
  const clave = claveDe(posiciones);
  if (!clave) return undefined;
  const cacheado = leerCache(clave);
  if (cacheado) return cacheado;
  const activos: ActivoRiesgo[] = posiciones.filter((p) => p.isin && (p.valor || 0) > 0).map((p) => ({ isin: p.isin.toUpperCase(), nombre: p.nombre, valor: p.valor }));
  if (activos.length === 0) return undefined;
  const res = await fetch("/api/cartera/riesgo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activos }), signal });
  if (!res.ok) throw new Error(`riesgo ${res.status}`);
  const r = (await res.json()) as RespuestaRiesgo;
  const riesgo = componerRiesgo(posiciones, r);
  guardarCache(clave, riesgo);
  return riesgo;
}
