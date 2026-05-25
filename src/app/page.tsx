"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { PortfolioBuilder } from "@/components/PortfolioBuilder";
import { FundSearch } from "@/components/FundSearch";
import { MetricsTable, type ValueMode } from "@/components/MetricsTable";
import { FeeImpactCard } from "@/components/FeeImpactCard";
import { TaxImpactCard } from "@/components/TaxImpactCard";
import { ReportGeneratorModal } from "@/components/ReportGeneratorModal";
import { AccessGate } from "@/components/AccessGate";
import { SidebarNav } from "@/components/SidebarNav";
import { DataSourceToggle } from "@/components/DataSourceToggle";
import { AnnualReturnsHeatmap } from "@/components/AnnualReturnsHeatmap";
import { MonthlyReturnsHeatmap, type HeatmapSeries as MonthlySeries } from "@/components/MonthlyReturnsHeatmap";
import type {
  BacktestResponse,
  RebalanceFrequency,
  DisplayGranularity,
  PortfolioHolding,
  BacktestWarning,
  Fund,
} from "@/lib/types";
import { getAllBenchmarks } from "@/lib/benchmarks";
import { getFundById } from "@/lib/fund-database";
import { getAllPresets } from "@/lib/portfolio-presets";
import { fetchWithSource } from "@/lib/data-source";
import { MOMENTUM_FUND_PREFIX } from "@/lib/saved-momentum-strategies";

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

const TopDrawdownsTable = dynamic(
  () => import("@/components/TopDrawdownsTable").then((mod) => mod.TopDrawdownsTable),
  {
    loading: () => <ChartLoadingSkeleton height="h-64" />,
    ssr: false,
  }
);

const StressPeriodsTable = dynamic(
  () => import("@/components/StressPeriodsTable").then((mod) => mod.StressPeriodsTable),
  {
    loading: () => <ChartLoadingSkeleton height="h-64" />,
    ssr: false,
  }
);

const BenchmarkComparisonCard = dynamic(
  () => import("@/components/BenchmarkComparisonCard").then((mod) => mod.BenchmarkComparisonCard),
  {
    loading: () => <ChartLoadingSkeleton height="h-64" />,
    ssr: false,
  }
);

const RollingStatsTable = dynamic(
  () => import("@/components/RollingStatsTable").then((mod) => mod.RollingStatsTable),
  {
    loading: () => <ChartLoadingSkeleton height="h-64" />,
    ssr: false,
  }
);

const ReturnsHistogramChart = dynamic(
  () => import("@/components/ReturnsHistogramChart").then((mod) => mod.ReturnsHistogramChart),
  {
    loading: () => <ChartLoadingSkeleton height="h-64" />,
    ssr: false,
  }
);

const RebalanceLogTable = dynamic(
  () => import("@/components/RebalanceLogTable").then((mod) => mod.RebalanceLogTable),
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
  managementFee: number;
  taxMode: "none" | "flat" | "spain-irpf";
  taxRate: number; // decimal, ej: 0.21 (solo aplica en modo "flat")
  /** Frecuencia de rebalanceo de esta cartera */
  rebalanceFrequency: RebalanceFrequency;
  /** Banda relativa propia en % (UI), 0 = desactivada */
  rebalanceBandRelativePct: number;
  /** Banda absoluta propia en % (UI), 0 = desactivada */
  rebalanceBandAbsolutePct: number;
}

export default function Home() {
  // Referencias para scroll
  const resultsRef = useRef<HTMLDivElement>(null);

  // Estado de las carteras (recibido desde PortfolioBuilder)
  const [portfolioA, setPortfolioA] = useState<PortfolioState>({
    name: "Cartera 1",
    holdings: [],
    isValid: false,
    managementFee: 0,
    taxMode: "none",
    taxRate: 0.21,
    rebalanceFrequency: "annual",
    rebalanceBandRelativePct: 0,
    rebalanceBandAbsolutePct: 0,
  });
  const [portfolioB, setPortfolioB] = useState<PortfolioState>({
    name: "Cartera 2",
    holdings: [],
    isValid: false,
    managementFee: 0,
    taxMode: "none",
    taxRate: 0.21,
    rebalanceFrequency: "annual",
    rebalanceBandRelativePct: 0,
    rebalanceBandAbsolutePct: 0,
  });

  // Estado de configuración - usar fechas dinámicas
  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const previousMonth = useMemo(() => getPreviousMonth(), []);
  // Fecha de inicio por defecto: 1990-01. Cubre todo el histórico disponible
  // para la mayoría de activos (XAUUSD desde 1979, Vanguard funds desde 1992,
  // bancos españoles desde 1997). Si el backtest selecciona un activo con
  // menos histórico, el motor ajusta automáticamente al primer dato disponible.
  const [startDate, setStartDate] = useState("1990-01");
  const [endDate, setEndDate] = useState(currentMonth);
  const [initialInvestment, setInitialInvestment] = useState(10000);
  const [monthlyContribution, setMonthlyContribution] = useState(0);
  // Rebalanceo con aportaciones: dirige el dinero nuevo a activos rezagados.
  // Solo se activa si hay aportación mensual > 0.
  const [contributionRebalance, setContributionRebalance] = useState(false);
  const [displayGranularity, setDisplayGranularity] =
    useState<DisplayGranularity>("monthly");
  const [useCommonDateRange, setUseCommonDateRange] = useState(true);
  // Benchmark: puede ser un id predefinido ("bm:msci-world"), un preset
  // ("preset:k-inbestme-6"), o un fondo a medida vía buscador.
  const [benchmarkSelection, setBenchmarkSelection] = useState<string>("");
  // Fondo único añadido vía buscador como benchmark "a medida"
  const [customBenchmarkFund, setCustomBenchmarkFund] = useState<Fund | null>(null);

  // Estado de resultados y UI
  const [results, setResults] = useState<BacktestResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  // Modal del generador de informes PDF
  const [reportModalOpen, setReportModalOpen] = useState(false);
  // Modo de visualización del valor (bruto / camino / al liquidar) — controla
  // tanto las curvas del gráfico como las métricas hero. Por defecto "liquidar"
  // (la verdad del bolsillo).
  const [valueMode, setValueMode] = useState<ValueMode>("liquidar");

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

  // Detectar si alguna cartera contiene una estrategia momentum publicada.
  // Las estrategias momentum solo tienen datos a granularidad mensual, así que
  // forzamos el display a "monthly" cuando alguna está en juego y mostramos
  // un aviso en el selector.
  const hasMomentumStrategy = useMemo(() => {
    return (
      portfolioA.holdings.some((h) => h.fundId.startsWith(MOMENTUM_FUND_PREFIX)) ||
      portfolioB.holdings.some((h) => h.fundId.startsWith(MOMENTUM_FUND_PREFIX))
    );
  }, [portfolioA.holdings, portfolioB.holdings]);

  useEffect(() => {
    if (hasMomentumStrategy && displayGranularity !== "monthly") {
      setDisplayGranularity("monthly");
    }
  }, [hasMomentumStrategy, displayGranularity]);

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
        // Frecuencia "global" hardcodeada como anual: ya no se elige en la UI,
        // la frecuencia real viene de cada cartera. Este valor solo se usa
        // como fallback para el benchmark.
        rebalanceFrequency: "annual",
        displayGranularity,
        useCommonDateRange,
        contributionRebalance: monthlyContribution > 0 ? contributionRebalance : undefined,
      };

      // Resolver benchmark: 3 modos posibles.
      //   1) Fondo a medida (vía buscador) → tiene prioridad
      //   2) Preset existente → se envía como customBenchmark
      //   3) Índice predefinido → se envía como benchmarkId
      if (customBenchmarkFund) {
        payload.customBenchmark = {
          name: customBenchmarkFund.shortName || customBenchmarkFund.name,
          description: `Benchmark a medida: ${customBenchmarkFund.name}`,
          composition: [
            {
              fundId: customBenchmarkFund.id,
              weight: 100,
              fund: customBenchmarkFund.id.startsWith("yahoo-")
                ? customBenchmarkFund
                : undefined,
            },
          ],
        };
      } else if (benchmarkSelection.startsWith("bm:")) {
        payload.benchmarkId = benchmarkSelection.substring(3);
      } else if (benchmarkSelection.startsWith("preset:")) {
        const presetId = benchmarkSelection.substring(7);
        const preset = getAllPresets().find((p) => p.id === presetId);
        if (preset) {
          payload.customBenchmark = {
            name: preset.name,
            description: preset.description,
            composition: preset.holdings.map((h) => ({
              fundId: h.fundId,
              weight: h.weight,
              fund: h.fund,
            })),
          };
        }
      }

      if (portfolioA.isValid) {
        payload.portfolioA = {
          name: portfolioA.name,
          holdings: portfolioA.holdings,
          managementFee: portfolioA.managementFee || undefined,
          taxMode: portfolioA.taxMode !== "none" ? portfolioA.taxMode : undefined,
          taxRate: portfolioA.taxMode === "flat" && portfolioA.taxRate > 0 ? portfolioA.taxRate : undefined,
          // Rebalanceo por cartera — siempre se envía
          rebalanceFrequency: portfolioA.rebalanceFrequency,
          rebalanceBandRelative: portfolioA.rebalanceBandRelativePct > 0
            ? portfolioA.rebalanceBandRelativePct / 100 : undefined,
          rebalanceBandAbsolute: portfolioA.rebalanceBandAbsolutePct > 0
            ? portfolioA.rebalanceBandAbsolutePct / 100 : undefined,
        };
      }

      if (portfolioB.isValid) {
        payload.portfolioB = {
          name: portfolioB.name,
          holdings: portfolioB.holdings,
          managementFee: portfolioB.managementFee || undefined,
          taxMode: portfolioB.taxMode !== "none" ? portfolioB.taxMode : undefined,
          taxRate: portfolioB.taxMode === "flat" && portfolioB.taxRate > 0 ? portfolioB.taxRate : undefined,
          rebalanceFrequency: portfolioB.rebalanceFrequency,
          rebalanceBandRelative: portfolioB.rebalanceBandRelativePct > 0
            ? portfolioB.rebalanceBandRelativePct / 100 : undefined,
          rebalanceBandAbsolute: portfolioB.rebalanceBandAbsolutePct > 0
            ? portfolioB.rebalanceBandAbsolutePct / 100 : undefined,
        };
      }

      const response = await fetchWithSource("/api/backtest", {
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
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-brand-border">
        <div className="px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between max-w-[1800px] mx-auto">
            <a href="https://elproyectok.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group ml-14 lg:ml-0">
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

            {/* Pestañas Backtest / Momentum */}
            <nav className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <span className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md bg-white text-brand-navy shadow-sm">
                Backtest
              </span>
              <a
                href="/momentum"
                className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors text-brand-secondary hover:bg-white hover:text-brand-navy"
              >
                Momentum
              </a>
            </nav>

            {/* Selector de fuente de datos */}
            <DataSourceToggle />

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
        <SidebarNav hasResults={showResults && !!results} />

        {/* Main Content — max-width permite ver tablas anchas sin estirarse hasta los bordes en monitores grandes */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-[1600px] mx-auto w-full">
        {/* Intro — hero style */}
        <div className="mb-10 sm:mb-14 text-center max-w-3xl mx-auto">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-normal text-brand-navy mb-4 sm:mb-5 tracking-tight font-serif">
            Compara carteras de inversión
          </h2>
          <p className="text-base sm:text-lg text-brand-secondary leading-relaxed max-w-2xl mx-auto">
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
        <section id="section-carteras" className="scroll-mt-24 mb-8 sm:mb-10">
          <h3 className="text-sm font-semibold text-brand-tertiary uppercase tracking-wider mb-4">
            1. Configura tus carteras
          </h3>
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <PortfolioBuilder side="a" onUpdate={handlePortfolioAUpdate} />
            <PortfolioBuilder side="b" onUpdate={handlePortfolioBUpdate} />
          </div>
        </section>

        {/* Sección de Parámetros */}
        <section id="section-params" className="scroll-mt-24 mb-8 sm:mb-10">
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
                  min="1990-01"
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
                  min="1990-02"
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
                {/* Toggle: rebalanceo con aportaciones */}
                {monthlyContribution > 0 && (
                  <label className="mt-2 flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={contributionRebalance}
                      onChange={(e) => setContributionRebalance(e.target.checked)}
                      className="sr-only peer"
                    />
                    <span className="relative inline-block w-9 h-5 bg-slate-200 rounded-full peer-checked:bg-emerald-600 transition-colors flex-shrink-0 mt-0.5">
                      <span className="absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full border border-slate-300 transition-transform peer-checked:translate-x-4" />
                    </span>
                    <span className="text-xs text-brand-secondary leading-snug">
                      <span className="font-semibold text-brand-navy">
                        Rebalancear con las aportaciones
                      </span>
                      <span className="block text-brand-tertiary mt-0.5">
                        El dinero nuevo se dirige a los activos rezagados.
                        Sin ventas → cero impuestos en el camino.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Granularidad de datos */}
            <div className="mt-4 sm:mt-6">
              <label className="block text-sm font-medium text-brand-navy mb-2 sm:mb-3">
                Granularidad de datos
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  // "Diario" eliminado: el ruido del forward-fill multi-bolsa
                  // y los datos EUFUND de baja frecuencia en histórico temprano
                  // inflaban artificialmente la volatilidad diaria.
                  // Internamente seguimos usando datos diarios para gráficos
                  // y drawdowns, solo las métricas estadísticas usan mensual/trimestral.
                  { value: "monthly", label: "Mensual" },
                  { value: "quarterly", label: "Trimestral" },
                ].map((option) => {
                  // Si hay una estrategia momentum en alguna cartera, solo
                  // permitimos mensual (las estrategias trabajan a esa granularidad).
                  const isLockedByMomentum =
                    hasMomentumStrategy && option.value !== "monthly";
                  return (
                    <button
                      key={option.value}
                      onClick={() =>
                        !isLockedByMomentum &&
                        setDisplayGranularity(option.value as DisplayGranularity)
                      }
                      disabled={isLockedByMomentum}
                      title={
                        isLockedByMomentum
                          ? "Bloqueado: hay una estrategia momentum en la cartera y solo soporta granularidad mensual."
                          : undefined
                      }
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        displayGranularity === option.value
                          ? "bg-brand-coral text-white shadow-md"
                          : "bg-slate-100 text-brand-secondary hover:bg-slate-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {hasMomentumStrategy && (
                <p className="mt-2 text-xs text-violet-700/80 leading-tight">
                  ℹ️ Tu cartera incluye una estrategia momentum — granularidad forzada a mensual.
                </p>
              )}
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

            {/* Selector de benchmark */}
            <div className="mt-4 sm:mt-6">
              <label className="block text-sm font-medium text-brand-secondary mb-2">
                Benchmark de referencia (opcional)
              </label>
              <select
                value={benchmarkSelection}
                onChange={(e) => setBenchmarkSelection(e.target.value)}
                className="w-full sm:max-w-md px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral"
              >
                <option value="">Sin benchmark</option>
                <optgroup label="📊 Índices y benchmarks clásicos">
                  {getAllBenchmarks().map((b) => (
                    <option key={b.id} value={`bm:${b.id}`}>
                      {b.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="📁 Carteras preconfiguradas (como benchmark)">
                  {getAllPresets().map((p) => (
                    <option key={p.id} value={`preset:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <p className="mt-1.5 text-xs text-brand-tertiary">
                Si lo seleccionas, se calcularán alpha de Jensen, beta, tracking error, information ratio y capture ratios vs el benchmark.
                Puedes usar tanto índices clásicos como cualquier cartera preconfigurada (K Inbestme, K Sectorial USA, Indexa, banca, etc.).
              </p>

              {/* Buscador de fondo/ETF/acción a medida como benchmark.
                  Permite usar cualquier activo que no esté en la lista —
                  útil para comparar contra un ETF específico que tiene
                  el cliente, o contra una acción individual. */}
              <div className="mt-3 sm:max-w-md">
                <p className="text-xs font-semibold text-brand-secondary mb-1.5">
                  …o buscar un fondo/ETF/acción a medida:
                </p>
                {customBenchmarkFund ? (
                  <div className="flex items-center justify-between gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-emerald-800 truncate">
                        🎯 {customBenchmarkFund.shortName || customBenchmarkFund.name}
                      </p>
                      <p className="text-[11px] text-emerald-700/80 truncate">
                        {customBenchmarkFund.isin}
                        {customBenchmarkFund.yahooTicker && customBenchmarkFund.yahooTicker !== customBenchmarkFund.isin
                          && ` · ${customBenchmarkFund.yahooTicker}`}
                        {customBenchmarkFund.currency !== "EUR" && (
                          <span className="ml-1 px-1 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                            ⚠ {customBenchmarkFund.currency}
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomBenchmarkFund(null)}
                      className="text-xs text-emerald-700 hover:text-red-600 px-2 py-1 font-medium"
                      title="Quitar este benchmark a medida"
                    >
                      ✕ Quitar
                    </button>
                  </div>
                ) : (
                  <FundSearch
                    onSelect={(fund) => {
                      setCustomBenchmarkFund(fund);
                      // El selector predefinido pierde efecto cuando hay fondo a medida
                      setBenchmarkSelection("");
                    }}
                  />
                )}
                {customBenchmarkFund && (
                  <p className="mt-1.5 text-[11px] text-brand-tertiary italic">
                    El benchmark a medida tiene prioridad sobre el selector de arriba.
                  </p>
                )}
              </div>

              {/* Composición concreta del benchmark seleccionado */}
              {!customBenchmarkFund && benchmarkSelection && (() => {
                let name: string;
                let description: string | undefined;
                let composition: Array<{ fundId: string; weight: number }>;
                if (benchmarkSelection.startsWith("bm:")) {
                  const def = getAllBenchmarks().find((b) => `bm:${b.id}` === benchmarkSelection);
                  if (!def) return null;
                  name = def.name;
                  description = def.description;
                  composition = def.composition;
                } else if (benchmarkSelection.startsWith("preset:")) {
                  const preset = getAllPresets().find((p) => `preset:${p.id}` === benchmarkSelection);
                  if (!preset) return null;
                  name = preset.name;
                  description = preset.description;
                  composition = preset.holdings.map((h) => ({ fundId: h.fundId, weight: h.weight }));
                } else {
                  return null;
                }
                return (
                  <div className="mt-2 sm:max-w-md p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-xs text-brand-secondary">
                      <span className="font-semibold">Composición usada como benchmark ({name}):</span>{" "}
                      {composition.map((c, idx) => {
                        const f = getFundById(c.fundId);
                        return (
                          <span key={c.fundId}>
                            {idx > 0 && " + "}
                            {c.weight}% {f?.shortName ?? c.fundId}
                            {f?.isin && <span className="text-brand-tertiary"> ({f.isin})</span>}
                          </span>
                        );
                      })}
                    </p>
                    {description && (
                      <p className="mt-1 text-xs text-brand-tertiary italic">
                        {description}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-brand-tertiary">
                      Los precios incluyen el TER descontado del NAV, así que la comparación refleja el resultado real que obtendrías invirtiendo en este benchmark (no el índice teórico sin costes).
                    </p>
                  </div>
                );
              })()}
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

              {/* Acción: Generar informe PDF */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors shadow-sm"
                  title="Generar un informe PDF personalizable para compartir con el cliente"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generar informe PDF
                </button>
              </div>

              {/* 1. Card destacado de comisiones */}
              <div id="section-summary" className="scroll-mt-24">
                <FeeImpactCard results={results} isLoading={false} />
              </div>

              {/* 1b. Cómo afectan los impuestos (3 rentabilidades + barra apilada) */}
              <div id="section-tax-impact" className="scroll-mt-24">
                <TaxImpactCard results={results} isLoading={false} />
              </div>

              {/* 2. Gráfico principal de evolución */}
              <div id="section-performance" className="scroll-mt-24">
                <PerformanceChart results={results} isLoading={false} valueMode={valueMode} />
              </div>

              {/* Selector global de modo de valor — colocado encima de las hero
                  stats (donde se nota más el cambio numérico) y no encima del
                  gráfico (donde el escalado de las curvas pasa casi inadvertido). */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm">
                <div className="text-xs text-brand-tertiary leading-snug">
                  <span className="font-semibold text-brand-navy">Mostrar valor como:</span>{" "}
                  cambia la lente con la que ves las métricas y el gráfico.
                </div>
                <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1">
                  {([
                    { id: "bruto" as ValueMode, label: "Bruto", title: "Sin descontar ningún impuesto (la cifra del folleto)" },
                    { id: "camino" as ValueMode, label: "Neta del camino", title: "Descuenta solo los impuestos pagados en rebalanceos (lo que ves en tu broker)" },
                    { id: "liquidar" as ValueMode, label: "Al liquidar", title: "Descuenta también los pendientes — lo que de verdad te llevas al bolsillo (siempre que hayas configurado un régimen fiscal)" },
                  ]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setValueMode(opt.id)}
                      title={opt.title}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        valueMode === opt.id
                          ? "bg-white text-brand-navy shadow-sm"
                          : "text-brand-tertiary hover:text-brand-navy"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Tabla de métricas */}
              <div id="section-metrics" className="scroll-mt-24">
                <MetricsTable
                  results={results}
                  isLoading={false}
                  valueMode={valueMode}
                  onValueModeChange={setValueMode}
                />
              </div>

              {/* 4. Métricas individuales de cada activo */}
              {results.assetMetrics && results.assetMetrics.length > 0 && (
                <div id="section-assets" className="scroll-mt-24">
                  <AssetMetricsTable results={results} isLoading={false} />
                </div>
              )}

              {/* 5. Matriz de correlaciones entre activos */}
              {results.correlationMatrix && results.correlationMatrix.fundIds.length >= 2 && (
                <div id="section-correlations" className="scroll-mt-24">
                  <CorrelationMatrix
                    correlationMatrix={results.correlationMatrix}
                    warnings={results.warnings}
                    isLoading={false}
                    portfolioAFundIds={portfolioA.holdings.map(h => h.fundId)}
                    portfolioBFundIds={portfolioB.holdings.map(h => h.fundId)}
                    portfolioAHoldings={portfolioA.holdings}
                    portfolioBHoldings={portfolioB.holdings}
                    portfolioAName={portfolioA.name}
                    portfolioBName={portfolioB.name}
                  />
                </div>
              )}

              {/* 6. Gráficos secundarios en grid */}
              <div id="section-annual" className="scroll-mt-24 grid gap-4 sm:gap-6 lg:grid-cols-2">
                <AnnualReturnsChart results={results} isLoading={false} />
                <DrawdownChart results={results} isLoading={false} />
              </div>

              {/* 6a. Mapa de calor de rentabilidades anuales */}
              {(() => {
                const cols: { label: string; values: Map<number, number>; accentClass?: string }[] = [];
                if (results.resultA) {
                  cols.push({
                    label: results.resultA.portfolioName,
                    values: new Map(results.resultA.annualReturns.map((r) => [r.year, r.returnPct])),
                    accentClass: "text-blue-600",
                  });
                }
                if (results.resultB) {
                  cols.push({
                    label: results.resultB.portfolioName,
                    values: new Map(results.resultB.annualReturns.map((r) => [r.year, r.returnPct])),
                    accentClass: "text-rose-600",
                  });
                }
                if (cols.length === 0) return null;
                return (
                  <div className="scroll-mt-24">
                    <AnnualReturnsHeatmap
                      columns={cols}
                      title="Mapa de calor de rentabilidades anuales"
                      description="Cada celda colorea su rentabilidad anual respecto al máximo absoluto del rango. Los peores años se ven más rojos, los mejores más verdes — comparable año a año entre carteras."
                    />
                  </div>
                );
              })()}

              {/* 6a-bis. Mapa de calor MENSUAL (matriz año × mes, apilada por cartera) */}
              {(() => {
                const initialAmount = results.config?.initialAmount ?? 10000;
                const monthSeries: MonthlySeries[] = [];
                if (results.resultA) {
                  monthSeries.push({
                    label: results.resultA.portfolioName,
                    accentClass: "text-blue-600",
                    initialValue: initialAmount,
                    monthlyValues: results.resultA.timeSeries.map((p) => ({
                      monthKey: p.date,
                      value: p.value,
                    })),
                  });
                }
                if (results.resultB) {
                  monthSeries.push({
                    label: results.resultB.portfolioName,
                    accentClass: "text-rose-600",
                    initialValue: initialAmount,
                    monthlyValues: results.resultB.timeSeries.map((p) => ({
                      monthKey: p.date,
                      value: p.value,
                    })),
                  });
                }
                if (monthSeries.length === 0) return null;
                return (
                  <div id="section-monthly" className="scroll-mt-24">
                    <MonthlyReturnsHeatmap
                      series={monthSeries}
                      title="Mapa de calor mensual"
                      description="Matriz año × mes. Lee horizontal para ver cómo evolucionó cada año, vertical para detectar estacionalidad (¿septiembre suele ser malo?). La intensidad se calcula sobre el máximo absoluto MENSUAL — los meses muy extremos saltan a la vista. La columna 'Año' a la derecha repite el total anual."
                    />
                  </div>
                );
              })()}

              {/* 6b. Top 10 drawdowns por cartera */}
              <div id="section-drawdowns-top" className="scroll-mt-24">
                <TopDrawdownsTable results={results} isLoading={false} />
              </div>

              {/* 6c. Comportamiento en crisis históricas */}
              <div id="section-stress" className="scroll-mt-24">
                <StressPeriodsTable results={results} isLoading={false} />
              </div>

              {/* 6d. Comparación vs benchmark (si se seleccionó) */}
              <div id="section-benchmark" className="scroll-mt-24">
                <BenchmarkComparisonCard results={results} isLoading={false} />
              </div>

              {/* 6e. Mejores/peores ventanas rolling (estadísticos resumidos) */}
              <div id="section-rolling-stats" className="scroll-mt-24">
                <RollingStatsTable results={results} isLoading={false} />
              </div>

              {/* 7. Rolling returns */}
              <div id="section-rolling-chart" className="scroll-mt-24">
                <RollingReturnsChart results={results} isLoading={false} />
              </div>

              {/* 8. Historial detallado de rebalanceos (sells/buys/plusvalías/impuestos) */}
              <div id="section-rebalance-log" className="scroll-mt-24">
                <RebalanceLogTable results={results} isLoading={false} />
              </div>

              {/* 9. Histograma de distribución de retornos (movido al final por
                  ser técnico/estadístico — la mayoría de alumnos no lo necesitan
                  para entender los resultados principales). */}
              <div id="section-histogram" className="scroll-mt-24">
                <ReturnsHistogramChart results={results} isLoading={false} />
              </div>

              {/* 10. Disclaimer */}
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

          {/* Modal generador de informe PDF */}
          {results && (
            <ReportGeneratorModal
              open={reportModalOpen}
              onClose={() => setReportModalOpen(false)}
              results={results}
            />
          )}
        </section>
        </main>
      </div>

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
