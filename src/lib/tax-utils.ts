// =============================================================================
// TAX UTILS — Cálculo de impuestos sobre plusvalías
// =============================================================================
//
// Módulo compartido entre el motor de backtest y los componentes UI para
// poder calcular "impuestos hipotéticos" en comparaciones (ej: si la
// cartera A no tributa por ser fondos pero la cartera B sí, calcular
// cuánto pagaría A al liquidar usando el régimen de B).
//
// =============================================================================

export type TaxMode = "none" | "flat" | "spain-irpf";

/**
 * Tramos del IRPF español sobre rendimientos del ahorro (vigente desde 2025:
 * el tramo > 300.000 € subió del 28% al 30%).
 * Aplicación progresiva sobre las plusvalías anuales acumuladas.
 */
export const SPAIN_IRPF_BRACKETS: ReadonlyArray<{ limit: number; rate: number }> = [
  { limit: 6000, rate: 0.19 },
  { limit: 50000, rate: 0.21 },
  { limit: 200000, rate: 0.23 },
  { limit: 300000, rate: 0.27 },
  { limit: Infinity, rate: 0.30 },
];

/** Calcula el impuesto total que tocaría pagar dada una plusvalía anual total. */
export function spanishIrpfTax(annualGain: number): number {
  if (annualGain <= 0) return 0;
  let tax = 0;
  let remaining = annualGain;
  let lastLimit = 0;
  for (const b of SPAIN_IRPF_BRACKETS) {
    const tranche = Math.min(remaining, b.limit - lastLimit);
    if (tranche <= 0) break;
    tax += tranche * b.rate;
    remaining -= tranche;
    lastLimit = b.limit;
    if (remaining <= 0) break;
  }
  return tax;
}

/**
 * Calcula el impuesto sobre una plusvalía concreta según el modo.
 *   - "none": 0
 *   - "flat": gain × flatRate
 *   - "spain-irpf": aplicando los tramos progresivos del IRPF
 */
export function computeTaxOnGain(
  gain: number,
  mode: TaxMode,
  flatRate: number = 0
): number {
  if (gain <= 0) return 0;
  if (mode === "none") return 0;
  if (mode === "flat") return gain * flatRate;
  return spanishIrpfTax(gain);
}

/** Etiqueta legible del modo fiscal */
export function taxModeLabel(mode: TaxMode | undefined, rate?: number): string {
  if (!mode || mode === "none") return "Sin impuestos";
  if (mode === "spain-irpf") return "IRPF tramos";
  if (mode === "flat") return `${((rate ?? 0) * 100).toFixed(0)}% fijo`;
  return "";
}
