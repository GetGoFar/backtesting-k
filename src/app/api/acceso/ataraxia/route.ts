// =============================================================================
// API /api/acceso/ataraxia — entrada de los socios de Ataraxia, sin código
// =============================================================================
//
// El portal de Ataraxia (repo GetGoFar/ataraxia-bot) solo se sirve a quien LearnWorlds
// confirma como socio con la membresía vigente. Su función /api/laboratorio firma un
// token corto (2 minutos) con el secreto compartido ATARAXIA_LAB_SECRET y el iframe de
// la pestaña "Laboratorio K" navega aquí con él:
//
//   GET /api/acceso/ataraxia?t=<token>&next=/?campus=1
//
// Si la firma vale y no ha caducado, se emite la misma cookie `epk-access` que /api/acceso
// (con el hash del código reservado "ataraxia", que nadie teclea: sale del secreto) y se
// redirige a `next`. Si no, a /acceso (el formulario de código de siempre).
//
// Formato del token (el mismo esquema que el pase de Ataraxia, con otro secreto):
//   "v1.<base64url(json)>.<base64url(HMAC-SHA256)>", json = { lw, exp } (exp en segundos Unix).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { ACCESS_CODES } from "@/lib/access-codes";
import { logAccess, simplifyUserAgent, truncateIp } from "@/lib/access-log";

export const dynamic = "force-dynamic";

const SECRETO = (process.env.ATARAXIA_LAB_SECRET || "").trim();
const enc = new TextEncoder();
const dec = new TextDecoder();

async function sha256Hex(value: string): Promise<string> {
  const data = enc.encode(value.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function deB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice(0, (4 - (s.length % 4)) % 4);
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function igual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

/** Devuelve { lw } si el token está bien firmado y vigente; si no, null. Nunca lanza. */
async function verificar(token: string): Promise<{ lw: string } | null> {
  try {
    if (!SECRETO || SECRETO.length < 16) return null;
    const partes = token.split(".");
    if (partes.length !== 3 || partes[0] !== "v1") return null;
    const clave = await crypto.subtle.importKey("raw", enc.encode(SECRETO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const esperada = new Uint8Array(await crypto.subtle.sign("HMAC", clave, enc.encode("v1." + partes[1])));
    if (!igual(esperada, deB64url(partes[2]!))) return null;
    const datos = JSON.parse(dec.decode(deB64url(partes[1]!))) as { lw?: unknown; exp?: unknown };
    const ahora = Math.floor(Date.now() / 1000);
    if (typeof datos.exp !== "number" || datos.exp <= ahora) return null;
    const lw = String(datos.lw || "");
    if (!/^[A-Za-z0-9_@.:-]{3,80}$/.test(lw)) return null;
    return { lw };
  } catch {
    return null;
  }
}

/** Solo rutas relativas del propio sitio: nada de mandar al socio a otro dominio. */
function destinoSeguro(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/?campus=1";
  return next;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const t = request.nextUrl.searchParams.get("t") || "";
  const next = destinoSeguro(request.nextUrl.searchParams.get("next"));
  const datos = t ? await verificar(t) : null;

  const geoCity = request.headers.get("x-vercel-ip-city");
  const entrada = {
    ts: new Date().toISOString(),
    result: (datos ? "ok" : "fail") as "ok" | "fail",
    label: datos ? "ataraxia" : "INVALIDO(ataraxia)",
    city: geoCity ? decodeURIComponent(geoCity) : undefined,
    country: request.headers.get("x-vercel-ip-country") ?? undefined,
    ip: truncateIp(request.headers.get("x-forwarded-for")),
    ua: simplifyUserAgent(request.headers.get("user-agent")),
  };
  await logAccess(entrada);

  const acceso = ACCESS_CODES.find((c) => c.label === "ataraxia");
  if (!datos || !acceso) {
    const url = request.nextUrl.clone();
    url.pathname = "/acceso";
    url.search = "";
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, 302);
  }

  const hash = await sha256Hex(acceso.code);
  const url = request.nextUrl.clone();
  url.pathname = next.split("?")[0] || "/";
  url.search = next.includes("?") ? "?" + next.split("?").slice(1).join("?") : "";
  const res = NextResponse.redirect(url, 302);
  // Misma cookie que /api/acceso: HttpOnly, un año, SameSite=None + Partitioned (vive en un iframe).
  res.headers.append(
    "Set-Cookie",
    `epk-access=${hash}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; Secure; SameSite=None; Partitioned`
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
