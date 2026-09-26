// Cliente de /api/cartera/composicion para Mi cartera: pide la composición
// real de un ISIN y la casilla sugerida, una vez por ISIN (caché en
// localStorage 30 días; un "sin datos" se guarda 1 día) y sin peticiones
// duplicadas mientras una está en vuelo.

// Solo tipos del módulo de servidor: nada de él llega al navegador.
import type { RespuestaComposicion, Sugerencia } from "./composicion";
import { nombreSubRV, REGIONES, SECTORES, type SubRV } from "./cartera";

export type { RespuestaComposicion, Sugerencia };

// Subir la versión invalida lo cacheado cuando cambie el mapeo.
const CLAVE_CACHE = "cartera-k:composicion:v1";
const DIAS_OK = 30;
const DIAS_NULO = 1;

type Entrada = { fecha: string; respuesta: RespuestaComposicion };
type Cache = Record<string, Entrada>;

function leerCache(): Cache {
  try {
    const raw = window.localStorage.getItem(CLAVE_CACHE);
    if (!raw) return {};
    const c = JSON.parse(raw) as unknown;
    return c && typeof c === "object" ? (c as Cache) : {};
  } catch {
    return {};
  }
}

function vigente(e: Entrada | undefined): RespuestaComposicion | undefined {
  if (!e || !e.respuesta || typeof e.respuesta !== "object") return undefined;
  const dias = e.respuesta.composicion ? DIAS_OK : DIAS_NULO;
  if (Date.now() - new Date(e.fecha).getTime() > dias * 86400000) return undefined;
  const sug = e.respuesta.sugerencia as Partial<Sugerencia> | undefined;
  if (!sug || typeof sug !== "object") return undefined;
  return { composicion: e.respuesta.composicion ?? null, sugerencia: { ...sug, casillas: sug.casillas ?? {} } };
}

function guardarCache(isin: string, respuesta: RespuestaComposicion): void {
  try {
    const cache = leerCache();
    // Limpieza: fuera lo caducado, para que la clave no crezca sin fin.
    for (const k of Object.keys(cache)) if (!vigente(cache[k])) delete cache[k];
    cache[isin] = { fecha: new Date().toISOString(), respuesta };
    window.localStorage.setItem(CLAVE_CACHE, JSON.stringify(cache));
  } catch {
    /* nada */
  }
}

const enVuelo = new Map<string, Promise<RespuestaComposicion>>();

async function pedirAlServidor(isin: string): Promise<RespuestaComposicion> {
  const res = await fetch(`/api/cartera/composicion?isin=${encodeURIComponent(isin)}`, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`composicion ${res.status}`);
  const r = (await res.json()) as { composicion?: RespuestaComposicion["composicion"]; sugerencia?: Partial<Sugerencia> };
  const sug = r.sugerencia ?? {};
  const respuesta: RespuestaComposicion = { composicion: r.composicion ?? null, sugerencia: { ...sug, casillas: sug.casillas ?? {} } };
  guardarCache(isin, respuesta);
  return respuesta;
}

/**
 * Composición y casilla sugerida de un ISIN. `signal` solo corta la espera de
 * quien llama: la petición compartida sigue y su resultado se cachea.
 */
export function pedirSugerencia(isinBruto: string, signal?: AbortSignal): Promise<RespuestaComposicion> {
  const isin = isinBruto.trim().toUpperCase();
  const cacheado = vigente(leerCache()[isin]);
  if (cacheado) return Promise.resolve(cacheado);
  let p = enVuelo.get(isin);
  if (!p) {
    p = pedirAlServidor(isin).finally(() => enVuelo.delete(isin));
    enVuelo.set(isin, p);
  }
  if (!signal) return p;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Cancelado", "AbortError"));
    const alAbortar = () => reject(new DOMException("Cancelado", "AbortError"));
    signal.addEventListener("abort", alAbortar, { once: true });
    p!.then(resolve, reject).finally(() => signal.removeEventListener("abort", alAbortar));
  });
}

/** «Tecnología 97 % · EE. UU. 88 %»: la casilla de sector y la de región con más peso. */
export function resumenEodhd(s: Sugerencia): string {
  const mayor = (ids: SubRV[]) => {
    let mejor: { id: SubRV; pct: number } | undefined;
    for (const id of ids) {
      const pct = s.casillas[id];
      if (pct !== undefined && (!mejor || pct > mejor.pct)) mejor = { id, pct };
    }
    return mejor;
  };
  const partes: string[] = [];
  const sector = mayor(SECTORES.map((x) => x.id));
  if (sector) partes.push(`${nombreSubRV(sector.id)} ${Math.round(sector.pct)} %`);
  const region = mayor(REGIONES.filter((r) => r.id !== "global" && r.id !== "smallcaps").map((x) => x.id));
  if (region) partes.push(`${nombreSubRV(region.id)} ${Math.round(region.pct)} %`);
  const small = s.casillas.smallcaps;
  if (small !== undefined && small >= 60) partes.push(`Small caps ${Math.round(small)} %`);
  return partes.join(" · ");
}
