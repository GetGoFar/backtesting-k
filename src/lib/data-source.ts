"use client";

// =============================================================================
// CLIENT-SIDE DATA SOURCE — helpers para leer/escribir la fuente elegida
// =============================================================================
// El valor se guarda en localStorage para persistir entre sesiones. Las
// llamadas a fetch() leen este valor y lo envían como header X-Data-Source.
// El backend (request-context) lo recoge y lo propaga a getDailyPrices.
// =============================================================================

export type DataSource = "eodhd" | "yahoo";

const STORAGE_KEY = "epk-data-source";

/** Lee la fuente actual desde localStorage. Default: "eodhd". */
export function getDataSource(): DataSource {
  if (typeof window === "undefined") return "eodhd";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "yahoo" ? "yahoo" : "eodhd";
  } catch {
    return "eodhd";
  }
}

/** Escribe la fuente seleccionada y dispara un evento para que otros listeners se actualicen. */
export function setDataSource(source: DataSource): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, source);
    // Notificar a otros componentes que estén observando este valor
    window.dispatchEvent(new CustomEvent("epk-data-source-changed", { detail: source }));
  } catch {
    // localStorage no disponible — no-op
  }
}

/**
 * Wrapper de `fetch` que añade automáticamente el header `X-Data-Source`
 * con la fuente actualmente seleccionada. Mismo API que fetch nativo.
 */
export function fetchWithSource(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const source = getDataSource();
  const headers = new Headers(init.headers);
  headers.set("X-Data-Source", source);
  return fetch(input, { ...init, headers });
}
