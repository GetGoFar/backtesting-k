// =============================================================================
// API ROUTE: /api/prices - Precios históricos de un fondo
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getMonthlyPrices } from "@/lib/data-fetcher";
import { getFundById } from "@/lib/fund-database";

/**
 * GET /api/prices
 *
 * Devuelve los precios históricos mensuales de un fondo.
 *
 * Query params:
 * - fundId: string (requerido) - ID del fondo
 * - from: string (opcional) - Fecha inicio en formato YYYY-MM
 * - to: string (opcional) - Fecha fin en formato YYYY-MM
 *
 * Respuestas:
 * - 200: Lista de precios
 * - 400: Parámetros inválidos
 * - 404: Fondo no encontrado
 * - 500: Error interno
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Validar fundId requerido
    if (!fundId || fundId.trim() === "") {
      return NextResponse.json(
        {
          error: "Parámetro requerido",
          message: "El parámetro 'fundId' es obligatorio.",
        },
        { status: 400 }
      );
    }

    // Validar que el fondo existe
    const fund = getFundById(fundId);
    if (!fund) {
      return NextResponse.json(
        {
          error: "Fondo no encontrado",
          message: `No se encontró ningún fondo con el ID '${fundId}'. Usa /api/funds para ver los fondos disponibles.`,
        },
        { status: 404 }
      );
    }

    // Validar formato de fechas si se proporcionan
    const dateRegex = /^\d{4}-\d{2}$/;

    if (from && !dateRegex.test(from)) {
      return NextResponse.json(
        {
          error: "Formato de fecha inválido",
          message: `El parámetro 'from' debe tener formato YYYY-MM. Valor recibido: '${from}'`,
        },
        { status: 400 }
      );
    }

    if (to && !dateRegex.test(to)) {
      return NextResponse.json(
        {
          error: "Formato de fecha inválido",
          message: `El parámetro 'to' debe tener formato YYYY-MM. Valor recibido: '${to}'`,
        },
        { status: 400 }
      );
    }

    // Validar que from <= to si ambas se proporcionan
    if (from && to && from > to) {
      return NextResponse.json(
        {
          error: "Rango de fechas inválido",
          message: `La fecha 'from' (${from}) no puede ser posterior a 'to' (${to}).`,
        },
        { status: 400 }
      );
    }

    // Obtener precios usando el data-fetcher con caché
    const pricesMap = await getMonthlyPrices(fundId);

    // Convertir Map a array y filtrar por rango de fechas
    let prices: Array<{ date: string; price: number }> = [];

    for (const [date, price] of pricesMap) {
      // Filtrar por rango de fechas
      if (from && date < from) continue;
      if (to && date > to) continue;

      prices.push({ date, price });
    }

    // Ordenar por fecha
    prices.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      fundId,
      fundName: fund.name,
      currency: fund.currency,
      prices,
      total: prices.length,
      range: {
        from: prices[0]?.date ?? null,
        to: prices[prices.length - 1]?.date ?? null,
      },
    });
  } catch (error) {
    console.error("[API /prices] Error:", error);

    const errorMessage = error instanceof Error ? error.message : "Error desconocido";

    return NextResponse.json(
      {
        error: "Error al obtener precios",
        message: `No se pudieron obtener los precios históricos: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
