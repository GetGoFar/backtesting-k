// =============================================================================
// MIDDLEWARE — control de acceso público
// =============================================================================
//
// Capa edge de control de acceso. La home (/) ya está protegida por el
// componente <AccessGate> que pide código de suscriptor, así que aquí solo
// bloqueamos rutas internas/dev no destinadas a usuarios.
//
// Rutas permitidas:
//   - /                    → home con herramienta de Backtest (AccessGate gestiona el código)
//   - /momentum            → herramienta de Momentum / Relative Strength
//   - /informe/[isin]      → informe personalizado del lead capturado
//   - /api/*               → endpoints REST que consume el widget de WordPress
//   - /_next/*, /icon.svg  → assets de Next.js + favicon
//   - /wordpress/*         → fetcher servido desde /public
//
// Cualquier otra ruta (futuras páginas internas, /liga-preview…) redirige
// a https://elproyectok.com.
//
// =============================================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const RUTAS_PUBLICAS_PREFIJO = ["/api/", "/informe/", "/_next/", "/wordpress/"];
const RUTAS_PUBLICAS_EXACTAS = new Set([
  "/",
  "/momentum",
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
