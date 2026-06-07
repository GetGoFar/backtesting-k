// =============================================================================
// ANALYTICS — empuja eventos a dataLayer (GTM-T25FZ4G4) para GA4
// =============================================================================
//
// El simulador se embebe en un iframe dentro de elproyectok.com. Para que GA4
// vea el uso real (y no solo los ~5 s previos al clic en el iframe) cargamos el
// MISMO contenedor GTM dentro de la app (ver app/layout.tsx) y empujamos aquí
// los eventos de embudo. La sesión se mantiene con la medición cross-domain
// configurada en GA4 (elproyectok.com + backtesting-k.vercel.app).
//
// Taxonomía (alineada con la nota técnica de medición):
//   tool_iniciado    — el usuario empieza a usar la herramienta (1 vez)
//   tool_completado  — termina (resultado calculado)
//   lead_capturado   — deja su email en el informe
//   cta_click        — clic en CTA a Taller / Carteras K / Test de Perfil
// =============================================================================

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/** Identificador común de esta herramienta en todos los eventos. */
const TOOL_NAME = "simulador_jubilacion";

/** Empuja un evento al dataLayer con el `tool_name` ya incluido. */
export function track(
  event: string,
  params: Record<string, unknown> = {}
): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, tool_name: TOOL_NAME, ...params });
}

let started = false;
/** Dispara `tool_iniciado` una sola vez por carga de página. */
export function trackToolStart(params: Record<string, unknown> = {}): void {
  if (started) return;
  started = true;
  track("tool_iniciado", params);
}
