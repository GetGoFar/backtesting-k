// =============================================================================
// API /api/cartera/estado — Mi cartera del socio, guardada en servidor
// =============================================================================
//
//   GET  → { datos, identidad: true }           (datos: lo guardado, o null si nada)
//        → { datos: null, identidad: false }    (sin cookie de identidad: vive en el navegador)
//        → 503 { error: "almacen" }             (Redis sin configurar o caído: NO se sabe qué hay)
//   PUT  { datos } → { ok: true, guardado: <ISO> }
//                  → 409 { error: "anticuado", guardado, datos }  (lo guardado es más reciente)
//                  → 503 { error: "sin_almacen" }
//
// Puerta en dos pasos: primero la cookie de acceso (exigirAcceso → 401 sin ella;
// el middleware deja pasar todo /api/*), luego la identidad de la cookie `epk-socio`
// (identidadDe): sin ella no hay dónde guardar, así que GET responde vacío y PUT 403
// { error: "sin_identidad" }. El id nunca viene de la petición: sale de la cookie firmada.
//
// El servidor comprueba lo mínimo del estado (un objeto con version === 2 y
// `guardado` en ISO 8601 o ausente) y nada más: el formato es del cliente
// (lib/mi-cartera/store.tsx). Si `guardado` falta, se sella con la hora del servidor
// para que lo devuelto coincida con lo guardado. Tope: CARTERA_MAX_BYTES (413).
//
// Vacío y fallo no son lo mismo: si el almacén no responde, GET contesta 503 (nunca
// "no hay nada"), para que el cliente no suba lo suyo encima de una cartera guardada.
// Y PUT lee antes lo guardado: si el sello recibido es ANTERIOR al almacenado, no
// sobreescribe y devuelve 409 con lo del servidor para que el cliente lo adopte.
// (La lectura y la escritura no son atómicas; es una salvaguarda, no un cerrojo.)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { exigirAcceso, identidadDe } from "@/lib/lab-auth";
import { CARTERA_MAX_BYTES, guardarCartera, leerCartera, tamanoSerializado } from "@/lib/cartera-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SIN_CACHE = { "Cache-Control": "no-store" };

function responder(cuerpo: unknown, status = 200): NextResponse {
  return NextResponse.json(cuerpo, { status, headers: SIN_CACHE });
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Fecha ISO 8601 con hora (la que produce Date#toISOString, con o sin zona). */
function esFechaISO(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/.test(v) &&
    !Number.isNaN(Date.parse(v))
  );
}

/** El sello `guardado` de un estado almacenado, si lo tiene y es una fecha válida. */
function selloDe(datos: unknown): string | undefined {
  return esObjeto(datos) && esFechaISO(datos.guardado) ? datos.guardado : undefined;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sinAcceso = await exigirAcceso(req);
  if (sinAcceso) {
    sinAcceso.headers.set("Cache-Control", "no-store");
    return sinAcceso;
  }
  const id = await identidadDe(req);
  if (!id) return responder({ datos: null, identidad: false });
  const lectura = await leerCartera(id);
  if (!lectura.ok) return responder({ error: "almacen" }, 503);
  return responder({ datos: lectura.datos, identidad: true });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const sinAcceso = await exigirAcceso(req);
  if (sinAcceso) {
    sinAcceso.headers.set("Cache-Control", "no-store");
    return sinAcceso;
  }
  const id = await identidadDe(req);
  if (!id) return responder({ error: "sin_identidad" }, 403);

  // Antes de cargar el cuerpo en memoria (margen para el envoltorio { datos }).
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > CARTERA_MAX_BYTES + 16 * 1024) return responder({ error: "demasiado_grande" }, 413);

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: "json_invalido" }, 400);
  }
  const datos = esObjeto(cuerpo) ? cuerpo.datos : undefined;
  if (!esObjeto(datos) || datos.version !== 2) return responder({ error: "formato" }, 400);
  if (datos.guardado !== undefined && !esFechaISO(datos.guardado)) return responder({ error: "formato" }, 400);

  const guardado = esFechaISO(datos.guardado) ? datos.guardado : new Date().toISOString();
  const aGuardar = { ...datos, guardado };
  if (tamanoSerializado(JSON.stringify(aGuardar)) > CARTERA_MAX_BYTES) return responder({ error: "demasiado_grande" }, 413);

  // Lo almacenado manda si es más reciente: no se pisa con un estado anterior.
  const previo = await leerCartera(id);
  if (!previo.ok) return responder({ error: "sin_almacen" }, 503);
  const selloPrevio = selloDe(previo.datos);
  if (selloPrevio !== undefined && Date.parse(guardado) < Date.parse(selloPrevio)) {
    return responder({ error: "anticuado", guardado: selloPrevio, datos: previo.datos }, 409);
  }

  const ok = await guardarCartera(id, aGuardar);
  if (!ok) return responder({ error: "sin_almacen" }, 503);
  return responder({ ok: true, guardado });
}
