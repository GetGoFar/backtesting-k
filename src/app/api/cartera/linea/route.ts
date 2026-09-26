// =============================================================================
// API /api/cartera/linea — lo que Mi cartera le cuenta a la línea de Hoy (para el portal de Ataraxia)
// =============================================================================
//
// El portal (repo ataraxia-bot, api/linea.js) llama aquí de servidor a servidor con el mismo token
// corto que usa para entrar al Laboratorio (firmado con ATARAXIA_LAB_SECRET; lw = el id anónimo del
// socio, 32 hex). Se responde solo con fechas y el semáforo (src/lib/mi-cartera/linea.ts): nunca
// euros ni posiciones. Sin cartera guardada, { linea: null }. Sin token válido, 401.
//
//   GET /api/cartera/linea?t=<token>  →  { linea: LineaCartera | null }

import { NextRequest, NextResponse } from "next/server";
import { idValido, verificarTokenPortal } from "@/lib/lab-auth";
import { leerCartera } from "@/lib/cartera-store";
import { esDatos } from "@/lib/mi-cartera/sync";
import { lineaDe } from "@/lib/mi-cartera/linea";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const t = req.nextUrl.searchParams.get("t") || "";
  const datosToken = await verificarTokenPortal(t);
  if (!datosToken || !idValido(datosToken.lw) || datosToken.lw === "pablo") {
    return NextResponse.json({ error: "sin_acceso" }, { status: 401, headers: SIN_CACHE });
  }
  const lectura = await leerCartera(datosToken.lw);
  if (!lectura.ok) return NextResponse.json({ error: "almacen" }, { status: 503, headers: SIN_CACHE });
  if (!esDatos(lectura.datos)) return NextResponse.json({ linea: null }, { headers: SIN_CACHE });
  return NextResponse.json({ linea: lineaDe(lectura.datos) }, { headers: SIN_CACHE });
}
