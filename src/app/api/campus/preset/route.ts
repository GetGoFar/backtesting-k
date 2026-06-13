// =============================================================================
// API ROUTE: /api/campus/preset
// =============================================================================
// Devuelve la cartera K OFICIAL (preset ya diseñado) para (estrategia, perfil),
// con los instrumentos reales (ISIN, ticker, nombre, peso, categoría). Es la
// fuente única para que el campus construya la cartera del alumno a partir de
// las carteras diseñadas en el backtester, en vez de elegir instrumentos por su
// cuenta (lo que metía bonos solapados / sin datos).
//
//   estrategia "geo"    -> familia k-geografica-ucit-N  (K Geográfica UCIT)
//   estrategia "sector" -> familia k-inbestme-N         (K Inbestme / Sectorial)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getPresetById } from "@/lib/portfolio-presets";
import { getFundById } from "@/lib/fund-database";

const FAMILIA: Record<string, string> = {
  geo: "k-geografica-ucit",
  geografica: "k-geografica-ucit",
  sector: "k-inbestme",
  sectorial: "k-inbestme",
};

export function GET(request: NextRequest): NextResponse {
  const { searchParams } = new URL(request.url);
  const estrategia = (searchParams.get("strategy") || searchParams.get("estrategia") || "sector").toLowerCase();
  const profile = Math.round(Number(searchParams.get("profile") || searchParams.get("perfil")));

  const familia = FAMILIA[estrategia];
  if (!familia) {
    return NextResponse.json(
      { error: "Estrategia inválida", message: `Usa 'geo' o 'sector'. Recibido: '${estrategia}'.` },
      { status: 400 }
    );
  }
  if (!Number.isFinite(profile) || profile < 1 || profile > 10) {
    return NextResponse.json(
      { error: "Perfil inválido", message: "El perfil debe ser 1-10." },
      { status: 400 }
    );
  }

  const preset = getPresetById(`${familia}-${profile}`);
  if (!preset) {
    return NextResponse.json(
      { error: "Sin preset", message: `No existe ${familia}-${profile}.` },
      { status: 404 }
    );
  }

  const holdings = preset.holdings.map((h) => {
    const f = getFundById(h.fundId);
    return {
      fundId: h.fundId,
      weight: h.weight,
      isin: f?.isin ?? null,
      ticker: f?.ticker ?? null,
      name: f?.shortName || f?.name || h.fundId,
      category: f?.category ?? null,
    };
  });

  return NextResponse.json({
    family: familia,
    strategy: estrategia,
    profile,
    presetId: preset.id,
    presetName: preset.name,
    description: preset.description,
    holdings,
  });
}
