// =============================================================================
// MIDDLEWARE — control de acceso público + gate server-side de suscriptores
// =============================================================================
//
// Dos capas:
//
//  1) **Filtro de rutas públicas vs internas**. Si la ruta no está en las
//     listas blancas, redirigimos a elproyectok.com (página interna no
//     destinada a usuarios).
//
//  2) **Gate de suscriptor (SERVER-SIDE)**. Las rutas "gated" sólo se sirven
//     si el cookie `epk-access` lleva un hash SHA-256 que coincide con uno de
//     los códigos válidos. Sin cookie válida → redirect a /acceso.
//     ANTES había un gate solo en cliente (componente AccessGate.tsx) que se
//     podía saltar desactivando JS o manipulando localStorage. Esto es server-
//     side, no se puede esquivar.
//
// Rutas:
//   GATED (requieren cookie):       /, /momentum, /kray, /equivalente, /jubilacion
//   PÚBLICAS (sin cookie):          /acceso, /simulador-retiro, /informe/[isin],
//                                   /api/*, /_next/*, /wordpress/*
//   INTERNAS (redirect a EPK):      cualquier otra
// =============================================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_CODES } from "@/lib/access-codes";

const RUTAS_PUBLICAS_PREFIJO = ["/api/", "/informe/", "/_next/", "/wordpress/"];
const RUTAS_PUBLICAS_EXACTAS = new Set([
  "/acceso",
  "/simulador-retiro",
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.svg",
  "/robots.txt",
]);

/** Rutas que requieren el cookie `epk-access` válido. */
const RUTAS_GATED = new Set([
  "/",
  "/momentum",
  "/kray",
  "/equivalente",
  "/jubilacion",
  "/cartera-backtest",
  "/cartera-analisis",
  "/cartera-seguimiento",
]);

/** Prefijos gated: estáticos de /public que también exigen la cookie.
 *  /cartera-core = app Cartera Core K, embebida en elproyectok.com/campus/cartera/ */
const PREFIJOS_GATED = ["/cartera-core"];

const REDIRECT_DESTINO = "https://elproyectok.com";

// Códigos válidos centralizados en lib/access-codes.ts (con etiquetas de
// audiencia para el registro de accesos). Añadir códigos allí, no aquí.
const VALID_CODES = ACCESS_CODES.map((c) => c.code);

/** Calcula SHA-256 hex usando Web Crypto API (compatible con edge runtime). */
async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let cachedValidHashes: string[] | null = null;
async function getValidHashes(): Promise<string[]> {
  if (cachedValidHashes) return cachedValidHashes;
  cachedValidHashes = await Promise.all(VALID_CODES.map(sha256Hex));
  return cachedValidHashes;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // 1. Permitir explícitamente las rutas públicas
  if (RUTAS_PUBLICAS_EXACTAS.has(pathname)) return NextResponse.next();
  for (const prefijo of RUTAS_PUBLICAS_PREFIJO) {
    if (pathname.startsWith(prefijo)) return NextResponse.next();
  }

  // 2. Si es una ruta gated → chequear cookie
  if (RUTAS_GATED.has(pathname) || PREFIJOS_GATED.some((p) => pathname.startsWith(p))) {
    const cookie = req.cookies.get("epk-access");
    if (!cookie?.value) {
      // Sin cookie → al login
      const url = req.nextUrl.clone();
      url.pathname = "/acceso";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    const validHashes = await getValidHashes();
    if (!validHashes.includes(cookie.value)) {
      // Cookie inválida → al login con flag de error
      const url = req.nextUrl.clone();
      url.pathname = "/acceso";
      url.searchParams.set("next", pathname);
      url.searchParams.set("error", "1");
      const res = NextResponse.redirect(url);
      // Borrar las dos variantes posibles de la cookie: la identidad de una
      // cookie incluye su partición, así que la Partitioned (emitida desde el
      // iframe del Campus) y la clásica (visitas directas, antigua Lax) se
      // eliminan con cabeceras separadas.
      res.headers.append(
        "Set-Cookie",
        "epk-access=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned"
      );
      res.headers.append(
        "Set-Cookie",
        "epk-access=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
      );
      return res;
    }
    return NextResponse.next();
  }

  // 3. Cualquier otra ruta → redirect a la web pública del proyecto
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
