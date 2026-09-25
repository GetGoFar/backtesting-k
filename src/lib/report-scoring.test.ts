import { describe, it, expect } from "vitest";
import { computePortfolioScore } from "./report-scoring";
import type { BacktestResult } from "./types";

/** Cartera mínima con lo justo para puntuar. Solo nos importa diversificación. */
function cartera(diversification?: BacktestResult["diversification"]): BacktestResult {
  return {
    portfolioName: "test",
    metrics: {
      cagr: 0.06,
      volatility: 0.12,
      maxDrawdown: -0.2,
      sharpe: 0.5,
      sortino: 0.7,
      calmar: 0.3,
      totalReturn: 0.5,
      positivePeriods: 0.6,
      bestPeriod: 0.1,
      worstPeriod: -0.1,
    },
    fees: { totalFees: 100, feesAsPercentage: 1, weightedTer: 0.2 },
    allocation: {
      byCategory: [{ name: "RV Global", weight: 100 }],
      byAssetClass: [{ name: "Renta Variable", weight: 100 }],
      byManagement: [{ name: "Indexado", weight: 100 }],
    },
    diversification,
  } as unknown as BacktestResult;
}

describe("nota de diversificación (por riesgo, no por número de activos)", () => {
  it("un solo activo saca CERO: no hay nada que diversificar", () => {
    const s = computePortfolioScore(cartera({ removed: 0, ratio: 1, assets: 1, coverage: 1 }));
    expect(s.diversificacion.value).toBe(0);
    expect(s.diversificacion.metric).toContain("no diversifica");
    expect(s.diversificacion.explanation).toContain("un solo activo");
    // No debe afirmar que cargas con el riesgo específico: un índice mundial
    // es UN activo aquí y por dentro lleva miles de empresas.
    expect(s.diversificacion.explanation).not.toContain("riesgo específico");
  });

  it("dos fondos que se solapan sacan casi cero aunque sean dos activos", () => {
    // Medido con VWCE + IWDA al 50 %: elimina el 0,2 % del riesgo.
    const s = computePortfolioScore(cartera({ removed: 0.002, ratio: 1.002, assets: 2, coverage: 1 }));
    expect(s.diversificacion.value).toBeLessThan(0.5);
  });

  it("una cartera de verdad diversificada saca nota alta", () => {
    // K3 Inbestme, medida: quita el 44,1 % del riesgo diversificable.
    const s = computePortfolioScore(cartera({ removed: 0.441, ratio: 1.79, assets: 11, coverage: 1 }));
    expect(s.diversificacion.value).toBeGreaterThan(8);
    expect(s.diversificacion.value).toBeLessThanOrEqual(10);
    expect(s.diversificacion.metric).toContain("44%");
  });

  it("eliminar la mitad del riesgo es un 10", () => {
    const s = computePortfolioScore(cartera({ removed: 0.5, ratio: 2, assets: 6, coverage: 1 }));
    expect(s.diversificacion.value).toBe(10);
  });

  it("dos activos que sí se complementan puntúan más que dos que se solapan", () => {
    // 60/40, medido: 17,2 %.
    const mixta = computePortfolioScore(cartera({ removed: 0.172, ratio: 1.21, assets: 2, coverage: 1 }));
    const solapada = computePortfolioScore(cartera({ removed: 0.002, ratio: 1, assets: 2, coverage: 1 }));
    expect(mixta.diversificacion.value).toBeGreaterThan(solapada.diversificacion.value);
  });

  it("sin datos de riesgo cae a la heurística antigua de composición", () => {
    const s = computePortfolioScore(cartera(undefined));
    // Una sola clase y una sola categoría seguían dando 0 con la heurística vieja.
    expect(s.diversificacion.value).toBe(0);
    expect(s.diversificacion.metric).toContain("categorías");
  });
});
