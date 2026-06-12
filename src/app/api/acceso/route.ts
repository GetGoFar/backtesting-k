// =============================================================================
// API /api/acceso — Valida el código de suscriptor y emite cookie de acceso
// =============================================================================
//
// Recibe POST { code } → calcula SHA-256 → compara con los hashes válidos →
// si coincide, devuelve la cookie HttpOnly con el hash como valor (1 año TTL).
//
// El gate server-side (middleware.ts) lee esa cookie y la verifica contra los
// mismos hashes válidos antes de servir cualquier ruta protegida. Sin cookie
// válida → redirect a /acceso.
//
// Además, REGISTRA cada intento (correcto o no) en el log de accesos
// (lib/access-log.ts → Upstash Redis): etiqueta del código, ciudad/país
// (headers de Vercel), IP truncada y navegador. Visor: /api/acceso/log.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { ACCESS_CODES } from "@/lib/access-codes";
import { logAccess, simplifyUserAgent, truncateIp } from "@/lib/access-log";

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Pista enmascarada de un código fallido: 2 primeros chars + longitud.
 *  No guardamos el texto completo (podría ser una contraseña tecleada por
 *  error), pero la pista permite detectar intentos de fuerza bruta. */
function maskFailedCode(code: string): string {
  return `INVALIDO(${code.slice(0, 2)}…${code.length})`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { code?: string } | null = null;
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const code = body?.code?.trim();
  if (!code) {
    return NextResponse.json({ ok: false, error: "Falta código" }, { status: 400 });
  }

  const candidateHash = await sha256Hex(code);
  const entries = await Promise.all(
    ACCESS_CODES.map(async (c) => ({ label: c.label, hash: await sha256Hex(c.code) }))
  );
  const matched = entries.find((e) => e.hash === candidateHash);

  // Contexto del visitante para el registro (headers de Vercel)
  const geoCity = request.headers.get("x-vercel-ip-city");
  const logEntry = {
    ts: new Date().toISOString(),
    result: (matched ? "ok" : "fail") as "ok" | "fail",
    label: matched ? matched.label : maskFailedCode(code),
    city: geoCity ? decodeURIComponent(geoCity) : undefined,
    country: request.headers.get("x-vercel-ip-country") ?? undefined,
    ip: truncateIp(request.headers.get("x-forwarded-for")),
    ua: simplifyUserAgent(request.headers.get("user-agent")),
  };
  // Fire-and-forget con red de seguridad: el login nunca falla por el log.
  await logAccess(logEntry);

  if (!matched) {
    return NextResponse.json(
      { ok: false, error: "Código incorrecto" },
      { status: 401 }
    );
  }

  // Emite la cookie con el hash. HttpOnly = el JS del cliente no puede leerla
  // (mitiga XSS). Secure = solo HTTPS. Max-Age = 1 año.
  // SameSite=None + Partitioned (CHIPS): la herramienta vive embebida en un
  // iframe del Campus de elproyectok.com — con Lax el navegador no envía la
  // cookie en contexto cross-site y el gate se convierte en un bucle (el
  // código valida pero la recarga vuelve a /acceso). Partitioned la aísla
  // por sitio embebedor, requisito de Chrome/Safari para cookies en iframes.
  // Header manual porque la opción `partitioned` de cookies.set no está
  // disponible en todas las versiones de Next.
  const res = NextResponse.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `epk-access=${candidateHash}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; Secure; SameSite=None; Partitioned`
  );
  return res;
}
