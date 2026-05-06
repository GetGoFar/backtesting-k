// =============================================================================
// API: GET /api/informe-fondo?isin=...
// =============================================================================
//
// Devuelve los datos del informe (fondo del user vs Cartera K10 Sectorial)
// para que la página /informe/[isin] los renderice. Resultado cacheado en
// CDN porque los NAVs no cambian dentro del día.
//
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { generarInformeFondo } from "@/lib/informe-fondo";
import { obtenerAlfasMorningstar } from "@/lib/morningstar-alfa";
import { getFundByIsin } from "@/lib/fund-database";

export const maxDuration = 60;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const RE_ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const rawIsin = url.searchParams.get("isin") || "";
  const isin = rawIsin.trim().toUpperCase();
  // Cliente puede enviar el nombre del fondo (si ya lo conoce) para evitar
  // un round-trip a Morningstar. Útil cuando la calculadora ya lo resolvió.
  const nombreCliente = (url.searchParams.get("nombre") || "").trim().slice(0, 200);

  if (!RE_ISIN.test(isin)) {
    return NextResponse.json(
      { ok: false, error: "isin_invalido" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const apiToken = process.env.EODHD_API_TOKEN;
  if (!apiToken) {
    return NextResponse.json(
      { ok: false, error: "config_missing" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  // Resolver el nombre del fondo: cliente > db curada > Morningstar > ISIN.
  let nombreFondo = isin;
  if (nombreCliente) {
    nombreFondo = nombreCliente;
  } else {
    const curated = getFundByIsin(isin);
    if (curated) {
      nombreFondo = curated.name;
    } else {
      try {
        const ms = await obtenerAlfasMorningstar(isin);
        if (ms?.nombre) nombreFondo = ms.nombre;
      } catch {
        // Si Morningstar bloquea, mantenemos el ISIN como fallback
      }
    }
  }

  try {
    const informe = await generarInformeFondo(isin, nombreFondo);
    if (!informe) {
      return NextResponse.json(
        {
          ok: false,
          error: "datos_insuficientes",
          detail:
            "No tenemos histórico suficiente para este fondo o para los componentes de la cartera K10. " +
            "Suele pasar con fondos muy nuevos (<13 meses) o muy poco transparentes.",
        },
        { status: 200, headers: { ...CORS_HEADERS, "Cache-Control": "public, s-maxage=300" } },
      );
    }
    return NextResponse.json(
      { ok: true, informe },
      {
        headers: {
          ...CORS_HEADERS,
          // 12h cache CDN — los NAVs cambian a lo sumo 1x/día. Stale-while-revalidate
          // permite servir mientras se regenera detrás.
          "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[informe-fondo]", msg);
    return NextResponse.json(
      { ok: false, error: "interno", detail: msg },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
