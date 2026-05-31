"use client";

// =============================================================================
// PÁGINA MOMENTUM — Estrategia de relative strength (tactical asset allocation)
// =============================================================================
//
// Réplica del modelo "Relative Strength" de Portfoliovisualizer:
// - El usuario define un universo de tickers
// - Cada periodo se rankean por momentum (retorno acumulado en lookback)
// - Se mantiene el top-N
// - Filtros opcionales: MA, exclude previous month, weighting
//
// MODOS:
//   - "single": una sola estrategia (panel A únicamente)
//   - "ab":     comparativa A vs B (dos paneles lado a lado, dos llamadas API
//               en paralelo, cabecera con equity overlay + métricas)
//
// El layout tiene el sidebar a la izquierda (estilo página de backtest) con
// navegación rápida a las secciones de configuración y resultados.
// =============================================================================

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { AccessGate } from "@/components/AccessGate";
import { MomentumConfigPanel } from "@/components/MomentumConfigPanel";
import { MomentumResultsView } from "@/components/MomentumResultsView";
import { MomentumComparisonView } from "@/components/MomentumComparisonView";
import { MomentumSidebarNav } from "@/components/MomentumSidebarNav";
import { fetchWithSource } from "@/lib/data-source";
import type { MomentumConfig, MomentumResponse, MomentumAsset } from "@/lib/momentum-types";

// Universo por defecto: cartera "KX Sectorial" — 5 sectores SPDR clave
// (Tecnología, Salud, Consumo Básico, Utilities, Energía) + VNQ (REITs USA)
// + GLD (Oro) como activos defensivos / descorrelacionados.
const DEFAULT_ASSETS: MomentumAsset[] = [
  { ticker: "XLK", displayName: "Tecnología" },
  { ticker: "XLV", displayName: "Salud" },
  { ticker: "XLP", displayName: "Consumo Bás." },
  { ticker: "XLU", displayName: "Utilities" },
  { ticker: "XLE", displayName: "Energía" },
  { ticker: "VNQ", displayName: "Real Estate" },
  { ticker: "GLD", displayName: "Oro" },
];

function getDefaultConfig(overrides?: Partial<MomentumConfig>): MomentumConfig {
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
    rankingMethod: "momentum",
    volatilityPeriodMonths: 3,
    movingAverageMonths: 0,
    slippagePercent: 0,
    benchmarkTicker: "SPY",
    tradeExecution: "nextClose",
    ...overrides,
  };
}

type Mode = "single" | "ab";

export default function MomentumPage() {
  const [mode, setMode] = useState<Mode>("single");

  // Estrategia A — siempre activa (en modo single es la única)
  const [configA, setConfigA] = useState<MomentumConfig>(getDefaultConfig());
  const [nameA, setNameA] = useState("Estrategia A");
  const [resultsA, setResultsA] = useState<MomentumResponse | null>(null);

  // Estrategia B — se inicializa con una variante distinta del default
  // (excludePreviousMonth=false) para que la comparativa tenga sentido de
  // entrada. El usuario puede tunearla a su gusto.
  const [configB, setConfigB] = useState<MomentumConfig>(
    getDefaultConfig({ excludePreviousMonth: false })
  );
  const [nameB, setNameB] = useState("Estrategia B");
  const [resultsB, setResultsB] = useState<MomentumResponse | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (mode === "single") {
        const res = await fetchWithSource("/api/momentum", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(configA),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? "Error al ejecutar momentum");
          setResultsA(null);
        } else {
          setResultsA(data as MomentumResponse);
          setResultsB(null);
        }
      } else {
        // Modo AB: dos llamadas en paralelo
        const [resA, resB] = await Promise.all([
          fetchWithSource("/api/momentum", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(configA),
          }),
          fetchWithSource("/api/momentum", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(configB),
          }),
        ]);
        const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
        if (!resA.ok || !resB.ok) {
          const msgs: string[] = [];
          if (!resA.ok) msgs.push(`A: ${dataA.message ?? "error"}`);
          if (!resB.ok) msgs.push(`B: ${dataB.message ?? "error"}`);
          setError(msgs.join(" · "));
          setResultsA(resA.ok ? (dataA as MomentumResponse) : null);
          setResultsB(resB.ok ? (dataB as MomentumResponse) : null);
        } else {
          setResultsA(dataA as MomentumResponse);
          setResultsB(dataB as MomentumResponse);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setIsLoading(false);
    }
  }, [mode, configA, configB]);

  const hasResultsA = useMemo(
    () => !!resultsA && resultsA.equityCurve.length > 0,
    [resultsA]
  );
  const hasResultsB = useMemo(
    () => !!resultsB && resultsB.equityCurve.length > 0,
    [resultsB]
  );
  const hasAnyResults = hasResultsA || hasResultsB;
  const isComparison = mode === "ab" && hasResultsA && hasResultsB;

  // Botón "Ejecutar" deshabilitado si en modo ab alguna estrategia no tiene
  // activos suficientes.
  const canRun =
    configA.assets.length >= 2 &&
    (mode === "single" || configB.assets.length >= 2);

  return (
    <AccessGate>
      <div className="min-h-screen flex flex-col bg-slate-50">
        {/* Header */}
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
                <Link
                  href="/kray"
                  className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors text-brand-secondary hover:bg-white hover:text-brand-navy"
                >
                  K-Ray
                </Link>
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

        {/* Layout: sidebar + main */}
        <div className="flex flex-1 w-full">
          <MomentumSidebarNav
            hasResults={hasAnyResults}
            comparisonMode={mode === "ab"}
            nameA={nameA}
            nameB={nameB}
          />

          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-[1600px] mx-auto w-full">
            {/* Intro */}
            <div className="mb-10 text-center max-w-3xl mx-auto">
              <h2 className="text-4xl sm:text-5xl font-normal text-brand-navy mb-4 tracking-tight font-serif">
                Estrategia de Momentum
              </h2>
              <p className="text-base sm:text-lg text-brand-secondary leading-relaxed">
                Tactical asset allocation por <em>relative strength</em>: cada
                mes rotamos al activo (o activos) con mejor comportamiento
                reciente. Réplica del modelo de Portfoliovisualizer adaptada a
                tu universo.
              </p>
            </div>

            {/* Toggle modo single / comparación A vs B */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1 text-sm">
                <button
                  onClick={() => setMode("single")}
                  className={`px-4 py-1.5 rounded-md font-medium transition-colors ${
                    mode === "single"
                      ? "bg-white text-brand-navy shadow-sm"
                      : "text-brand-secondary hover:text-brand-navy"
                  }`}
                >
                  Una estrategia
                </button>
                <button
                  onClick={() => setMode("ab")}
                  className={`px-4 py-1.5 rounded-md font-medium transition-colors ${
                    mode === "ab"
                      ? "bg-white text-brand-navy shadow-sm"
                      : "text-brand-secondary hover:text-brand-navy"
                  }`}
                >
                  Comparar A vs B
                </button>
              </div>
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

            {/* Configuración de estrategias */}
            <section id="section-strategies" className="scroll-mt-24 mb-8 sm:mb-10">
              {mode === "single" ? (
                <MomentumConfigPanel
                  config={configA}
                  onChange={setConfigA}
                  onRun={handleRun}
                  isLoading={isLoading}
                />
              ) : (
                <>
                  <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                    <MomentumConfigPanel
                      config={configA}
                      onChange={setConfigA}
                      onRun={handleRun}
                      isLoading={isLoading}
                      side="a"
                      strategyName={nameA}
                      onStrategyNameChange={setNameA}
                    />
                    <MomentumConfigPanel
                      config={configB}
                      onChange={setConfigB}
                      onRun={handleRun}
                      isLoading={isLoading}
                      side="b"
                      strategyName={nameB}
                      onStrategyNameChange={setNameB}
                    />
                  </div>
                  {/* Botón unificado de ejecución */}
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={handleRun}
                      disabled={isLoading || !canRun}
                      className="px-8 py-3 bg-brand-coral text-white text-base font-semibold rounded-lg hover:bg-brand-coral/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                    >
                      {isLoading
                        ? "Ejecutando ambas estrategias..."
                        : "Ejecutar comparación"}
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Resultados */}
            {isComparison && resultsA && resultsB && (
              <section id="section-comparison" className="scroll-mt-24 mb-8">
                <MomentumComparisonView
                  resultsA={resultsA}
                  resultsB={resultsB}
                  nameA={nameA}
                  nameB={nameB}
                />
              </section>
            )}

            {/* Detalle de cada estrategia */}
            {mode === "ab" && hasResultsA && resultsA && (
              <section id="section-strategy-a" className="scroll-mt-24 mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 rounded-lg bg-brand-navy text-white font-bold text-sm flex items-center justify-center">
                    A
                  </span>
                  <h2 className="text-2xl font-semibold text-brand-navy font-serif">
                    {nameA}
                  </h2>
                </div>
                <MomentumResultsView results={resultsA} idSuffix="-a" />
              </section>
            )}
            {mode === "ab" && hasResultsB && resultsB && (
              <section id="section-strategy-b" className="scroll-mt-24 mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 rounded-lg bg-brand-coral text-white font-bold text-sm flex items-center justify-center">
                    B
                  </span>
                  <h2 className="text-2xl font-semibold text-brand-navy font-serif">
                    {nameB}
                  </h2>
                </div>
                <MomentumResultsView results={resultsB} idSuffix="-b" />
              </section>
            )}

            {/* Modo single: solo una vista de resultados */}
            {mode === "single" && hasResultsA && resultsA && (
              <div className="mt-10">
                <MomentumResultsView results={resultsA} />
              </div>
            )}
          </main>
        </div>

        {/* Footer disclaimer */}
        <footer className="border-t border-slate-200 bg-white py-6 mt-10">
          <div className="max-w-3xl mx-auto px-4 text-center text-xs text-brand-tertiary leading-relaxed">
            Esta herramienta tiene fines exclusivamente educativos. Las
            rentabilidades pasadas no garantizan resultados futuros. El Proyecto
            K no es una entidad de asesoramiento financiero regulada.
          </div>
        </footer>
      </div>
    </AccessGate>
  );
}
