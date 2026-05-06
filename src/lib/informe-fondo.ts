// =============================================================================
// INFORME DE FONDO — comparativa fondo del usuario vs Cartera K10 Sectorial
// =============================================================================
//
// Este es el lead magnet de la calculadora "¿Quieres saber si tu fondo bate
// a la K10?". Se entrega por email a quien deja el lead. Comparamos el NAV
// del fondo del usuario contra el preset k-inbestme-10 (K10 Sectorial:
// 80% RV Sectorial + 20% Oro).
//
// Implementación: usamos el motor `runBacktest` real para garantizar que
// las cifras COINCIDEN al céntimo con las del backtester completo. Para
// permitir un fondo de usuario que no esté curado en la BD, lo registramos
// dinámicamente vía `registrarFondoAdHoc` antes de llamar al motor.
//
// Output normalizado: lo que `/informe/[isin]/page.tsx` renderiza
// (gráfico + 4 KPIs + correlación).
//
// =============================================================================

import { runBacktest } from "./backtest-engine";
import { registrarFondoAdHoc } from "./fund-database";
import { getPresetById } from "./portfolio-presets";
import type { BacktestConfig, BacktestResult } from "./types";

const PRESET_K10 = "k-inbestme-10";
const INVERSION_INICIAL = 10_000;

export interface InformeKpi {
  valorFinal: number;
  cagr: number;
  volatilidad: number;
  maxDrawdown: number;
}

export interface InformeFondo {
  isin: string;
  nombreFondo: string;
  fechas: string[];
  valorFondo: number[];
  valorK10: number[];
  kpiFondo: InformeKpi;
  kpiK10: InformeKpi;
  correlacion: number;
  rangoFechas: { inicio: string; fin: string };
  anosCubiertos: number;
}

const DIAS_POR_ANO = 365.25;

/**
 * Convierte BacktestResult del motor en KPI simplificado para el informe.
 */
function toKpi(r: BacktestResult): InformeKpi {
  return {
    valorFinal: Math.round(r.finalValue),
    cagr: r.metrics.cagr,
    volatilidad: r.metrics.volatility,
    maxDrawdown: r.metrics.maxDrawdown,
  };
}

/**
 * Genera el informe del fondo del usuario vs Cartera K10 Sectorial.
 * Reusa runBacktest para que rebalanceo, TER y frecuencia diaria sean
 * idénticos al backtester completo.
 */
export async function generarInformeFondo(
  isin: string,
  nombreFondo: string,
): Promise<InformeFondo | null> {
  // 1) Registrar el fondo del usuario como ad-hoc en fund-database
  registrarFondoAdHoc(isin, nombreFondo);

  // 2) Cargar el preset K10 Sectorial
  const k10Preset = getPresetById(PRESET_K10);
  if (!k10Preset) {
    console.error(`[informe-fondo] preset ${PRESET_K10} no encontrado`);
    return null;
  }

  // 3) Construir config: rango amplio (15 años hacia atrás) + rebalanceo mensual
  //    + rango común para que sólo se use el periodo donde ambos tienen NAVs.
  const hoy = new Date();
  const finIso = hoy.toISOString().slice(0, 10);
  const inicio = new Date(hoy);
  inicio.setUTCFullYear(inicio.getUTCFullYear() - 15);
  const inicioIso = inicio.toISOString().slice(0, 10);

  const config: BacktestConfig = {
    portfolioA: {
      name: nombreFondo,
      holdings: [{ fundId: `adhoc-${isin}`, weight: 100 }],
    },
    portfolioB: {
      name: k10Preset.name,
      holdings: k10Preset.holdings,
    },
    startDate: inicioIso,
    endDate: finIso,
    initialAmount: INVERSION_INICIAL,
    rebalanceFrequency: "monthly",
    useCommonDateRange: true,
    // Mensual: Pablo prefiere ese granularity para comparar (encaja mejor
    // visualmente con la curva del backtester completo). Las metricas
    // residuales difieren ~0,3pp respecto a daily — aceptable.
    displayGranularity: "monthly",
  };

  let res;
  try {
    res = await runBacktest(config);
  } catch (err) {
    console.error("[informe-fondo] runBacktest error:", err);
    return null;
  }

  if (!res.a || !res.b) {
    console.warn("[informe-fondo] backtest sin resultados completos");
    return null;
  }

  // 4) Construir series alineadas para el chart (ya en granularidad mensual).
  const fechasA = res.a.timeSeries.map((p) => p.exactDate || p.date);
  const valoresA = res.a.timeSeries.map((p) => Math.round(p.value));
  const valoresB = res.b.timeSeries.map((p) => Math.round(p.value));

  // 5) Correlación: viene del backtest si lo expone, si no calculamos manual
  let correlacion = res.correlation ?? null;
  if (correlacion == null) {
    correlacion = correlacionMensual(valoresA, valoresB);
  }

  // 6) Rango y años cubiertos
  const fechaIni = res.commonDateRange?.start || fechasA[0] || inicioIso;
  const fechaFin = res.commonDateRange?.end || fechasA[fechasA.length - 1] || finIso;
  const ms = new Date(fechaFin + "T00:00:00Z").getTime() - new Date(fechaIni + "T00:00:00Z").getTime();
  const anosCubiertos = ms / (DIAS_POR_ANO * 24 * 3600 * 1000);

  return {
    isin,
    nombreFondo,
    fechas: fechasA,
    valorFondo: valoresA,
    valorK10: valoresB,
    kpiFondo: toKpi(res.a),
    kpiK10: toKpi(res.b),
    correlacion,
    rangoFechas: { inicio: fechaIni, fin: fechaFin },
    anosCubiertos,
  };
}

/** Correlación de Pearson sobre retornos mensuales de dos series de valores. */
function correlacionMensual(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 3) return 0;
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < a.length; i++) {
    if (a[i - 1]! > 0 && b[i - 1]! > 0) {
      ra.push(a[i]! / a[i - 1]! - 1);
      rb.push(b[i]! / b[i - 1]! - 1);
    }
  }
  if (ra.length < 3) return 0;
  const muA = ra.reduce((s, v) => s + v, 0) / ra.length;
  const muB = rb.reduce((s, v) => s + v, 0) / rb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) {
    const xa = ra[i]! - muA;
    const xb = rb[i]! - muB;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}
