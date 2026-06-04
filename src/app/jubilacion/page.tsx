"use client";

// =============================================================================
// JUBILACIÓN — Financial Goals al estilo Portfolio Visualizer
// =============================================================================
//
// Simulador de plan de jubilación con block bootstrap 12m + glide path A→B,
// IRPF español opcional, inflación. Reutiliza presets de cartera del backtest.
// =============================================================================

import { useState, useMemo } from "react";
import Link from "next/link";
import { AccessGate } from "@/components/AccessGate";
import { fetchWithSource } from "@/lib/data-source";
import { getAllPresets } from "@/lib/portfolio-presets";
import { getFundById } from "@/lib/fund-database";
import { formatEUR, formatPct, formatNumber } from "@/lib/formatters";
import type { Portfolio } from "@/lib/types";
import type {
  RetirementConfig,
  RetirementResult,
  RetirementTaxMode,
  FinancialGoal,
  GoalType,
  GoalStart,
  GoalDuration,
} from "@/lib/retirement-types";
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

function defaultConfig(): RetirementConfig {
  return {
    currentAge: 40,
    retirementAge: 65,
    endAge: 90,
    initialCapital: 50_000,
    // Legacy — el motor los ignora si hay `goals` no vacío
    monthlyContributionReal: 0,
    monthlyWithdrawalReal: 0,
    goals: [
      {
        id: "default-contribution",
        type: "contribution",
        amount: 500,
        start: "immediately",
        durationType: "untilRetirement",
        inflationAdjusted: true,
      },
      {
        id: "default-withdrawal",
        type: "fixedWithdrawal",
        amount: 2_000,
        start: "atRetirement",
        durationType: "untilEnd",
        inflationAdjusted: true,
      },
    ],
    portfolioAccumulation: { name: "Acumulación", holdings: [] },
    portfolioDistribution: { name: "Distribución", holdings: [] },
    glidePathYears: 5,
    inflationAnnualPct: 2.5,
    taxMode: "spain-irpf",
    numPaths: 1000,
    blockSizeMonths: 12,
  };
}

function newGoalId(): string {
  return `goal-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function buildPortfolioFromPresetId(
  presetId: string,
  name: string
): Portfolio | null {
  const preset = getAllPresets().find((p) => p.id === presetId);
  if (!preset) return null;
  // Para fondos custom (no en DB), enviamos también `fund` completo
  const holdings = preset.holdings.map((h) => {
    const fund = getFundById(h.fundId);
    return fund
      ? { fundId: h.fundId, weight: h.weight, fund }
      : { fundId: h.fundId, weight: h.weight };
  });
  return { name, holdings };
}

export default function JubilacionPage() {
  const [presetAccum, setPresetAccum] = useState<string>("");
  const [presetDist, setPresetDist] = useState<string>("");
  const [config, setConfig] = useState<RetirementConfig>(defaultConfig());
  const [results, setResults] = useState<RetirementResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presets = useMemo(() => getAllPresets(), []);

  const canRun = useMemo(() => {
    return presetAccum && presetDist && config.initialCapital >= 0;
  }, [presetAccum, presetDist, config.initialCapital]);

  const handleRun = async () => {
    setIsLoading(true);
    setError(null);
    setResults(null);

    const portA = buildPortfolioFromPresetId(presetAccum, "Acumulación");
    const portB = buildPortfolioFromPresetId(presetDist, "Distribución");
    if (!portA || !portB) {
      setError("Selecciona dos carteras válidas");
      setIsLoading(false);
      return;
    }

    const payload: RetirementConfig = {
      ...config,
      portfolioAccumulation: portA,
      portfolioDistribution: portB,
    };

    try {
      const res = await fetchWithSource("/api/retirement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Error al simular");
      } else {
        setResults(data as RetirementResult);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AccessGate>
      <div className="min-h-screen flex flex-col bg-slate-50">
        {/* Header — replica el de backtest y momentum */}
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
                <Link
                  href="/equivalente"
                  className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors text-brand-secondary hover:bg-white hover:text-brand-navy"
                >
                  Equivalente
                </Link>
                <span className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md bg-white text-brand-navy shadow-sm">
                  Jubilación
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

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-[1400px] mx-auto w-full">
          {/* Intro */}
          <div className="mb-10 text-center max-w-3xl mx-auto">
            <h2 className="text-4xl sm:text-5xl font-normal text-brand-navy mb-4 tracking-tight font-serif">
              Simulador de Jubilación
            </h2>
            <p className="text-base sm:text-lg text-brand-secondary leading-relaxed">
              ¿Te llega el capital? Block bootstrap con 1.000 trayectorias usando
              retornos históricos reales + glide path entre dos carteras +
              inflación + IRPF. Te dice la probabilidad de éxito, no una promesa.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-medium">Error en la simulación</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 p-1">×</button>
            </div>
          )}

          {/* Form */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-10">
            <div className="bg-brand-navy px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold font-serif text-lg">
                  Tu plan
                </h3>
                <p className="text-xs text-white/70 mt-0.5">
                  Inputs en € de hoy. La inflación los ajusta cada año.
                </p>
              </div>
              <button
                onClick={handleRun}
                disabled={!canRun || isLoading}
                className="px-5 py-2 bg-brand-coral text-white text-sm font-semibold rounded-lg hover:bg-brand-coral/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Simulando..." : "Simular"}
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Edades */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <NumberField label="Edad actual" value={config.currentAge} onChange={(v) => setConfig({ ...config, currentAge: v })} min={18} max={100} />
                <NumberField label="Edad de jubilación" value={config.retirementAge} onChange={(v) => setConfig({ ...config, retirementAge: v })} min={config.currentAge + 1} max={100} />
                <NumberField label="Edad fin del plan" value={config.endAge} onChange={(v) => setConfig({ ...config, endAge: v })} min={config.retirementAge + 1} max={110} />
              </div>

              {/* Capital inicial */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <NumberField label="Capital inicial (€)" value={config.initialCapital} onChange={(v) => setConfig({ ...config, initialCapital: v })} min={0} step={1000} />
              </div>

              {/* Objetivos financieros */}
              <FinancialGoalsEditor
                goals={config.goals ?? []}
                onChange={(goals) => setConfig({ ...config, goals })}
              />

              {/* Carteras */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField label="Cartera de acumulación" value={presetAccum} onChange={setPresetAccum} options={presets.map((p) => ({ value: p.id, label: p.name }))} placeholder="Selecciona cartera A..." />
                <SelectField label="Cartera de distribución (jubilación)" value={presetDist} onChange={setPresetDist} options={presets.map((p) => ({ value: p.id, label: p.name }))} placeholder="Selecciona cartera B..." />
              </div>
              <p className="text-xs text-brand-tertiary leading-tight">
                💡 Glide path: en los <strong>{config.glidePathYears} años</strong> previos
                a la jubilación, la cartera se desplaza linealmente de A a B. Si eliges
                la misma para ambas, no hay glide path.
              </p>

              {/* Macro */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <NumberField label="Inflación anual (%)" value={config.inflationAnnualPct} onChange={(v) => setConfig({ ...config, inflationAnnualPct: v })} min={-5} max={15} step={0.1} />
                <NumberField label="Glide path (años)" value={config.glidePathYears} onChange={(v) => setConfig({ ...config, glidePathYears: v })} min={0} max={20} />
                <SelectField
                  label="Modo fiscal"
                  value={config.taxMode}
                  onChange={(v) => setConfig({ ...config, taxMode: v as RetirementTaxMode })}
                  options={[
                    { value: "spain-irpf", label: "IRPF España (tramos)" },
                    { value: "flat", label: "Tasa fija" },
                    { value: "none", label: "Sin impuestos" },
                  ]}
                />
              </div>

              {config.taxMode === "flat" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <NumberField label="Tasa fija (%)" value={config.flatTaxRatePct ?? 21} onChange={(v) => setConfig({ ...config, flatTaxRatePct: v })} min={0} max={50} step={0.5} />
                </div>
              )}

              {/* Avanzado */}
              <details className="border-t border-slate-100 pt-4">
                <summary className="cursor-pointer text-xs font-semibold text-brand-tertiary uppercase tracking-wider">
                  Opciones avanzadas
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <NumberField label="Nº de trayectorias" value={config.numPaths} onChange={(v) => setConfig({ ...config, numPaths: v })} min={100} max={5000} step={100} tooltip="Más trayectorias = más precisión pero más tiempo. 1000 es estándar." />
                  <NumberField label="Tamaño bloque bootstrap (meses)" value={config.blockSizeMonths} onChange={(v) => setConfig({ ...config, blockSizeMonths: v })} min={1} max={60} tooltip="12 preserva la 'secuencia de retornos' anual." />
                </div>
              </details>
            </div>
          </section>

          {/* Resultados */}
          {results && <ResultsPanel results={results} />}
        </main>

        <footer className="border-t border-slate-200 bg-white py-6 mt-10">
          <div className="max-w-3xl mx-auto px-4 text-center text-xs text-brand-tertiary leading-relaxed">
            Esta herramienta tiene fines exclusivamente educativos. Las
            rentabilidades pasadas no garantizan resultados futuros. El simulador
            asume composición de cartera estable y rebalanceo mensual. El
            Proyecto K no es una entidad de asesoramiento financiero regulada.
          </div>
        </footer>
      </div>
    </AccessGate>
  );
}

// -----------------------------------------------------------------------------
// Inputs reutilizables
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Editor de objetivos financieros (Financial Goals, como en PV)
// -----------------------------------------------------------------------------

function FinancialGoalsEditor({
  goals,
  onChange,
}: {
  goals: FinancialGoal[];
  onChange: (g: FinancialGoal[]) => void;
}) {
  const update = (id: string, patch: Partial<FinancialGoal>) => {
    onChange(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };
  const remove = (id: string) => onChange(goals.filter((g) => g.id !== id));
  const add = () =>
    onChange([
      ...goals,
      {
        id: newGoalId(),
        type: "contribution",
        amount: 100,
        start: "immediately",
        durationType: "untilRetirement",
        inflationAdjusted: true,
      },
    ]);

  const hasNominal = goals.some((g) => !g.inflationAdjusted);

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h4 className="text-sm font-bold text-brand-navy">Objetivos financieros</h4>
          <p className="text-xs text-brand-tertiary mt-0.5">
            Aportaciones, retiradas fijas o porcentuales. Cada uno con su propio
            tramo temporal e ajuste por inflación.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="px-3 py-1.5 text-sm font-medium text-white bg-brand-coral rounded-lg hover:bg-brand-coral/90"
        >
          + Añadir objetivo
        </button>
      </div>

      {hasNominal && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 items-start text-xs leading-relaxed">
          <span className="text-amber-600 mt-0.5">⚠</span>
          <p className="text-amber-900">
            <strong>Algún objetivo está en términos NOMINALES</strong> (sin
            ajustar por inflación). Con 2-3% de inflación anual, su poder
            adquisitivo se erosiona ~25% por década. Las cifras finales que
            verás serán optimistas — recomendado dejar todos los objetivos
            como <em>ajustados por inflación</em>.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {goals.length === 0 && (
          <p className="text-sm text-brand-tertiary italic text-center py-4">
            Sin objetivos definidos. Añade al menos uno (típicamente una
            aportación y una retirada).
          </p>
        )}
        {goals.map((g, idx) => (
          <div
            key={g.id}
            className="p-4 bg-slate-50 border border-slate-200 rounded-lg"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-brand-navy uppercase tracking-wider">
                Objetivo #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(g.id)}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Eliminar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Tipo */}
              <label className="block">
                <span className="block text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider mb-1">
                  Tipo
                </span>
                <select
                  value={g.type}
                  onChange={(e) =>
                    update(g.id, { type: e.target.value as GoalType })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral bg-white"
                >
                  <option value="contribution">Aportación</option>
                  <option value="fixedWithdrawal">Retirada fija (€)</option>
                  <option value="percentageWithdrawal">
                    Retirada porcentaje (% anual)
                  </option>
                </select>
              </label>

              {/* Cantidad o porcentaje */}
              {g.type === "percentageWithdrawal" ? (
                <label className="block">
                  <span className="block text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider mb-1">
                    % anual sobre patrimonio
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.1}
                    value={g.percentagePct ?? 0}
                    onChange={(e) =>
                      update(g.id, { percentagePct: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral"
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="block text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider mb-1">
                    EUR / mes
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={g.amount ?? 0}
                    onChange={(e) =>
                      update(g.id, { amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral"
                  />
                </label>
              )}

              {/* Inflación */}
              <label className="flex items-center gap-2 sm:mt-6">
                <input
                  type="checkbox"
                  checked={g.inflationAdjusted}
                  onChange={(e) =>
                    update(g.id, { inflationAdjusted: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-300 text-brand-coral focus:ring-brand-coral/50"
                />
                <span className="text-xs text-brand-secondary">
                  Ajustar por inflación{" "}
                  <span className="text-brand-tertiary">(recomendado)</span>
                </span>
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Empieza */}
              <label className="block">
                <span className="block text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider mb-1">
                  Empieza
                </span>
                <select
                  value={g.start}
                  onChange={(e) =>
                    update(g.id, { start: e.target.value as GoalStart })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral bg-white"
                >
                  <option value="immediately">Inmediatamente</option>
                  <option value="atRetirement">En la jubilación</option>
                  <option value="yearsFromNow">Dentro de X años…</option>
                </select>
              </label>
              {g.start === "yearsFromNow" && (
                <label className="block">
                  <span className="block text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider mb-1">
                    Años desde ahora
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    value={g.startYearsFromNow ?? 0}
                    onChange={(e) =>
                      update(g.id, {
                        startYearsFromNow: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral"
                  />
                </label>
              )}

              {/* Duración */}
              <label className="block">
                <span className="block text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider mb-1">
                  Duración
                </span>
                <select
                  value={g.durationType}
                  onChange={(e) =>
                    update(g.id, {
                      durationType: e.target.value as GoalDuration,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral bg-white"
                >
                  <option value="untilEnd">Hasta el final del plan</option>
                  <option value="untilRetirement">Hasta la jubilación</option>
                  <option value="yearsAfterStart">X años desde el inicio</option>
                </select>
              </label>
              {g.durationType === "yearsAfterStart" && (
                <label className="block">
                  <span className="block text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider mb-1">
                    Años de duración
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={80}
                    step={1}
                    value={g.durationYears ?? 1}
                    onChange={(e) =>
                      update(g.id, {
                        durationYears: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral"
                  />
                </label>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  tooltip,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-brand-tertiary uppercase tracking-wider mb-1" title={tooltip}>
        {label}
      </span>
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
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-brand-tertiary uppercase tracking-wider mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral bg-white"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

// -----------------------------------------------------------------------------
// Panel de resultados
// -----------------------------------------------------------------------------

function ResultsPanel({ results }: { results: RetirementResult }) {
  const { successProbability, medianFinalValueReal, medianDepletionAge, depletionProbability, yearByYear, historicalSuccessRate, worstHistoricalCohort, bestHistoricalCohort, historicalCohorts, bootstrapSource, sequenceRisk, representativeMedianPath, withdrawalRates, warnings, config } = results;
  // Severidad del aviso de fiabilidad por longitud del histórico
  const histYears = bootstrapSource.historicalMonths / 12;
  const reliability: "high" | "medium" | "low" =
    bootstrapSource.recyclingFactor <= 0.6 && histYears >= 15
      ? "high"
      : bootstrapSource.recyclingFactor <= 1.5 && histYears >= 10
      ? "medium"
      : "low";
  const fmtMonth = (m: string) => {
    const [y, mo] = m.split("-").map(Number) as [number, number];
    if (!y || !mo) return m;
    return new Date(y, mo - 1, 1).toLocaleDateString("es-ES", { month: "short", year: "numeric" });
  };

  // Datos para el fan chart (Recharts). PRIMER PUNTO: el capital inicial en
  // age = currentAge, antes de cualquier retorno. Sin esto, la curva arranca
  // en age = currentAge + 1 con valores ya post-1-año, lo que visualmente
  // hace parecer que "sale desde 0" cuando en realidad sale del capital
  // inicial. Todos los percentiles del punto 0 son iguales al capital inicial.
  const initialPoint = {
    age: config.currentAge,
    p10: Math.round(config.initialCapital),
    p25: Math.round(config.initialCapital),
    p50: Math.round(config.initialCapital),
    p75: Math.round(config.initialCapital),
    p90: Math.round(config.initialCapital),
    p10_25_band: 0,
    p25_50_band: 0,
    p50_75_band: 0,
    p75_90_band: 0,
  };
  const fanData = [initialPoint, ...yearByYear.map((y) => ({
    age: y.age,
    p10: Math.round(y.p10),
    p25: Math.round(y.p25),
    p50: Math.round(y.p50),
    p75: Math.round(y.p75),
    p90: Math.round(y.p90),
    p10_25_band: Math.max(0, y.p25 - y.p10),
    p25_50_band: Math.max(0, y.p50 - y.p25),
    p50_75_band: Math.max(0, y.p75 - y.p50),
    p75_90_band: Math.max(0, y.p90 - y.p75),
  }))];

  const probColor =
    successProbability >= 90 ? "emerald" : successProbability >= 70 ? "amber" : "red";

  return (
    <div className="space-y-8">
      {/* Diagnóstico del bootstrap — fiabilidad de los resultados */}
      <section
        className={`rounded-2xl border p-5 ${
          reliability === "high"
            ? "bg-emerald-50 border-emerald-200"
            : reliability === "medium"
            ? "bg-amber-50 border-amber-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none">
            {reliability === "high" ? "🟢" : reliability === "medium" ? "🟡" : "🔴"}
          </div>
          <div className="flex-1">
            <p
              className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
                reliability === "high"
                  ? "text-emerald-700"
                  : reliability === "medium"
                  ? "text-amber-700"
                  : "text-red-700"
              }`}
            >
              Fiabilidad de la simulación —{" "}
              {reliability === "high" ? "Alta" : reliability === "medium" ? "Media" : "Baja"}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-brand-tertiary uppercase tracking-wider">Histórico común</p>
                <p className="font-semibold text-brand-navy">
                  {histYears.toFixed(1)} años
                </p>
                <p className="text-[10px] text-brand-tertiary">
                  {fmtMonth(bootstrapSource.historicalStartMonth)} →{" "}
                  {fmtMonth(bootstrapSource.historicalEndMonth)}
                </p>
              </div>
              <div>
                <p className="text-xs text-brand-tertiary uppercase tracking-wider">Plan</p>
                <p className="font-semibold text-brand-navy">
                  {(bootstrapSource.planMonths / 12).toFixed(0)} años
                </p>
              </div>
              <div>
                <p className="text-xs text-brand-tertiary uppercase tracking-wider">
                  Reciclado del histórico
                </p>
                <p className="font-semibold text-brand-navy">
                  ×{bootstrapSource.recyclingFactor.toFixed(1)}
                </p>
                <p className="text-[10px] text-brand-tertiary">
                  {bootstrapSource.recyclingFactor <= 1
                    ? "histórico cubre el plan"
                    : "el histórico se repite"}
                </p>
              </div>
              <div>
                <p className="text-xs text-brand-tertiary uppercase tracking-wider">
                  Bloques posibles
                </p>
                <p className="font-semibold text-brand-navy">
                  {bootstrapSource.blockStartPoints}
                </p>
                <p className="text-[10px] text-brand-tertiary">
                  blockSize:{" "}
                  {bootstrapSource.effectiveBlockSize === bootstrapSource.requestedBlockSize
                    ? `${bootstrapSource.effectiveBlockSize}m`
                    : `${bootstrapSource.effectiveBlockSize}m (ajustado desde ${bootstrapSource.requestedBlockSize}m)`}
                </p>
              </div>
            </div>
            {warnings.length > 0 && (
              <ul className="mt-4 space-y-1.5 text-xs leading-relaxed">
                {warnings.map((w, i) => (
                  <li
                    key={i}
                    className={
                      reliability === "high"
                        ? "text-emerald-900"
                        : reliability === "medium"
                        ? "text-amber-900"
                        : "text-red-900"
                    }
                  >
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Probabilidad de éxito + KPIs */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Gauge */}
          <div className={`rounded-xl p-6 ${probColor === "emerald" ? "bg-emerald-50 border-emerald-200" : probColor === "amber" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"} border`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-tertiary mb-2">
              Probabilidad de éxito
            </p>
            <p className={`text-5xl font-bold font-serif ${probColor === "emerald" ? "text-emerald-700" : probColor === "amber" ? "text-amber-700" : "text-red-700"}`}>
              {formatNumber(successProbability, 1)}%
            </p>
            <p className="text-xs mt-2 text-brand-secondary leading-tight">
              {successProbability >= 90 ? "Plan sólido — el capital aguanta en la inmensa mayoría de escenarios." : successProbability >= 70 ? "Plan razonable — algo de riesgo de quedarte corto." : "Plan frágil — considera aumentar aportes o reducir retiradas."}
            </p>
          </div>

          {/* Mediana final */}
          <div className="rounded-xl p-6 bg-slate-50 border border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-tertiary mb-2">
              Patrimonio final mediano (€ reales)
            </p>
            <p className="text-3xl font-bold font-serif text-brand-navy">
              {formatEUR(medianFinalValueReal)}
            </p>
            <p className="text-xs mt-2 text-brand-secondary">
              Lo que el 50% de los paths te deja al cumplir {yearByYear[yearByYear.length - 1]?.age} años.
            </p>
          </div>

          {/* Edad mediana de agotamiento */}
          <div className="rounded-xl p-6 bg-slate-50 border border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-tertiary mb-2">
              Edad mediana de agotamiento
            </p>
            <p className="text-3xl font-bold font-serif text-brand-navy">
              {medianDepletionAge !== undefined ? `${formatNumber(medianDepletionAge, 1)} años` : "—"}
            </p>
            <p className="text-xs mt-2 text-brand-secondary">
              Entre los {formatNumber(depletionProbability, 1)}% de paths que se agotan.
            </p>
          </div>
        </div>
      </section>

      {/* Fan chart */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
          Evolución del patrimonio (€ reales)
        </h3>
        <p className="text-xs text-brand-tertiary mb-4">
          Bandas año a año: p10-p25, p25-p50 (mediana), p50-p75, p75-p90. La línea
          es la mediana. Cuanto más estrecha la banda, más consistente el resultado.
        </p>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fanData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }} stackOffset="none">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: "#64748b" }} label={{ value: "Edad", position: "insideBottom", offset: -2, fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => formatEUR(v as number)} width={80} />
              <RechartsTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  // El payload contiene varios items (uno por <Area>/<Line>),
                  // pero todos comparten el mismo `payload` (el dato de la
                  // fila). Tomamos el primero y mostramos los percentiles
                  // CUMULATIVOS reales — no los anchos de banda.
                  const first = payload[0];
                  const d = first?.payload as {
                    p10: number;
                    p25: number;
                    p50: number;
                    p75: number;
                    p90: number;
                  } | undefined;
                  if (!d) return null;
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
                      <div className="font-semibold text-brand-navy mb-1.5">
                        Edad {label}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-blue-700 font-medium">p90 (mejor)</span>
                          <span className="font-mono text-brand-navy">{formatEUR(d.p90)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-blue-600">p75</span>
                          <span className="font-mono text-brand-navy">{formatEUR(d.p75)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-0.5 mt-0.5">
                          <span className="font-semibold text-brand-navy">p50 (mediana)</span>
                          <span className="font-mono font-bold text-brand-navy">{formatEUR(d.p50)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-0.5 mt-0.5">
                          <span className="text-red-600">p25</span>
                          <span className="font-mono text-brand-navy">{formatEUR(d.p25)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-red-700 font-medium">p10 (peor)</span>
                          <span className="font-mono text-brand-navy">{formatEUR(d.p10)}</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Area type="monotone" dataKey="p10" stackId="1" stroke="none" fill="transparent" name="p10" />
              <Area type="monotone" dataKey="p10_25_band" stackId="1" stroke="none" fill="#e11d48" fillOpacity={0.15} name="p10-p25" />
              <Area type="monotone" dataKey="p25_50_band" stackId="1" stroke="none" fill="#e11d48" fillOpacity={0.30} name="p25-p50" />
              <Area type="monotone" dataKey="p50_75_band" stackId="1" stroke="none" fill="#2563eb" fillOpacity={0.30} name="p50-p75" />
              <Area type="monotone" dataKey="p75_90_band" stackId="1" stroke="none" fill="#2563eb" fillOpacity={0.15} name="p75-p90" />
              <Line type="monotone" dataKey="p50" stroke="#1d4ed8" strokeWidth={2.5} dot={false} name="Mediana" />
              <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Tasas de retirada SWR / PWR por ESCENARIO */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-brand-navy font-serif">
            ¿Cuánto puedes retirar al mes?
          </h3>
          <p className="text-xs text-brand-tertiary mt-0.5 leading-relaxed">
            Sobre tu capital REAL mediano al jubilarte (
            <strong>{formatEUR(withdrawalRates.capitalAtRetirementReal)}</strong>
            ), retiros mensuales máximos en € de hoy bajo dos criterios:
            <br />
            <strong className="text-emerald-700">SWR</strong> permite acabar el
            plan con €0 ·{" "}
            <strong className="text-indigo-700">PWR</strong> exige preservar el
            capital real al final. {withdrawalRates.windowsAnalyzed} ventanas
            históricas contiguas analizadas. Elige el escenario según cuánta
            tolerancia al fracaso aceptes.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-2 pr-3 font-semibold text-brand-tertiary uppercase text-xs tracking-wider">
                  Escenario
                </th>
                <th className="text-left py-2 px-3 font-semibold text-brand-tertiary uppercase text-xs tracking-wider">
                  Prob. éxito
                </th>
                <th className="text-right py-2 px-3 font-semibold text-emerald-700 uppercase text-xs tracking-wider border-l border-slate-200">
                  SWR €/mes
                </th>
                <th className="text-right py-2 px-3 font-semibold text-emerald-700 uppercase text-xs tracking-wider">
                  SWR % anual
                </th>
                <th className="text-right py-2 px-3 font-semibold text-indigo-700 uppercase text-xs tracking-wider border-l border-slate-200">
                  PWR €/mes
                </th>
                <th className="text-right py-2 pl-3 font-semibold text-indigo-700 uppercase text-xs tracking-wider">
                  PWR % anual
                </th>
              </tr>
            </thead>
            <tbody>
              {withdrawalRates.scenarios.map((s) => {
                // Colores semánticos según el grado de optimismo/riesgo
                const palette =
                  s.key === "bengen"
                    ? { bg: "bg-emerald-100/60", dot: "🛡️", label: "text-emerald-800" }
                    : s.key === "agorero"
                    ? { bg: "bg-emerald-50/60", dot: "🟢", label: "text-emerald-700" }
                    : s.key === "conservador"
                    ? { bg: "bg-emerald-50/30", dot: "🟢", label: "text-emerald-600" }
                    : s.key === "medio"
                    ? { bg: "bg-amber-50/40", dot: "🟡", label: "text-amber-700" }
                    : { bg: "bg-red-50/30", dot: "🔴", label: "text-red-600" };
                return (
                  <tr key={s.key} className={`${palette.bg} border-b border-slate-100`}>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{palette.dot}</span>
                        <span className={`font-semibold ${palette.label}`}>
                          {s.label}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-brand-secondary">
                      <strong>{s.successRatePct}%</strong> de las secuencias
                      <br />
                      <span className="text-[10px] text-brand-tertiary">
                        (= percentil {s.percentile})
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right border-l border-slate-200">
                      <span className="font-mono font-bold text-emerald-700">
                        {formatEUR(s.swr.eurPerMonth)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-700">
                      {formatNumber(s.swr.pctAnnual, 2)}%
                    </td>
                    <td className="py-3 px-3 text-right border-l border-slate-200">
                      <span className="font-mono font-bold text-indigo-700">
                        {formatEUR(s.pwr.eurPerMonth)}
                      </span>
                    </td>
                    <td className="py-3 pl-3 text-right text-indigo-700">
                      {formatNumber(s.pwr.pctAnnual, 2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 leading-relaxed">
            <p className="font-semibold text-emerald-700 mb-1">
              🟢 SWR — Safe Withdrawal Rate
            </p>
            <p className="text-emerald-900">
              Retiro mensual máximo tal que el <strong>dinero NO se agota</strong>{" "}
              antes de los {config.endAge} años. Acepta acabar con €0.
              Equivalente al &quot;4% rule&quot; de Bengen.
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 leading-relaxed">
            <p className="font-semibold text-indigo-700 mb-1">
              🟣 PWR — Perpetual Withdrawal Rate
            </p>
            <p className="text-indigo-900">
              Retiro mensual máximo tal que el{" "}
              <strong>capital final en € REALES ≥ capital al jubilarte</strong>
              . Preserva poder adquisitivo (herencia íntegra, perpetuo).
            </p>
          </div>
        </div>

        <p className="text-xs text-brand-tertiary mt-4 leading-relaxed">
          💡 <strong>Cómo leer la tabla</strong>:{" "}
          <strong>Bengen</strong> es la cifra del paper original de 1994 —
          sobrevive incluso en el peor 1% de las secuencias históricas
          (jubilarse el día antes del crash del 29, p.ej.). Es el techo
          ultra-conservador que da casi cualquier escenario. La{" "}
          <strong>Agorero</strong> (95%) y <strong>Conservador</strong> (75%)
          son los típicos del sector. <strong>Medio</strong> es 50/50 — si
          tienes mala suerte el plan falla. <strong>Optimista</strong> sólo
          funciona si te toca el 25% mejor de los escenarios. Si los warnings
          del panel de fiabilidad indican histórico corto, todas estas tasas{" "}
          <strong>sobreestiman</strong> lo seguro a futuro.
        </p>
      </section>

      {/* Sequence-of-returns risk */}
      <section className="bg-white rounded-2xl border border-red-200 shadow-sm p-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="text-2xl">⚠️</div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-700 font-serif">
              Riesgo de secuencia de rentabilidades
            </h3>
            <p className="text-xs text-brand-tertiary mt-0.5 leading-relaxed">
              Qué pasaría si los <strong>peores {(sequenceRisk.windowMonths / 12).toFixed(0)} años</strong> del histórico ocurrieran{" "}
              <strong>justo cuando te jubilas</strong>. Mide el peor caso de
              &quot;sequence of returns risk&quot; — un crash al inicio de la
              retirada puede arruinar un plan que la media a largo plazo
              aprobaría con creces.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="rounded-lg p-4 bg-red-50 border border-red-200">
            <p className="text-[10px] font-semibold uppercase text-red-700 mb-1">
              Peor ventana histórica
            </p>
            <p className="text-base font-bold font-serif text-red-700">
              {sequenceRisk.worstWindowStartMonth}
            </p>
            <p className="text-xs text-red-600">
              {sequenceRisk.worstWindowCumulativeReturn >= 0 ? "+" : ""}
              {formatNumber(sequenceRisk.worstWindowCumulativeReturn, 1)}% acumulado
              en {(sequenceRisk.windowMonths / 12).toFixed(0)} años
            </p>
          </div>

          <div
            className={`rounded-lg p-4 border ${
              sequenceRisk.success
                ? "bg-amber-50 border-amber-200"
                : "bg-red-50 border-red-300"
            }`}
          >
            <p
              className={`text-[10px] font-semibold uppercase mb-1 ${
                sequenceRisk.success ? "text-amber-700" : "text-red-700"
              }`}
            >
              Resultado del stress test
            </p>
            <p
              className={`text-base font-bold font-serif ${
                sequenceRisk.success ? "text-amber-700" : "text-red-700"
              }`}
            >
              {sequenceRisk.success ? "Aguanta" : "Plan ARRUINADO"}
            </p>
            <p className="text-xs text-brand-secondary">
              {sequenceRisk.success
                ? "El plan sobrevive incluso con sequence risk"
                : sequenceRisk.depletionAge !== undefined
                ? `Dinero agotado a los ${formatNumber(sequenceRisk.depletionAge, 0)} años`
                : "El plan no llega al final"}
            </p>
          </div>

          <div className="rounded-lg p-4 bg-slate-50 border border-slate-200">
            <p className="text-[10px] font-semibold uppercase text-brand-tertiary mb-1">
              Patrimonio final (€ reales)
            </p>
            <p className="text-base font-bold font-serif text-brand-navy">
              {formatEUR(sequenceRisk.finalValueReal)}
            </p>
            <p className="text-xs text-brand-secondary">
              {medianFinalValueReal > 0
                ? `${formatNumber((sequenceRisk.finalValueReal / medianFinalValueReal) * 100, 0)}% de la mediana`
                : "—"}
            </p>
          </div>

          <div className="rounded-lg p-4 bg-slate-50 border border-slate-200">
            <p className="text-[10px] font-semibold uppercase text-brand-tertiary mb-1">
              vs Mediana (sin stress)
            </p>
            <p className="text-base font-bold font-serif text-brand-navy">
              {medianFinalValueReal > sequenceRisk.finalValueReal
                ? `${formatEUR(medianFinalValueReal - sequenceRisk.finalValueReal)} menos`
                : "—"}
            </p>
            <p className="text-xs text-brand-secondary">
              Coste del peor inicio
            </p>
          </div>
        </div>

        {/* Mini-gráfico: dos trayectorias REALES — path representativo del
            bootstrap vs path con sequence-risk inyectado. Ambos son paths
            mensuales reales, así que la comparación es directa (no como
            comparar contra un p50 que cruza paths). */}
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sequenceRisk.monthlyValuesReal
                .filter((_, i) => i % 6 === 0)
                .map((v, i) => {
                  const monthIdx = i * 6;
                  return {
                    age: config.currentAge + monthIdx / 12,
                    sequenceRisk: Math.max(0, v),
                    representativa: Math.max(
                      0,
                      representativeMedianPath.monthlyValuesReal[monthIdx] ?? 0
                    ),
                  };
                })}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="age"
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickFormatter={(v) => `${Math.round(v as number)}`}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickFormatter={(v) => formatEUR(v as number)}
                width={70}
              />
              <RechartsTooltip
                formatter={(value: number) => formatEUR(value)}
                labelFormatter={(l) => `Edad ${Math.round(l as number)}`}
                contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "11px" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <ReferenceLine x={config.retirementAge} stroke="#e11d48" strokeDasharray="3 3" label={{ value: "Jubilación", position: "top", fontSize: 10, fill: "#e11d48" }} />
              <Line
                type="monotone"
                dataKey="representativa"
                stroke="#1d4ed8"
                strokeWidth={2}
                dot={false}
                name="Trayectoria típica (bootstrap)"
              />
              <Line
                type="monotone"
                dataKey="sequenceRisk"
                stroke="#dc2626"
                strokeWidth={2.5}
                dot={false}
                name="Trayectoria con sequence risk"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-brand-tertiary leading-relaxed">
          Ambas curvas son <strong>trayectorias reales mes a mes</strong>: la
          azul es el path del bootstrap normal cuyo patrimonio final cae más
          cerca de la mediana (escenario &quot;típico&quot;); la roja es la
          misma simulación pero con la peor ventana histórica de 5 años
          inyectada al jubilarse. Las dos pueden tener mucha volatilidad
          intra-anual — eso es real, no un artefacto del agregado.
        </p>
      </section>

      {/* Cohortes históricos */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
          Secuencias históricas reales
        </h3>
        <p className="text-xs text-brand-tertiary mb-4">
          Resultado del MISMO plan ejecutado empezando en cada mes histórico
          disponible (no aleatorio). Enseña el <strong>sequence of returns risk</strong>:
          jubilarse en 2000 (dotcom) vs 2009 (post-crisis) cambia totalmente el final.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="rounded-lg p-4 bg-slate-50 border border-slate-200">
            <p className="text-[10px] font-semibold uppercase text-brand-tertiary mb-1">% éxito histórico</p>
            <p className="text-2xl font-bold font-serif text-brand-navy">{formatNumber(historicalSuccessRate, 1)}%</p>
          </div>
          {worstHistoricalCohort && (
            <div className="rounded-lg p-4 bg-red-50 border border-red-200">
              <p className="text-[10px] font-semibold uppercase text-red-700 mb-1">Peor cohorte</p>
              <p className="text-lg font-bold font-serif text-red-700">{worstHistoricalCohort.startMonth}</p>
              <p className="text-xs text-red-600">
                Final: {formatEUR(worstHistoricalCohort.finalValueReal)}
                {worstHistoricalCohort.depletionAge !== undefined && ` · agotado a los ${formatNumber(worstHistoricalCohort.depletionAge, 0)} años`}
              </p>
            </div>
          )}
          {bestHistoricalCohort && (
            <div className="rounded-lg p-4 bg-emerald-50 border border-emerald-200">
              <p className="text-[10px] font-semibold uppercase text-emerald-700 mb-1">Mejor cohorte</p>
              <p className="text-lg font-bold font-serif text-emerald-700">{bestHistoricalCohort.startMonth}</p>
              <p className="text-xs text-emerald-600">Final: {formatEUR(bestHistoricalCohort.finalValueReal)}</p>
            </div>
          )}
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-slate-100 rounded-lg">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-slate-200">
              <tr>
                <th className="text-left font-semibold text-brand-tertiary uppercase py-2 px-3">Inicio</th>
                <th className="text-right font-semibold text-brand-tertiary uppercase py-2 px-3">Final real</th>
                <th className="text-right font-semibold text-brand-tertiary uppercase py-2 px-3">Edad agotamiento</th>
                <th className="text-center font-semibold text-brand-tertiary uppercase py-2 px-3">Éxito</th>
              </tr>
            </thead>
            <tbody>
              {historicalCohorts.slice().sort((a, b) => a.startMonth.localeCompare(b.startMonth)).map((c) => (
                <tr key={c.startMonth} className={`border-b border-slate-100 ${c.success ? "" : "bg-red-50/30"}`}>
                  <td className="py-1.5 px-3 font-mono text-brand-secondary">{c.startMonth}</td>
                  <td className={`py-1.5 px-3 text-right font-mono ${c.success ? "text-emerald-700" : "text-red-700"}`}>{formatEUR(c.finalValueReal)}</td>
                  <td className="py-1.5 px-3 text-right font-mono">{c.depletionAge !== undefined ? formatNumber(c.depletionAge, 0) : "—"}</td>
                  <td className="py-1.5 px-3 text-center">{c.success ? "✓" : "✗"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
