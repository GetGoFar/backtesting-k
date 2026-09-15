// =============================================================================
// MARCAS DEL EJE Y EN ESCALA LOGARÍTMICA
// =============================================================================
//
// Recharts/d3 en escala log solo emiten múltiplos enteros de cada potencia de
// diez (1…9 × 10ⁿ). Cuando la serie ocupa menos de una década (p.ej. una
// cartera medida en onzas de oro entre 4.000 y 14.000 oz), por encima de
// 10.000 no aparece ninguna marca hasta 20.000, que queda fuera del dominio, y
// el eje parece "capado" en 10.000. Aquí se generan marcas "bonitas" con un
// paso adaptado a cuántas décadas abarca el dominio, de modo que siempre haya
// marcas repartidas hasta el máximo.
// =============================================================================

/**
 * Marcas para un eje logarítmico entre `min` y `max` (ambos > 0).
 * - Menos de ~1,2 décadas: 1, 1,5, 2, 3, 4, 5, 6, 8 × 10ⁿ
 * - Hasta ~2,5 décadas:    1, 2, 5 × 10ⁿ
 * - Más:                   1 × 10ⁿ
 */
export function logAxisTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > 0) || max <= min) return [];
  const decades = Math.log10(max) - Math.log10(min);
  const steps = decades > 2.5 ? [1] : decades > 1.2 ? [1, 2, 5] : [1, 1.5, 2, 3, 4, 5, 6, 8];
  const out: number[] = [];
  const eMin = Math.floor(Math.log10(min));
  const eMax = Math.ceil(Math.log10(max));
  for (let e = eMin; e <= eMax; e++) {
    for (const s of steps) {
      // Redondeo para evitar 0.30000000000000004 y similares
      const v = Number((s * Math.pow(10, e)).toPrecision(12));
      if (v >= min && v <= max) out.push(v);
    }
  }
  return out;
}
