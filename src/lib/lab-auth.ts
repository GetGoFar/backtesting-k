// =============================================================================
// LAB-AUTH — la puerta del Laboratorio K dentro de las rutas de servidor
// =============================================================================
//
// El middleware protege las PÁGINAS con la cookie `epk-access` (hash del código con el que se
// entró: el derivado de Ataraxia para los socios, o el personal de Pablo), pero deja pasar todo
// /api/*. Las rutas de Mi cartera (/api/cartera/*) gastan proveedores externos (Anthropic, EODHD)
// y guardan datos por socio, así que comprueban la cookie aquí, con la misma tabla de códigos.
//
// Identidad del socio: el portal de Ataraxia manda en el token de entrada un identificador
// anónimo (32 hex, un HMAC del id de LearnWorlds que solo el portal sabe calcular). Al entrar,
// /api/acceso/ataraxia lo firma con ATARAXIA_LAB_SECRET y lo deja en la cookie `epk-socio`
// ("<id>.<firma>"), un año, Partitioned como `epk-access`. Pablo, al entrar con su código, recibe
// la identidad "pablo". Con esa identidad Mi cartera se guarda en servidor (cartera:<id>) y se ve
// igual desde cualquier dispositivo. Sin identidad, Mi cartera vive solo en el navegador.
//
// Todo con Web Crypto: vale en edge y en node.

import { NextRequest, NextResponse } from "next/server";
import { ACCESS_CODES } from "@/lib/access-codes";

const enc = new TextEncoder();
const SECRETO = (process.env.ATARAXIA_LAB_SECRET || "").trim();

export const COOKIE_ACCESO = "epk-access";
export const COOKIE_SOCIO = "epk-socio";
const UN_ANYO = 60 * 60 * 24 * 365;

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const b64url = (bytes: Uint8Array): string => {
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function hmacB64url(mensaje: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRETO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(mensaje));
  return b64url(new Uint8Array(sig));
}

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// hash de la cookie -> etiqueta del código ("ataraxia" | "pablo"). Se calcula una vez por instancia.
let tabla: Promise<Map<string, string>> | null = null;
function tablaHashes(): Promise<Map<string, string>> {
  if (!tabla) {
    tabla = Promise.all(ACCESS_CODES.map(async (c) => [await sha256Hex(c.code), c.label] as const))
      .then((pares) => new Map(pares));
  }
  return tabla;
}

/** Quién entra: la etiqueta del código de la cookie, o null si no hay cookie válida. */
export async function accesoDe(req: NextRequest): Promise<{ ok: boolean; label: string | null }> {
  const hash = req.cookies.get(COOKIE_ACCESO)?.value || "";
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, label: null };
  const label = (await tablaHashes()).get(hash) || null;
  return { ok: !!label, label };
}

/** Respuesta 401 lista para devolver desde una ruta cuando no hay acceso; null si lo hay. */
export async function exigirAcceso(req: NextRequest): Promise<NextResponse | null> {
  const a = await accesoDe(req);
  if (a.ok) return null;
  return NextResponse.json({ error: "sin_acceso", message: "Entra al Laboratorio K desde Ataraxia." }, { status: 401 });
}

// ----- Identidad del socio (cookie epk-socio) -----

/** Un identificador aceptable: el hash anónimo del portal (32 hex) o el propio de Pablo. */
export function idValido(id: string): boolean {
  return id === "pablo" || /^[0-9a-f]{32}$/.test(id);
}

/** Valor firmado para la cookie: "<id>.<firma>". Sin secreto no hay identidad (devuelve null). */
export async function firmarIdentidad(id: string): Promise<string | null> {
  if (!SECRETO || SECRETO.length < 16 || !idValido(id)) return null;
  return id + "." + (await hmacB64url("socio:" + id));
}

/** La identidad de la petición, verificada; null si no hay cookie, no vale o no hay secreto. */
export async function identidadDe(req: NextRequest): Promise<string | null> {
  const v = req.cookies.get(COOKIE_SOCIO)?.value || "";
  const i = v.indexOf(".");
  if (i <= 0 || !SECRETO || SECRETO.length < 16) return null;
  const id = v.slice(0, i), firma = v.slice(i + 1);
  if (!idValido(id)) return null;
  return igual(firma, await hmacB64url("socio:" + id)) ? id : null;
}

// ----- El token del portal (v1.<b64url(json)>.<b64url(HMAC)>, json = {lw, exp}) -----

function deB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice(0, (4 - (s.length % 4)) % 4);
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Verifica un token firmado por el portal de Ataraxia (api/laboratorio.js) con el secreto compartido:
 *  firma en tiempo constante, caducidad y forma de lw. Lo usan la entrada de socios y /api/cartera/linea. */
export async function verificarTokenPortal(token: string): Promise<{ lw: string } | null> {
  try {
    if (!SECRETO || SECRETO.length < 16) return null;
    const partes = token.split(".");
    if (partes.length !== 3 || partes[0] !== "v1") return null;
    const esperada = await hmacB64url("v1." + partes[1]);
    if (!igual(esperada, partes[2]!)) return null;
    const datos = JSON.parse(new TextDecoder().decode(deB64url(partes[1]!))) as { lw?: unknown; exp?: unknown };
    const ahora = Math.floor(Date.now() / 1000);
    if (typeof datos.exp !== "number" || datos.exp <= ahora) return null;
    const lw = String(datos.lw || "");
    if (!/^[A-Za-z0-9_@.:-]{3,80}$/.test(lw)) return null;
    return { lw };
  } catch {
    return null;
  }
}

/** Cabecera Set-Cookie de la identidad (misma forma que epk-access: un año, Partitioned). */
export function cookieIdentidad(valorFirmado: string): string {
  return `${COOKIE_SOCIO}=${valorFirmado}; Path=/; Max-Age=${UN_ANYO}; HttpOnly; Secure; SameSite=None; Partitioned`;
}

/** Cabecera Set-Cookie que borra la identidad (al cambiar de socio en el mismo navegador). */
export function cookieIdentidadBorrar(): string {
  return `${COOKIE_SOCIO}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`;
}
