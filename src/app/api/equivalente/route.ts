// =============================================================================
// API ROUTE: /api/equivalente — Comparativa histórica real activo vs indexado
// =============================================================================
//
// Toma referencia al fondo activo + el ETF indexado equivalente y devuelve los
// datos de rentabilidad histórica REAL: CAGR, valor final, serie temporal.
//
// Acepta dos formas de identificar el fondo activo:
//   1. `activeFundId` — fondo ya presente en nuestra BD local
//   2. `activeFund: { isin, ticker, id }` — fondo dinámico (encontrado vía
//      búsqueda EODHD, no en BD)
// Igual para el indexado: `indexedFundId` o `indexedFund: {...}`.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import {
  buildHistoricalComparison,
  type FundRef,
} from "@/lib/equivalente-historical";
import { runWithContext } from "@/lib/request-context";

const TIMEOUT_MS = 45_000;

interface RequestBody {
  activeFundId?: string;
  indexedFundId?: string;
  activeFund?: { id?: string; ticker?: string; isin?: string };
  indexedFund?: { id?: string; ticker?: string; isin?: string };
  initialCapital?: number;
}

function resolveRef(
  id?: string,
  snapshot?: { id?: string; ticker?: string; isin?: string }
): FundRef | null {
  if (id) return { id };
  if (snapshot && (snapshot.id || snapshot.isin || snapshot.ticker)) {
    return {
      id: snapshot.id ?? `dyn-${snapshot.isin ?? snapshot.ticker ?? "x"}`,
      ticker: snapshot.ticker,
      isin: snapshot.isin,
    };
  }
  return null;
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

      const initialCapital = Number(body.initialCapital) > 0
        ? Number(body.initialCapital)
        : 100_000;

      const active = resolveRef(body.activeFundId, body.activeFund);
      const indexed = resolveRef(body.indexedFundId, body.indexedFund);

      if (!active || !indexed) {
        return NextResponse.json(
          {
            error: "Validación fallida",
            message:
              "Se requiere activeFundId (o activeFund con ticker/ISIN) e indexedFundId (o indexedFund).",
          },
          { status: 400 }
        );
      }

      const result = await Promise.race([
        buildHistoricalComparison(active, indexed, initialCapital),
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
