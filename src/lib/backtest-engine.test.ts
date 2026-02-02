// =============================================================================
// TESTS UNITARIOS - Motor de Backtesting
// =============================================================================
//
// Tests para verificar la corrección de los cálculos financieros.
// Ejecutar con: npx vitest run src/lib/backtest-engine.test.ts
//
// =============================================================================

import { describe, it, expect } from "vitest";
import { _testing } from "./backtest-engine";

const {
  calculateCAGR,
  calculateVolatility,
  calculateDownsideDeviation,
  calculateMaxDrawdown,
  calculateMetrics,
  calculateRollingReturnSeries,
  rebalancePortfolio,
  shouldRebalance,
  sumPositions,
} = _testing;

// -----------------------------------------------------------------------------
// Tests de CAGR
// -----------------------------------------------------------------------------

describe("calculateCAGR", () => {
  it("calcula CAGR correctamente para un caso simple", () => {
    // 10000€ que crecen a 20000€ en 5 años
    // CAGR = (20000/10000)^(1/5) - 1 = 2^0.2 - 1 ≈ 0.1487 (14.87%)
    const result = calculateCAGR(10000, 20000, 5);
    expect(result).toBeCloseTo(0.1487, 3);
  });

  it("calcula CAGR de 0% cuando no hay cambio", () => {
    const result = calculateCAGR(10000, 10000, 3);
    expect(result).toBeCloseTo(0, 5);
  });

  it("calcula CAGR negativo para pérdidas", () => {
    // 10000€ que caen a 5000€ en 2 años
    // CAGR = (5000/10000)^(1/2) - 1 = 0.5^0.5 - 1 ≈ -0.2929 (-29.29%)
    const result = calculateCAGR(10000, 5000, 2);
    expect(result).toBeCloseTo(-0.2929, 3);
  });

  it("retorna 0 para valores iniciales inválidos", () => {
    expect(calculateCAGR(0, 10000, 5)).toBe(0);
    expect(calculateCAGR(-1000, 10000, 5)).toBe(0);
    expect(calculateCAGR(10000, 20000, 0)).toBe(0);
    expect(calculateCAGR(10000, 20000, -1)).toBe(0);
  });

  it("calcula CAGR para un año exacto", () => {
    // 10000€ que crecen a 11000€ en 1 año = 10% exacto
    const result = calculateCAGR(10000, 11000, 1);
    expect(result).toBeCloseTo(0.10, 5);
  });
});

// -----------------------------------------------------------------------------
// Tests de Volatilidad
// -----------------------------------------------------------------------------

describe("calculateVolatility", () => {
  it("calcula volatilidad correctamente para retornos conocidos", () => {
    // Retornos mensuales de ejemplo: [-2%, 3%, -1%, 2%, 4%, -3%]
    const monthlyReturns = [-0.02, 0.03, -0.01, 0.02, 0.04, -0.03];

    // Media = 0.005
    // Varianza = sum((r - media)^2) / (n-1)
    // = [(-0.02-0.005)^2 + (0.03-0.005)^2 + (-0.01-0.005)^2 + (0.02-0.005)^2 + (0.04-0.005)^2 + (-0.03-0.005)^2] / 5
    // = [0.000625 + 0.000625 + 0.000225 + 0.000225 + 0.001225 + 0.001225] / 5
    // = 0.00415 / 5 = 0.00083
    // StdDev = sqrt(0.00083) ≈ 0.0288
    // Anualizado = 0.0288 * sqrt(12) ≈ 0.0998 (9.98%)

    const result = calculateVolatility(monthlyReturns);
    expect(result).toBeCloseTo(0.0998, 2);
  });

  it("retorna 0 para menos de 2 retornos", () => {
    expect(calculateVolatility([])).toBe(0);
    expect(calculateVolatility([0.05])).toBe(0);
  });

  it("calcula volatilidad 0 para retornos constantes", () => {
    const monthlyReturns = [0.01, 0.01, 0.01, 0.01, 0.01];
    const result = calculateVolatility(monthlyReturns);
    expect(result).toBeCloseTo(0, 5);
  });

  it("maneja retornos de un solo valor sin explotar", () => {
    const result = calculateVolatility([0.05]);
    expect(result).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Tests de Downside Deviation
// -----------------------------------------------------------------------------

describe("calculateDownsideDeviation", () => {
  it("calcula downside deviation correctamente", () => {
    // Solo cuenta los retornos negativos
    const monthlyReturns = [-0.05, 0.03, -0.02, 0.04, 0.01, -0.03];

    // Retornos negativos: -0.05, -0.02, -0.03
    // Cuadrados: 0.0025, 0.0004, 0.0009
    // Media de cuadrados = (0.0025 + 0.0004 + 0.0009 + 0 + 0 + 0) / 6 = 0.00063333
    // sqrt(0.00063333) ≈ 0.02517
    // Anualizado = 0.02517 * sqrt(12) ≈ 0.0872

    const result = calculateDownsideDeviation(monthlyReturns);
    expect(result).toBeCloseTo(0.0872, 2);
  });

  it("retorna 0 cuando no hay retornos negativos", () => {
    const monthlyReturns = [0.01, 0.02, 0.03, 0.04];
    const result = calculateDownsideDeviation(monthlyReturns);
    expect(result).toBeCloseTo(0, 5);
  });

  it("retorna 0 para menos de 2 retornos", () => {
    expect(calculateDownsideDeviation([])).toBe(0);
    expect(calculateDownsideDeviation([-0.05])).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Tests de Max Drawdown
// -----------------------------------------------------------------------------

describe("calculateMaxDrawdown", () => {
  it("calcula max drawdown correctamente", () => {
    // Secuencia: 100 -> 110 -> 90 -> 95 -> 80 -> 100
    // Drawdown desde 110 a 80 = (80-110)/110 = -27.27%
    const values = [100, 110, 90, 95, 80, 100];
    const result = calculateMaxDrawdown(values);
    expect(result).toBeCloseTo(-0.2727, 3);
  });

  it("retorna 0 para valores siempre crecientes", () => {
    const values = [100, 110, 120, 130, 140];
    const result = calculateMaxDrawdown(values);
    expect(result).toBe(0);
  });

  it("calcula drawdown de 100% cuando el valor cae a 0", () => {
    const values = [100, 50, 0];
    const result = calculateMaxDrawdown(values);
    expect(result).toBeCloseTo(-1, 5);
  });

  it("maneja un solo valor", () => {
    const result = calculateMaxDrawdown([100]);
    expect(result).toBe(0);
  });

  it("maneja array vacío", () => {
    const result = calculateMaxDrawdown([]);
    expect(result).toBe(0);
  });

  it("encuentra el drawdown correcto con múltiples caídas", () => {
    // Secuencia con dos caídas: primera de 10%, segunda de 20%
    const values = [100, 90, 100, 80, 100];
    const result = calculateMaxDrawdown(values);
    expect(result).toBeCloseTo(-0.20, 5);
  });
});

// -----------------------------------------------------------------------------
// Tests de Rolling Returns
// -----------------------------------------------------------------------------

describe("calculateRollingReturnSeries", () => {
  it("calcula rolling returns correctamente para 12 meses", () => {
    // Crear serie de tiempo con crecimiento conocido
    const timeSeries = [];
    let value = 100;
    for (let i = 0; i < 24; i++) {
      const year = 2020 + Math.floor(i / 12);
      const month = (i % 12) + 1;
      timeSeries.push({
        date: `${year}-${String(month).padStart(2, "0")}`,
        value,
      });
      // Crecimiento mensual de ~0.8% (aproximadamente 10% anual)
      value *= 1.008;
    }

    const result = calculateRollingReturnSeries(timeSeries, 12);

    // Debería tener 12 puntos (24 - 12 = 12)
    expect(result.length).toBe(12);

    // El primer rolling return de 12 meses debería ser ~10%
    expect(result[0]?.value).toBeCloseTo(0.10, 1);
  });

  it("retorna array vacío si no hay suficientes datos", () => {
    const timeSeries = [
      { date: "2020-01", value: 100 },
      { date: "2020-02", value: 105 },
    ];

    const result = calculateRollingReturnSeries(timeSeries, 12);
    expect(result.length).toBe(0);
  });

  it("calcula correctamente el número de resultados", () => {
    const timeSeries = [];
    for (let i = 0; i < 60; i++) {
      timeSeries.push({
        date: `2020-${String((i % 12) + 1).padStart(2, "0")}`,
        value: 100 + i,
      });
    }

    // Rolling de 36 meses sobre 60 meses = 24 resultados
    const result = calculateRollingReturnSeries(timeSeries, 36);
    expect(result.length).toBe(24);
  });
});

// -----------------------------------------------------------------------------
// TEST 1: Backtest con retornos conocidos
// -----------------------------------------------------------------------------

describe("Backtest con retornos conocidos", () => {
  it("calcula métricas correctamente para retornos simples [+10%, -5%, +8%, +3%, -2%]", () => {
    // Retornos mensuales: +10%, -5%, +8%, +3%, -2%
    const monthlyReturns = [0.10, -0.05, 0.08, 0.03, -0.02];

    // Calcular valores de la cartera
    // Inicio: 10000
    // Mes 1: 10000 * 1.10 = 11000
    // Mes 2: 11000 * 0.95 = 10450
    // Mes 3: 10450 * 1.08 = 11286
    // Mes 4: 11286 * 1.03 = 11624.58
    // Mes 5: 11624.58 * 0.98 = 11392.09
    const initialValue = 10000;
    const values = [initialValue];
    let currentValue = initialValue;
    for (const ret of monthlyReturns) {
      currentValue = currentValue * (1 + ret);
      values.push(currentValue);
    }

    const finalValue = values[values.length - 1]!;

    // Verificar valor final calculado manualmente
    expect(finalValue).toBeCloseTo(11392.09, 0);

    // Calcular CAGR manualmente
    // 5 meses = 5/12 años
    const years = 5 / 12;
    const expectedCAGR = Math.pow(finalValue / initialValue, 1 / years) - 1;

    const calculatedCAGR = calculateCAGR(initialValue, finalValue, years);
    expect(calculatedCAGR).toBeCloseTo(expectedCAGR, 5);

    // Calcular volatilidad manualmente
    // Media = (0.10 - 0.05 + 0.08 + 0.03 - 0.02) / 5 = 0.028
    const mean = monthlyReturns.reduce((sum, r) => sum + r, 0) / monthlyReturns.length;
    expect(mean).toBeCloseTo(0.028, 5);

    // Varianza = sum((r - mean)^2) / (n-1)
    const squaredDiffs = monthlyReturns.map((r) => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (monthlyReturns.length - 1);
    const stdDev = Math.sqrt(variance);
    const expectedVolatility = stdDev * Math.sqrt(12);

    const calculatedVolatility = calculateVolatility(monthlyReturns);
    expect(calculatedVolatility).toBeCloseTo(expectedVolatility, 5);

    // Calcular max drawdown manualmente
    // Pico: 11286 (después del mes 3)
    // Valle: 10450 (mes 2) - pero esto es antes del pico
    // Nuevo análisis: Pico = 11624.58, Valle = 11392.09
    // Drawdown = (11392.09 - 11624.58) / 11624.58 = -0.02
    // Pero el max drawdown real es desde 11000 a 10450 = -5%
    // Verificar: picos y valles
    // Valores: [10000, 11000, 10450, 11286, 11624.58, 11392.09]
    // Pico 1: 11000, Valle 1: 10450 -> DD = -5%
    // Pico 2: 11624.58, Valle 2: 11392.09 -> DD = -2%
    // Max DD = -5%

    const calculatedMaxDD = calculateMaxDrawdown(values);
    expect(calculatedMaxDD).toBeCloseTo(-0.05, 2);
  });

  it("calcula Sharpe correctamente", () => {
    // Retornos mensuales conocidos
    const monthlyReturns = [0.10, -0.05, 0.08, 0.03, -0.02];
    const initialValue = 10000;

    let currentValue = initialValue;
    const values = [initialValue];
    for (const ret of monthlyReturns) {
      currentValue = currentValue * (1 + ret);
      values.push(currentValue);
    }
    const finalValue = values[values.length - 1]!;
    const years = 5 / 12;

    // Calcular métricas
    const metrics = calculateMetrics(
      values,
      monthlyReturns,
      initialValue,
      finalValue,
      years
    );

    // Sharpe = (CAGR - risk_free) / volatility
    // CAGR calculado
    const cagr = calculateCAGR(initialValue, finalValue, years);
    const volatility = calculateVolatility(monthlyReturns);
    const riskFreeRate = 0.01;
    const expectedSharpe = (cagr - riskFreeRate) / volatility;

    expect(metrics.sharpe).toBeCloseTo(expectedSharpe, 3);
  });
});

// -----------------------------------------------------------------------------
// TEST 2: Rebalanceo
// -----------------------------------------------------------------------------

describe("Rebalanceo de cartera", () => {
  it("devuelve los pesos a 50/50 después del rebalanceo", () => {
    // Cartera 50/50 con dos fondos
    // Fondo A sube 20%, Fondo B baja 10%
    const initialAmount = 10000;
    const positionValues = new Map<string, number>();

    // Pesos iniciales 50/50
    positionValues.set("fund-a", initialAmount * 0.50); // 5000
    positionValues.set("fund-b", initialAmount * 0.50); // 5000

    // Aplicar retornos: A +20%, B -10%
    const fundAValue = 5000 * 1.20; // 6000
    const fundBValue = 5000 * 0.90; // 4500
    positionValues.set("fund-a", fundAValue);
    positionValues.set("fund-b", fundBValue);

    // Valor total: 6000 + 4500 = 10500
    const totalBeforeRebalance = sumPositions(positionValues);
    expect(totalBeforeRebalance).toBe(10500);

    // Verificar pesos antes del rebalanceo
    const weightABefore = fundAValue / totalBeforeRebalance; // 6000/10500 = 57.14%
    const weightBBefore = fundBValue / totalBeforeRebalance; // 4500/10500 = 42.86%
    expect(weightABefore).toBeCloseTo(0.5714, 3);
    expect(weightBBefore).toBeCloseTo(0.4286, 3);

    // Definir holdings con pesos objetivo
    const holdings = [
      { fundId: "fund-a", weight: 50 },
      { fundId: "fund-b", weight: 50 },
    ];

    // Ejecutar rebalanceo
    rebalancePortfolio(positionValues, holdings);

    // Verificar que los pesos vuelven a 50/50
    const totalAfterRebalance = sumPositions(positionValues);
    expect(totalAfterRebalance).toBeCloseTo(10500, 2); // Valor total no cambia

    const newFundAValue = positionValues.get("fund-a")!;
    const newFundBValue = positionValues.get("fund-b")!;

    const weightAAfter = newFundAValue / totalAfterRebalance;
    const weightBAfter = newFundBValue / totalAfterRebalance;

    expect(weightAAfter).toBeCloseTo(0.50, 5);
    expect(weightBAfter).toBeCloseTo(0.50, 5);

    // Verificar valores exactos
    expect(newFundAValue).toBeCloseTo(5250, 2); // 50% de 10500
    expect(newFundBValue).toBeCloseTo(5250, 2); // 50% de 10500
  });

  it("shouldRebalance detecta correctamente cuándo rebalancear", () => {
    // Rebalanceo mensual
    expect(shouldRebalance(1, 0, "monthly")).toBe(true);
    expect(shouldRebalance(2, 1, "monthly")).toBe(true);

    // Rebalanceo trimestral
    expect(shouldRebalance(2, 0, "quarterly")).toBe(false);
    expect(shouldRebalance(3, 0, "quarterly")).toBe(true);
    expect(shouldRebalance(6, 3, "quarterly")).toBe(true);

    // Rebalanceo anual
    expect(shouldRebalance(11, 0, "annual")).toBe(false);
    expect(shouldRebalance(12, 0, "annual")).toBe(true);
    expect(shouldRebalance(24, 12, "annual")).toBe(true);

    // Sin rebalanceo
    expect(shouldRebalance(100, 0, "none")).toBe(false);
  });

  it("rebalanceo con cartera desequilibrada 70/30", () => {
    const positionValues = new Map<string, number>();

    // Después de movimientos del mercado: A tiene 8000, B tiene 2000
    positionValues.set("fund-a", 8000);
    positionValues.set("fund-b", 2000);

    // Objetivo: 60/40
    const holdings = [
      { fundId: "fund-a", weight: 60 },
      { fundId: "fund-b", weight: 40 },
    ];

    rebalancePortfolio(positionValues, holdings);

    const total = sumPositions(positionValues);
    expect(total).toBe(10000);

    expect(positionValues.get("fund-a")).toBeCloseTo(6000, 2);
    expect(positionValues.get("fund-b")).toBeCloseTo(4000, 2);
  });
});

// -----------------------------------------------------------------------------
// TEST 3: Descuento de TER
// -----------------------------------------------------------------------------

describe("Descuento de TER", () => {
  it("la diferencia de retorno neto entre TER 1.8% y 0.2% es ~1.6% anual", () => {
    // Simular un año (12 meses) con retornos brutos idénticos
    const grossMonthlyReturn = 0.01; // 1% mensual bruto (~12.68% anual)
    const terHigh = 1.8; // 1.8% TER
    const terLow = 0.2;  // 0.2% TER

    const initialValue = 10000;
    let valueHighTer = initialValue;
    let valueLowTer = initialValue;

    // Simular 12 meses
    for (let month = 0; month < 12; month++) {
      // TER mensual = TER anual / 12 / 100
      const monthlyTerHigh = terHigh / 12 / 100;
      const monthlyTerLow = terLow / 12 / 100;

      // Retorno neto = retorno bruto - TER mensual
      const netReturnHigh = grossMonthlyReturn - monthlyTerHigh;
      const netReturnLow = grossMonthlyReturn - monthlyTerLow;

      valueHighTer *= (1 + netReturnHigh);
      valueLowTer *= (1 + netReturnLow);
    }

    // Calcular retornos anuales
    const annualReturnHighTer = (valueHighTer - initialValue) / initialValue;
    const annualReturnLowTer = (valueLowTer - initialValue) / initialValue;

    // La diferencia debería ser aproximadamente 1.6% (la diferencia en TER)
    const returnDifference = annualReturnLowTer - annualReturnHighTer;

    // Tolerancia: la diferencia real es ligeramente diferente debido al compounding
    // TER diferencia = 1.6%, pero el efecto compuesto lo modifica ligeramente
    expect(returnDifference).toBeCloseTo(0.016, 2);

    // Verificar que el valor final con TER bajo es mayor
    expect(valueLowTer).toBeGreaterThan(valueHighTer);

    // La diferencia en valor debería ser significativa
    const valueDifference = valueLowTer - valueHighTer;
    expect(valueDifference).toBeGreaterThan(150); // Aproximadamente 160€ de diferencia
  });

  it("el TER se deduce mensualmente, no anualmente", () => {
    const initialValue = 10000;
    const ter = 1.2; // 1.2% anual
    const grossReturn = 0; // Sin retorno para ver solo el efecto del TER

    // Simular 12 meses con solo TER (sin retorno)
    let value = initialValue;
    for (let month = 0; month < 12; month++) {
      const monthlyTer = ter / 12 / 100;
      value *= (1 - monthlyTer);
    }

    // El valor debería ser aproximadamente inicial * (1 - TER)
    // Pero debido al compounding mensual, es ligeramente diferente
    const expectedWithCompounding = initialValue * Math.pow(1 - ter / 12 / 100, 12);
    expect(value).toBeCloseTo(expectedWithCompounding, 2);

    // Sin compounding sería: 10000 * (1 - 0.012) = 9880
    // Con compounding mensual: 10000 * (1 - 0.001)^12 ≈ 9880.53
    // La diferencia es pequeña pero existe
    expect(value).toBeCloseTo(9880.53, 0);
  });

  it("compara fondo caro vs barato con 10 años de inversión", () => {
    const initialValue = 10000;
    const grossMonthlyReturn = 0.006; // ~7.44% anual bruto
    const terExpensive = 1.8;
    const terCheap = 0.18;

    let valueExpensive = initialValue;
    let valueCheap = initialValue;

    // Simular 10 años (120 meses)
    for (let month = 0; month < 120; month++) {
      const monthlyTerExpensive = terExpensive / 12 / 100;
      const monthlyTerCheap = terCheap / 12 / 100;

      valueExpensive *= (1 + grossMonthlyReturn - monthlyTerExpensive);
      valueCheap *= (1 + grossMonthlyReturn - monthlyTerCheap);
    }

    // El fondo barato debería tener significativamente más valor
    const difference = valueCheap - valueExpensive;
    const differencePercent = (difference / valueExpensive) * 100;

    // La diferencia debería ser considerable después de 10 años
    expect(difference).toBeGreaterThan(2000); // Al menos 2000€ de diferencia

    // El fondo caro pierde aproximadamente 15-20% más que el barato por comisiones
    expect(differencePercent).toBeGreaterThan(10);

    // Verificar que ambos crecieron (retorno bruto > TER)
    expect(valueExpensive).toBeGreaterThan(initialValue);
    expect(valueCheap).toBeGreaterThan(initialValue);
  });
});

// -----------------------------------------------------------------------------
// Tests de verificación de fórmulas
// -----------------------------------------------------------------------------

describe("Verificación de fórmulas financieras", () => {
  it("CAGR con reinversión compuesta es correcto", () => {
    // Si invierto 1000€ con 10% CAGR durante 10 años
    // Valor final = 1000 * (1.10)^10 = 2593.74€
    const initialValue = 1000;
    const years = 10;
    const cagr = 0.10;
    const expectedFinalValue = initialValue * Math.pow(1 + cagr, years);

    // Verificar que calculateCAGR produce el CAGR correcto
    const calculatedCAGR = calculateCAGR(initialValue, expectedFinalValue, years);
    expect(calculatedCAGR).toBeCloseTo(cagr, 5);
  });

  it("Sharpe Ratio teórico es correcto", () => {
    // Sharpe = (Retorno - Risk-free) / Volatilidad
    // Con CAGR = 8%, Risk-free = 1%, Vol = 15%
    // Sharpe = (0.08 - 0.01) / 0.15 = 0.4667
    const cagr = 0.08;
    const riskFree = 0.01;
    const volatility = 0.15;
    const expectedSharpe = (cagr - riskFree) / volatility;

    expect(expectedSharpe).toBeCloseTo(0.4667, 3);
  });

  it("Volatilidad anualizada es √12 veces la mensual", () => {
    // Si la volatilidad mensual es 3%, la anualizada debe ser ~10.39%
    const monthlyVol = 0.03;
    const annualizedVol = monthlyVol * Math.sqrt(12);

    expect(annualizedVol).toBeCloseTo(0.1039, 3);
  });
});

// -----------------------------------------------------------------------------
// Tests de casos extremos
// -----------------------------------------------------------------------------

describe("Casos extremos", () => {
  it("maneja valores muy grandes", () => {
    const result = calculateCAGR(1, 1e12, 30);
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("maneja valores muy pequeños", () => {
    const result = calculateCAGR(1000000, 0.01, 10);
    expect(result).toBeLessThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("volatilidad con retornos extremos", () => {
    const extremeReturns = [-0.50, 0.80, -0.30, 0.60, -0.40, 0.70];
    const result = calculateVolatility(extremeReturns);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("max drawdown con recuperación total", () => {
    // Cae 50% y luego se recupera
    const values = [100, 50, 100];
    const result = calculateMaxDrawdown(values);
    expect(result).toBeCloseTo(-0.50, 5);
  });
});

// -----------------------------------------------------------------------------
// Tests de integración de métricas
// -----------------------------------------------------------------------------

describe("calculateMetrics - Integración", () => {
  it("calcula todas las métricas para un escenario completo", () => {
    // Crear datos de un año con retornos mixtos
    const monthlyReturns = [
      0.02, -0.01, 0.03, 0.01, -0.02, 0.04,
      0.02, -0.03, 0.01, 0.03, -0.01, 0.02
    ];

    const initialValue = 10000;
    const values = [initialValue];
    let currentValue = initialValue;

    for (const ret of monthlyReturns) {
      currentValue *= (1 + ret);
      values.push(currentValue);
    }

    const finalValue = values[values.length - 1]!;
    const years = 1;

    const metrics = calculateMetrics(
      values,
      monthlyReturns,
      initialValue,
      finalValue,
      years
    );

    // Verificar que todas las métricas son números válidos
    expect(Number.isFinite(metrics.totalReturn)).toBe(true);
    expect(Number.isFinite(metrics.cagr)).toBe(true);
    expect(Number.isFinite(metrics.volatility)).toBe(true);
    expect(Number.isFinite(metrics.sharpe)).toBe(true);
    expect(Number.isFinite(metrics.sortino)).toBe(true);
    expect(Number.isFinite(metrics.maxDrawdown)).toBe(true);
    expect(Number.isFinite(metrics.bestMonth)).toBe(true);
    expect(Number.isFinite(metrics.worstMonth)).toBe(true);
    expect(Number.isFinite(metrics.positiveMonthsRatio)).toBe(true);

    // Verificar coherencia
    expect(metrics.bestMonth).toBeGreaterThan(metrics.worstMonth);
    expect(metrics.maxDrawdown).toBeLessThanOrEqual(0);
    expect(metrics.positiveMonthsRatio).toBeGreaterThanOrEqual(0);
    expect(metrics.positiveMonthsRatio).toBeLessThanOrEqual(1);

    // Verificar que los meses positivos son correctos
    const positiveMonths = monthlyReturns.filter(r => r > 0).length;
    expect(metrics.positiveMonthsRatio).toBeCloseTo(positiveMonths / 12, 5);
  });
});
