// =============================================================================
// API /api/acceso/ataraxia — entrada de los socios de Ataraxia, sin código
// =============================================================================
//
// El portal de Ataraxia (repo GetGoFar/ataraxia-bot) solo se sirve a quien LearnWorlds
// confirma como socio con la membresía vigente. Su función /api/laboratorio firma un
// token corto (2 minutos) con el secreto compartido ATARAXIA_LAB_SECRET y el iframe de
// la pestaña "Laboratorio K" navega aquí con él:
//
//   GET /api/acceso/ataraxia?t=<token>&next=/?campus=1[&a=<sección>]
//
// Si la firma vale y no ha caducado, se emite la misma cookie `epk-access` que /api/acceso
// (con el hash del código reservado "ataraxia", que nadie teclea: sale del secreto) y se
// redirige al destino. Si no, a /acceso (la puerta cerrada, con el formulario de código).
//
// Formato del token (el mismo esquema que el pase de Ataraxia, con otro secreto):
//   "v1.<base64url(json)>.<base64url(HMAC-SHA256)>", json = { lw, exp } (exp en segundos Unix).
//
// Identidad (cookie `epk-socio`, 26-sep-2026): en "lw" el portal manda un identificador
// ANÓNIMO del socio (32 hex: un HMAC del id de LearnWorlds que solo el portal sabe calcular)
// o la palabra "socio" cuando no lo sabe. Con identificador, se firma con firmarIdentidad
// (lib/lab-auth.ts) y se deja en la cookie junto a epk-access: con ella Mi cartera se guarda
// en servidor (cartera:<id>). Sin él, se borra la cookie de identidad que hubiera (otro socio
// en el mismo navegador). El identificador NO se guarda en el registro de accesos.
//
// Destino, por este orden:
//   1. si `next` trae la cartera del Kopiloto (/?campus=1&k=…), manda `next` tal cual;
//   2. si viene `a` (cartera | aportar | simuladores | perfil | backtest), "/<a>?campus=1"
//      (backtest → "/?campus=1");
//   3. si no viene `a` y `next` es el de siempre ("/?campus=1"): el socio con identidad y
//      cartera guardada (cartera:<id> en Redis) aterriza en "/cartera?campus=1"; el resto,
//      en el Backtest ("/?campus=1").
// Siempre rutas relativas del propio sitio (destinoSeguro).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { ACCESS_CODES } from "@/lib/access-codes";
import { logAccess, simplifyUserAgent, truncateIp } from "@/lib/access-log";
import { cookieIdentidad, cookieIdentidadBorrar, firmarIdentidad } from "@/lib/lab-auth";
import { existeCartera } from "@/lib/cartera-store";

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

const DESTINO_POR_DEFECTO = "/?campus=1";

/** Solo rutas relativas del propio sitio: nada de mandar al socio a otro dominio. */
function destinoSeguro(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return DESTINO_POR_DEFECTO;
  return next;
}

/** Secciones del menú del Laboratorio K que admite el parámetro `a`, con su ruta. */
const SECCIONES = new Map<string, string>([
  ["cartera", "/cartera"],
  ["aportar", "/aportar"],
  ["simuladores", "/simuladores"],
  ["perfil", "/perfil"],
  ["backtest", "/"],
]);

/** Destino de la sección pedida en `a` (siempre en modo campus), o null si no viene o no existe. */
function seccionDe(a: string | null): string | null {
  const ruta = a ? SECCIONES.get(a) : undefined;
  return ruta ? destinoSeguro(ruta + "?campus=1") : null;
}

/** ¿Trae `next` la cartera montada por el Kopiloto (/?campus=1&k=…)? Ese caso manda. */
function traeKopiloto(next: string): boolean {
  return /[?&]k=/.test(next);
}

/** Solo el identificador anónimo del portal (32 hex). "socio" u otra cosa: sin identidad.
 *  "pablo" nunca nace de un token: sale de su código en /api/acceso. */
function idDelPortal(lw: string): string | null {
  return /^[0-9a-f]{32}$/.test(lw) ? lw : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams;
  const t = q.get("t") || "";
  const next = destinoSeguro(q.get("next"));
  const seccion = seccionDe(q.get("a"));
  // Destino antes de saber quién entra: el Kopiloto manda; luego la sección pedida; luego `next`.
  let destino = traeKopiloto(next) ? next : (seccion ?? next);
  const datos = t ? await verificar(t) : null;

  // Registro de accesos: etiqueta del grupo, nunca el identificador del socio.
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
    url.searchParams.set("next", destino);
    return NextResponse.redirect(url, 302);
  }

  const id = idDelPortal(datos.lw);
  const firmada = id ? await firmarIdentidad(id) : null;

  // Aterrizaje: sin sección pedida y con el destino de siempre, el socio que ya tiene cartera
  // guardada entra por Mi cartera; el resto (o sin identidad, o sin Redis), por el Backtest.
  if (!seccion && destino === DESTINO_POR_DEFECTO && id && (await existeCartera(id))) {
    destino = "/cartera?campus=1";
  }

  const hash = await sha256Hex(acceso.code);
  const url = request.nextUrl.clone();
  const [ruta, ...resto] = destino.split("?");
  url.pathname = ruta || "/";
  url.search = resto.length ? "?" + resto.join("?") : "";
  const res = NextResponse.redirect(url, 302);
  // Misma cookie que /api/acceso: HttpOnly, un año, SameSite=None + Partitioned (vive en un iframe).
  res.headers.append(
    "Set-Cookie",
    `epk-access=${hash}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; Secure; SameSite=None; Partitioned`
  );
  // Identidad: con identificador del portal se firma; si no (o sin secreto), se borra la que hubiera.
  res.headers.append("Set-Cookie", firmada ? cookieIdentidad(firmada) : cookieIdentidadBorrar());
  res.headers.set("Cache-Control", "no-store");
  return res;
}
