// =============================================================================
// sync.ts — Mi cartera en el servidor (GET/PUT /api/cartera/estado)
// =============================================================================
// El store guarda en localStorage y, además, sube el objeto Datos entero al servidor para el
// socio identificado por la cookie epk-socio, de modo que la cartera se vea igual desde cualquier
// dispositivo. Este módulo aísla la red (y las reglas de decisión, que son puras) para poder
// probarlas sin navegador.
//
// Contrato de la ruta (la implementa src/app/api/cartera/estado/route.ts):
//   GET  → 200 {datos: Datos|null, identidad: true} · 200 {datos: null, identidad: false} sin
//          identidad (también se admiten 204 o {}) · 401 sin acceso · 503 {error: "almacen"}
//          cuando el almacén no responde (esto es un FALLO, nunca "no hay nada")
//   PUT  {datos} → 200 {ok: true, guardado} · 401 sin acceso · 403 sin identidad ·
//          409 {error: "anticuado", guardado, datos} si lo guardado en el servidor es más
//          reciente (el cliente adopta esos datos) · 503 {error: "sin_almacen"}
//
// Regla de fusión: manda quien tenga el sello `guardado` más reciente; si aquí no hay nada,
// manda el servidor.
//
// Regla de seguridad: sin GET no hay PUT. Hasta que el servidor no ha contestado bien (sea con
// identidad o sin ella) no se sabe qué tiene, y subir lo local a ciegas podría pisar una cartera
// guardada. Mientras tanto el store está "sin confirmar": enseña lo local y reintenta el GET.

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

/** El servidor tiene un estado más reciente que el enviado (409): hay que adoptar `datos`. */
export class EstadoAnticuado extends Error {
  readonly datos: Datos;
  readonly guardado: string | undefined;
  constructor(datos: Datos, guardado?: string) {
    super("estado anticuado");
    this.name = "EstadoAnticuado";
    this.datos = datos;
    this.guardado = guardado;
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

// ----- Estado de la sincronización (lo que el store sabe del servidor) -----

/** Dónde vive la cartera ahora mismo, para decírselo al socio. */
export type GuardadoEn = "servidor" | "navegador" | "sin-confirmar";

export type EstadoServidor = {
  /** El GET ha respondido bien al menos una vez: ya se sabe si hay identidad y qué hay guardado. */
  confirmado: boolean;
  /** El servidor no reconoce al socio (GET o PUT con SinIdentidad): todo se queda en el navegador. */
  sinIdentidad: boolean;
  /** Cómo acabó el último PUT (null si aún no ha habido ninguno). */
  ultimoPut: "ok" | "fallo" | null;
};

export const ESTADO_SERVIDOR_INICIAL: EstadoServidor = { confirmado: false, sinIdentidad: false, ultimoPut: null };

/** Servidor: GET confirmado con identidad y el último PUT bien (o ninguno aún). Navegador: sin
 *  identidad o con el último PUT fallido. Sin confirmar: el GET no ha respondido bien todavía. */
export function guardadoEn(e: EstadoServidor): GuardadoEn {
  if (!e.confirmado) return "sin-confirmar";
  if (e.sinIdentidad || e.ultimoPut === "fallo") return "navegador";
  return "servidor";
}

/** Qué hacer con un cambio local: nada (sin identidad), consultar (primero hay que saber qué
 *  tiene el servidor: sin GET no hay PUT) o subir. */
export function accionAlCambiar(e: EstadoServidor): "nada" | "consultar" | "subir" {
  if (e.sinIdentidad) return "nada";
  if (!e.confirmado) return "consultar";
  return "subir";
}

// ----- Red -----

/** Lo guardado en el servidor para este socio; null si está identificado pero no tiene nada.
 *  Lanza SinIdentidad si el servidor no sabe quién es (identidad: false, 204, {} o 401) y Error
 *  en cualquier otro fallo (503 del almacén incluido: eso no es "vacío"). */
export async function cargarEstado(): Promise<Datos | null> {
  const res = await fetch(RUTA_ESTADO, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  if (res.status === 204 || res.status === 401 || res.status === 403) throw new SinIdentidad();
  if (!res.ok) throw new Error(`estado ${res.status}`);
  const cuerpo = (await res.json().catch(() => null)) as { datos?: unknown; identidad?: unknown } | null;
  if (!cuerpo || typeof cuerpo !== "object" || !("datos" in cuerpo) || cuerpo.identidad === false) throw new SinIdentidad();
  return esDatos(cuerpo.datos) ? cuerpo.datos : null;
}

/** Sube el estado entero. Lanza SinIdentidad con 401/403, EstadoAnticuado con 409 (trae los datos
 *  del servidor) y Error en cualquier otro fallo. `keepalive` sirve para el último intento al
 *  cerrar la pestaña. */
export async function guardarEstado(datos: Datos, opciones: { keepalive?: boolean } = {}): Promise<void> {
  const res = await fetch(RUTA_ESTADO, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ datos }),
    keepalive: opciones.keepalive === true,
  });
  if (res.status === 401 || res.status === 403) throw new SinIdentidad();
  if (res.status === 409) {
    const cuerpo = (await res.json().catch(() => null)) as { datos?: unknown; guardado?: unknown } | null;
    if (cuerpo && esDatos(cuerpo.datos)) throw new EstadoAnticuado(cuerpo.datos, typeof cuerpo.guardado === "string" ? cuerpo.guardado : undefined);
    throw new Error("estado 409");
  }
  if (!res.ok) throw new Error(`estado ${res.status}`);
}
