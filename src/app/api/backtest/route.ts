// =============================================================================
// API ROUTE: /api/backtest - Ejecutar backtest de carteras
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest-engine";
import { getFundById } from "@/lib/fund-database";
import type { BacktestConfig, Portfolio, PortfolioHolding, BacktestWarning } from "@/lib/types";

// Timeout máximo para el backtest (30 segundos)
const BACKTEST_TIMEOUT_MS = 30000;

// Tolerancia para la suma de pesos (permite 90-110%, se normaliza después)
const WEIGHT_TOLERANCE = 10;

/**
 * POST /api/backtest
 *
 * Ejecuta un backtest comparando dos carteras.
 *
 * Body: BacktestConfig
 * - portfolioA: { name, holdings: [{ fundId, weight }] }
 * - portfolioB: { name, holdings: [{ fundId, weight }] }
 * - startDate: "YYYY-MM-DD"
 * - endDate: "YYYY-MM-DD"
 * - initialAmount: number (en EUR)
 * - rebalanceFrequency: "monthly" | "quarterly" | "annual" | "none"
 * - monthlyContribution?: number (opcional)
 *
 * Respuestas:
 * - 200: { a: BacktestResult, b: BacktestResult }
 * - 400: Validación fallida
 * - 408: Timeout
 * - 500: Error interno
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parsear el body
    let config: BacktestConfig;
    try {
      config = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "JSON inválido",
          message: "El cuerpo de la petición no es un JSON válido.",
        },
        { status: 400 }
      );
    }

    // Validar estructura básica
    const validationError = validateConfig(config);
    if (validationError) {
      return NextResponse.json(
        {
          error: "Validación fallida",
          message: validationError,
        },
        { status: 400 }
      );
    }

    // Normalizar pesos si no suman exactamente 100% y recopilar avisos
    const warnings: BacktestWarning[] = [];

    const normalizedA = normalizeWeights(config.portfolioA);
    if (normalizedA.normalized) {
      warnings.push({
        type: "weight_normalized",
        message: `Los pesos de "${config.portfolioA.name}" sumaban ${normalizedA.originalTotal.toFixed(1)}% y se han normalizado a 100%.`,
      });
      config.portfolioA.holdings = normalizedA.holdings;
    }

    const normalizedB = normalizeWeights(config.portfolioB);
    if (normalizedB.normalized) {
      warnings.push({
        type: "weight_normalized",
        message: `Los pesos de "${config.portfolioB.name}" sumaban ${normalizedB.originalTotal.toFixed(1)}% y se han normalizado a 100%.`,
      });
      config.portfolioB.holdings = normalizedB.holdings;
    }

    // Ejecutar backtest con timeout
    const result = await Promise.race([
      runBacktest(config),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("TIMEOUT")),
          BACKTEST_TIMEOUT_MS
        )
      ),
    ]);

    // Verificar que obtuvimos resultados
    if (!result.a && !result.b) {
      return NextResponse.json(
        {
          error: "Sin datos suficientes",
          message:
            "No hay datos suficientes para ejecutar el backtest en el rango de fechas especificado. " +
            "Verifica que los fondos tengan datos históricos disponibles.",
        },
        { status: 400 }
      );
    }

    // Determinar el rango efectivo de datos (del primer al último punto en la serie)
    const effectiveStart = result.a?.timeSeries?.[0]?.date;
    const effectiveEnd = result.a?.timeSeries?.[result.a.timeSeries.length - 1]?.date;

    // Avisar si el rango efectivo difiere del solicitado
    const requestedStart = config.startDate.substring(0, 7);
    const requestedEnd = config.endDate.substring(0, 7);

    if (effectiveStart && effectiveStart !== requestedStart) {
      warnings.push({
        type: "data_range",
        message: `Los datos comienzan en ${effectiveStart} (solicitado: ${requestedStart}).`,
      });
    }
    if (effectiveEnd && effectiveEnd !== requestedEnd) {
      warnings.push({
        type: "data_range",
        message: `Los datos terminan en ${effectiveEnd} (solicitado: ${requestedEnd}).`,
      });
    }

    return NextResponse.json({
      resultA: result.a,
      resultB: result.b,
      config: {
        startDate: config.startDate,
        endDate: config.endDate,
        initialAmount: config.initialAmount,
        rebalanceFrequency: config.rebalanceFrequency,
        monthlyContribution: config.monthlyContribution ?? 0,
      },
      effectiveDateRange: effectiveStart && effectiveEnd ? {
        startDate: effectiveStart,
        endDate: effectiveEnd,
      } : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error("[API /backtest] Error:", error);

    // Manejar timeout específicamente
    if (error instanceof Error && error.message === "TIMEOUT") {
      return NextResponse.json(
        {
          error: "Tiempo de espera agotado",
          message:
            "El backtest tardó demasiado tiempo en completarse (máximo 30 segundos). " +
            "Prueba con un rango de fechas más corto o menos fondos.",
        },
        { status: 408 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : "Error desconocido";

    return NextResponse.json(
      {
        error: "Error al ejecutar el backtest",
        message: `Ocurrió un error durante la ejecución: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------------------------
// Normalización de pesos
// -----------------------------------------------------------------------------

/**
 * Normaliza los pesos de una cartera para que sumen exactamente 100%
 */
function normalizeWeights(portfolio: Portfolio): {
  holdings: PortfolioHolding[];
  normalized: boolean;
  originalTotal: number;
} {
  const totalWeight = portfolio.holdings.reduce((sum, h) => sum + h.weight, 0);

  // Solo normalizar si está fuera del rango 99.5-100.5%
  if (Math.abs(totalWeight - 100) <= 0.5) {
    return { holdings: portfolio.holdings, normalized: false, originalTotal: totalWeight };
  }

  const normalizedHoldings = portfolio.holdings.map((h) => ({
    ...h,
    weight: (h.weight / totalWeight) * 100,
  }));

  return {
    holdings: normalizedHoldings,
    normalized: true,
    originalTotal: totalWeight,
  };
}

// -----------------------------------------------------------------------------
// Funciones de validación
// -----------------------------------------------------------------------------

/**
 * Valida la configuración completa del backtest
 * Retorna un mensaje de error si hay problemas, o null si todo es válido
 */
function validateConfig(config: BacktestConfig): string | null {
  // Validar que existe portfolioA
  if (!config.portfolioA) {
    return "Falta la cartera A (portfolioA).";
  }

  // Validar que existe portfolioB
  if (!config.portfolioB) {
    return "Falta la cartera B (portfolioB).";
  }

  // Validar cartera A
  const portfolioAError = validatePortfolio(config.portfolioA, "A");
  if (portfolioAError) return portfolioAError;

  // Validar cartera B
  const portfolioBError = validatePortfolio(config.portfolioB, "B");
  if (portfolioBError) return portfolioBError;

  // Validar fechas
  const datesError = validateDates(config.startDate, config.endDate);
  if (datesError) return datesError;

  // Validar inversión inicial
  if (config.initialAmount === undefined || config.initialAmount === null) {
    return "Falta la inversión inicial (initialAmount).";
  }
  if (typeof config.initialAmount !== "number" || config.initialAmount <= 0) {
    return "La inversión inicial debe ser un número mayor que 0.";
  }
  if (config.initialAmount > 100000000) {
    return "La inversión inicial no puede superar 100 millones de euros.";
  }

  // Validar frecuencia de rebalanceo
  const validFrequencies = ["monthly", "quarterly", "annual", "none"];
  if (!config.rebalanceFrequency) {
    return "Falta la frecuencia de rebalanceo (rebalanceFrequency).";
  }
  if (!validFrequencies.includes(config.rebalanceFrequency)) {
    return `La frecuencia de rebalanceo debe ser una de: ${validFrequencies.join(", ")}. Valor recibido: '${config.rebalanceFrequency}'`;
  }

  // Validar aportación mensual (opcional)
  if (config.monthlyContribution !== undefined && config.monthlyContribution !== null) {
    if (typeof config.monthlyContribution !== "number" || config.monthlyContribution < 0) {
      return "La aportación mensual debe ser un número mayor o igual a 0.";
    }
    if (config.monthlyContribution > 1000000) {
      return "La aportación mensual no puede superar 1 millón de euros.";
    }
  }

  return null;
}

/**
 * Valida una cartera individual
 */
function validatePortfolio(portfolio: Portfolio, label: string): string | null {
  // Validar nombre
  if (!portfolio.name || portfolio.name.trim() === "") {
    return `La cartera ${label} debe tener un nombre.`;
  }

  // Validar holdings
  if (!portfolio.holdings || !Array.isArray(portfolio.holdings)) {
    return `La cartera ${label} debe tener una lista de posiciones (holdings).`;
  }

  if (portfolio.holdings.length === 0) {
    return `La cartera ${label} debe tener al menos un fondo.`;
  }

  if (portfolio.holdings.length > 20) {
    return `La cartera ${label} no puede tener más de 20 fondos.`;
  }

  // Validar cada holding
  const fundIds = new Set<string>();
  let totalWeight = 0;

  for (let i = 0; i < portfolio.holdings.length; i++) {
    const holding = portfolio.holdings[i];
    if (!holding) continue;

    const holdingError = validateHolding(holding, label, i + 1);
    if (holdingError) return holdingError;

    // Verificar duplicados
    if (fundIds.has(holding.fundId)) {
      return `La cartera ${label} tiene el fondo '${holding.fundId}' duplicado.`;
    }
    fundIds.add(holding.fundId);

    totalWeight += holding.weight;
  }

  // Validar que los pesos sumen ~100%
  if (totalWeight < 100 - WEIGHT_TOLERANCE || totalWeight > 100 + WEIGHT_TOLERANCE) {
    return `Los pesos de la cartera ${label} deben sumar 100% (±${WEIGHT_TOLERANCE}%). Suma actual: ${totalWeight.toFixed(1)}%`;
  }

  return null;
}

/**
 * Valida un holding individual
 */
function validateHolding(
  holding: PortfolioHolding,
  portfolioLabel: string,
  index: number
): string | null {
  // Validar fundId
  if (!holding.fundId || holding.fundId.trim() === "") {
    return `El fondo #${index} de la cartera ${portfolioLabel} no tiene ID (fundId).`;
  }

  // Verificar que el fondo existe
  const fund = getFundById(holding.fundId);
  if (!fund) {
    return `El fondo '${holding.fundId}' de la cartera ${portfolioLabel} no existe. Usa /api/funds para ver los fondos disponibles.`;
  }

  // Validar peso
  if (holding.weight === undefined || holding.weight === null) {
    return `El fondo '${holding.fundId}' de la cartera ${portfolioLabel} no tiene peso (weight).`;
  }

  if (typeof holding.weight !== "number" || holding.weight <= 0) {
    return `El peso del fondo '${holding.fundId}' en la cartera ${portfolioLabel} debe ser un número mayor que 0.`;
  }

  if (holding.weight > 100) {
    return `El peso del fondo '${holding.fundId}' en la cartera ${portfolioLabel} no puede superar 100%.`;
  }

  return null;
}

/**
 * Valida las fechas de inicio y fin
 */
function validateDates(startDate: string, endDate: string): string | null {
  if (!startDate) {
    return "Falta la fecha de inicio (startDate).";
  }

  if (!endDate) {
    return "Falta la fecha de fin (endDate).";
  }

  // Validar formato YYYY-MM-DD o YYYY-MM
  const dateRegexFull = /^\d{4}-\d{2}-\d{2}$/;
  const dateRegexMonth = /^\d{4}-\d{2}$/;

  const isValidStart = dateRegexFull.test(startDate) || dateRegexMonth.test(startDate);
  const isValidEnd = dateRegexFull.test(endDate) || dateRegexMonth.test(endDate);

  if (!isValidStart) {
    return `La fecha de inicio tiene formato inválido. Usa YYYY-MM-DD o YYYY-MM. Valor recibido: '${startDate}'`;
  }

  if (!isValidEnd) {
    return `La fecha de fin tiene formato inválido. Usa YYYY-MM-DD o YYYY-MM. Valor recibido: '${endDate}'`;
  }

  // Verificar que las fechas son válidas
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    return `La fecha de inicio '${startDate}' no es una fecha válida.`;
  }

  if (isNaN(end.getTime())) {
    return `La fecha de fin '${endDate}' no es una fecha válida.`;
  }

  // Verificar que start < end
  if (start >= end) {
    return `La fecha de inicio (${startDate}) debe ser anterior a la fecha de fin (${endDate}).`;
  }

  // Verificar rango mínimo (al menos 2 meses)
  const diffMonths =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());

  if (diffMonths < 2) {
    return "El rango de fechas debe ser de al menos 2 meses.";
  }

  // Verificar que no sea futuro lejano
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 1);

  if (end > maxDate) {
    return "La fecha de fin no puede ser posterior al mes actual.";
  }

  // Verificar fecha mínima razonable (2000)
  const minDate = new Date("2000-01-01");
  if (start < minDate) {
    return "La fecha de inicio no puede ser anterior a 2000.";
  }

  return null;
}
