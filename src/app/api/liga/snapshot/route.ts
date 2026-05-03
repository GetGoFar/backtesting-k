// =============================================================================
// API: GET /api/liga/snapshot
// =============================================================================
//
// Devuelve el último snapshot generado de la Liga de Fondos Basura.
//
// Uso principal: fallback para el widget de WordPress si su propio endpoint
// REST (/wp-json/epk/v1/liga-snapshot) no respondiera. Como el frontend de la
// liga es público (https://elproyectok.com), permitimos CORS abierto.
//
// Bootstrap on miss:
//   Si el snapshot todavía no se ha generado y la petición incluye
//   `?bootstrap=1`, se genera uno sincrónamente. Útil para preview pages que
//   quieren funcionar la primera vez sin esperar al cron semanal. Después
//   queda cacheado en Redis (o memoria) y las siguientes peticiones son
//   instantáneas.
//
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { leerSnapshot, escribirSnapshot } from "@/lib/liga-storage";
import { cargarFondosCsv, generarSnapshot } from "@/lib/liga-engine";

// El refresh tarda ~30s con 100 fondos. En Hobby Vercel limita serverless
// a 10s; Pro a 60s. Sin export explícito, Next.js usa el default del plan.
// Si el bootstrap se queda corto, el cliente verá un timeout y reintentará
// — los datos parciales no se guardan porque generarSnapshot es atómico.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  let snap = await leerSnapshot();

  if (!snap) {
    const url = new URL(req.url);
    const bootstrap = url.searchParams.get("bootstrap") === "1";
    if (bootstrap && process.env.EODHD_API_TOKEN) {
      try {
        const fondos = await cargarFondosCsv();
        snap = await generarSnapshot(fondos, {
          apiToken: process.env.EODHD_API_TOKEN,
          snapshotPrevio: null,
        });
        await escribirSnapshot(snap);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { error: "bootstrap falló", detail: msg },
          { status: 500, headers: CORS_HEADERS },
        );
      }
    } else {
      return NextResponse.json(
        { error: "snapshot todavía no generado", hint: "añade ?bootstrap=1 para auto-generarlo" },
        { status: 503, headers: CORS_HEADERS },
      );
    }
  }

  return NextResponse.json(snap, {
    headers: {
      ...CORS_HEADERS,
      // Cachear en CDN 5 min, permitir stale-while-revalidate hasta 1h
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
