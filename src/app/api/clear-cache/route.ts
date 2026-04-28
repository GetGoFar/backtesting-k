// =============================================================================
// API ROUTE: /api/clear-cache - Limpiar caché de precios
// =============================================================================
// Fuerza la re-descarga de datos desde EODHD/fuentes originales
// Útil después de migrar fuentes de datos o para debugging

import { NextResponse } from "next/server";
import { clearMemoryCache } from "@/lib/kv-cache";

export async function POST(): Promise<NextResponse> {
  const cleared = clearMemoryCache();
  return NextResponse.json({
    success: true,
    message: `Cache de memoria limpiada: ${cleared} entradas eliminadas`,
    entriesCleared: cleared,
  });
}

export async function GET(): Promise<NextResponse> {
  const cleared = clearMemoryCache();
  return NextResponse.json({
    success: true,
    message: `Cache de memoria limpiada: ${cleared} entradas eliminadas`,
    entriesCleared: cleared,
  });
}
