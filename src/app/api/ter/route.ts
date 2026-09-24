// =============================================================================
// API ROUTE: /api/ter — gastos corrientes (TER) de un puñado de fondos
// =============================================================================
//
// La caja del TER del comparador rellena SOLO lo que falta (fondos sin TER o
// marcados como no confirmados) preguntando aquí. Vive en el servidor porque
// necesita la API key de EODHD y porque el respaldo de FT.com es scraping.
//
// POST /api/ter
//   body: { fondos: [{ fundId, ticker?, isin? }] }   (máx. 30)
//   200:  { resultados: [{ fundId, ter?, fuente?, listado? }] }
//
// `ter` va en % (0.07 = 0,07 %). Si un fondo no tiene dato, vuelve sin `ter`:
// la interfaz deja la caja como estaba. Nunca devuelve error por un fondo
// suelto — un fallo de EODHD/FT no debe romper el montaje de la cartera.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { buscarTerVarios } from "@/lib/ter-lookup";

const MAX_FONDOS = 30;

interface FondoPedido {
  fundId: string;
  ticker?: string;
  isin?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const lista = (body as { fondos?: unknown })?.fondos;
    if (!Array.isArray(lista) || lista.length === 0) {
      return NextResponse.json({ error: "Falta 'fondos': [{ fundId, ticker?, isin? }]" }, { status: 400 });
    }
    if (lista.length > MAX_FONDOS) {
      return NextResponse.json({ error: `Máximo ${MAX_FONDOS} fondos por petición` }, { status: 400 });
    }

    const fondos: FondoPedido[] = [];
    for (const item of lista) {
      if (typeof item !== "object" || item === null) continue;
      const f = item as Record<string, unknown>;
      const fundId = typeof f.fundId === "string" ? f.fundId.trim() : "";
      if (!fundId) continue;
      fondos.push({
        fundId,
        ticker: typeof f.ticker === "string" && f.ticker.trim() ? f.ticker.trim() : undefined,
        isin: typeof f.isin === "string" && f.isin.trim() ? f.isin.trim() : undefined,
      });
    }
    if (fondos.length === 0) {
      return NextResponse.json({ error: "Ningún fondo válido en 'fondos'" }, { status: 400 });
    }

    const resultados = await buscarTerVarios(fondos);
    return NextResponse.json({ resultados });
  } catch (error) {
    console.error("[API /ter] Error:", error);
    return NextResponse.json({ error: "Error obteniendo el TER" }, { status: 500 });
  }
}
