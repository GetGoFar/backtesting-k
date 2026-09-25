// GET /api/cartera/buscar?q=<nombre o ISIN>
// Búsqueda de activos para Mi cartera, en proceso (esta ruta vive dentro del
// propio Laboratorio K; no llama a ningún dominio fijo):
//   - catálogo curado (src/lib/fund-database): instantáneo, con categoría. El
//     mismo filtrado que /api/funds?search= pero SIN el filtro de campus,
//     porque el socio mete sus propios ISIN.
//   - mercado (src/lib/eodhd-search): EODHD, más lento (1-5 s), cualquier
//     activo cotizado.
// Se unen, se quitan duplicados por ISIN y se sugiere categoría.
// Solo para socios: exige la cookie del Laboratorio, porque gasta EODHD.

import { NextRequest, NextResponse } from "next/server";
import { exigirAcceso } from "@/lib/lab-auth";
import { filterFundsByQuery, getAllFunds } from "@/lib/fund-database";
import { buscarMercado, type ResultadoBusqueda } from "@/lib/eodhd-search";
import { acortarNombre, categoriaDesdeCatalogo, esIsin, type Activo, type TipoActivo } from "@/lib/mi-cartera/buscar";

function tipoPorNombre(nombre: string, porDefecto: TipoActivo): TipoActivo {
  return /\bETF\b|\bETC\b|UCITS ETF/i.test(nombre) ? "etf" : porDefecto;
}

/** Catálogo curado. Los pares de divisas y el oro spot del catálogo no tienen ISIN real y se quedan fuera. */
function catalogo(q: string): Activo[] {
  return filterFundsByQuery(getAllFunds(), q)
    .filter((f) => f.isin && f.name && esIsin(f.isin))
    .map((f) => {
      const tipo = tipoPorNombre(f.name, "fondo");
      return { nombre: f.name, isin: f.isin.toUpperCase(), tipo, categoriaSugerida: categoriaDesdeCatalogo(f.category, f.name, tipo), origen: "catalogo" as const };
    });
}

async function mercado(q: string): Promise<Activo[]> {
  let resultados: ResultadoBusqueda[] = [];
  try {
    resultados = await buscarMercado(q);
  } catch {
    resultados = [];
  }
  return resultados
    .filter((r) => r.isin && r.name && !r.isCurrency)
    .map((r) => {
      const nombre = acortarNombre(r.name);
      const t = r.type.toUpperCase();
      const tipo: TipoActivo = t === "ETF" ? "etf" : t === "MUTUALFUND" || t === "FUND" ? "fondo" : t === "STOCK" || r.isStock ? "accion" : tipoPorNombre(nombre, "otro");
      return { nombre, isin: (r.isin ?? "").toUpperCase(), tipo, categoriaSugerida: categoriaDesdeCatalogo(undefined, nombre, tipo), origen: "mercado" as const };
    });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sinAcceso = await exigirAcceso(req);
  if (sinAcceso) return sinAcceso;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ activos: [] });

  const [local, remoto] = await Promise.all([catalogo(q), mercado(q)]);
  const vistos = new Set<string>();
  const activos: Activo[] = [];
  for (const a of [...local, ...remoto]) {
    if (vistos.has(a.isin)) continue;
    vistos.add(a.isin);
    activos.push(a);
    if (activos.length >= 15) break;
  }
  // Caché solo en el navegador del socio: la ruta lleva puerta y una copia en
  // el CDN se serviría sin pasar por ella.
  return NextResponse.json({ activos }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
