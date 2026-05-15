// =============================================================================
// API ROUTE: /api/momentum — Ejecutar estrategia de momentum (relative strength)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { runMomentum } from "@/lib/momentum-engine";
import { runWithContext } from "@/lib/request-context";
import type { MomentumConfig } from "@/lib/momentum-types";

const TIMEOUT_MS = 90_000; // 90s — cargar precios de muchos tickers puede ser lento

/**
 * POST /api/momentum
 *
 * Body: MomentumConfig
 * - assets: [{ ticker, fundId?, displayName? }, ...]
 * - startDate / endDate: "YYYY-MM-DD"
 * - initialAmount: number
 * - lookbackMonths: number
 * - excludePreviousMonth: boolean
 * - assetsToHold: number (top-K)
 * - weighting: "equal" | "rank" | "volatility"
 * - frequency: "monthly" | "quarterly"
 * - movingAverageMonths?: number (0 = sin filtro)
 * - slippagePercent?: number
 * - benchmarkTicker?: string
 *
 * Respuesta: MomentumResponse o { error, message }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const headerSource = request.headers.get("x-data-source");
  const dataSource: "eodhd" | "yahoo" = headerSource === "yahoo" ? "yahoo" : "eodhd";

  return runWithContext({ dataSource }, async () => {
    try {
      let config: MomentumConfig;
      try {
        config = await request.json();
      } catch {
        return NextResponse.json(
          { error: "JSON inválido", message: "El cuerpo de la petición no es JSON válido." },
          { status: 400 }
        );
      }

      const err = validateConfig(config);
      if (err) {
        return NextResponse.json({ error: "Validación fallida", message: err }, { status: 400 });
      }

      const result = await Promise.race([
        runMomentum(config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS)
        ),
      ]);

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      const status = message === "Timeout" ? 408 : 500;
      return NextResponse.json(
        {
          error: status === 408 ? "Timeout" : "Error interno",
          message,
        },
        { status }
      );
    }
  });
}

function validateConfig(config: MomentumConfig): string | null {
  if (!config) return "Config vacía";
  if (!Array.isArray(config.assets) || config.assets.length < 2) {
    return "Se requieren al menos 2 activos en el universo";
  }
  for (const a of config.assets) {
    if (!a.ticker || typeof a.ticker !== "string") {
      return "Cada activo debe tener un ticker válido";
    }
  }
  if (!config.startDate || !config.endDate) return "startDate y endDate son requeridos";
  if (!(config.initialAmount > 0)) return "initialAmount debe ser > 0";
  if (!(config.lookbackMonths >= 1 && config.lookbackMonths <= 60)) {
    return "lookbackMonths debe estar entre 1 y 60";
  }
  if (!(config.assetsToHold >= 1 && config.assetsToHold <= config.assets.length)) {
    return `assetsToHold debe estar entre 1 y ${config.assets.length}`;
  }
  if (!["monthly", "quarterly"].includes(config.frequency)) {
    return "frequency debe ser 'monthly' o 'quarterly'";
  }
  if (!["equal", "rank", "volatility"].includes(config.weighting)) {
    return "weighting debe ser 'equal', 'rank' o 'volatility'";
  }
  if (
    config.movingAverageMonths !== undefined &&
    (config.movingAverageMonths < 0 || config.movingAverageMonths > 24)
  ) {
    return "movingAverageMonths debe estar entre 0 y 24";
  }
  if (
    config.rankingMethod !== undefined &&
    !["momentum", "sharpe"].includes(config.rankingMethod)
  ) {
    return "rankingMethod debe ser 'momentum' o 'sharpe'";
  }
  if (
    config.volatilityPeriodMonths !== undefined &&
    (config.volatilityPeriodMonths < 2 || config.volatilityPeriodMonths > 36)
  ) {
    return "volatilityPeriodMonths debe estar entre 2 y 36";
  }
  if (
    config.tradeExecution !== undefined &&
    !["lastClose", "nextClose"].includes(config.tradeExecution)
  ) {
    return "tradeExecution debe ser 'lastClose' o 'nextClose'";
  }
  return null;
}
