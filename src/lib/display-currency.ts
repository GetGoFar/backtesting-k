// =============================================================================
// DIVISA DE VISUALIZACIÓN — helpers sin dependencias de servidor
// =============================================================================
//
// Compartidos por la UI (client) y por la API. La conversión real de precios
// vive en `fx-convert.ts` (servidor: usa el data-fetcher).
// =============================================================================

import type { DisplayCurrency } from "./types";

/** Divisas/unidades que se pueden elegir para ver los resultados. */
export const DISPLAY_CURRENCIES: DisplayCurrency[] = ["EUR", "USD", "GBP", "CHF", "JPY", "XAU", "native"];

/** Opciones del selector de la UI, con etiqueta corta. */
export const DISPLAY_CURRENCY_OPTIONS: Array<{ value: DisplayCurrency; label: string; title: string }> = [
  { value: "EUR", label: "EUR", title: "Todo convertido a euros con el tipo de cambio de cada día" },
  { value: "USD", label: "USD", title: "Todo convertido a dólares" },
  { value: "GBP", label: "GBP", title: "Todo convertido a libras (tipo de cambio desde 2000)" },
  { value: "CHF", label: "CHF", title: "Todo convertido a francos suizos" },
  { value: "JPY", label: "JPY", title: "Todo convertido a yenes" },
  { value: "XAU", label: "Oro (oz)", title: "Todo medido en onzas de oro: el oro como unidad de cuenta" },
  { value: "native", label: "Sin convertir", title: "Cada activo en su divisa de cotización, sin conversión (comportamiento histórico)" },
];

export function isDisplayCurrency(v: unknown): v is DisplayCurrency {
  return typeof v === "string" && (DISPLAY_CURRENCIES as string[]).includes(v);
}

/** Símbolo/unidad para etiquetar cifras. "native" conserva el € histórico. */
export function currencyUnitLabel(c: DisplayCurrency | undefined): string {
  switch (c) {
    case "USD": return "$";
    case "GBP": return "£";
    case "CHF": return "CHF";
    case "JPY": return "¥";
    case "XAU": return "oz";
    default: return "€";
  }
}

/** Nombre legible de la divisa objetivo. */
export function displayCurrencyName(c: DisplayCurrency | undefined): string {
  switch (c) {
    case "USD": return "dólares";
    case "GBP": return "libras";
    case "CHF": return "francos suizos";
    case "JPY": return "yenes";
    case "XAU": return "onzas de oro";
    case "native": return "la divisa nativa de cada activo (sin convertir)";
    default: return "euros";
  }
}
