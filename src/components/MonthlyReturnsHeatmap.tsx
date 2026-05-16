"use client";

// =============================================================================
// MONTHLY RETURNS HEATMAP — Matriz Año × Mes con gradiente rojo-verde
// =============================================================================
//
// Layout estándar de los backtesters profesionales (Portfolio Visualizer,
// Morningstar, etc): filas = años, 12 columnas Ene-Dic + 1 columna "Año"
// con el total. Permite leer:
//
//   • HORIZONTAL: cómo fue cada año mes a mes
//   • VERTICAL:   estacionalidad (¿septiembre suele ser malo?)
//   • DIAGONAL:   tendencias (rachas alcistas/bajistas)
//
// La escala de color usa el máximo absoluto MENSUAL del rango (no anual),
// porque los meses tienen mucha más dispersión que los años — si usásemos
// la escala anual, casi todas las celdas saldrían saturadas.
// =============================================================================

import { useMemo, useState } from "react";

/** Punto de la serie temporal mensual: año-mes y valor del patrimonio. */
export interface MonthlyValue {
  /** "YYYY-MM". */
  monthKey: string;
  /** Valor del patrimonio al cierre de ese mes. */
  value: number;
}

/** Una serie etiquetada (cartera A, cartera B, benchmark...). */
export interface HeatmapSeries {
  label: string;
  /** Color de acento opcional para el encabezado (clase Tailwind). */
  accentClass?: string;
  /** Valores ORDENADOS por monthKey (cierre mensual). */
  monthlyValues: MonthlyValue[];
  /** Valor inicial (para calcular el retorno del primer mes). */
  initialValue: number;
}

interface Props {
  series: HeatmapSeries[];
  title?: string;
  description?: string;
}

const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

interface MonthlyReturn {
  year: number;
  month: number; // 1-12
  returnPct: number;
}

/**
 * A partir de valores mensuales (Map de fin de mes), calcula los retornos
 * mensuales (% sobre el cierre anterior). El primer mes usa initialValue.
 */
function computeMonthlyReturns(
  monthlyValues: MonthlyValue[],
  initialValue: number
): MonthlyReturn[] {
  if (monthlyValues.length === 0) return [];
  const sorted = [...monthlyValues].sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );
  const result: MonthlyReturn[] = [];
  let prev = initialValue;
  for (const point of sorted) {
    const [yearStr, monthStr] = point.monthKey.split("-");
    const year = parseInt(yearStr!, 10);
    const month = parseInt(monthStr!, 10);
    const ret = prev > 0 ? (point.value / prev - 1) * 100 : 0;
    result.push({ year, month, returnPct: ret });
    prev = point.value;
  }
  return result;
}

/** Retorno anual = compuesto de los retornos mensuales del año. */
function computeAnnualReturns(monthlyReturns: MonthlyReturn[]): Map<number, number> {
  const yearMap = new Map<number, number[]>();
  for (const r of monthlyReturns) {
    if (!yearMap.has(r.year)) yearMap.set(r.year, []);
    yearMap.get(r.year)!.push(r.returnPct);
  }
  const annual = new Map<number, number>();
  for (const [year, monthlyRets] of yearMap) {
    let compound = 1;
    for (const r of monthlyRets) compound *= 1 + r / 100;
    annual.set(year, (compound - 1) * 100);
  }
  return annual;
}

/** Color de fondo y texto para un valor dado la magnitud máxima del conjunto. */
function getCellColor(value: number, maxMagnitude: number): {
  bg: string;
  text: string;
} {
  if (maxMagnitude === 0 || value === 0) {
    return { bg: "rgb(248, 250, 252)", text: "rgb(71, 85, 105)" };
  }
  const intensity = Math.min(1, Math.abs(value) / maxMagnitude);
  const lightness = 95 - 63 * intensity;
  const hue = value >= 0 ? 152 : 0;
  const sat = 76;
  const bg = `hsl(${hue}, ${sat}%, ${lightness}%)`;
  const text = intensity > 0.55 ? "rgba(255,255,255,0.95)" : "rgb(15, 23, 42)";
  return { bg, text };
}

function formatReturn(v: number, decimals = 1): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(decimals)}%`;
}

// -----------------------------------------------------------------------------
// Sub-componente: una matriz para una serie (todas las series usan la MISMA
// escala de color para que las celdas sean comparables visualmente entre
// carteras).
// -----------------------------------------------------------------------------

function MatrixForSeries({
  series,
  globalMaxMagnitude,
  globalMaxAnnualMagnitude,
}: {
  series: HeatmapSeries;
  globalMaxMagnitude: number;
  globalMaxAnnualMagnitude: number;
}) {
  const { rows, annualByYear } = useMemo(() => {
    const monthlyReturns = computeMonthlyReturns(
      series.monthlyValues,
      series.initialValue
    );
    const annual = computeAnnualReturns(monthlyReturns);

    // Construir grid año → [12 valores | undefined si no hay]
    const yearMap = new Map<number, (number | undefined)[]>();
    for (const r of monthlyReturns) {
      if (!yearMap.has(r.year)) {
        yearMap.set(r.year, new Array(12).fill(undefined));
      }
      yearMap.get(r.year)![r.month - 1] = r.returnPct;
    }
    const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
    const rows = years.map((year) => ({
      year,
      months: yearMap.get(year)!,
    }));
    return { rows, annualByYear: annual };
  }, [series]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-brand-tertiary italic">
        Sin datos mensuales para {series.label}.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <h4
        className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
          series.accentClass ?? "text-brand-navy"
        }`}
      >
        {series.label}
      </h4>
      <table className="w-full text-xs border-separate" style={{ borderSpacing: "2px" }}>
        <colgroup>
          <col style={{ width: "55px" }} />
          {MONTH_LABELS.map((m) => (
            <col key={m} />
          ))}
          <col style={{ width: "65px" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="text-left text-[10px] font-semibold text-brand-tertiary uppercase px-1 py-1">
              Año
            </th>
            {MONTH_LABELS.map((m) => (
              <th
                key={m}
                className="text-center text-[10px] font-semibold text-brand-tertiary uppercase px-1 py-1"
              >
                {m}
              </th>
            ))}
            <th className="text-center text-[10px] font-semibold text-brand-navy uppercase px-1 py-1 border-l-2 border-slate-200">
              Año
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ year, months }) => {
            const annual = annualByYear.get(year);
            return (
              <tr key={year}>
                <td className="font-mono text-xs font-semibold text-brand-secondary px-1 py-1">
                  {year}
                </td>
                {months.map((value, idx) => {
                  if (value === undefined) {
                    return (
                      <td
                        key={idx}
                        className="rounded p-1.5 text-center bg-slate-50 text-slate-300 text-[11px]"
                      >
                        —
                      </td>
                    );
                  }
                  const { bg, text } = getCellColor(value, globalMaxMagnitude);
                  return (
                    <td
                      key={idx}
                      className="rounded p-1.5 text-center text-[11px] font-semibold"
                      style={{ backgroundColor: bg, color: text }}
                      title={`${MONTH_LABELS[idx]} ${year}: ${formatReturn(value, 2)}`}
                    >
                      {formatReturn(value)}
                    </td>
                  );
                })}
                {annual !== undefined ? (
                  (() => {
                    const { bg, text } = getCellColor(annual, globalMaxAnnualMagnitude);
                    return (
                      <td
                        className="rounded p-1.5 text-center text-[11px] font-bold border-l-2 border-slate-100"
                        style={{ backgroundColor: bg, color: text }}
                        title={`Total ${year}: ${formatReturn(annual, 2)}`}
                      >
                        {formatReturn(annual)}
                      </td>
                    );
                  })()
                ) : (
                  <td className="rounded p-1.5 text-center bg-slate-50 text-slate-300 text-[11px] border-l-2 border-slate-100">
                    —
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------------

export function MonthlyReturnsHeatmap({ series, title, description }: Props) {
  // Sección colapsable: por defecto abierta. El usuario puede plegarla para no
  // saturar la pantalla.
  const [expanded, setExpanded] = useState(true);

  // Calcular máximo absoluto MENSUAL y ANUAL a nivel global (todas las series
  // comparten la misma escala para que las celdas sean comparables visualmente).
  const { maxMonthly, maxAnnual } = useMemo(() => {
    let monMax = 0;
    let yearMax = 0;
    for (const s of series) {
      const monthly = computeMonthlyReturns(s.monthlyValues, s.initialValue);
      for (const r of monthly) {
        if (Math.abs(r.returnPct) > monMax) monMax = Math.abs(r.returnPct);
      }
      const annual = computeAnnualReturns(monthly);
      for (const [, v] of annual) {
        if (Math.abs(v) > yearMax) yearMax = Math.abs(v);
      }
    }
    return { maxMonthly: monMax || 1, maxAnnual: yearMax || 1 };
  }, [series]);

  if (series.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-100 shadow-sm bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="text-left">
          {title && (
            <h3 className="text-lg font-semibold text-brand-navy font-serif">{title}</h3>
          )}
          {description && (
            <p className="text-sm text-brand-tertiary mt-1">{description}</p>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-brand-tertiary flex-shrink-0 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-6 pb-6">
          {/* Leyenda */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <span className="text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
              Peor
            </span>
            <div
              className="h-2.5 flex-1 max-w-[300px] rounded-full"
              style={{
                background:
                  "linear-gradient(to right, hsl(0,76%,32%), hsl(0,76%,80%), rgb(248,250,252), hsl(152,76%,80%), hsl(152,76%,32%))",
              }}
            />
            <span className="text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
              Mejor
            </span>
            <span className="text-xs text-brand-tertiary ml-2">
              (intensidad mensual relativa al máx. mensual:{" "}
              <strong>{formatReturn(maxMonthly, 1)}</strong>)
            </span>
          </div>

          {/* Una matriz por serie, apiladas */}
          <div className="space-y-6">
            {series.map((s, i) => (
              <MatrixForSeries
                key={`${s.label}-${i}`}
                series={s}
                globalMaxMagnitude={maxMonthly}
                globalMaxAnnualMagnitude={maxAnnual}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
