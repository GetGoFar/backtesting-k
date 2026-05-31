"use client";

// =============================================================================
// FETCH WRAPPER — Compatibilidad con código existente
// =============================================================================
//
// Antes existía un toggle EODHD vs Yahoo en la UI que enviaba el header
// X-Data-Source con la fuente elegida. El toggle se eliminó porque la
// dualidad confundía y daba errores cuando Yahoo no tenía un ticker.
//
// Ahora la única fuente de datos para precios es EODHD. Este módulo se
// mantiene como wrapper de `fetch` para no romper los call sites del
// resto del código, pero ya no envía el header — el backend siempre
// usa EODHD.
// =============================================================================

/** Wrapper compatible con el fetch nativo. Antes añadía X-Data-Source. */
export function fetchWithSource(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(input, init);
}
