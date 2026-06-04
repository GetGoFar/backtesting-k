// =============================================================================
// API ROUTE: /api/retirement — Simulador de jubilación (Financial Goals)
// =============================================================================
//
// Recibe la config de un plan de jubilación (capital, aportes, retiradas,
// edades, dos carteras para glide path, inflación, IRPF) y devuelve la
// simulación block bootstrap completa + cohortes históricos.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { runRetirementSimulation } from "@/lib/retirement-engine";
import { getMonthlyPrices } from "@/lib/data-fetcher";
import { getFundById } from "@/lib/fund-database";
import { runWithContext } from "@/lib/request-context";
import type { Portfolio } from "@/lib/types";
import type { RetirementConfig } from "@/lib/retirement-types";

// Timeout amplio: 1000 paths × 50 años son ~600k iteraciones, debe correr <30s
const RETIREMENT_TIMEOUT_MS = 90_000;

/**
 * Calcula la serie de retornos mensuales de una cartera composición fija con
 * rebalanceo mensual instantáneo, descontando TER. La granularidad mensual
 * es suficiente para el bootstrap.
 */
async function buildPortfolioMonthlyReturns(
  portfolio: Portfolio
): Promise<Map<string, number>> {
  // 1) Cargar precios mensuales de cada fondo
  const fundReturns = new Map<string, Map<string, number>>();
  const fundTers = new Map<string, number>();

  for (const holding of portfolio.holdings) {
    const fund = getFundById(holding.fundId) || holding.fund;
    if (!fund) continue;

    try {
      const { prices } = await getMonthlyPrices(
        holding.fundId,
        fund.yahooTicker,
        fund.isin
      );
      if (prices.size < 3) continue;

      // Retornos mensuales: r[t] = price[t] / price[t-1] - 1
      const sortedMonths = Array.from(prices.keys()).sort();
      const returns = new Map<string, number>();
      for (let i = 1; i < sortedMonths.length; i++) {
        const prev = prices.get(sortedMonths[i - 1]!);
        const curr = prices.get(sortedMonths[i]!);
        if (prev && curr && prev > 0) {
          returns.set(sortedMonths[i]!, curr / prev - 1);
        }
      }
      fundReturns.set(holding.fundId, returns);
      fundTers.set(holding.fundId, fund.ter ?? 0);
    } catch (err) {
      console.warn(
        `[RetirementAPI] Error con ${holding.fundId}: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  if (fundReturns.size === 0) {
    throw new Error(
      `Cartera "${portfolio.name}": ningún fondo tiene datos históricos suficientes`
    );
  }

  // 2) Renormalizar pesos sobre los fondos con datos
  const activeHoldings = portfolio.holdings.filter((h) => fundReturns.has(h.fundId));
  const totalWeight = activeHoldings.reduce((s, h) => s + h.weight, 0);
  if (totalWeight <= 0) {
    throw new Error(`Cartera "${portfolio.name}": pesos inválidos`);
  }
  const normWeights = new Map(
    activeHoldings.map((h) => [h.fundId, h.weight / totalWeight])
  );

  // 3) Encontrar meses comunes entre todos los fondos activos
  let commonMonths: Set<string> | null = null;
  for (const ret of fundReturns.values()) {
    const set = new Set(ret.keys());
    if (commonMonths === null) commonMonths = set;
    else commonMonths = new Set([...commonMonths].filter((m) => set.has(m)));
  }
  if (!commonMonths || commonMonths.size < 12) {
    throw new Error(
      `Cartera "${portfolio.name}": menos de 12 meses comunes entre los fondos`
    );
  }

  // 4) Combinar retornos ponderados, descontando TER mensual
  const result = new Map<string, number>();
  const sortedCommon = Array.from(commonMonths).sort();
  for (const month of sortedCommon) {
    let weightedRet = 0;
    for (const [fundId, weight] of normWeights) {
      const r = fundReturns.get(fundId)!.get(month) ?? 0;
      const ter = fundTers.get(fundId) ?? 0;
      // TER mensual (anual / 12 / 100)
      const netRet = r - ter / 12 / 100;
      weightedRet += weight * netRet;
    }
    result.set(month, weightedRet);
  }

  return result;
}

function validateConfig(config: unknown): string | null {
  if (!config || typeof config !== "object") return "Falta el cuerpo de la petición";
  const c = config as Partial<RetirementConfig>;
  if (typeof c.currentAge !== "number" || c.currentAge < 18 || c.currentAge > 100)
    return "currentAge inválido (18-100)";
  if (typeof c.retirementAge !== "number" || c.retirementAge <= c.currentAge)
    return "retirementAge debe ser mayor que currentAge";
  if (typeof c.endAge !== "number" || c.endAge <= c.retirementAge)
    return "endAge debe ser mayor que retirementAge";
  if (c.endAge - c.currentAge > 80)
    return "Horizonte máximo: 80 años (endAge - currentAge)";
  if (typeof c.initialCapital !== "number" || c.initialCapital < 0)
    return "initialCapital inválido";
  if (typeof c.monthlyContributionReal !== "number" || c.monthlyContributionReal < 0)
    return "monthlyContributionReal inválido";
  if (typeof c.monthlyWithdrawalReal !== "number" || c.monthlyWithdrawalReal < 0)
    return "monthlyWithdrawalReal inválido";
  if (!c.portfolioAccumulation || !Array.isArray(c.portfolioAccumulation.holdings))
    return "portfolioAccumulation requerido con holdings";
  if (!c.portfolioDistribution || !Array.isArray(c.portfolioDistribution.holdings))
    return "portfolioDistribution requerido con holdings";
  if (typeof c.inflationAnnualPct !== "number" || c.inflationAnnualPct < -5 || c.inflationAnnualPct > 20)
    return "inflationAnnualPct fuera de rango";
  if (!["none", "spain-irpf", "flat"].includes(c.taxMode ?? "none"))
    return "taxMode inválido";
  if (c.taxMode === "flat" && (typeof c.flatTaxRatePct !== "number" || c.flatTaxRatePct < 0 || c.flatTaxRatePct > 50))
    return "flatTaxRatePct requerido (0-50) cuando taxMode=flat";
  if (typeof c.numPaths !== "number" || c.numPaths < 50 || c.numPaths > 5000)
    return "numPaths fuera de rango (50-5000)";
  if (typeof c.blockSizeMonths !== "number" || c.blockSizeMonths < 1 || c.blockSizeMonths > 60)
    return "blockSizeMonths fuera de rango (1-60)";
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const headerSource = request.headers.get("x-data-source");
  const dataSource: "eodhd" | "yahoo" = headerSource === "yahoo" ? "yahoo" : "eodhd";

  return runWithContext({ dataSource }, async () => {
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "JSON inválido", message: "Body no parseable" },
          { status: 400 }
        );
      }

      const validation = validateConfig(body);
      if (validation) {
        return NextResponse.json(
          { error: "Validación fallida", message: validation },
          { status: 400 }
        );
      }
      const config = body as RetirementConfig;

      // Obtener retornos mensuales de las dos carteras
      const result = await Promise.race([
        (async () => {
          const [monthlyRetA, monthlyRetB] = await Promise.all([
            buildPortfolioMonthlyReturns(config.portfolioAccumulation),
            buildPortfolioMonthlyReturns(config.portfolioDistribution),
          ]);
          return runRetirementSimulation({
            config,
            monthlyReturnsAccumulation: monthlyRetA,
            monthlyReturnsDistribution: monthlyRetB,
          });
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), RETIREMENT_TIMEOUT_MS)
        ),
      ]);

      return NextResponse.json(result);
    } catch (err) {
      console.error("[API /retirement] Error:", err);
      const msg = err instanceof Error ? err.message : "Error desconocido";
      if (msg === "TIMEOUT") {
        return NextResponse.json(
          {
            error: "Tiempo de espera agotado",
            message: "La simulación tardó demasiado. Reduce numPaths o el horizonte.",
          },
          { status: 408 }
        );
      }
      return NextResponse.json(
        { error: "Error en la simulación", message: msg },
        { status: 500 }
      );
    }
  });
}
