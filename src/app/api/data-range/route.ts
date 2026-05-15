// =============================================================================
// API ROUTE: /api/data-range - Rango de fechas disponible para un fondo
// =============================================================================
// Devuelve la primera y última fecha de datos disponibles.
// Acepta fondos locales (por fundId) y fondos externos (por yahooTicker + isin).

import { NextRequest, NextResponse } from "next/server";
import { getDailyPrices } from "@/lib/data-fetcher";
import { runWithContext } from "@/lib/request-context";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const headerSource = request.headers.get("x-data-source");
  const dataSource: "eodhd" | "yahoo" = headerSource === "yahoo" ? "yahoo" : "eodhd";

  return runWithContext({ dataSource }, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const fundId = searchParams.get("fundId") || "dynamic-fund";
      const yahooTicker = searchParams.get("yahooTicker") || undefined;
      const isin = searchParams.get("isin") || undefined;

      if (!yahooTicker && fundId === "dynamic-fund") {
        return NextResponse.json(
          { error: "Se requiere yahooTicker o un fundId válido" },
          { status: 400 }
        );
      }

      const { prices } = await getDailyPrices(fundId, yahooTicker, isin);

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
      console.error("[API /data-range] Error:", error);
      const msg = error instanceof Error ? error.message : "Error desconocido";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  });
}
