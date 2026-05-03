// =============================================================================
// Route: /liga-preview
// =============================================================================
//
// Sirve la copia del widget de la Liga de Fondos Basura con datos en vivo
// (apuntando al endpoint /api/liga/snapshot?bootstrap=1).
//
// Implementado como route handler que lee el HTML pre-generado en
// `public/liga-preview-2026-05.html` y lo devuelve. Esto sortea problemas
// con el CDN de Vercel que cacheaba 404 viejos para paths de /public/.
//
// =============================================================================

import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const htmlPath = join(process.cwd(), "public", "liga-preview-2026-05.html");
  const html = await fs.readFile(htmlPath, "utf-8");
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
