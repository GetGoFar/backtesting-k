// =============================================================================
// FORMATTERS - Utilidades de formato para números y fechas
// =============================================================================
// Formato español: punto para miles, coma para decimales
// Ejemplo: 1.234.567,89 €

/**
 * Formatea un número como moneda EUR en formato español
 * @param value - Valor a formatear
 * @param decimals - Número de decimales (default: 0)
 */
export function formatEUR(value: number, decimals = 0): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Formatea un número genérico en formato español
 * @param value - Valor a formatear
 * @param decimals - Número de decimales (default: 2)
 */
export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Formatea un porcentaje con signo
 * @param value - Valor decimal (ej: 0.05 para 5%)
 * @param decimals - Número de decimales (default: 2)
 */
export function formatPct(value: number, decimals = 2): string {
  const pct = value * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${formatNumber(pct, decimals)}%`;
}

/**
 * Formatea un porcentaje sin signo
 * @param value - Valor decimal (ej: 0.05 para 5%)
 * @param decimals - Número de decimales (default: 1)
 */
export function formatPctNoSign(value: number, decimals = 1): string {
  const pct = value * 100;
  return `${formatNumber(pct, decimals)}%`;
}

/**
 * Formatea un ratio (Sharpe, Sortino, etc.)
 * @param value - Valor del ratio
 */
export function formatRatio(value: number): string {
  if (!isFinite(value)) return "N/A";
  return formatNumber(value, 2);
}

/**
 * Convierte fecha YYYY-MM o YYYY-MM-DD a formato legible en español
 * @param dateStr - Fecha en formato YYYY-MM o YYYY-MM-DD
 * @param full - Si mostrar mes completo (default: false)
 */
export function formatDateLabel(dateStr: string, full = false): string {
  const parts = dateStr.split("-");
  const year = parts[0];
  const month = parts[1];
  const day = parts[2]; // puede ser undefined si es YYYY-MM
  const monthIndex = parseInt(month || "1", 10) - 1;

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const shortMonthNames = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
  ];

  // Si tenemos día (YYYY-MM-DD), mostrarlo
  if (day) {
    const dayNum = parseInt(day, 10);
    if (full) {
      return `${dayNum} de ${monthNames[monthIndex]} ${year}`;
    }
    return `${dayNum} ${shortMonthNames[monthIndex]} ${year}`;
  }

  // Solo YYYY-MM
  if (full) {
    return `${monthNames[monthIndex]} ${year}`;
  }
  return `${shortMonthNames[monthIndex]} ${year}`;
}

/**
 * Formatea el eje Y para gráficos de moneda
 * @param value - Valor a formatear
 */
export function formatAxisEUR(value: number): string {
  if (value >= 1000000) {
    return `${formatNumber(value / 1000000, 1)}M €`;
  }
  if (value >= 1000) {
    return `${formatNumber(value / 1000, 0)}k €`;
  }
  return formatEUR(value, 0);
}

/**
 * Formatea el eje Y para gráficos de porcentaje
 * @param value - Valor decimal
 */
export function formatAxisPct(value: number): string {
  return `${formatNumber(value * 100, 0)}%`;
}
