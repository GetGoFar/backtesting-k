// =============================================================================
// API ROUTE: /api/kray — Radiografía de cartera (composición agregada)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { runKray } from "@/lib/kray-engine";
import { runWithContext } from "@/lib/request-context";
import type { KrayInput } from "@/lib/kray-types";

const TIMEOUT_MS = 45_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // El análisis K-Ray vive en EODHD /fundamentals — usamos siempre esa fuente,
  // ignorando el toggle de la UI (Yahoo no expone composición).
  const headerSource = request.headers.get("x-data-source");
  const dataSource: "eodhd" | "yahoo" =
    headerSource === "yahoo" ? "yahoo" : "eodhd";

  return runWithContext({ dataSource }, async () => {
    try {
      let input: KrayInput;
      try {
        input = (await request.json()) as KrayInput;
      } catch {
        return NextResponse.json(
          { error: "JSON inválido", message: "Cuerpo de petición mal formado." },
          { status: 400 }
        );
      }

      if (!input.holdings || !Array.isArray(input.holdings) || input.holdings.length === 0) {
        return NextResponse.json(
          {
            error: "Validación fallida",
            message: "Se requiere al menos un holding en la cartera.",
          },
          { status: 400 }
        );
      }

      // Normalización: descartar pesos no numéricos / ≤ 0
      input.holdings = input.holdings
        .map((h) => ({ fundId: h.fundId, weight: Number(h.weight) }))
        .filter((h) => h.fundId && h.weight > 0);

      if (input.holdings.length === 0) {
        return NextResponse.json(
          {
            error: "Validación fallida",
            message: "Los pesos deben ser numéricos y mayores que 0.",
          },
          { status: 400 }
        );
      }

      const result = await Promise.race([
        runKray(input),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS)
        ),
      ]);

      return NextResponse.json(result);
    } catch (err) {
      console.error("[API /kray] Error:", err);
      if (err instanceof Error && err.message === "TIMEOUT") {
        return NextResponse.json(
          {
            error: "Tiempo de espera agotado",
            message: "El análisis tardó demasiado. Reduce el número de fondos.",
          },
          { status: 408 }
        );
      }
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return NextResponse.json(
        { error: "Error al ejecutar K-Ray", message: msg },
        { status: 500 }
      );
    }
  });
}
