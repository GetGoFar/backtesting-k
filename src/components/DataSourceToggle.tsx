"use client";

// =============================================================================
// DATA SOURCE TOGGLE — Selector EODHD / Yahoo OCULTO en un menú discreto
// =============================================================================
// El toggle vive detrás de un icono diminuto de engranaje en el header. Esto
// evita que se vea en demos / masterclasses donde no queremos llamar la
// atención hacia "fuentes de datos alternativas". El valor sigue persistiendo
// en localStorage y los cambios entre pestañas se propagan vía custom event.
// =============================================================================

import { useEffect, useState, useRef } from "react";
import { getDataSource, setDataSource, type DataSource } from "@/lib/data-source";

export function DataSourceToggle() {
  const [source, setSourceState] = useState<DataSource>("eodhd");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSourceState(getDataSource());
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<DataSource>;
      setSourceState(ce.detail);
    };
    window.addEventListener("epk-data-source-changed", onChange);
    return () => window.removeEventListener("epk-data-source-changed", onChange);
  }, []);

  // Cerrar el popover al hacer click fuera o al pulsar Escape
  useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  function pick(next: DataSource) {
    setDataSource(next);
    setSourceState(next);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="hidden sm:block relative">
      {/* Icono de engranaje muy discreto — invisible a primera vista */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-slate-500 transition-colors"
        aria-label="Ajustes avanzados"
        title="Ajustes"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Popover con el selector — sólo se muestra al abrir */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-3">
          <p className="text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider mb-2">
            Fuente de datos
          </p>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => pick("eodhd")}
              className={`flex-1 px-2 py-1 rounded-md font-medium transition-colors ${
                source === "eodhd"
                  ? "bg-white text-brand-navy shadow-sm"
                  : "text-slate-500 hover:text-brand-navy"
              }`}
            >
              EODHD
            </button>
            <button
              onClick={() => pick("yahoo")}
              className={`flex-1 px-2 py-1 rounded-md font-medium transition-colors ${
                source === "yahoo"
                  ? "bg-white text-brand-navy shadow-sm"
                  : "text-slate-500 hover:text-brand-navy"
              }`}
            >
              Yahoo
            </button>
          </div>
          <p className="text-[10px] text-brand-tertiary mt-2 leading-relaxed">
            EODHD = precios oficiales de pago. Yahoo = gratis, útil para comparar
            con Portfoliovisualizer. Al cambiar, vuelve a ejecutar el backtest.
          </p>
        </div>
      )}
    </div>
  );
}
