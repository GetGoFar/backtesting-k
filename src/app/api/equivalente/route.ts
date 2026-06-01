// =============================================================================
// API ROUTE: /api/equivalente — Comparativa histórica real activo vs indexado
// =============================================================================
//
// Toma el ID de un fondo activo + el ID de su ETF indexado equivalente y
// devuelve los datos de rentabilidad histórica REAL: CAGR, valor final, serie
// temporal normalizada al capital inicial. Usa los NAVs mensuales del
// data-fetcher (EODHD + CSV) sin asumir nada sobre el retorno bruto.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { buildHistoricalComparison } from "@/lib/equivalente-historical";
import { runWithContext } from "@/lib/request-context";

const TIMEOUT_MS = 45_000;

interface RequestBody {
  activeFundId?: string;
  indexedFundId?: string;
  initialCapital?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runWithContext({ dataSource: "eodhd" }, async () => {
    try {
      let body: RequestBody;
      try {
        body = (await request.json()) as RequestBody;
      } catch {
        return NextResponse.json(
          { error: "JSON inválido", message: "Cuerpo de petición mal formado." },
          { status: 400 }
        );
      }

      const { activeFundId, indexedFundId } = body;
      const initialCapital = Number(body.initialCapital) > 0
        ? Number(body.initialCapital)
        : 100_000;

      if (!activeFundId || !indexedFundId) {
        return NextResponse.json(
          {
            error: "Validación fallida",
            message: "Se requieren activeFundId e indexedFundId.",
          },
          { status: 400 }
        );
      }

      const result = await Promise.race([
        buildHistoricalComparison(activeFundId, indexedFundId, initialCapital),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS)
        ),
      ]);

      if (!result) {
        return NextResponse.json(
          {
            error: "Sin solapamiento",
            message:
              "No hay un periodo común suficiente con datos NAV en ambos fondos. Prueba con otro fondo activo o con un ETF equivalente alternativo.",
          },
          { status: 422 }
        );
      }

      return NextResponse.json(result);
    } catch (err) {
      console.error("[API /equivalente] Error:", err);
      if (err instanceof Error && err.message === "TIMEOUT") {
        return NextResponse.json(
          {
            error: "Tiempo de espera agotado",
            message: "La carga de datos históricos tardó demasiado.",
          },
          { status: 408 }
        );
      }
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return NextResponse.json(
        { error: "Error al construir comparativa", message: msg },
        { status: 500 }
      );
    }
  });
}
