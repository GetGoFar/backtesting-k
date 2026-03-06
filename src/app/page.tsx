"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { PortfolioBuilder } from "@/components/PortfolioBuilder";
import { MetricsTable } from "@/components/MetricsTable";
import { FeeImpactCard } from "@/components/FeeImpactCard";
import { AccessGate } from "@/components/AccessGate";
import type {
  BacktestResponse,
  RebalanceFrequency,
  PortfolioHolding,
  BacktestWarning,
} from "@/lib/types";

// Función para obtener el mes actual en formato YYYY-MM
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

// Función para obtener el mes anterior en formato YYYY-MM
function getPreviousMonth(): string {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

// Lazy loading de los gráficos - solo se cargan cuando hay resultados
const PerformanceChart = dynamic(
  () => import("@/components/PerformanceChart").then((mod) => mod.PerformanceChart),
  {
    loading: () => <ChartLoadingSkeleton height="h-80" />,
    ssr: false,
  }
);

const AnnualReturnsChart = dynamic(
  () => import("@/components/AnnualReturnsChart").then((mod) => mod.AnnualReturnsChart),
  {
    loading: () => <ChartLoadingSkeleton height="h-64" />,
    ssr: false,
  }
);

const DrawdownChart = dynamic(
  () => import("@/components/DrawdownChart").then((mod) => mod.DrawdownChart),
  {
    loading: () => <ChartLoadingSkeleton height="h-64" />,
    ssr: false,
  }
);

const RollingReturnsChart = dynamic(
  () => import("@/components/RollingReturnsChart").then((mod) => mod.RollingReturnsChart),
  {
    loading: () => <ChartLoadingSkeleton height="h-72" />,
    ssr: false,
  }
);

const CorrelationMatrix = dynamic(
  () => import("@/components/CorrelationMatrix").then((mod) => mod.CorrelationMatrix),
  {
    loading: () => <ChartLoadingSkeleton height="h-64" />,
    ssr: false,
  }
);

const AssetMetricsTable = dynamic(
  () => import("@/components/AssetMetricsTable").then((mod) => mod.AssetMetricsTable),
  {
    loading: () => <ChartLoadingSkeleton height="h-64" />,
    ssr: false,
  }
);

// Skeleton de carga para gráficos
function ChartLoadingSkeleton({ height }: { height: string }) {
  return (
    <div className={`bg-white rounded-lg border border-brand-border p-6 ${height} flex items-center justify-center`}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand-coral/30 border-t-brand-coral rounded-full animate-spin" />
        <span className="text-sm text-brand-tertiary">Cargando gráfico...</span>
      </div>
    </div>
  );
}

// Formateador de fecha para mostrar (YYYY-MM -> "Enero 2024")
function formatDateForDisplay(dateStr: string): string {
  const [year, month] = dateStr.split("-");
  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const monthIndex = parseInt(month || "1", 10) - 1;
  return `${monthNames[monthIndex]} ${year}`;
}

// Estado de cada cartera desde PortfolioBuilder
interface PortfolioState {
  name: string;
  holdings: PortfolioHolding[];
  isValid: boolean;
}

export default function Home() {
  // Referencias para scroll
  const resultsRef = useRef<HTMLDivElement>(null);

  // Estado de las carteras (recibido desde PortfolioBuilder)
  const [portfolioA, setPortfolioA] = useState<PortfolioState>({
    name: "Cartera 1",
    holdings: [],
    isValid: false,
  });
  const [portfolioB, setPortfolioB] = useState<PortfolioState>({
    name: "Cartera 2",
    holdings: [],
    isValid: false,
  });

  // Estado de configuración - usar fechas dinámicas
  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const previousMonth = useMemo(() => getPreviousMonth(), []);
  const [startDate, setStartDate] = useState("2015-01");
  const [endDate, setEndDate] = useState(currentMonth);
  const [initialInvestment, setInitialInvestment] = useState(10000);
  const [monthlyContribution, setMonthlyContribution] = useState(0);
  const [rebalanceFrequency, setRebalanceFrequency] =
    useState<RebalanceFrequency>("annual");
  const [useCommonDateRange, setUseCommonDateRange] = useState(true);

  // Estado de resultados y UI
  const [results, setResults] = useState<BacktestResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Callbacks para actualizar carteras
  const handlePortfolioAUpdate = useCallback((data: PortfolioState) => {
    setPortfolioA(data);
  }, []);

  const handlePortfolioBUpdate = useCallback((data: PortfolioState) => {
    setPortfolioB(data);
  }, []);

  // Validar que las carteras están completas
  const hasHoldingsA = portfolioA.holdings.length > 0;
  const hasHoldingsB = portfolioB.holdings.length > 0;
  // Permitir ejecutar con al menos una cartera válida
  const canRunBacktest = portfolioA.isValid || portfolioB.isValid;

  // Mensaje de validación
  const getValidationMessage = (): string => {
    if (!hasHoldingsA && !hasHoldingsB) {
      return "Añade al menos un fondo a una cartera";
    }
    if ((hasHoldingsA && !portfolioA.isValid) && (hasHoldingsB && !portfolioB.isValid)) {
      return "Los pesos de las carteras deben sumar 100%";
    }
    if (hasHoldingsA && !portfolioA.isValid) {
      return "Los pesos de la Cartera 1 deben sumar 100%";
    }
    if (hasHoldingsB && !portfolioB.isValid) {
      return "Los pesos de la Cartera 2 deben sumar 100%";
    }
    return "";
  };

  // Ejecutar backtest
  const handleRunBacktest = async () => {
    if (!portfolioA.isValid && !portfolioB.isValid) {
      setError("Al menos una cartera debe tener fondos con pesos que sumen 100%");
      return;
    }

    setIsLoading(true);
    setError(null);
    setShowResults(false);

    try {
      const payload: Record<string, unknown> = {
        startDate: startDate + "-01",
        endDate: endDate + "-01",
        initialAmount: initialInvestment,
        monthlyContribution,
        rebalanceFrequency,
        useCommonDateRange,
      };

      if (portfolioA.isValid) {
        payload.portfolioA = {
          name: portfolioA.name,
          holdings: portfolioA.holdings,
        };
      }

      if (portfolioB.isValid) {
        payload.portfolioB = {
          name: portfolioB.name,
          holdings: portfolioB.holdings,
        };
      }

      const response = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al ejecutar el backtest");
      }

      setResults(data);

      setTimeout(() => {
        setShowResults(true);
      }, 50);

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AccessGate>
    <div className="min-h-screen flex flex-col">
      {/* Header — estilo elproyectok.com */}
      <header className="sticky top-0 z-50 bg-white border-b border-brand-border shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-3 max-w-[1320px]">
          <div className="flex items-center justify-between">
            <a href="https://elproyectok.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
              {/* Logo K con gradiente púrpura-cian del sitio web */}
              <div className="w-10 h-10 rounded-lg gradient-k flex items-center justify-center shadow-md">
                <span className="text-2xl font-bold text-white">K</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-brand-navy group-hover:text-brand-coral transition-colors">
                  Backtesting Tool
                </h1>
                <p className="text-xs text-brand-tertiary hidden sm:block">El Proyecto K</p>
              </div>
            </a>
            <a
              href="https://elproyectok.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-secondary hover:text-brand-coral transition-colors hidden sm:flex items-center gap-1.5"
            >
              <span>elproyectok.com</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 sm:px-6 py-6 sm:py-10 max-w-[1320px]">
        {/* Intro */}
        <div className="mb-8 sm:mb-10 text-center max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-[42px] md:leading-tight font-bold text-brand-navy mb-3 sm:mb-4">
            Compara carteras de inversión
          </h2>
          <p className="text-sm sm:text-base text-brand-secondary">
            Analiza el rendimiento histórico de carteras indexadas frente a
            fondos de gestión activa bancaria. Descubre el impacto real de las
            comisiones en tu patrimonio.
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-3">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="font-medium">Error al ejecutar el backtest</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 p-1"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Sección de Configuración de Carteras */}
        <section className="mb-8 sm:mb-10">
          <h3 className="text-sm font-semibold text-brand-tertiary uppercase tracking-wider mb-4">
            1. Configura tus carteras
          </h3>
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <PortfolioBuilder side="a" onUpdate={handlePortfolioAUpdate} />
            <PortfolioBuilder side="b" onUpdate={handlePortfolioBUpdate} />
          </div>
        </section>

        {/* Sección de Parámetros */}
        <section className="mb-8 sm:mb-10">
          <h3 className="text-sm font-semibold text-brand-tertiary uppercase tracking-wider mb-4">
            2. Parámetros del backtest
          </h3>
          <div className="bg-white rounded-lg border border-brand-border p-4 sm:p-6">
            <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4">
              {/* Fecha inicio */}
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1.5 sm:mb-2">
                  Fecha inicio
                </label>
                <input
                  type="month"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min="2010-01"
                  max={previousMonth}
                  className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral transition-colors"
                />
              </div>

              {/* Fecha fin */}
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1.5 sm:mb-2">
                  Fecha fin
                </label>
                <input
                  type="month"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min="2010-02"
                  max={currentMonth}
                  className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral transition-colors"
                />
              </div>

              {/* Inversión inicial */}
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1.5 sm:mb-2">
                  Inversión inicial
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={initialInvestment}
                    onChange={(e) =>
                      setInitialInvestment(Number(e.target.value))
                    }
                    min={100}
                    max={10000000}
                    step={100}
                    className="w-full px-3 py-2 pr-12 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-tertiary text-xs sm:text-sm">
                    EUR
                  </span>
                </div>
              </div>

              {/* Aportación mensual */}
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1.5 sm:mb-2">
                  Aportación mensual
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={monthlyContribution}
                    onChange={(e) =>
                      setMonthlyContribution(Number(e.target.value))
                    }
                    min={0}
                    max={100000}
                    step={50}
                    className="w-full px-3 py-2 pr-12 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-tertiary text-xs sm:text-sm">
                    EUR
                  </span>
                </div>
              </div>
            </div>

            {/* Rebalanceo */}
            <div className="mt-4 sm:mt-6">
              <label className="block text-sm font-medium text-brand-navy mb-2 sm:mb-3">
                Frecuencia de rebalanceo
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "none", label: "Sin rebalanceo" },
                  { value: "annual", label: "Anual" },
                  { value: "quarterly", label: "Trimestral" },
                  { value: "monthly", label: "Mensual" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      setRebalanceFrequency(option.value as RebalanceFrequency)
                    }
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
                      rebalanceFrequency === option.value
                        ? "bg-brand-coral text-white shadow-md"
                        : "bg-slate-100 text-brand-secondary hover:bg-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Opción de fecha común */}
            <div className="mt-4 sm:mt-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCommonDateRange}
                  onChange={(e) => setUseCommonDateRange(e.target.checked)}
                  className="w-4 h-4 text-brand-coral bg-slate-100 border-slate-300 rounded focus:ring-brand-coral focus:ring-2"
                />
                <span className="text-sm text-brand-secondary">
                  Usar rango de fechas común (donde ambas carteras tienen datos)
                </span>
              </label>
              {results?.effectiveDateRange && useCommonDateRange && (
                <p className="mt-2 text-xs text-brand-tertiary ml-7">
                  Rango efectivo: {formatDateForDisplay(results.effectiveDateRange.startDate)} - {formatDateForDisplay(results.effectiveDateRange.endDate)}
                </p>
              )}
            </div>

            {/* Botón Ejecutar — CTA coral estilo elproyectok.com */}
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <button
                onClick={handleRunBacktest}
                disabled={!canRunBacktest || isLoading}
                className={`btn-coral w-full sm:w-auto px-8 sm:px-10 py-3 text-sm sm:text-base font-medium flex items-center justify-center gap-2 ${
                  !canRunBacktest || isLoading
                    ? "!bg-slate-200 !text-slate-400 !cursor-not-allowed !shadow-none"
                    : ""
                }`}
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Ejecutando...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span>Ejecutar Backtest</span>
                  </>
                )}
              </button>

              {/* Validación de carteras */}
              {!canRunBacktest && (
                <p className="text-xs sm:text-sm text-brand-tertiary text-center sm:text-left">
                  {getValidationMessage()}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Sección de Resultados */}
        <section ref={resultsRef} className="mb-8 sm:mb-10">
          <h3 className="text-sm font-semibold text-brand-tertiary uppercase tracking-wider mb-4">
            3. Resultados
          </h3>

          {/* Placeholder si no hay resultados */}
          {!results && !isLoading && (
            <div className="bg-white rounded-lg border border-dashed border-brand-border p-8 sm:p-12 text-center">
              <svg
                className="w-12 sm:w-16 h-12 sm:h-16 mx-auto text-slate-300 mb-3 sm:mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <p className="text-brand-secondary text-base sm:text-lg font-medium">
                Los resultados aparecerán aquí
              </p>
              <p className="text-brand-tertiary text-xs sm:text-sm mt-1">
                Configura las carteras y ejecuta el backtest
              </p>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="bg-white rounded-lg border border-brand-border p-8 sm:p-12 text-center">
              <div className="inline-flex items-center justify-center w-14 sm:w-16 h-14 sm:h-16 rounded-full bg-red-50 mb-3 sm:mb-4">
                <svg
                  className="animate-spin h-7 sm:h-8 w-7 sm:w-8 text-brand-coral"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
              <p className="text-brand-navy text-base sm:text-lg font-medium">
                Ejecutando backtest...
              </p>
              <p className="text-brand-tertiary text-xs sm:text-sm mt-1">
                Calculando rentabilidades y métricas
              </p>
            </div>
          )}

          {/* Resultados con animación fade-in */}
          {results && !isLoading && (
            <div
              className={`space-y-4 sm:space-y-6 transition-all duration-500 ease-out ${
                showResults
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
            >
              {/* Avisos del backtest — coloreados por severidad */}
              {results.warnings && results.warnings.length > 0 && (() => {
                const errors = results.warnings!.filter((w: BacktestWarning) => w.severity === "error");
                const warns = results.warnings!.filter((w: BacktestWarning) => w.severity === "warning");
                const infos = results.warnings!.filter((w: BacktestWarning) => !w.severity || w.severity === "info");
                return (
                  <div className="space-y-2">
                    {/* Errores — rojo */}
                    {errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex gap-3">
                          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          <ul className="text-red-700 text-xs sm:text-sm space-y-1">
                            {errors.map((w: BacktestWarning, i: number) => (
                              <li key={i}>{w.message}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    {/* Warnings — ámbar */}
                    {warns.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex gap-3">
                          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <ul className="text-amber-700 text-xs sm:text-sm space-y-1">
                            {warns.map((w: BacktestWarning, i: number) => (
                              <li key={i}>{w.message}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    {/* Info — azul */}
                    {infos.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex gap-3">
                          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <div className="flex-1">
                            <p className="font-medium text-blue-800 text-sm mb-1">Información sobre los datos</p>
                            <ul className="text-blue-700 text-xs sm:text-sm space-y-1">
                              {infos.map((w: BacktestWarning, i: number) => (
                                <li key={i}>{w.message}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Rango de datos efectivo */}
              {results.effectiveDateRange && (
                <div className="flex items-center justify-between text-xs text-brand-tertiary px-1">
                  <span>
                    Periodo analizado: <strong className="text-brand-secondary">{formatDateForDisplay(results.effectiveDateRange.startDate)}</strong> — <strong className="text-brand-secondary">{formatDateForDisplay(results.effectiveDateRange.endDate)}</strong>
                  </span>
                  <span>
                    Último dato: {formatDateForDisplay(results.effectiveDateRange.endDate)}
                  </span>
                </div>
              )}

              {/* 1. Card destacado de comisiones */}
              <FeeImpactCard results={results} isLoading={false} />

              {/* 2. Gráfico principal de evolución */}
              <PerformanceChart results={results} isLoading={false} />

              {/* 3. Tabla de métricas */}
              <MetricsTable results={results} isLoading={false} />

              {/* 4. Métricas individuales de cada activo */}
              {results.assetMetrics && results.assetMetrics.length > 0 && (
                <AssetMetricsTable results={results} isLoading={false} />
              )}

              {/* 5. Matriz de correlaciones entre activos */}
              {results.correlationMatrix && results.correlationMatrix.fundIds.length >= 2 && (
                <CorrelationMatrix results={results} isLoading={false} />
              )}

              {/* 6. Gráficos secundarios en grid */}
              <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                <AnnualReturnsChart results={results} isLoading={false} />
                <DrawdownChart results={results} isLoading={false} />
              </div>

              {/* 7. Rolling returns */}
              <RollingReturnsChart results={results} isLoading={false} />

              {/* 8. Disclaimer */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <svg
                    className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="text-sm text-amber-800">
                    <p className="font-medium mb-1">Aviso legal</p>
                    <p className="text-amber-700 text-xs sm:text-sm">
                      Esta herramienta tiene fines exclusivamente educativos. Las
                      rentabilidades pasadas no garantizan resultados futuros. Los
                      datos de fondos bancarios pueden no reflejar valores
                      liquidativos exactos. Consulta siempre el folleto informativo
                      de cada fondo. El Proyecto K no es una entidad de
                      asesoramiento financiero regulada.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer — estilo elproyectok.com */}
      <footer className="border-t border-brand-border bg-white">
        <div className="container mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-[1320px]">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-brand-tertiary">
            <p>&copy; {new Date().getFullYear()} El Proyecto K</p>
            <div className="flex items-center gap-1">
              <span>Hecho con</span>
              <svg
                className="w-4 h-4 text-brand-coral"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                  clipRule="evenodd"
                />
              </svg>
              <span>para la comunidad inversora</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
    </AccessGate>
  );
}
