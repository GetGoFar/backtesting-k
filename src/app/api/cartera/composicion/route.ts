// GET /api/cartera/composicion?isin=<ISIN>
// Composición real (sectores, regiones, capitalización) de un ETF o fondo de
// bolsa según EODHD y la casilla de Mi cartera que le corresponde para cada
// estrategia (sectorial, geográfica, mixta). Sin clave EODHD o sin datos:
// { composicion: null, sugerencia: { casillas: {} } } y nada se rompe.
// Solo para socios: exige la cookie del Laboratorio, porque gasta EODHD.

import { NextRequest, NextResponse } from "next/server";
import { exigirAcceso } from "@/lib/lab-auth";
import { obtenerComposicion, sugerenciaDe, type RespuestaComposicion } from "@/lib/mi-cartera/composicion";

export const runtime = "nodejs";
export const maxDuration = 20;

const ES_ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sinAcceso = await exigirAcceso(req);
  if (sinAcceso) return sinAcceso;

  const isin = (req.nextUrl.searchParams.get("isin") ?? "").trim().toUpperCase();
  if (!ES_ISIN.test(isin)) return NextResponse.json({ error: "ISIN inválido" }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const composicion = await obtenerComposicion(isin);
  const respuesta: RespuestaComposicion = { composicion, sugerencia: sugerenciaDe(composicion) };
  // Caché solo en el navegador del socio: la ruta lleva puerta.
  return NextResponse.json(respuesta, { headers: { "Cache-Control": "private, max-age=86400" } });
}
