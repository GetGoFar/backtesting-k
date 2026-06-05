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
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

/** Códigos de acceso aceptados. Cambia esta lista cuando quieras rotar el
 *  código publicado a los suscriptores. Se normalizan (lowercase + trim) y
 *  hashean antes de comparar, así que aquí en plano: */
const VALID_CODES = ["proyectok", "proyectok2025", "elproyectok"];

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  const validHashes = await Promise.all(VALID_CODES.map(sha256Hex));
  const isValid = validHashes.includes(candidateHash);

  if (!isValid) {
    return NextResponse.json(
      { ok: false, error: "Código incorrecto" },
      { status: 401 }
    );
  }

  // Emite la cookie con el hash. HttpOnly = el JS del cliente no puede leerla
  // (mitiga XSS). Secure = solo HTTPS. SameSite=Lax = bloqueamos CSRF básicos.
  // Max-Age = 1 año.
  const res = NextResponse.json({ ok: true });
  res.cookies.set("epk-access", candidateHash, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
