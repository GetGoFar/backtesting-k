"use client";

// =============================================================================
// PÁGINA K-RAY — Radiografía de cartera (composición agregada)
// =============================================================================
//
// Auto-carga la última cartera ejecutada en /backtest desde localStorage,
// permite alternar entre A y B (si hay), y permite refrescar el análisis.
// =============================================================================

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { AccessGate } from "@/components/AccessGate";
import { KrayResultsView } from "@/components/KrayResultsView";
import { KraySidebarNav } from "@/components/KraySidebarNav";
import { fetchWithSource } from "@/lib/data-source";
import {
  getLastBacktestPortfolios,
  type SavedBacktestPortfolio,
} from "@/lib/last-backtest-portfolios";
import { getFundById } from "@/lib/fund-database";
import type { KrayResult } from "@/lib/kray-types";

export default function KrayPage() {
  // Cartera A/B del último backtest (cargadas de localStorage al montar).
  const [portfolioA, setPortfolioA] = useState<SavedBacktestPortfolio | null>(null);
  const [portfolioB, setPortfolioB] = useState<SavedBacktestPortfolio | null>(null);
  const [selectedSide, setSelectedSide] = useState<"a" | "b">("a");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Resultados del análisis
  const [results, setResults] = useState<KrayResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar carteras del backtest al montar y al cambiar (custom event)
  useEffect(() => {
    const load = () => {
      const data = getLastBacktestPortfolios();
      if (data) {
        setPortfolioA(data.portfolioA ?? null);
        setPortfolioB(data.portfolioB ?? null);
        setSavedAt(data.savedAt);
        // Si sólo hay B, seleccionarla por defecto
        if (!data.portfolioA && data.portfolioB) setSelectedSide("b");
      }
    };
    load();
    window.addEventListener("epk-last-backtest-portfolios-changed", load);
    return () => window.removeEventListener("epk-last-backtest-portfolios-changed", load);
  }, []);

  const currentPortfolio = selectedSide === "a" ? portfolioA : portfolioB;
  const hasResults = !!results;

  const handleRun = useCallback(async () => {
    if (!currentPortfolio) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithSource("/api/kray", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: currentPortfolio.name,
          // IMPORTANTE: incluir el snapshot `fund` para holdings dinámicos
          // (prefijo eodhd-) — sin él el motor no sabe el ISIN/ticker y no
          // puede llamar al fallback de FT.com para UCITS europeos.
          holdings: currentPortfolio.holdings.map((h) => ({
            fundId: h.fundId,
            weight: h.weight,
            ...(h.fund
              ? {
                  fund: {
                    name: h.fund.name,
                    shortName: h.fund.shortName,
                    isin: h.fund.isin,
                    ticker: h.fund.ticker,
                  },
                }
              : {}),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Error al ejecutar K-Ray");
        setResults(null);
      } else {
        setResults(data as KrayResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setIsLoading(false);
    }
  }, [currentPortfolio]);

  // Reset results al cambiar de cartera (A → B)
  useEffect(() => {
    setResults(null);
    setError(null);
  }, [selectedSide]);

  const formattedSaveDate = useMemo(() => {
    if (!savedAt) return null;
    try {
      return new Date(savedAt).toLocaleString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }, [savedAt]);

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
                <Link
                  href="/momentum"
                  className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors text-brand-secondary hover:bg-white hover:text-brand-navy"
                >
                  Momentum
                </Link>
                <span className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md bg-white text-brand-navy shadow-sm">
                  K-Ray
                </span>
                <Link
                  href="/equivalente"
                  className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors text-brand-secondary hover:bg-white hover:text-brand-navy"
                >
                  Equivalente
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

        <div className="flex flex-1 w-full">
          <KraySidebarNav hasResults={hasResults} />

          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-[1600px] mx-auto w-full">
            {/* Intro */}
            <div className="mb-10 text-center max-w-3xl mx-auto">
              <h2 className="text-4xl sm:text-5xl font-normal text-brand-navy mb-4 tracking-tight font-serif">
                K-Ray
              </h2>
              <p className="text-base sm:text-lg text-brand-secondary leading-relaxed">
                Radiografía cualitativa de tu cartera: sectores, geografía, top
                10 posiciones y duplicidades entre fondos. Te dice qué hay{" "}
                <em>dentro</em> de cada fondo y cómo se combina con el resto —
                pone luz a la concentración real de tu patrimonio.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="font-medium">Error al ejecutar K-Ray</p>
                  <p className="text-sm mt-1">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 p-1">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}

            <section id="section-portfolio" className="scroll-mt-24 mb-8">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="bg-brand-navy px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-white font-semibold font-serif text-lg">
                      Cartera a analizar
                    </h3>
                    <p className="text-xs text-white/70 mt-0.5">
                      {portfolioA || portfolioB
                        ? formattedSaveDate
                          ? `Heredada de tu último backtest · ${formattedSaveDate}`
                          : "Heredada de tu último backtest"
                        : "Ejecuta primero un backtest para traer una cartera aquí"}
                    </p>
                  </div>
                  <button
                    onClick={handleRun}
                    disabled={isLoading || !currentPortfolio || currentPortfolio.holdings.length === 0}
                    className="px-5 py-2 bg-brand-coral text-white text-sm font-semibold rounded-lg hover:bg-brand-coral/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? "Analizando..." : "Ejecutar radiografía"}
                  </button>
                </div>

                <div className="p-6">
                  {!portfolioA && !portfolioB ? (
                    <div className="text-center py-10">
                      <p className="text-base text-brand-navy mb-3">
                        Aún no hay cartera para analizar
                      </p>
                      <p className="text-sm text-brand-tertiary mb-6 max-w-md mx-auto">
                        K-Ray necesita una cartera para radiografiar. Ve a la
                        pestaña <strong>Backtest</strong>, configura una cartera
                        y ejecútalo. Después vuelve aquí y el análisis se cargará
                        solo.
                      </p>
                      <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy/90 transition-colors"
                      >
                        Ir a Backtest →
                      </Link>
                    </div>
                  ) : (
                    <>
                      {/* Toggle A / B si hay ambas */}
                      {portfolioA && portfolioB && (
                        <div className="mb-5 flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                            Elegir cartera:
                          </span>
                          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                            <button
                              onClick={() => setSelectedSide("a")}
                              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                selectedSide === "a"
                                  ? "bg-white text-brand-navy shadow-sm"
                                  : "text-brand-secondary hover:text-brand-navy"
                              }`}
                            >
                              A: {portfolioA.name}
                            </button>
                            <button
                              onClick={() => setSelectedSide("b")}
                              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                selectedSide === "b"
                                  ? "bg-white text-brand-navy shadow-sm"
                                  : "text-brand-secondary hover:text-brand-navy"
                              }`}
                            >
                              B: {portfolioB.name}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Composición */}
                      {currentPortfolio ? (
                        <div>
                          <h4 className="text-sm font-semibold text-brand-navy mb-2">
                            {currentPortfolio.name}{" "}
                            <span className="text-xs font-normal text-brand-tertiary">
                              · {currentPortfolio.holdings.length} fondo{currentPortfolio.holdings.length === 1 ? "" : "s"}
                            </span>
                          </h4>
                          <div className="space-y-1 max-h-72 overflow-y-auto">
                            {currentPortfolio.holdings.map((h, idx) => {
                              const fund = getFundById(h.fundId);
                              const displayName =
                                fund?.shortName ?? fund?.name ?? h.fund?.shortName ?? h.fund?.name ?? h.fundId;
                              return (
                                <div
                                  key={`${h.fundId}-${idx}`}
                                  className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-50 text-sm"
                                >
                                  <span className="text-brand-navy truncate">
                                    {displayName}
                                  </span>
                                  <span className="font-mono font-semibold text-brand-secondary ml-3 flex-shrink-0">
                                    {h.weight.toFixed(1)}%
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-brand-tertiary italic">
                          Esta cartera no tiene fondos configurados.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* Resultados */}
            {hasResults && results && (
              <div className="mt-10">
                <KrayResultsView results={results} />
              </div>
            )}
          </main>
        </div>

        <footer className="border-t border-slate-200 bg-white py-6 mt-10">
          <div className="max-w-3xl mx-auto px-4 text-center text-xs text-brand-tertiary leading-relaxed">
            La composición se obtiene de los reportings oficiales (vía EODHD) y
            puede tener un desfase de hasta 30 días con la realidad. Esta
            herramienta tiene fines exclusivamente educativos. El Proyecto K no
            es una entidad de asesoramiento financiero regulada.
          </div>
        </footer>
      </div>
    </AccessGate>
  );
}
