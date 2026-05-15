"use client";

// =============================================================================
// PÁGINA MOMENTUM — Estrategia de relative strength (tactical asset allocation)
// =============================================================================
//
// Réplica del modelo "Relative Strength" de Portfoliovisualizer:
// - El usuario define un universo de tickers
// - Cada periodo se rankean por momentum (retorno acumulado en lookback)
// - Se mantiene el top-K
// - Filtros opcionales: MA, exclude previous month, weighting
//
// El layout sigue el estilo del backtest existente: header sticky + main centrado.
// =============================================================================

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { AccessGate } from "@/components/AccessGate";
import { MomentumConfigPanel } from "@/components/MomentumConfigPanel";
import { MomentumResultsView } from "@/components/MomentumResultsView";
import type { MomentumConfig, MomentumResponse, MomentumAsset } from "@/lib/momentum-types";

// Universo por defecto: 10 sectores de SPDR + benchmark SPY como ejemplo clásico.
const DEFAULT_ASSETS: MomentumAsset[] = [
  { ticker: "XLK", displayName: "Tecnología" },
  { ticker: "XLV", displayName: "Salud" },
  { ticker: "XLF", displayName: "Financiero" },
  { ticker: "XLY", displayName: "Consumo Discr." },
  { ticker: "XLP", displayName: "Consumo Bás." },
  { ticker: "XLE", displayName: "Energía" },
  { ticker: "XLI", displayName: "Industrial" },
  { ticker: "XLB", displayName: "Materiales" },
  { ticker: "XLU", displayName: "Utilities" },
  { ticker: "XLRE", displayName: "Real Estate" },
];

function getDefaultConfig(): MomentumConfig {
  return {
    assets: DEFAULT_ASSETS,
    startDate: "2005-01-01",
    endDate: new Date().toISOString().substring(0, 10),
    initialAmount: 10_000,
    lookbackMonths: 12,
    excludePreviousMonth: true,
    assetsToHold: 1,
    weighting: "equal",
    frequency: "monthly",
    movingAverageMonths: 0,
    slippagePercent: 0,
    benchmarkTicker: "SPY",
  };
}

export default function MomentumPage() {
  const [config, setConfig] = useState<MomentumConfig>(getDefaultConfig());
  const [results, setResults] = useState<MomentumResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/momentum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Error al ejecutar momentum");
        setResults(null);
      } else {
        setResults(data as MomentumResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const hasResults = useMemo(() => !!results && results.equityCurve.length > 0, [results]);

  return (
    <AccessGate>
      <div className="min-h-screen flex flex-col bg-slate-50">
        {/* Header — replica el del backtest con pestañas */}
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-brand-border">
          <div className="px-4 sm:px-6 py-3">
            <div className="flex items-center justify-between max-w-[1800px] mx-auto">
              <a
                href="https://elproyectok.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 group"
              >
                <div className="w-10 h-10 rounded-xl gradient-k flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                  <span className="text-2xl font-bold text-white">K</span>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-brand-navy group-hover:text-brand-coral transition-colors font-serif">
                    Backtesting Tool
                  </h1>
                  <p className="text-xs text-brand-tertiary hidden sm:block">El Proyecto K</p>
                </div>
              </a>

              {/* Pestañas */}
              <nav className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <Link
                  href="/"
                  className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors text-brand-secondary hover:bg-white hover:text-brand-navy"
                >
                  Backtest
                </Link>
                <span className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md bg-white text-brand-navy shadow-sm">
                  Momentum
                </span>
              </nav>

              <a
                href="https://elproyectok.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-brand-secondary hover:text-brand-coral transition-colors hidden sm:flex items-center gap-1.5"
              >
                <span>elproyectok.com</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-[1600px] mx-auto w-full">
          {/* Intro */}
          <div className="mb-10 text-center max-w-3xl mx-auto">
            <h2 className="text-4xl sm:text-5xl font-normal text-brand-navy mb-4 tracking-tight font-serif">
              Estrategia de Momentum
            </h2>
            <p className="text-base sm:text-lg text-brand-secondary leading-relaxed">
              Tactical asset allocation por <em>relative strength</em>: cada mes
              rotamos al activo (o activos) con mejor comportamiento reciente.
              Réplica del modelo de Portfoliovisualizer adaptada a tu universo.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-medium">Error al ejecutar la estrategia</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 p-1">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}

          {/* Configuración */}
          <MomentumConfigPanel
            config={config}
            onChange={setConfig}
            onRun={handleRun}
            isLoading={isLoading}
          />

          {/* Resultados */}
          {hasResults && results && (
            <div className="mt-10">
              <MomentumResultsView results={results} />
            </div>
          )}
        </main>

        {/* Footer disclaimer */}
        <footer className="border-t border-slate-200 bg-white py-6 mt-10">
          <div className="max-w-3xl mx-auto px-4 text-center text-xs text-brand-tertiary leading-relaxed">
            Esta herramienta tiene fines exclusivamente educativos. Las rentabilidades pasadas
            no garantizan resultados futuros. El Proyecto K no es una entidad de asesoramiento
            financiero regulada.
          </div>
        </footer>
      </div>
    </AccessGate>
  );
}
