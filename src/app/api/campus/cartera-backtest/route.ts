// =============================================================================
// API ROUTE: /api/campus/cartera-backtest
// =============================================================================
// Panel del alumno — Fase 1 (Backtest).
// Recibe el PERFIL de riesgo (1-10) del alumno y un ETF de REFERENCIA, resuelve
// la "Cartera K del perfil" (preset k-inbestme-N) y la backtestea contra el ETF
// elegido, reutilizando el motor existente (runBacktest). Devuelve dos
// resultados (cartera del alumno + benchmark) listos para pintar.
//
// Es una comparación de ESTRATEGIA (suma global, sin aportaciones): TWR puro,
// que es lo correcto para comparar contra un índice/ETF. Las aportaciones del
// alumno llegan en la Fase 3 (Seguimiento).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest-engine";
import { getPresetById } from "@/lib/portfolio-presets";
import { getFundById } from "@/lib/fund-database";
import { runWithContext } from "@/lib/request-context";
import type { BacktestConfig } from "@/lib/types";

const BACKTEST_TIMEOUT_MS = 60000;

// ETFs de referencia permitidos (acumulación, en EUR) — clave -> fundId BD.
const BENCHMARKS: Record<string, string> = {
  vwce: "vanguard-global", // Vanguard FTSE All-World Acc (proxy ACWI)
  world: "ishares-msci-world", // iShares Core MSCI World Acc
  sp500: "vanguard-sp500", // iShares Core S&P 500 Acc (SXR8)
};

type Period = "1y" | "3y" | "5y" | "max" | "ytd";

function isoDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

/** Calcula [startDate, endDate] (YYYY-MM-DD) a partir del periodo solicitado. */
function rangeForPeriod(period: Period): { startDate: string; endDate: string } {
  const today = new Date();
  const endDate = isoDate(today);
  if (period === "ytd") {
    return { startDate: `${today.getFullYear()}-01-01`, endDate };
  }
  if (period === "max") {
    // Inicio generoso; el motor recorta al rango común disponible y avisa.
    return { startDate: "2010-01-01", endDate };
  }
  const years = period === "1y" ? 1 : period === "3y" ? 3 : 5;
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - years);
  return { startDate: isoDate(start), endDate };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runWithContext({ dataSource: "eodhd" }, async () => {
    try {
      let body: {
        profile?: number;
        benchmark?: string;
        period?: Period;
        rebalanceFrequency?: BacktestConfig["rebalanceFrequency"];
      };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "JSON inválido", message: "El cuerpo no es JSON válido." },
          { status: 400 }
        );
      }

      // --- Perfil -> preset Cartera K ---
      const profile = Math.round(Number(body.profile));
      if (!Number.isFinite(profile) || profile < 1 || profile > 10) {
        return NextResponse.json(
          { error: "Perfil inválido", message: "El perfil de riesgo debe ser un número entre 1 y 10." },
          { status: 400 }
        );
      }
      const preset = getPresetById(`k-inbestme-${profile}`);
      if (!preset) {
        return NextResponse.json(
          { error: "Sin cartera", message: `No existe una Cartera K para el perfil ${profile}.` },
          { status: 400 }
        );
      }

      // --- ETF de referencia ---
      const benchKey = (body.benchmark || "vwce").toLowerCase();
      const benchFundId = BENCHMARKS[benchKey];
      if (!benchFundId) {
        return NextResponse.json(
          { error: "Benchmark inválido", message: `Referencia no permitida: '${body.benchmark}'.` },
          { status: 400 }
        );
      }
      const benchFund = getFundById(benchFundId);
      if (!benchFund) {
        return NextResponse.json(
          { error: "Benchmark no encontrado", message: `El ETF '${benchFundId}' no existe en la base de datos.` },
          { status: 500 }
        );
      }

      // --- Periodo ---
      const period: Period = (["1y", "3y", "5y", "max", "ytd"] as Period[]).includes(
        body.period as Period
      )
        ? (body.period as Period)
        : "max";
      const { startDate, endDate } = rangeForPeriod(period);

      const rebalanceFrequency = body.rebalanceFrequency || "annual";

      const config: BacktestConfig = {
        portfolioA: { name: preset.name, holdings: preset.holdings },
        portfolioB: {
          name: benchFund.shortName || benchFund.name,
          holdings: [{ fundId: benchFundId, weight: 100 }],
        },
        startDate,
        endDate,
        initialAmount: 10000,
        rebalanceFrequency,
        displayGranularity: "monthly",
      };

      const result = await Promise.race([
        runBacktest(config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), BACKTEST_TIMEOUT_MS)
        ),
      ]);

      if (!result.a) {
        return NextResponse.json(
          {
            error: "Sin datos",
            message:
              "No hay datos históricos suficientes para esta cartera en el periodo elegido. Prueba un periodo más corto.",
          },
          { status: 400 }
        );
      }

      const eff = result.a.timeSeries;
      const effectiveDateRange =
        eff && eff.length
          ? { startDate: eff[0]?.exactDate ?? eff[0]?.date, endDate: eff[eff.length - 1]?.exactDate ?? eff[eff.length - 1]?.date }
          : undefined;

      return NextResponse.json({
        profile,
        period,
        cartera: result.a,
        benchmark: result.b,
        presetName: preset.name,
        presetDescription: preset.description,
        benchmarkName: benchFund.shortName || benchFund.name,
        benchmarkKey: benchKey,
        effectiveDateRange,
        warnings: result.warnings,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "TIMEOUT") {
        return NextResponse.json(
          { error: "Tiempo agotado", message: "El backtest tardó demasiado. Prueba un periodo más corto." },
          { status: 408 }
        );
      }
      const msg = error instanceof Error ? error.message : "Error desconocido";
      console.error("[API /campus/cartera-backtest] Error:", error);
      return NextResponse.json(
        { error: "Error en el backtest", message: msg },
        { status: 500 }
      );
    }
  });
}
