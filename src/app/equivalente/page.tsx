"use client";

// =============================================================================
// PÁGINA EQUIVALENTE — Encuentra el ETF indexado equivalente a tu fondo activo
// =============================================================================
//
// Feature estrella educativa: el usuario elige su fondo bancario y ve en un
// instante (a) el ETF indexado de bajo coste que lo sustituye y (b) cuánto
// dinero ha perdido en comisiones con él.
//
// DOS MODOS:
//   1. "Histórico real" (por defecto): usa NAVs históricos de ambos fondos y
//      muestra el ahorro REAL que se habría conseguido en el periodo común.
//      Las cifras son hechos, no proyecciones — esto es lo que ocurrió.
//
//   2. "Simulación TER": asume misma rentabilidad bruta en ambos y proyecta a
//      futuro descontando sólo el TER. Útil para escenarios largos (40 años)
//      donde no hay histórico, o para ver "lo mínimo que ahorrarías".
// =============================================================================

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { AccessGate } from "@/components/AccessGate";
import {
  findEquivalent,
  projectSavings,
  getActiveFundsByBank,
  searchActiveFunds,
  EXAMPLE_FUND_IDS,
  type EquivalenceResult,
  type SavingsResult,
} from "@/lib/equivalente-engine";
import { getFundById } from "@/lib/fund-database";
import type { Fund } from "@/lib/types";
import type { HistoricalComparison } from "@/lib/equivalente-historical";

// -----------------------------------------------------------------------------
// Formateadores
// -----------------------------------------------------------------------------

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const fmtEURSign = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(n);

const fmtPct = (n: number) => `${n.toFixed(2)}%`;
const fmtPctSign = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const fmtMonth = (m: string) => {
  // YYYY-MM → "mar 2014"
  const [year, month] = m.split("-").map(Number) as [number, number];
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
};

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

type Tab = "ejemplos" | "banco" | "search";
type Mode = "historical" | "simulation";

export default function EquivalentePage() {
  const [tab, setTab] = useState<Tab>("ejemplos");
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [mode, setMode] = useState<Mode>("historical");

  // Configuración de la simulación
  const [initialCapital, setInitialCapital] = useState(100_000);
  const [years, setYears] = useState(20);
  const [grossReturn, setGrossReturn] = useState(7);
  const [monthlyContribution, setMonthlyContribution] = useState(0);

  // Datos históricos (modo histórico real)
  const [historicalData, setHistoricalData] =
    useState<HistoricalComparison | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState<string | null>(null);

  // --- Datos para los pickers ---
  const fundsByBank = useMemo(() => getActiveFundsByBank(), []);
  const banks = useMemo(
    () => Array.from(fundsByBank.keys()).sort(),
    [fundsByBank]
  );
  useEffect(() => {
    if (tab === "banco" && !selectedBank && banks.length > 0) {
      const first = banks[0];
      if (first) setSelectedBank(first);
    }
  }, [tab, selectedBank, banks]);

  const searchResults = useMemo(
    () => (searchQuery.length >= 2 ? searchActiveFunds(searchQuery, 20) : []),
    [searchQuery]
  );

  const exampleFunds = useMemo(
    () => EXAMPLE_FUND_IDS.map((id) => getFundById(id)).filter(Boolean) as Fund[],
    []
  );

  // --- Resultado base (matching de equivalente) ---
  const selectedFund = selectedFundId ? getFundById(selectedFundId) : null;
  const equivalence: EquivalenceResult | null = useMemo(
    () => (selectedFund ? findEquivalent(selectedFund) : null),
    [selectedFund]
  );

  // --- Carga de datos históricos ---
  const fetchHistorical = useCallback(
    async (activeId: string, indexedId: string, capital: number) => {
      setHistoricalLoading(true);
      setHistoricalError(null);
      setHistoricalData(null);
      try {
        const res = await fetch("/api/equivalente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activeFundId: activeId,
            indexedFundId: indexedId,
            initialCapital: capital,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setHistoricalError(
            data.message ?? "No se pudo cargar el histórico de este fondo."
          );
        } else {
          setHistoricalData(data as HistoricalComparison);
        }
      } catch (err) {
        setHistoricalError(
          err instanceof Error ? err.message : "Error de red"
        );
      } finally {
        setHistoricalLoading(false);
      }
    },
    []
  );

  // Disparar carga histórica al cambiar fondo o capital (modo histórico)
  useEffect(() => {
    if (mode !== "historical") return;
    if (!equivalence) {
      setHistoricalData(null);
      setHistoricalError(null);
      return;
    }
    fetchHistorical(
      equivalence.activeFund.id,
      equivalence.recommended.id,
      initialCapital
    );
  }, [mode, equivalence, initialCapital, fetchHistorical]);

  // --- Simulación TER (modo simulación) ---
  const savings: SavingsResult | null = useMemo(() => {
    if (!equivalence || mode !== "simulation") return null;
    return projectSavings({
      initialCapital,
      monthlyContribution,
      years,
      grossAnnualReturn: grossReturn,
      activeTer: equivalence.activeFund.ter,
      indexedTer: equivalence.recommended.ter,
    });
  }, [
    equivalence,
    mode,
    initialCapital,
    monthlyContribution,
    years,
    grossReturn,
  ]);

  // --- Chart data ---
  const simulationChartData = useMemo(() => {
    if (!savings) return [];
    return [
      { year: 0, activo: initialCapital, indexado: initialCapital },
      ...savings.yearly.map((y) => ({
        year: y.year,
        activo: Math.round(y.activeValue),
        indexado: Math.round(y.indexedValue),
      })),
    ];
  }, [savings, initialCapital]);

  const historicalChartData = useMemo(() => {
    if (!historicalData) return [];
    return historicalData.timeSeries.map((p) => ({
      date: p.date,
      activo: Math.round(p.activeValue),
      indexado: Math.round(p.indexedValue),
    }));
  }, [historicalData]);

  return (
    <AccessGate>
      <div className="min-h-screen flex flex-col bg-slate-50">
        {/* ------------------------------------ Header ------------------------------------ */}
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
                  <p className="text-xs text-brand-tertiary hidden sm:block">
                    El Proyecto K
                  </p>
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
                <Link
                  href="/kray"
                  className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors text-brand-secondary hover:bg-white hover:text-brand-navy"
                >
                  K-Ray
                </Link>
                <span className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md bg-white text-brand-navy shadow-sm">
                  Equivalente
                </span>
              </nav>

              <a
                href="https://elproyectok.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-brand-secondary hover:text-brand-coral transition-colors hidden sm:flex items-center gap-1.5"
              >
                <span>elproyectok.com</span>
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </div>
        </header>

        {/* ------------------------------------ Main ------------------------------------ */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-[1400px] mx-auto w-full">
          {/* Hero */}
          <div className="mb-10 text-center max-w-3xl mx-auto">
            <h2 className="text-4xl sm:text-5xl font-normal text-brand-navy mb-4 tracking-tight font-serif">
              Equivalente indexado
            </h2>
            <p className="text-base sm:text-lg text-brand-secondary leading-relaxed">
              Elige tu fondo activo y te decimos el ETF indexado de bajo coste
              que mejor lo sustituye. Comparamos con{" "}
              <strong className="text-brand-navy">
                rentabilidad histórica real
              </strong>{" "}
              de los dos fondos — no con simulaciones — para que veas{" "}
              <strong className="text-brand-navy">
                cuánto ha costado realmente
              </strong>{" "}
              estar en gestión activa.
            </p>
          </div>

          {/* -------------------- Selector de fondo -------------------- */}
          <section className="mb-8 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="bg-brand-navy px-6 py-4">
              <h3 className="text-white font-semibold font-serif text-lg">
                1. Elige tu fondo activo
              </h3>
              <p className="text-xs text-white/70 mt-0.5">
                Si no encuentras el tuyo, prueba la búsqueda por ISIN o nombre
              </p>
            </div>

            <div className="p-6">
              {/* Tabs */}
              <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1 mb-5">
                {(
                  [
                    ["ejemplos", "⭐ Populares"],
                    ["banco", "🏦 Por banco"],
                    ["search", "🔍 Búsqueda"],
                  ] as Array<[Tab, string]>
                ).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      tab === t
                        ? "bg-white text-brand-navy shadow-sm"
                        : "text-brand-secondary hover:text-brand-navy"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "ejemplos" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {exampleFunds.map((f) => (
                    <FundCard
                      key={f.id}
                      fund={f}
                      selected={selectedFundId === f.id}
                      onClick={() => setSelectedFundId(f.id)}
                    />
                  ))}
                </div>
              )}

              {tab === "banco" && (
                <>
                  <div className="mb-4 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                      Entidad:
                    </span>
                    <select
                      value={selectedBank}
                      onChange={(e) => {
                        setSelectedBank(e.target.value);
                        setSelectedFundId(null);
                      }}
                      className="px-3 py-1.5 border border-slate-300 rounded-md text-sm bg-white text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/30"
                    >
                      {banks.map((b) => (
                        <option key={b} value={b}>
                          {b} ({fundsByBank.get(b)?.length ?? 0})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto">
                    {(fundsByBank.get(selectedBank) ?? []).map((f) => (
                      <FundCard
                        key={f.id}
                        fund={f}
                        selected={selectedFundId === f.id}
                        onClick={() => setSelectedFundId(f.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              {tab === "search" && (
                <>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Busca por nombre del fondo, banco o ISIN (ej: 'CaixaBank', 'BBVA Sostenible', 'ES0114768030')"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-brand-navy placeholder-brand-tertiary focus:outline-none focus:ring-2 focus:ring-brand-navy/30 mb-4"
                  />
                  {searchQuery.length < 2 ? (
                    <p className="text-sm text-brand-tertiary text-center py-6">
                      Escribe al menos 2 caracteres para buscar
                    </p>
                  ) : searchResults.length === 0 ? (
                    <p className="text-sm text-brand-tertiary text-center py-6">
                      Sin resultados para &ldquo;{searchQuery}&rdquo;.
                      <br />
                      ¿Tu fondo no está en nuestra base? Avísanos y lo añadimos.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {searchResults.map((f) => (
                        <FundCard
                          key={f.id}
                          fund={f}
                          selected={selectedFundId === f.id}
                          onClick={() => setSelectedFundId(f.id)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* -------------------- Selector de modo (sólo cuando hay fondo) -------------------- */}
          {equivalence && (
            <section className="mb-6 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                Vista:
              </span>
              <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                <button
                  onClick={() => setMode("historical")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    mode === "historical"
                      ? "bg-brand-navy text-white shadow-sm"
                      : "text-brand-secondary hover:text-brand-navy"
                  }`}
                >
                  📊 Histórico real
                </button>
                <button
                  onClick={() => setMode("simulation")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    mode === "simulation"
                      ? "bg-brand-navy text-white shadow-sm"
                      : "text-brand-secondary hover:text-brand-navy"
                  }`}
                >
                  🔮 Simulación TER
                </button>
              </div>
              <p className="text-xs text-brand-tertiary">
                {mode === "historical"
                  ? "Rentabilidad REAL de ambos fondos en el periodo disponible"
                  : "Proyección asumiendo misma rentabilidad bruta + descuento TER"}
              </p>
            </section>
          )}

          {/* ============================================================== */}
          {/* MODO HISTÓRICO REAL                                            */}
          {/* ============================================================== */}
          {equivalence && mode === "historical" && (
            <>
              {historicalLoading && (
                <section className="mb-8 bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
                  <div className="inline-flex items-center gap-3 text-brand-secondary">
                    <svg
                      className="animate-spin h-5 w-5 text-brand-navy"
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
                    Cargando NAVs históricos…
                  </div>
                </section>
              )}

              {historicalError && (
                <section className="mb-8 bg-red-50 border border-red-200 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-red-900 mb-1">
                        No se pudo cargar el histórico
                      </p>
                      <p className="text-sm text-red-900 leading-relaxed">
                        {historicalError}
                      </p>
                      <button
                        onClick={() => setMode("simulation")}
                        className="mt-3 text-sm font-semibold text-red-700 underline hover:text-red-900"
                      >
                        Ver la simulación TER en su lugar →
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {historicalData && (
                <>
                  {/* Banner del ahorro real */}
                  <section className="mb-8 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-blue-50 border-2 border-emerald-200 shadow-sm overflow-hidden">
                    <div className="px-6 sm:px-10 py-8 text-center">
                      <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700 mb-2">
                        Patrimonio extra que habrías tenido
                      </p>
                      <p className="text-5xl sm:text-6xl font-bold text-emerald-700 mb-3 font-serif">
                        {fmtEURSign(historicalData.realSavings)}
                      </p>
                      <p className="text-base sm:text-lg text-brand-secondary max-w-2xl mx-auto leading-relaxed">
                        Si hubieras invertido{" "}
                        <strong>{fmtEUR(initialCapital)}</strong> en{" "}
                        <strong>{fmtMonth(historicalData.startMonth)}</strong>{" "}
                        en el ETF indexado{" "}
                        <strong>{equivalence.recommended.shortName}</strong> en
                        vez de en{" "}
                        <strong>{equivalence.activeFund.shortName}</strong>,
                        hoy ({fmtMonth(historicalData.endMonth)}) tendrías
                        esto de más.
                      </p>
                      <div className="grid grid-cols-2 gap-6 mt-6 max-w-xl mx-auto pt-4 border-t border-emerald-200/60">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-brand-tertiary">
                            Rentabilidad anual real
                          </p>
                          <p className="text-lg font-bold text-red-700">
                            Activo:{" "}
                            {fmtPctSign(historicalData.activeCagr)}
                          </p>
                          <p className="text-lg font-bold text-blue-700">
                            Indexado:{" "}
                            {fmtPctSign(historicalData.indexedCagr)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider text-brand-tertiary">
                            Periodo cubierto
                          </p>
                          <p className="text-lg font-bold text-brand-navy">
                            {historicalData.years.toFixed(1)} años
                          </p>
                          <p className="text-xs text-brand-tertiary">
                            {fmtMonth(historicalData.startMonth)} →{" "}
                            {fmtMonth(historicalData.endMonth)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Configuración mínima — sólo capital */}
                  <section className="mb-8 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="bg-brand-navy px-6 py-4">
                      <h3 className="text-white font-semibold font-serif text-lg">
                        2. Capital inicial
                      </h3>
                      <p className="text-xs text-white/70 mt-0.5">
                        Cambia el importe para ver el ahorro real con tu cantidad
                      </p>
                    </div>
                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                      <ConfigField
                        label="Capital invertido"
                        suffix="€"
                        value={initialCapital}
                        onChange={setInitialCapital}
                        min={0}
                        step={1000}
                      />
                    </div>
                  </section>

                  {/* Comparativa side-by-side */}
                  <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <HistoricalCard
                      variant="active"
                      fund={equivalence.activeFund}
                      cagr={historicalData.activeCagr}
                      totalReturn={historicalData.activeTotalReturn}
                      finalValue={historicalData.finalActive}
                      initialCapital={initialCapital}
                    />
                    <HistoricalCard
                      variant="indexed"
                      fund={equivalence.recommended}
                      cagr={historicalData.indexedCagr}
                      totalReturn={historicalData.indexedTotalReturn}
                      finalValue={historicalData.finalIndexed}
                      initialCapital={initialCapital}
                    />
                  </section>

                  {/* Gráfico de evolución real */}
                  <section className="mb-8 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="bg-brand-navy px-6 py-4">
                      <h3 className="text-white font-semibold font-serif text-lg">
                        3. Evolución histórica real
                      </h3>
                      <p className="text-xs text-white/70 mt-0.5">
                        Curvas reales de NAV de ambos fondos, normalizadas al
                        mismo punto de partida
                      </p>
                    </div>
                    <div className="p-6">
                      <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={historicalChartData}
                            margin={{
                              top: 10,
                              right: 20,
                              bottom: 10,
                              left: 10,
                            }}
                          >
                            <CartesianGrid
                              stroke="#e2e8f0"
                              strokeDasharray="3 3"
                            />
                            <XAxis
                              dataKey="date"
                              tick={{ fill: "#475569", fontSize: 11 }}
                              tickFormatter={(d) => {
                                // Mostrar sólo el año cada cierto intervalo
                                const [y] = (d as string).split("-");
                                return y ?? d;
                              }}
                              minTickGap={40}
                            />
                            <YAxis
                              tick={{ fill: "#475569", fontSize: 12 }}
                              tickFormatter={(v) =>
                                new Intl.NumberFormat("es-ES", {
                                  notation: "compact",
                                  maximumFractionDigits: 1,
                                }).format(v) + "€"
                              }
                            />
                            <Tooltip
                              formatter={(value: number) => fmtEUR(value)}
                              labelFormatter={(d) => fmtMonth(d as string)}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="indexado"
                              stroke="#1d4ed8"
                              strokeWidth={3}
                              dot={false}
                              name={`Indexado · ${equivalence.recommended.shortName}`}
                            />
                            <Line
                              type="monotone"
                              dataKey="activo"
                              stroke="#e11d48"
                              strokeWidth={3}
                              dot={false}
                              name={`Activo · ${equivalence.activeFund.shortName}`}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </section>

                  {/* Periodo corto warning */}
                  {historicalData.years < 5 && (
                    <section className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5">
                      <div className="flex items-start gap-3">
                        <svg
                          className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9.25a.875.875 0 100-1.75.875.875 0 000 1.75z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold text-amber-900 mb-1">
                            Periodo corto
                          </p>
                          <p className="text-sm text-amber-900 leading-relaxed">
                            Sólo hay {historicalData.years.toFixed(1)} años de
                            datos comunes entre ambos fondos. La diferencia
                            puede no ser representativa a largo plazo —
                            considera también la vista de Simulación TER.
                          </p>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Nota si hay match aproximado */}
                  {equivalence.note && (
                    <section className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5">
                      <div className="flex items-start gap-3">
                        <svg
                          className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9.25a.875.875 0 100-1.75.875.875 0 000 1.75z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold text-amber-900 mb-1">
                            Match aproximado
                          </p>
                          <p className="text-sm text-amber-900 leading-relaxed">
                            {equivalence.note}
                          </p>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Supuestos histórico */}
                  <section className="mb-12 text-xs text-brand-tertiary bg-slate-50 border border-slate-200 rounded-xl p-5">
                    <p className="font-semibold text-brand-secondary mb-2">
                      ¿Cómo se calcula?
                    </p>
                    <ul className="space-y-1 list-disc pl-5">
                      <li>
                        NAVs mensuales reales de ambos fondos en el periodo
                        común disponible (
                        {fmtMonth(historicalData.startMonth)} →{" "}
                        {fmtMonth(historicalData.endMonth)}).
                      </li>
                      <li>
                        La rentabilidad ya tiene descontadas las comisiones del
                        fondo (TER) — son los datos que viste como cliente.
                      </li>
                      <li>
                        Cifras nominales. No incluye fiscalidad de plusvalías ni
                        comisiones de compra/venta del bróker.
                      </li>
                      <li>
                        Rentabilidad pasada no garantiza resultados futuros,
                        pero esta diferencia es lo que de hecho ocurrió.
                      </li>
                    </ul>
                  </section>
                </>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* MODO SIMULACIÓN TER                                            */}
          {/* ============================================================== */}
          {equivalence && mode === "simulation" && savings && (
            <>
              {/* Banner del ahorro */}
              <section className="mb-8 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-blue-50 border-2 border-emerald-200 shadow-sm overflow-hidden">
                <div className="px-6 sm:px-10 py-8 text-center">
                  <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700 mb-2">
                    Patrimonio extra proyectado al final del plazo
                  </p>
                  <p className="text-5xl sm:text-6xl font-bold text-emerald-700 mb-3 font-serif">
                    {fmtEURSign(savings.savings)}
                  </p>
                  <p className="text-base sm:text-lg text-brand-secondary max-w-2xl mx-auto leading-relaxed">
                    Eso es lo que tendrías de MÁS en{" "}
                    <strong>{years} años</strong> al cambiar de{" "}
                    <strong>{equivalence.activeFund.shortName}</strong> (
                    {fmtPct(equivalence.activeFund.ter)}) al ETF indexado{" "}
                    <strong>{equivalence.recommended.shortName}</strong> (
                    {fmtPct(equivalence.recommended.ter)}).
                  </p>
                  <p className="text-sm text-brand-tertiary mt-4">
                    Ahorro en comisiones acumuladas:{" "}
                    <strong className="text-brand-navy">
                      {fmtEUR(savings.feesAvoided)}
                    </strong>{" "}
                    · Reducción de la comisión:{" "}
                    <strong className="text-brand-navy">
                      −{equivalence.terSavingPercentage.toFixed(0)}%
                    </strong>
                  </p>
                </div>
              </section>

              {/* Configuración */}
              <section className="mb-8 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="bg-brand-navy px-6 py-4">
                  <h3 className="text-white font-semibold font-serif text-lg">
                    2. Ajusta la simulación
                  </h3>
                  <p className="text-xs text-white/70 mt-0.5">
                    Cambia capital, plazo o aportaciones para ver tu caso real
                  </p>
                </div>
                <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <ConfigField
                    label="Capital inicial"
                    suffix="€"
                    value={initialCapital}
                    onChange={setInitialCapital}
                    min={0}
                    step={1000}
                  />
                  <ConfigField
                    label="Aportación mensual"
                    suffix="€/mes"
                    value={monthlyContribution}
                    onChange={setMonthlyContribution}
                    min={0}
                    step={50}
                  />
                  <ConfigField
                    label="Plazo"
                    suffix="años"
                    value={years}
                    onChange={setYears}
                    min={1}
                    max={50}
                    step={1}
                  />
                  <ConfigField
                    label="Rentabilidad bruta anual"
                    suffix="%"
                    value={grossReturn}
                    onChange={setGrossReturn}
                    min={0}
                    max={20}
                    step={0.5}
                  />
                </div>
              </section>

              {/* Comparativa side-by-side */}
              <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ComparisonCard
                  variant="active"
                  fund={equivalence.activeFund}
                  totalFees={savings.totalFeesActive}
                  finalValue={savings.finalActive}
                  totalContributed={savings.totalContributed}
                />
                <ComparisonCard
                  variant="indexed"
                  fund={equivalence.recommended}
                  totalFees={savings.totalFeesIndexed}
                  finalValue={savings.finalIndexed}
                  totalContributed={savings.totalContributed}
                />
              </section>

              {/* Gráfico simulación */}
              <section className="mb-8 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="bg-brand-navy px-6 py-4">
                  <h3 className="text-white font-semibold font-serif text-lg">
                    3. Evolución del patrimonio
                  </h3>
                  <p className="text-xs text-white/70 mt-0.5">
                    Mismo retorno bruto en ambos; la diferencia es exclusivamente
                    el TER compuesto en el tiempo
                  </p>
                </div>
                <div className="p-6">
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={simulationChartData}
                        margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
                      >
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="year"
                          tick={{ fill: "#475569", fontSize: 12 }}
                          label={{
                            value: "Años",
                            position: "insideBottom",
                            offset: -5,
                            style: { fontSize: 12, fill: "#475569" },
                          }}
                        />
                        <YAxis
                          tick={{ fill: "#475569", fontSize: 12 }}
                          tickFormatter={(v) =>
                            new Intl.NumberFormat("es-ES", {
                              notation: "compact",
                              maximumFractionDigits: 1,
                            }).format(v) + "€"
                          }
                        />
                        <Tooltip
                          formatter={(value: number) => fmtEUR(value)}
                          labelFormatter={(year) => `Año ${year}`}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="indexado"
                          stroke="#1d4ed8"
                          strokeWidth={3}
                          dot={false}
                          name="Indexado"
                        />
                        <Line
                          type="monotone"
                          dataKey="activo"
                          stroke="#e11d48"
                          strokeWidth={3}
                          dot={false}
                          name="Activo"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              {/* Nota si hay match aproximado */}
              {equivalence.note && (
                <section className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9.25a.875.875 0 100-1.75.875.875 0 000 1.75z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-amber-900 mb-1">
                        Match aproximado
                      </p>
                      <p className="text-sm text-amber-900 leading-relaxed">
                        {equivalence.note}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Supuestos simulación */}
              <section className="mb-12 text-xs text-brand-tertiary bg-slate-50 border border-slate-200 rounded-xl p-5">
                <p className="font-semibold text-brand-secondary mb-2">
                  ¿Cómo se calcula?
                </p>
                <ul className="space-y-1 list-disc pl-5">
                  <li>
                    Misma rentabilidad bruta anual asumida en ambos fondos (
                    {fmtPct(grossReturn)}). La <em>única</em> diferencia
                    modelada es el TER.
                  </li>
                  <li>
                    Comisión descontada mensualmente como{" "}
                    <code className="bg-white px-1 rounded">TER ÷ 12</code>{" "}
                    sobre el valor del fondo (igual que el motor de
                    backtesting).
                  </li>
                  <li>
                    Cifras nominales, sin descuento de inflación ni impuestos.
                  </li>
                  <li>
                    En la realidad, los fondos activos suelen rendir{" "}
                    <em>también</em> peor en bruto que el índice — el ahorro
                    real suele ser mayor que el simulado. Cambia a la vista
                    Histórico real para ver los datos sin asunción.
                  </li>
                </ul>
              </section>
            </>
          )}
        </main>
      </div>
    </AccessGate>
  );
}

// -----------------------------------------------------------------------------
// Sub-componentes
// -----------------------------------------------------------------------------

function FundCard({
  fund,
  selected,
  onClick,
}: {
  fund: Fund;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-lg border-2 transition-all ${
        selected
          ? "border-brand-coral bg-brand-coral/5 shadow-md"
          : "border-slate-200 bg-white hover:border-brand-navy/30 hover:shadow-sm"
      }`}
    >
      <p
        className={`text-sm font-semibold mb-1 leading-snug ${
          selected ? "text-brand-coral" : "text-brand-navy"
        }`}
      >
        {fund.shortName}
      </p>
      <p className="text-xs text-brand-tertiary leading-tight line-clamp-2 mb-2">
        {fund.name}
      </p>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="px-2 py-0.5 bg-slate-100 text-brand-secondary rounded-full font-medium">
          {fund.category}
        </span>
        <span className="font-bold text-red-600">{fmtPct(fund.ter)}</span>
      </div>
      {fund.bank && (
        <p className="text-[10px] text-brand-tertiary mt-1.5 uppercase tracking-wider">
          {fund.bank}
        </p>
      )}
    </button>
  );
}

function ConfigField({
  label,
  suffix,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-brand-tertiary uppercase tracking-wider block mb-1.5">
        {label}
      </span>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          min={min}
          max={max}
          step={step}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/30 pr-12"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-tertiary font-medium">
          {suffix}
        </span>
      </div>
    </label>
  );
}

function ComparisonCard({
  variant,
  fund,
  totalFees,
  finalValue,
  totalContributed,
}: {
  variant: "active" | "indexed";
  fund: Fund;
  totalFees: number;
  finalValue: number;
  totalContributed: number;
}) {
  const isActive = variant === "active";
  const accent = isActive ? "red" : "blue";
  const accentBorder = isActive ? "border-red-300" : "border-blue-300";
  const accentBg = isActive ? "bg-red-50" : "bg-blue-50";
  const accentText = isActive ? "text-red-700" : "text-blue-700";
  const accentHeader = isActive ? "bg-red-600" : "bg-blue-600";
  const labelTxt = isActive ? "TU FONDO ACTIVO" : "EQUIVALENTE INDEXADO";

  return (
    <div
      className={`rounded-2xl border-2 ${accentBorder} bg-white overflow-hidden shadow-sm`}
    >
      <div className={`${accentHeader} px-5 py-3`}>
        <p className="text-xs font-bold uppercase tracking-widest text-white/80">
          {labelTxt}
        </p>
        <p className="text-white font-semibold text-base leading-snug mt-0.5">
          {fund.shortName}
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <p className="text-xs text-brand-tertiary leading-tight mb-1">
            {fund.name}
          </p>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span className="font-mono text-brand-secondary">
              ISIN: {fund.isin}
            </span>
            {fund.bank && (
              <span className="text-brand-secondary">· {fund.bank}</span>
            )}
            <span className={`font-bold ${accentText}`}>
              · TER {fmtPct(fund.ter)}
            </span>
          </div>
        </div>

        <div className={`${accentBg} rounded-lg p-4 space-y-3`}>
          <Stat
            label="Comisiones totales pagadas"
            value={fmtEUR(totalFees)}
            accent={accent}
          />
          <Stat label="Patrimonio final" value={fmtEUR(finalValue)} />
          <Stat
            label="Total aportado"
            value={fmtEUR(totalContributed)}
            muted
          />
        </div>
      </div>
    </div>
  );
}

function HistoricalCard({
  variant,
  fund,
  cagr,
  totalReturn,
  finalValue,
  initialCapital,
}: {
  variant: "active" | "indexed";
  fund: Fund;
  cagr: number;
  totalReturn: number;
  finalValue: number;
  initialCapital: number;
}) {
  const isActive = variant === "active";
  const accent = isActive ? "red" : "blue";
  const accentBorder = isActive ? "border-red-300" : "border-blue-300";
  const accentBg = isActive ? "bg-red-50" : "bg-blue-50";
  const accentText = isActive ? "text-red-700" : "text-blue-700";
  const accentHeader = isActive ? "bg-red-600" : "bg-blue-600";
  const labelTxt = isActive ? "TU FONDO ACTIVO" : "EQUIVALENTE INDEXADO";
  const profit = finalValue - initialCapital;

  return (
    <div
      className={`rounded-2xl border-2 ${accentBorder} bg-white overflow-hidden shadow-sm`}
    >
      <div className={`${accentHeader} px-5 py-3`}>
        <p className="text-xs font-bold uppercase tracking-widest text-white/80">
          {labelTxt}
        </p>
        <p className="text-white font-semibold text-base leading-snug mt-0.5">
          {fund.shortName}
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <p className="text-xs text-brand-tertiary leading-tight mb-1">
            {fund.name}
          </p>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span className="font-mono text-brand-secondary">
              ISIN: {fund.isin}
            </span>
            {fund.bank && (
              <span className="text-brand-secondary">· {fund.bank}</span>
            )}
            <span className={`font-bold ${accentText}`}>
              · TER {fmtPct(fund.ter)}
            </span>
          </div>
        </div>

        <div className={`${accentBg} rounded-lg p-4 space-y-3`}>
          <Stat
            label="Rentabilidad anual (CAGR)"
            value={fmtPctSign(cagr)}
            accent={accent}
          />
          <Stat
            label="Rentabilidad total"
            value={fmtPctSign(totalReturn)}
            accent={accent}
          />
          <Stat label="Patrimonio final" value={fmtEUR(finalValue)} />
          <Stat
            label="Ganancia neta"
            value={fmtEURSign(profit)}
            muted={profit < 0}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: "red" | "blue";
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={`text-xs ${
          muted ? "text-brand-tertiary" : "text-brand-secondary"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-base sm:text-lg font-bold ${
          accent === "red"
            ? "text-red-700"
            : accent === "blue"
            ? "text-blue-700"
            : muted
            ? "text-brand-tertiary"
            : "text-brand-navy"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
