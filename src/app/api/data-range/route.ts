// =============================================================================
// API ROUTE: /api/data-range - Rango de fechas disponible para un fondo
// =============================================================================
// Devuelve la primera y última fecha de datos disponibles.
// Acepta fondos locales (por fundId) y fondos externos (por ticker + isin).

import { NextRequest, NextResponse } from "next/server";
import { getDailyPrices, NoPriceDataError } from "@/lib/data-fetcher";
import { runWithContext } from "@/lib/request-context";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Yahoo data source eliminado — siempre EODHD.
  return runWithContext({ dataSource: "eodhd" }, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const fundId = searchParams.get("fundId") || "dynamic-fund";
      const ticker = searchParams.get("ticker") || undefined;
      const isin = searchParams.get("isin") || undefined;

      if (!ticker && fundId === "dynamic-fund") {
        return NextResponse.json(
          { error: "Se requiere ticker o un fundId válido" },
          { status: 400 }
        );
      }

      const { prices } = await getDailyPrices(fundId, ticker, isin);

      if (prices.size === 0) {
        return NextResponse.json({ firstDate: null, lastDate: null, months: 0 });
      }

      const dates = Array.from(prices.keys()).sort();
      const uniqueMonths = new Set(dates.map((d) => d.substring(0, 7)));
      return NextResponse.json({
        firstDate: dates[0],
        lastDate: dates[dates.length - 1],
        months: uniqueMonths.size,
      });
    } catch (error) {
      // Sin serie en el proveedor (ticker inexistente, p.ej. ZZZQQQ.FOREX):
      // 404 con rango vacío, no un 500 ni el rango de otro activo.
      if (error instanceof NoPriceDataError) {
        return NextResponse.json(
          { error: error.message, firstDate: null, lastDate: null, months: 0 },
          { status: 404 }
        );
      }
      console.error("[API /data-range] Error:", error);
      const msg = error instanceof Error ? error.message : "Error desconocido";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  });
}
