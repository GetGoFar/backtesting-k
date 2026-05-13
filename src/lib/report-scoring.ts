// =============================================================================
// REPORT SCORING — Sistema de notas 0-10 para evaluación de carteras
// =============================================================================
//
// Calcula notas de 0 a 10 sobre 6 dimensiones, basadas en métricas
// PRE-IMPUESTOS (la calidad inherente de la cartera no depende del régimen
// fiscal del inversor). El impacto fiscal se trata en una sección aparte.
//
// =============================================================================

import type { BacktestResult } from "./types";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface ScoreDetail {
  /** Nota de 0 a 10 */
  value: number;
  /** Métrica usada (ya numéricamente formateada para mostrar) */
  metric: string;
  /** Explicación breve para el alumno (sin jerga) */
  explanation: string;
}

export interface PortfolioScore {
  /** Nota global de 0 a 10 (media ponderada) */
  global: number;
  /** Adjetivo cualitativo correspondiente a la nota global */
  adjective: string;
  /** Color hex sugerido para mostrar el adjetivo */
  color: string;
  /** Notas individuales por dimensión */
  rentabilidad: ScoreDetail;
  eficiencia: ScoreDetail;
  resistencia: ScoreDetail;
  estabilidad: ScoreDetail;
  coste: ScoreDetail;
  diversificacion: ScoreDetail;
}

// -----------------------------------------------------------------------------
// Pesos de la nota global (suman 100%)
// -----------------------------------------------------------------------------

const WEIGHTS = {
  rentabilidad: 0.25,
  eficiencia: 0.20,
  resistencia: 0.20,
  estabilidad: 0.15,
  coste: 0.15,
  diversificacion: 0.05,
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Mapea un valor en un rango lineal a una nota 0-10 (interpolación lineal). */
function linearScore(value: number, min: number, max: number, invert = false): number {
  if (invert) {
    if (value <= min) return 10;
    if (value >= max) return 0;
    return Math.max(0, Math.min(10, 10 * (1 - (value - min) / (max - min))));
  }
  if (value <= min) return 0;
  if (value >= max) return 10;
  return Math.max(0, Math.min(10, 10 * (value - min) / (max - min)));
}

/** Convierte una nota global en adjetivo y color */
function globalToAdjective(score: number): { adjective: string; color: string } {
  if (score >= 9.0) return { adjective: "Excelente", color: "#059669" };
  if (score >= 7.5) return { adjective: "Muy buena", color: "#2563EB" };
  if (score >= 6.0) return { adjective: "Notable", color: "#0891B2" };
  if (score >= 4.5) return { adjective: "Mejorable", color: "#D97706" };
  if (score >= 3.0) return { adjective: "Floja", color: "#DC2626" };
  return { adjective: "Mala", color: "#991B1B" };
}

// -----------------------------------------------------------------------------
// Scoring por dimensión
// -----------------------------------------------------------------------------

/**
 * RENTABILIDAD — basada en CAGR pre-impuestos (anualizado, TWRR).
 * Escala calibrada al universo de carteras realistas:
 *   < 0%   → 0 (perdiendo dinero)
 *   ≥ 12%  → 10 (excelente histórico)
 */
function scoreRentabilidad(result: BacktestResult): ScoreDetail {
  // El CAGR del result ya es TWRR puro (sin contribuciones)
  const cagr = result.metrics.cagr * 100;
  const value = linearScore(cagr, 0, 12);
  const formatted = `${cagr >= 0 ? "+" : ""}${cagr.toFixed(1)}% al año`;
  let explanation: string;
  if (cagr >= 12) explanation = "Tu cartera crece a un ritmo excelente, comparable a los mejores índices globales.";
  else if (cagr >= 8) explanation = "Crecimiento sólido. Tu dinero se duplicaría aproximadamente cada 8-10 años.";
  else if (cagr >= 5) explanation = "Crecimiento moderado, por encima de la inflación de largo plazo.";
  else if (cagr >= 0) explanation = "Crecimiento bajo. Probablemente se está comiendo la inflación.";
  else explanation = "Tu cartera pierde dinero en el periodo analizado.";
  return { value, metric: formatted, explanation };
}

/**
 * EFICIENCIA — combinación de Sharpe (60%) y Calmar (40%).
 *   Sharpe: rentabilidad por unidad de volatilidad
 *   Calmar: rentabilidad por unidad de drawdown máximo
 */
function scoreEficiencia(result: BacktestResult): ScoreDetail {
  const sharpe = result.metrics.sharpe;
  const calmar = result.metrics.calmar;
  // Sharpe: <0=0, 1.2+=10
  const sharpeScore = linearScore(sharpe, 0, 1.2);
  // Calmar: <0=0, 1.0+=10
  const calmarScore = linearScore(calmar, 0, 1.0);
  const value = sharpeScore * 0.6 + calmarScore * 0.4;
  const formatted = `Sharpe ${sharpe.toFixed(2)} · Calmar ${calmar.toFixed(2)}`;
  let explanation: string;
  if (value >= 8.5) explanation = "Excelente: obtienes mucha rentabilidad por cada euro de riesgo asumido.";
  else if (value >= 7) explanation = "Buena relación rentabilidad/riesgo. La cartera te paga bien por aguantar los altibajos.";
  else if (value >= 5) explanation = "Eficiencia razonable. Hay equilibrio entre lo que ganas y lo que arriesgas.";
  else if (value >= 3) explanation = "El riesgo asumido no se está traduciendo en la rentabilidad esperada.";
  else explanation = "Mal aprovechamiento del riesgo: arriesgas mucho para ganar poco.";
  return { value, metric: formatted, explanation };
}

/**
 * RESISTENCIA — basada en Max Drawdown y peor mes/trimestre.
 *   Max DD pre-impuestos: peor caída desde un máximo
 */
function scoreResistencia(result: BacktestResult): ScoreDetail {
  const maxDD = result.metrics.maxDrawdown * 100; // negativo
  const worstMonth = result.metrics.worstMonth * 100; // negativo
  // Max DD: 0% = 10, -45% = 0
  const ddScore = linearScore(Math.abs(maxDD), 10, 45, true);
  // Peor mes: 0% = 10, -20% = 0
  const wmScore = linearScore(Math.abs(worstMonth), 5, 20, true);
  const value = ddScore * 0.7 + wmScore * 0.3;
  const formatted = `Peor caída ${maxDD.toFixed(1)}% · peor periodo ${worstMonth.toFixed(1)}%`;
  let explanation: string;
  if (value >= 8.5) explanation = "Cartera muy resistente. Las crisis le han afectado poco.";
  else if (value >= 7) explanation = "Aguante bueno. En su peor momento perdió de manera asumible para la mayoría de inversores.";
  else if (value >= 5) explanation = "Resistencia razonable, pero en las crisis grandes habrías sufrido bastante.";
  else if (value >= 3) explanation = "Cartera frágil en crisis. Necesitas mucho temple para no vender en pánico.";
  else explanation = "Muy vulnerable a las crisis. Los retrocesos son brutales.";
  return { value, metric: formatted, explanation };
}

/**
 * ESTABILIDAD — basada en volatilidad y % periodos positivos.
 */
function scoreEstabilidad(result: BacktestResult): ScoreDetail {
  const vol = result.metrics.volatility * 100;
  const posRatio = result.metrics.positiveMonthsRatio * 100; // %
  // Vol: 8% = 10, 22% = 0
  const volScore = linearScore(vol, 8, 22, true);
  // % positivos: 50% = 0, 70% = 10
  const posScore = linearScore(posRatio, 50, 70);
  const value = volScore * 0.6 + posScore * 0.4;
  const formatted = `Altibajos ${vol.toFixed(1)}% · ${posRatio.toFixed(0)}% periodos positivos`;
  let explanation: string;
  if (value >= 8.5) explanation = "Camino muy tranquilo. Pocas sorpresas desagradables.";
  else if (value >= 7) explanation = "Estabilidad buena. Los altibajos son manejables.";
  else if (value >= 5) explanation = "Estabilidad típica de una cartera diversificada con renta variable.";
  else if (value >= 3) explanation = "Camino movido. Necesitas estómago para no preocuparte cada mes.";
  else explanation = "Cartera muy volátil. Difícil de aguantar emocionalmente para la mayoría.";
  return { value, metric: formatted, explanation };
}

/**
 * COSTE — basado en TER ponderado + comisión de gestión.
 *   NO incluye impuestos (esos son contextuales del inversor).
 */
function scoreCoste(result: BacktestResult): ScoreDetail {
  const ter = result.fees.weightedTer;
  const mgmt = result.fees.managementFee ?? 0;
  const total = ter + mgmt;
  // 0.3% = 10, 1.6% = 0
  const value = linearScore(total, 0.3, 1.6, true);
  const formatted = mgmt > 0
    ? `TER ${ter.toFixed(2)}% + gestión ${mgmt.toFixed(2)}% = ${total.toFixed(2)}%`
    : `TER ${ter.toFixed(2)}%`;
  let explanation: string;
  if (value >= 8.5) explanation = "Cartera barata, dentro de los mejores estándares de inversión indexada.";
  else if (value >= 7) explanation = "Coste razonable. No te están sangrando con comisiones.";
  else if (value >= 5) explanation = "Coste medio. Hay margen para abaratar y mejorar la rentabilidad neta.";
  else if (value >= 3) explanation = "Coste alto. Las comisiones se comen una parte significativa de tu rentabilidad.";
  else explanation = "Coste muy alto. Estás pagando demasiado por lo que recibes.";
  return { value, metric: formatted, explanation };
}

/**
 * DIVERSIFICACIÓN — basada en composición de la cartera.
 *   Más activos + más clases + más regiones = mejor nota.
 */
function scoreDiversificacion(result: BacktestResult): ScoreDetail {
  const byClass = result.allocation?.byAssetClass ?? [];
  const byCategory = result.allocation?.byCategory ?? [];
  const numClasses = byClass.length;
  const numCategories = byCategory.length;
  // Heurística simple: nº de clases (mapea 1→0, 4+→10) y nº categorías (1→0, 5+→10)
  const classScore = linearScore(numClasses, 1, 4);
  const catScore = linearScore(numCategories, 1, 5);
  // Penalización si una sola categoría representa >70% (concentración excesiva)
  const maxConcentration = byCategory.reduce((max, c) => Math.max(max, c.weight), 0);
  const concentrationPenalty = maxConcentration > 70 ? (maxConcentration - 70) / 3 : 0;
  let value = classScore * 0.5 + catScore * 0.5 - concentrationPenalty;
  value = Math.max(0, Math.min(10, value));
  const formatted = `${numClasses} clases · ${numCategories} categorías`;
  let explanation: string;
  if (value >= 8.5) explanation = "Muy bien diversificada: el riesgo está bien repartido entre tipos de activo y regiones.";
  else if (value >= 7) explanation = "Diversificación adecuada para una cartera de medio-largo plazo.";
  else if (value >= 5) explanation = "Diversificación básica. Algo concentrada en pocos tipos de activo.";
  else if (value >= 3) explanation = "Poca diversificación. Estás bastante expuesto a riesgos específicos.";
  else explanation = "Cartera muy concentrada. Un error en pocas posiciones te puede hacer mucho daño.";
  return { value, metric: formatted, explanation };
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

/**
 * Calcula todas las notas de una cartera (pre-impuestos).
 */
export function computePortfolioScore(result: BacktestResult): PortfolioScore {
  const rentabilidad = scoreRentabilidad(result);
  const eficiencia = scoreEficiencia(result);
  const resistencia = scoreResistencia(result);
  const estabilidad = scoreEstabilidad(result);
  const coste = scoreCoste(result);
  const diversificacion = scoreDiversificacion(result);

  const global =
    rentabilidad.value * WEIGHTS.rentabilidad +
    eficiencia.value * WEIGHTS.eficiencia +
    resistencia.value * WEIGHTS.resistencia +
    estabilidad.value * WEIGHTS.estabilidad +
    coste.value * WEIGHTS.coste +
    diversificacion.value * WEIGHTS.diversificacion;

  const { adjective, color } = globalToAdjective(global);

  return {
    global,
    adjective,
    color,
    rentabilidad,
    eficiencia,
    resistencia,
    estabilidad,
    coste,
    diversificacion,
  };
}
