// =============================================================================
// API /api/presets/privados — las carteras que NO viajan en el bundle
// =============================================================================
//
// Carteras de clientes de consultoría y extractos reales (lib/portfolio-presets-privados.ts).
// Solo se entregan al navegador que entró con el código PERSONAL de Pablo (etiqueta "pablo"
// en lib/access-codes.ts): con cualquier otro código, o en el campus / Ataraxia, la lista
// vuelve vacía. Así un socio no puede leerlas ni en el código fuente ni en la red.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { ACCESS_CODES } from "@/lib/access-codes";
import { PRESETS_PRIVADOS } from "@/lib/portfolio-presets-privados";

export const dynamic = "force-dynamic";

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const responder = (presets: unknown[]) =>
    NextResponse.json({ presets }, { headers: { "Cache-Control": "no-store" } });
  const cookie = request.cookies.get("epk-access")?.value;
  if (!cookie) return responder([]);
  for (const c of ACCESS_CODES) {
    if (c.label !== "pablo") continue;
    if ((await sha256Hex(c.code)) === cookie) return responder(PRESETS_PRIVADOS);
  }
  return responder([]);
}
