// =============================================================================
// API ROUTE: /api/campus/quiz-carteras-k
// =============================================================================
// Calculadora "¿Cuánto llevarías con una Cartera K?" (El Proyecto K).
//
// Recibe { mesInicio, perfil, tipo } y devuelve la rentabilidad acumulada y el
// drawdown máximo de la Cartera K del perfil desde el mes elegido hasta hoy,
// junto con la cartera Indexa equivalente (mismo perfil, misma fecha) como
// benchmark de roboadvisor. Reutiliza el motor existente (runBacktest) y los
// presets ya definidos:
//   - Cartera K Sectorial  -> preset "k-inbestme-N"        (N = perfil 1..10)
//   - Cartera K Geográfica -> preset "k-geografica-ucit-N"
//   - Roboadvisor Indexa   -> preset "indexa-N"
//
// Comparación JUSTA: ambas carteras se backtestean con la MISMA ventana común
// (useCommonDateRange) y el MISMO capital inicial. Es TWR puro (suma global,
// sin aportaciones), que es lo correcto para comparar dos estrategias.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest-engine";
import { getPresetById } from "@/lib/portfolio-presets";
import { runWithContext } from "@/lib/request-context";
import type { BacktestConfig, BacktestResult, TimeSeriesPoint } from "@/lib/types";

const BACKTEST_TIMEOUT_MS = 60000;

// Primera edición del curso: no se permite empezar antes (límite de negocio,
// no técnico — los presets tienen histórico desde 2010+).
const MES_MINIMO = "2024-10";

const INITIAL_AMOUNT = 10000;

type Tipo = "geografica" | "sectorial";

function isoToday(): string {
  return new Date().toISOString().substring(0, 10);
}

/** Mes actual en formato YYYY-MM (para acotar el rango por arriba). */
function mesActual(): string {
  return isoToday().substring(0, 7);
}

const MES_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Resumen de métricas de una cartera para el informe del quiz. Las rentabilidades
 * van en DECIMAL (0.85 = +85%) tal y como las entrega el motor; el front decide
 * el formato.
 */
interface CarteraResumen {
  nombre: string;
  rentabilidad: number; // totalReturn (decimal)
  cagr: number; // tasa anual compuesta (decimal)
  drawdown: number; // maxDrawdown (decimal negativo)
  volatilidad: number; // volatilidad anualizada (decimal)
  valorFinal: number; // EUR
}

function resumir(r: BacktestResult): CarteraResumen {
  return {
    nombre: r.portfolioName,
    rentabilidad: r.metrics.totalReturn,
    cagr: r.metrics.cagr,
    drawdown: r.metrics.maxDrawdown,
    volatilidad: r.metrics.volatility,
    valorFinal: r.finalValue,
  };
}

/**
 * Serie temporal combinada para el gráfico comparativo. Ambas carteras comparten
 * fechas (useCommonDateRange) y arrancan en el mismo capital inicial, así que el
 * gráfico de patrimonio (€) ya es directamente comparable.
 */
function serieCombinada(
  a: TimeSeriesPoint[],
  b: TimeSeriesPoint[]
): Array<{ date: string; exactDate?: string; cartera: number; indexa: number | null }> {
  return a.map((p, i) => ({
    date: p.date,
    exactDate: p.exactDate,
    cartera: p.value,
    indexa: b[i]?.value ?? null,
  }));
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: "Petición inválida", message }, { status: 400 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runWithContext({ dataSource: "eodhd" }, async () => {
    try {
      let body: { mesInicio?: string; perfil?: number; tipo?: string };
      try {
        body = await request.json();
      } catch {
        return badRequest("El cuerpo no es JSON válido.");
      }

      // --- Perfil (1..10) ---
      const perfilRaw = Math.round(Number(body.perfil));
      if (!Number.isFinite(perfilRaw) || perfilRaw < 1 || perfilRaw > 10) {
        return badRequest("El perfil de riesgo debe ser un número entre 1 y 10.");
      }
      const perfil = perfilRaw;

      // --- Tipo de cartera ---
      const tipo: Tipo = body.tipo === "geografica" ? "geografica" : "sectorial";

      // --- Mes de inicio (YYYY-MM, dentro del rango permitido) ---
      const mesInicio = String(body.mesInicio || "").trim();
      if (!MES_REGEX.test(mesInicio)) {
        return badRequest("El mes de inicio debe tener formato AAAA-MM.");
      }
      if (mesInicio < MES_MINIMO) {
        return badRequest(
          `La primera edición del curso fue en ${MES_MINIMO}. No se puede empezar antes.`
        );
      }
      if (mesInicio > mesActual()) {
        return badRequest("El mes de inicio no puede ser futuro.");
      }

      // --- Resolver presets (Cartera K del perfil + Indexa del perfil) ---
      const familiaK = tipo === "geografica" ? "k-geografica-ucit" : "k-inbestme";
      const kPreset = getPresetById(`${familiaK}-${perfil}`);
      const indexaPreset = getPresetById(`indexa-${perfil}`);
      if (!kPreset) {
        return badRequest(`No existe Cartera K (${tipo}) para el perfil ${perfil}.`);
      }
      if (!indexaPreset) {
        return badRequest(`No existe cartera Indexa para el perfil ${perfil}.`);
      }

      const startDate = `${mesInicio}-01`;
      const endDate = isoToday();

      const config: BacktestConfig = {
        portfolioA: {
          name: kPreset.name,
          holdings: kPreset.holdings.map((h) => ({ fundId: h.fundId, weight: h.weight })),
        },
        portfolioB: {
          name: indexaPreset.name,
          holdings: indexaPreset.holdings.map((h) => ({ fundId: h.fundId, weight: h.weight })),
        },
        startDate,
        endDate,
        initialAmount: INITIAL_AMOUNT,
        rebalanceFrequency: "annual",
        displayGranularity: "monthly",
        // Recorta ambas series a la ventana común (clave para que la comparación
        // K vs Indexa sea justa: misma fecha de inicio efectiva).
        useCommonDateRange: true,
      };

      const result = await Promise.race([
        runBacktest(config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), BACKTEST_TIMEOUT_MS)
        ),
      ]);

      if (!result.a || !result.b) {
        return badRequest(
          "No hay datos históricos suficientes para ese periodo. Prueba un mes de inicio anterior."
        );
      }

      const serie = result.a.timeSeries;
      const effectiveDateRange =
        serie && serie.length
          ? {
              startDate: serie[0]?.exactDate ?? serie[0]?.date,
              endDate:
                serie[serie.length - 1]?.exactDate ?? serie[serie.length - 1]?.date,
            }
          : undefined;
      // Nº de meses transcurridos (puntos de la serie mensual menos el inicial).
      const meses = serie && serie.length ? Math.max(0, serie.length - 1) : 0;

      const cartera = resumir(result.a);
      const indexa = resumir(result.b);
      // Diferencia en PUNTOS porcentuales de rentabilidad acumulada (K - Indexa).
      const diferenciaPuntos = (cartera.rentabilidad - indexa.rentabilidad) * 100;

      return NextResponse.json({
        perfil,
        tipo,
        requestedStart: startDate,
        effectiveDateRange,
        meses,
        cartera,
        indexa,
        diferenciaPuntos,
        serie: serieCombinada(result.a.timeSeries, result.b.timeSeries),
        warnings: result.warnings,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "TIMEOUT") {
        return NextResponse.json(
          {
            error: "Tiempo agotado",
            message: "El cálculo tardó demasiado. Inténtalo de nuevo en unos segundos.",
          },
          { status: 408 }
        );
      }
      const msg = error instanceof Error ? error.message : "Error desconocido";
      console.error("[API /campus/quiz-carteras-k] Error:", error);
      return NextResponse.json({ error: "Error en el cálculo", message: msg }, { status: 500 });
    }
  });
}
