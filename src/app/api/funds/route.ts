// =============================================================================
// API ROUTE: /api/funds - Lista de fondos disponibles
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import {
  getAllFunds,
  getFundsByType,
} from "@/lib/fund-database";
import type { Fund, FundType } from "@/lib/types";

/**
 * GET /api/funds
 *
 * Devuelve la lista de fondos disponibles.
 *
 * Query params opcionales:
 * - type: "index" | "active" - Filtra por tipo de fondo
 * - search: string - Busca por nombre, ISIN, categoría o banco
 *
 * Respuestas:
 * - 200: Lista de fondos
 * - 400: Parámetros inválidos
 * - 500: Error interno
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type");
    const searchParam = searchParams.get("search");

    let funds: Fund[];

    // Validar y aplicar filtro por tipo
    if (typeParam) {
      if (typeParam !== "index" && typeParam !== "active") {
        return NextResponse.json(
          {
            error: "Parámetro inválido",
            message: `El parámetro 'type' debe ser 'index' o 'active'. Valor recibido: '${typeParam}'`,
          },
          { status: 400 }
        );
      }
      funds = getFundsByType(typeParam as FundType);
    } else {
      funds = getAllFunds();
    }

    // Aplicar búsqueda si se especifica
    if (searchParam && searchParam.trim() !== "") {
      const searchLower = searchParam.toLowerCase().trim();
      funds = funds.filter(
        (fund) =>
          fund.name.toLowerCase().includes(searchLower) ||
          fund.shortName.toLowerCase().includes(searchLower) ||
          fund.isin.toLowerCase().includes(searchLower) ||
          fund.category.toLowerCase().includes(searchLower) ||
          fund.bank?.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json({
      funds,
      total: funds.length,
    });
  } catch (error) {
    console.error("[API /funds] Error:", error);

    return NextResponse.json(
      {
        error: "Error interno del servidor",
        message: "No se pudo obtener la lista de fondos. Inténtalo de nuevo más tarde.",
      },
      { status: 500 }
    );
  }
}
