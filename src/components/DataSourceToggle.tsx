"use client";

// =============================================================================
// DATA SOURCE TOGGLE — Selector EODHD / Yahoo en el header
// =============================================================================
// El valor se persiste en localStorage. El hook se subscribe al evento global
// para que si lo cambias en una pestaña/parte, las demás se actualicen.
// =============================================================================

import { useEffect, useState } from "react";
import { getDataSource, setDataSource, type DataSource } from "@/lib/data-source";
import { Tooltip } from "./Tooltip";

export function DataSourceToggle() {
  const [source, setSourceState] = useState<DataSource>("eodhd");

  useEffect(() => {
    setSourceState(getDataSource());
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<DataSource>;
      setSourceState(ce.detail);
    };
    window.addEventListener("epk-data-source-changed", onChange);
    return () => window.removeEventListener("epk-data-source-changed", onChange);
  }, []);

  function pick(next: DataSource) {
    setDataSource(next);
    setSourceState(next);
  }

  return (
    <div className="hidden sm:flex items-center gap-1.5">
      <Tooltip
        wide
        content="Fuente de precios usada por la app:\n• EODHD (de pago): precios oficiales con derechos de uso comercial. Default para esta app.\n• Yahoo Finance (gratis, no oficial): cobertura más amplia pero precios con pequeñas variaciones; útil si quieres comparar contra Portfoliovisualizer (que también usa Yahoo).\nAl cambiar, el cache se mantiene separado por fuente — vuelve a ejecutar el backtest o momentum para ver el efecto."
      >
        <span className="text-[10px] font-medium text-brand-tertiary uppercase tracking-wider cursor-help">
          Datos
        </span>
      </Tooltip>
      <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
        <button
          onClick={() => pick("eodhd")}
          className={`px-2 py-1 rounded-md font-medium transition-colors ${
            source === "eodhd"
              ? "bg-white text-brand-navy shadow-sm"
              : "text-slate-500 hover:text-brand-navy"
          }`}
          title="EODHD — precios oficiales de pago"
        >
          EODHD
        </button>
        <button
          onClick={() => pick("yahoo")}
          className={`px-2 py-1 rounded-md font-medium transition-colors ${
            source === "yahoo"
              ? "bg-white text-brand-navy shadow-sm"
              : "text-slate-500 hover:text-brand-navy"
          }`}
          title="Yahoo Finance — gratis, útil para comparar con Portfoliovisualizer"
        >
          Yahoo
        </button>
      </div>
    </div>
  );
}
