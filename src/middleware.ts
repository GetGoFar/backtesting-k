// =============================================================================
// MIDDLEWARE — control de acceso público
// =============================================================================
//
// La herramienta de backtesting (/) es interna del equipo. Públicamente solo
// queremos exponer:
//   - /informe/[isin]      → informe personalizado del lead capturado
//   - /api/*               → endpoints REST que consume el widget de WordPress
//   - /_next/*, /icon.svg  → assets de Next.js + favicon
//   - /wordpress/*         → fichero del fetcher (servido desde /public, no
//                             pasa por aquí pero lo permitimos por claridad)
//
// Cualquier otra ruta (la home con la herramienta, /liga-preview, páginas
// futuras…) redirige a https://elproyectok.com.
//
// =============================================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const RUTAS_PUBLICAS_PREFIJO = ["/api/", "/informe/", "/_next/", "/wordpress/"];
const RUTAS_PUBLICAS_EXACTAS = new Set([
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.svg",
  "/robots.txt",
]);
const REDIRECT_DESTINO = "https://elproyectok.com";

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Permitir explícitamente las rutas públicas
  if (RUTAS_PUBLICAS_EXACTAS.has(pathname)) return NextResponse.next();
  for (const prefijo of RUTAS_PUBLICAS_PREFIJO) {
    if (pathname.startsWith(prefijo)) return NextResponse.next();
  }

  // Cualquier otra cosa → fuera. Redirect 302 a la web pública del proyecto.
  return NextResponse.redirect(REDIRECT_DESTINO, 302);
}

// Excluir static internals: /public files NO pasan por middleware en Next.js,
// pero los assets generados de Next sí — los exceptuamos aquí para evitar
// gasto de invocaciones.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|icon.svg|apple-icon.svg).*)",
  ],
};
