"use client";

// =============================================================================
// ANNUAL RETURNS HEATMAP — Tabla coloreada con gradiente rojo→verde
// =============================================================================
//
// Cada celda muestra la rentabilidad anual con color proporcional a su
// magnitud absoluta (más rojo = peor, más verde = mejor). El gradiente se
// computa relativo al MÁXIMO absoluto del conjunto, así una caída del -40%
// se ve igual de "intensa" que una subida del +40%.
//
// Soporta múltiples columnas (carteras / benchmark) — útil para comparar
// performance año a año entre estrategias o contra un índice.
// =============================================================================

import { useMemo } from "react";

/** Una columna del heatmap: una serie de retornos anuales etiquetada. */
export interface HeatmapColumn {
  /** Etiqueta visible en la cabecera (ej. "Estrategia", "Benchmark", "Cartera A"). */
  label: string;
  /** Color de acento opcional para la cabecera (clase Tailwind). Por defecto navy. */
  accentClass?: string;
  /** Mapa año → rentabilidad en %. Ej: { 2020: 18.5, 2021: -3.2, ... } */
  values: Map<number, number>;
}

interface Props {
  /** Una o varias columnas a comparar. */
  columns: HeatmapColumn[];
  /** Título opcional encima del heatmap. */
  title?: string;
  /** Descripción opcional debajo del título. */
  description?: string;
}

/**
 * Devuelve el color de fondo CSS para una rentabilidad. El gradiente va de
 * blanco (0%) a verde saturado (max) o rojo saturado (min). La intensidad
 * relativa se calcula respecto al MÁXIMO absoluto del conjunto.
 */
function getCellColor(value: number, maxMagnitude: number): {
  bg: string;
  text: string;
} {
  if (maxMagnitude === 0 || value === 0) {
    return { bg: "rgb(248, 250, 252)", text: "rgb(71, 85, 105)" }; // slate-50 / slate-600
  }
  const intensity = Math.min(1, Math.abs(value) / maxMagnitude);
  // Lightness: de 95% (casi blanco) a 32% (saturado profundo)
  const lightness = 95 - 63 * intensity;
  // Hue: 152 (verde esmeralda) para positivos, 0 (rojo) para negativos
  const hue = value >= 0 ? 152 : 0;
  const sat = 76; // saturación constante
  const bg = `hsl(${hue}, ${sat}%, ${lightness}%)`;
  // Texto: blanco cuando el fondo es oscuro (intensidad alta), negro cuando es claro
  const text = intensity > 0.55 ? "rgba(255,255,255,0.95)" : "rgb(15, 23, 42)"; // slate-900
  return { bg, text };
}

function formatReturn(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export function AnnualReturnsHeatmap({ columns, title, description }: Props) {
  // 1. Determinar todos los años que aparecen en alguna columna (ordenados)
  // 2. Calcular el máximo absoluto para escalar el gradiente
  const { years, maxMagnitude } = useMemo(() => {
    const yearsSet = new Set<number>();
    let maxMag = 0;
    for (const col of columns) {
      for (const [year, value] of col.values) {
        yearsSet.add(year);
        if (Math.abs(value) > maxMag) maxMag = Math.abs(value);
      }
    }
    return {
      years: Array.from(yearsSet).sort((a, b) => a - b),
      maxMagnitude: maxMag || 1, // evitar dividir por 0
    };
  }, [columns]);

  if (years.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 shadow-sm p-6 bg-white">
        <p className="text-sm text-brand-tertiary italic">Sin datos anuales para mostrar.</p>
      </div>
    );
  }

  const singleColumn = columns.length === 1;

  return (
    <section className="rounded-2xl border border-slate-100 shadow-sm bg-white overflow-hidden">
      <div className="p-6">
        {title && (
          <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">{title}</h3>
        )}
        {description && (
          <p className="text-xs text-brand-tertiary mb-4">{description}</p>
        )}

        {/* Leyenda de gradiente */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[10px] text-brand-tertiary uppercase tracking-wider">
            Peor
          </span>
          <div
            className="h-2 flex-1 max-w-[300px] rounded-full"
            style={{
              background:
                "linear-gradient(to right, hsl(0,76%,32%), hsl(0,76%,80%), rgb(248,250,252), hsl(152,76%,80%), hsl(152,76%,32%))",
            }}
          />
          <span className="text-[10px] text-brand-tertiary uppercase tracking-wider">
            Mejor
          </span>
          <span className="text-[10px] text-brand-tertiary ml-2">
            (intensidad relativa al máx. absoluto: {formatReturn(maxMagnitude)})
          </span>
        </div>

        {singleColumn ? (
          // Vista de UNA cartera: grid responsive de celdas
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
            {years.map((year) => {
              const value = columns[0]!.values.get(year);
              if (value === undefined) {
                return (
                  <div
                    key={year}
                    className="rounded-md p-2 text-center bg-slate-50 border border-slate-100"
                  >
                    <div className="text-[10px] text-brand-tertiary">{year}</div>
                    <div className="text-xs text-slate-300 mt-0.5">—</div>
                  </div>
                );
              }
              const { bg, text } = getCellColor(value, maxMagnitude);
              return (
                <div
                  key={year}
                  className="rounded-md p-2 text-center border border-slate-100"
                  style={{ backgroundColor: bg, color: text }}
                  title={`${year}: ${formatReturn(value)}`}
                >
                  <div className="text-[10px] opacity-80">{year}</div>
                  <div className="text-sm font-bold mt-0.5">{formatReturn(value)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          // Vista de MÚLTIPLES carteras: tabla con años en filas, carteras en columnas
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm border-separate border-spacing-1">
              {/* colgroup garantiza que todas las columnas de datos tengan el
                  MISMO ancho independientemente del largo del nombre de la
                  cartera. La columna "Año" tiene un ancho fijo pequeño. */}
              <colgroup>
                <col style={{ width: "70px" }} />
                {columns.map((col) => (
                  <col key={col.label} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="text-left text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider px-2">
                    Año
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.label}
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 truncate ${
                        col.accentClass ?? "text-brand-navy"
                      }`}
                      title={col.label}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {years.map((year) => (
                  <tr key={year}>
                    <td className="font-mono text-xs text-brand-secondary px-2">{year}</td>
                    {columns.map((col) => {
                      const value = col.values.get(year);
                      if (value === undefined) {
                        return (
                          <td
                            key={col.label}
                            className="rounded-md p-2 text-center bg-slate-50 text-slate-300 text-xs"
                          >
                            —
                          </td>
                        );
                      }
                      const { bg, text } = getCellColor(value, maxMagnitude);
                      return (
                        <td
                          key={col.label}
                          className="rounded-md p-2 text-center text-sm font-semibold"
                          style={{ backgroundColor: bg, color: text }}
                          title={`${col.label} en ${year}: ${formatReturn(value)}`}
                        >
                          {formatReturn(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
