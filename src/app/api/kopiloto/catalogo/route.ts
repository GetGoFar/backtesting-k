// =============================================================================
// API ROUTE: /api/kopiloto/catalogo — universo que conoce el Kopiloto de ATARAXIA
// =============================================================================
//
// El copiloto (ataraxia-bot.vercel.app) traduce peticiones en lenguaje natural
// a carteras del comparador. Para mapear "MSCI World" → `ishares-msci-world` o
// "Cartera K perfil 6" → `k-geografica-ucit-6` necesita saber QUÉ existe, y la
// única fuente de verdad es este repo. Este endpoint se lo da en un JSON
// compacto y determinista (ordenado por id, para que el prompt se cachee).
//
// Universo = el del campus (sin productos de banca ni fondos activos de clientes
// de consultoría) + todos los indexados sin banco + las familias de presets
// visibles en el campus + los índices de referencia. Pública, como el resto
// de /api/*; no expone nada que /api/funds no exponga ya.
// =============================================================================

import { NextResponse } from "next/server";
import { getAllFunds } from "@/lib/fund-database";
import { getAllPresets } from "@/lib/portfolio-presets";
import { getAllBenchmarks } from "@/lib/benchmarks";
import { isInCampusWhitelist, isInCampusFundIds } from "@/lib/campus-whitelist";
import { isCampusPreset } from "@/lib/campus-client";

export function GET(): NextResponse {
  const fondos = getAllFunds()
    // Universo: lo que ve el campus + cualquier indexado sin banco detrás (ETFs
    // UCITS y fondos índice; las acciones sueltas "stock-*" no, no son método).
    // Así entran el All-World (VWCE) o el ACWI, que la whitelist del campus no lista.
    .filter(
      (f) =>
        !f.bank &&
        ((f.type === "index" && !f.id.startsWith("stock-")) ||
          isInCampusWhitelist(f.isin) ||
          isInCampusFundIds(f.id))
    )
    .map((f) => ({
      id: f.id,
      nombre: f.name,
      corto: f.shortName,
      isin: f.isin,
      categoria: f.category,
      tipo: f.type,
      ter: f.ter,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const carteras = getAllPresets()
    .filter((p) => isCampusPreset(p.id))
    .map((p) => ({ id: p.id, nombre: p.name, descripcion: p.description }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const benchmarks = getAllBenchmarks()
    .map((b) => ({ id: `bm:${b.id}`, nombre: b.name }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return NextResponse.json(
    { version: 1, fondos, carteras, benchmarks },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
  );
}
