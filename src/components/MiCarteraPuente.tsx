"use client";

// Puente entre Mi cartera y el Backtest. No pinta nada.
//
// Se monta SOLO en modo campus (page.tsx lo monta bajo `{campus && ...}`):
// useStore() arranca la sincronización de red del store, y el Backtest de Pablo
// fuera del campus no debe hacer ninguna petición de Mi cartera.
//
// Cuando el store está hidratado y el servidor consultado, convierte las
// posiciones a pesos (backtest-spec) y entrega un PortfolioPreset «Mi cartera»
// al padre; vuelve a hacerlo si cambia la firma de las posiciones. Solo lee
// del store: nunca escribe en Mi cartera.

import { useEffect, useRef } from "react";
import type { PortfolioPreset } from "@/lib/types";
import { useStore } from "@/lib/mi-cartera/store";
import { firmaBacktest, pedirSpecBacktest } from "@/lib/mi-cartera/backtest-spec";

export const MI_CARTERA_PRESET_ID = "mi-cartera";

type Props = {
  /** `preset` null cuando no hay cartera (o nada con datos de precios). `excluidos`: nombres de lo que no entra. */
  onCartera: (preset: PortfolioPreset | null, excluidos: string[]) => void;
};

export function MiCarteraPuente({ onCartera }: Props) {
  const { datos, hidratado, servidorConsultado } = useStore();
  const posiciones = datos.cartera?.posiciones ?? [];
  const listo = hidratado && servidorConsultado;
  const firma = listo ? firmaBacktest(posiciones) : null;

  // Refs para que el efecto dependa solo de la firma (no de la identidad del callback ni del array).
  const onCarteraRef = useRef(onCartera);
  onCarteraRef.current = onCartera;
  const posicionesRef = useRef(posiciones);
  posicionesRef.current = posiciones;

  useEffect(() => {
    if (firma === null) return;
    if (firma === "") {
      onCarteraRef.current(null, []);
      return;
    }
    const ctrl = new AbortController();
    pedirSpecBacktest(posicionesRef.current, ctrl.signal)
      .then((spec) => {
        if (ctrl.signal.aborted) return;
        if (!spec || spec.holdings.length === 0) {
          onCarteraRef.current(null, []);
          return;
        }
        onCarteraRef.current(
          { id: MI_CARTERA_PRESET_ID, name: spec.name || "Mi cartera", description: "Tu cartera real, en pesos de hoy.", type: "index", holdings: spec.holdings },
          spec.excluidos.map((e) => e.nombre),
        );
      })
      .catch(() => {
        if (!ctrl.signal.aborted) onCarteraRef.current(null, []);
      });
    return () => ctrl.abort();
  }, [firma]);

  return null;
}
