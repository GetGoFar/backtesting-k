// =============================================================================
// sync.ts — Mi cartera en el servidor (GET/PUT /api/cartera/estado)
// =============================================================================
// El store guarda en localStorage y, además, sube el objeto Datos entero al servidor para el
// socio identificado por la cookie epk-socio, de modo que la cartera se vea igual desde cualquier
// dispositivo. Este módulo aísla la red para poder probarla sin navegador.
//
// Contrato de la ruta (la implementa src/app/api/cartera/estado/route.ts):
//   GET  → 200 {datos: Datos|null, identidad: true} · 200 {datos: null, identidad: false} sin
//          identidad (también se admiten 204 o {}) · 401 sin acceso
//   PUT  {datos} → 200 {ok: true, guardado} · 401 sin acceso · 403 sin identidad
//
// Regla de fusión: manda quien tenga el sello `guardado` más reciente; si aquí no hay nada,
// manda el servidor.

import type { Datos } from "./store";

export const RUTA_ESTADO = "/api/cartera/estado";

/** El servidor no reconoce al socio (sin identidad o sin acceso): no hay a quién guardarle nada
 *  hasta la siguiente carga de la página. */
export class SinIdentidad extends Error {
  constructor() {
    super("sin identidad");
    this.name = "SinIdentidad";
  }
}

export function esDatos(x: unknown): x is Datos {
  if (!x || typeof x !== "object") return false;
  const d = x as Partial<Datos>;
  return d.version === 2 && Array.isArray(d.movimientos);
}

export function estaVacio(d: Datos): boolean {
  return d.perfil === undefined && d.cartera === undefined && d.movimientos.length === 0;
}

/** ¿Lo del servidor debe sustituir a lo local? Con sello en los dos, el más reciente; si aquí
 *  no hay nada, lo del servidor (si tiene algo); en cualquier otro caso se queda lo local. */
export function mandaElServidor(remoto: Datos, local: Datos): boolean {
  if (remoto.guardado && local.guardado) return remoto.guardado > local.guardado;
  if (estaVacio(local)) return !estaVacio(remoto);
  return false;
}

/** Lo guardado en el servidor para este socio; null si está identificado pero no tiene nada.
 *  Lanza SinIdentidad si el servidor no sabe quién es (identidad: false, 204, {} o 401) y Error
 *  en cualquier otro fallo. */
export async function cargarEstado(): Promise<Datos | null> {
  const res = await fetch(RUTA_ESTADO, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  if (res.status === 204 || res.status === 401 || res.status === 403) throw new SinIdentidad();
  if (!res.ok) throw new Error(`estado ${res.status}`);
  const cuerpo = (await res.json().catch(() => null)) as { datos?: unknown; identidad?: unknown } | null;
  if (!cuerpo || typeof cuerpo !== "object" || !("datos" in cuerpo) || cuerpo.identidad === false) throw new SinIdentidad();
  return esDatos(cuerpo.datos) ? cuerpo.datos : null;
}

/** Sube el estado entero. Lanza SinIdentidad con 401/403 y Error en cualquier otro fallo.
 *  `keepalive` sirve para el último intento al cerrar la pestaña. */
export async function guardarEstado(datos: Datos, opciones: { keepalive?: boolean } = {}): Promise<void> {
  const res = await fetch(RUTA_ESTADO, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ datos }),
    keepalive: opciones.keepalive === true,
  });
  if (res.status === 401 || res.status === 403) throw new SinIdentidad();
  if (!res.ok) throw new Error(`estado ${res.status}`);
}
