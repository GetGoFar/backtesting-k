// =============================================================================
// API: POST /api/liga/refresh
// =============================================================================
//
// Regenera el snapshot de la Liga de Fondos Basura desde EODHD y lo persiste
// en Redis. Opcionalmente lo empuja al endpoint REST de WordPress.
//
// Disparado por Vercel Cron (vercel.json) todos los lunes a las 06:00 UTC.
// También accesible manualmente con `curl -H "Authorization: Bearer ..."`.
//
// Variables de entorno requeridas:
//   - EODHD_API_TOKEN
//   - CRON_SECRET                 // protege este endpoint
//   - WORDPRESS_URL               // p.ej. https://elproyectok.com
//   - WP_LIGA_TOKEN               // token estatico que valida el snippet PHP
//                                 // (Application Passwords esta deshabilitado
//                                 // en este WP, asi que usamos un header
//                                 // custom X-Liga-Token en vez de Basic Auth)
//
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import {
  cargarFondosCsv,
  generarSnapshot,
  type SnapshotLiga,
} from "@/lib/liga-engine";
import { escribirSnapshot, leerSnapshot } from "@/lib/liga-storage";

// Vercel Cron firma las peticiones con un header. En invocación manual usamos
// el mismo Bearer en CRON_SECRET para autenticar.
function autorizado(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const apiToken = process.env.EODHD_API_TOKEN;
  if (!apiToken) {
    return NextResponse.json({ error: "EODHD_API_TOKEN no configurado" }, { status: 500 });
  }

  try {
    const t0 = Date.now();
    const fondos = await cargarFondosCsv();
    const snapshotPrevio = await leerSnapshot();
    const snap = await generarSnapshot(fondos, { apiToken, snapshotPrevio });
    await escribirSnapshot(snap);

    let pushedToWp: { ok: boolean; status?: number; error?: string } | null = null;
    if (process.env.WORDPRESS_URL && process.env.WP_LIGA_TOKEN) {
      pushedToWp = await empujarAWordPress(snap);
    }

    const ms = Date.now() - t0;
    return NextResponse.json({
      ok: true,
      durationMs: ms,
      totalFondos: snap.totalFondos,
      fondosOk: snap.fondosOk,
      fondosStale: snap.fondosStale,
      generadoEn: snap.generadoEn,
      pushedToWp,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[liga/refresh] error:", err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// El cron de Vercel hace GET por defecto — aceptamos también GET para evitar
// fricción en el setup; comparte la misma autenticación.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}

async function empujarAWordPress(
  snap: SnapshotLiga,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = `${process.env.WORDPRESS_URL}/wp-json/epk/v1/liga-snapshot`;
  const token = process.env.WP_LIGA_TOKEN ?? "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Liga-Token": token,
      },
      body: JSON.stringify(snap),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: txt.slice(0, 300) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
