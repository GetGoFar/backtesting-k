// =============================================================================
// Route: GET /liga-preview
// =============================================================================
//
// Sirve la copia del widget de la Liga de Fondos Basura con datos en vivo
// (apuntando a /api/liga/snapshot?bootstrap=1).
//
// Implementado como route handler (no page.tsx) porque el contenido es un
// documento HTML completo (con <html>, <head>, <body>) que no encaja como
// React component sin pasar por dangerouslySetInnerHTML.
//
// El HTML pre-generado vive en public/liga-preview-2026-05.html — esta route
// lo lee en runtime y lo devuelve. Sortea el problema del CDN de Vercel
// que cacheaba 404 antiguos para paths estáticos en /preview/.
//
// =============================================================================

import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const htmlPath = join(process.cwd(), "public", "liga-preview-2026-05.html");
    const html = await fs.readFile(htmlPath, "utf-8");
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`liga-preview error: ${msg}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
