// POST /api/cartera/backtest  { activos: [{ isin, nombre, peso }] }
// Traduce Mi cartera a una cartera del Backtest: cada ISIN → holding del motor
// (catálogo curado o activo de mercado EODHD inline, vía resolver-isin).
//
// REGLA DURA: aquí solo llegan PESOS (porcentajes). El cliente ya ha convertido
// los euros a pesos (backtest-spec.ts); esta ruta nunca ve importes. Y nunca
// escribe en Mi cartera: solo lee lo que le mandan y responde.
//
// Solo para socios: exige la cookie del Laboratorio, porque gasta EODHD.

import { NextRequest, NextResponse } from "next/server";
import { exigirAcceso } from "@/lib/lab-auth";
import type { PortfolioHolding } from "@/lib/types";
import { ES_ISIN, resolver } from "@/lib/mi-cartera/resolver-isin";

export const runtime = "nodejs";
// Vercel corta la función a los 60 s; cada búsqueda EODHD tiene su propio tope de 10 s.
export const maxDuration = 60;

/** /api/backtest no admite más de 30 holdings. */
const MAX_HOLDINGS = 30;
const MAX_ENTRADA = 60;

type ActivoEntrada = { isin?: unknown; nombre?: unknown; peso?: unknown };
type Excluido = { nombre: string; motivo: string };
type Respuesta = { name: "Mi cartera"; holdings: PortfolioHolding[]; excluidos: Excluido[] };

const sinCache = { "Cache-Control": "no-store" };
const redondear = (x: number) => Math.round(x * 100) / 100;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sinAcceso = await exigirAcceso(req);
  if (sinAcceso) return sinAcceso;

  let body: { activos?: ActivoEntrada[] };
  try {
    body = (await req.json()) as { activos?: ActivoEntrada[] };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: sinCache });
  }
  const entrada = Array.isArray(body.activos) ? body.activos.slice(0, MAX_ENTRADA) : [];

  // Limpieza: ISIN en mayúsculas con formato válido y peso > 0. Lo que trae peso
  // pero no un ISIN válido se devuelve como excluido, no desaparece en silencio.
  const excluidos: Excluido[] = [];
  const limpios: { isin: string; nombre: string; peso: number }[] = [];
  for (const a of entrada) {
    const isin = String(a.isin ?? "").toUpperCase().trim();
    const nombre = String(a.nombre ?? "").trim() || isin;
    const peso = Number(a.peso);
    if (!Number.isFinite(peso) || peso <= 0) continue;
    if (!ES_ISIN.test(isin)) {
      excluidos.push({ nombre, motivo: "sin ISIN" });
      continue;
    }
    limpios.push({ isin, nombre, peso });
  }
  if (limpios.length === 0) {
    return NextResponse.json({ error: "Sin activos con ISIN", excluidos }, { status: 400, headers: sinCache });
  }

  // Un mismo ISIN puede aparecer varias veces (en distintas partes): se suma.
  const porIsin = new Map<string, { isin: string; nombre: string; peso: number }>();
  for (const a of limpios) {
    const prev = porIsin.get(a.isin);
    porIsin.set(a.isin, prev ? { ...prev, peso: prev.peso + a.peso } : a);
  }

  const resueltos = await Promise.all([...porIsin.values()].map(async (a) => ({ a, r: await resolver(a) })));
  // Dos ISIN no deberían caer en el mismo fundId, pero /api/backtest rechaza duplicados: se suman.
  const porFundId = new Map<string, { holding: PortfolioHolding; peso: number }>();
  for (const { a, r } of resueltos) {
    if (!("holding" in r)) {
      excluidos.push({ nombre: a.nombre, motivo: r.motivo });
      continue;
    }
    const prev = porFundId.get(r.holding.fundId);
    porFundId.set(r.holding.fundId, prev ? { ...prev, peso: prev.peso + a.peso } : { holding: r.holding, peso: a.peso });
  }
  if (porFundId.size === 0) {
    return NextResponse.json({ error: "Ningún activo con datos de precios", excluidos }, { status: 422, headers: sinCache });
  }

  // Los 30 de más peso; el resto se avisa. Luego se renormaliza a 100 con 2 decimales.
  const ordenados = [...porFundId.values()].sort((x, y) => y.peso - x.peso);
  const dentro = ordenados.slice(0, MAX_HOLDINGS);
  for (const fuera of ordenados.slice(MAX_HOLDINGS)) {
    excluidos.push({ nombre: fuera.holding.fund?.name ?? fuera.holding.fundId, motivo: `más de ${MAX_HOLDINGS} activos` });
  }
  const total = dentro.reduce((s, x) => s + x.peso, 0);
  const holdings: PortfolioHolding[] = dentro.map((x) => ({ ...x.holding, weight: redondear((x.peso / total) * 100) }));
  // El resto de redondeo lo absorbe el de más peso, para que sume exactamente 100.
  const suma = holdings.reduce((s, h) => s + h.weight, 0);
  const primero = holdings[0];
  if (primero && Math.abs(100 - suma) > 1e-9) primero.weight = redondear(primero.weight + (100 - suma));

  const respuesta: Respuesta = { name: "Mi cartera", holdings, excluidos };
  return NextResponse.json(respuesta, { headers: sinCache });
}
