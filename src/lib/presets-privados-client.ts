// =============================================================================
// presets-privados-client.ts — carga en el navegador de las carteras privadas
// =============================================================================
//
// Las carteras de clientes no van en el bundle (ver portfolio-presets-privados.ts). El
// navegador las pide UNA vez a /api/presets/privados; el servidor solo las devuelve al
// código personal de Pablo. Nunca en modo campus (Ataraxia, Campus): ahí ni se piden.
// Al llegar, se registran en portfolio-presets.ts (getAllPresets / getPresetById las
// incluyen) y se avisa a las páginas para que se repinten.
// =============================================================================

import { useEffect, useState } from "react";
import type { PortfolioPreset } from "./types";
import { registrarPresetsPrivados } from "./portfolio-presets";
import { isCampusMode } from "./campus-client";

let promesa: Promise<PortfolioPreset[]> | null = null;

export function cargarPresetsPrivados(): Promise<PortfolioPreset[]> {
  if (typeof window === "undefined" || isCampusMode()) return Promise.resolve([]);
  if (!promesa) {
    promesa = fetch("/api/presets/privados", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { presets: [] }))
      .then((j: { presets?: unknown }) => {
        const lista = Array.isArray(j?.presets) ? (j.presets as PortfolioPreset[]) : [];
        registrarPresetsPrivados(lista);
        return lista;
      })
      .catch(() => []);
  }
  return promesa;
}

/** Hook: dispara la carga al montar y devuelve cuántas carteras privadas hay (0 hasta que llegan).
 *  Cambiar ese número repinta el componente, que vuelve a llamar a getAllPresets(). */
export function usePresetsPrivados(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    cargarPresetsPrivados().then((lista) => {
      if (vivo && lista.length) setN(lista.length);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return n;
}
