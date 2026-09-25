// =============================================================================
// API /api/cartera/estado — Mi cartera del socio, guardada en servidor
// =============================================================================
//
//   GET  → { datos, identidad: true }           (datos: lo guardado, o null si nada)
//        → { datos: null, identidad: false }    (sin cookie de identidad: vive en el navegador)
//   PUT  { datos } → { ok: true, guardado: <ISO> }
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
// Sin Redis configurado, PUT responde 503 { error: "sin_almacen" }.
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sinAcceso = await exigirAcceso(req);
  if (sinAcceso) {
    sinAcceso.headers.set("Cache-Control", "no-store");
    return sinAcceso;
  }
  const id = await identidadDe(req);
  if (!id) return responder({ datos: null, identidad: false });
  const datos = await leerCartera(id);
  return responder({ datos, identidad: true });
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

  const ok = await guardarCartera(id, aGuardar);
  if (!ok) return responder({ error: "sin_almacen" }, 503);
  return responder({ ok: true, guardado });
}
