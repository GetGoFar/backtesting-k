"use client";

// =============================================================================
// /simulador-retiro — Widget público paramétrico (log-normal Monte Carlo)
// =============================================================================
//
// Versión paramétrica de /jubilacion. Sin AccessGate, sin header, optimizado
// para embeber via iframe en elproyectok.com/recursos/simulador-jubilacion/.
// Toda la simulación ocurre en cliente — no toca EODHD ni ningún API.
//
// Envía postMessage de altura al padre cada vez que cambian los resultados,
// para que el iframe se auto-redimensione.
// =============================================================================

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  AreaChart,
  Area,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  runParametricRetirement,
  type ParametricConfig,
  type ParametricResult,
  type FinancialGoal,
  type GoalType,
  type GoalStart,
  type GoalDuration,
} from "@/lib/retirement-parametric";

// -----------------------------------------------------------------------------
// Formateadores
// -----------------------------------------------------------------------------

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
const fmtPct = (n: number, dec = 2) => `${n.toFixed(dec)}%`;
const fmtPctSigned = (n: number, dec = 2) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(dec)}%`;

// -----------------------------------------------------------------------------
// Presets de cartera
// -----------------------------------------------------------------------------

interface Preset {
  label: string;
  ret: number;
  vol: number;
}
const PRESETS: Preset[] = [
  { label: "Cartera K10", ret: 8.5, vol: 11 },
  { label: "Cartera K4", ret: 7, vol: 7 },
  { label: "100% RV global", ret: 8, vol: 16 },
  { label: "80/20 (agresiva)", ret: 7.2, vol: 13 },
  { label: "60/40 (clásica)", ret: 6, vol: 10 },
  { label: "40/60 (moderada)", ret: 5, vol: 7 },
  { label: "20/80 (conservadora)", ret: 4, vol: 5 },
  { label: "100% RF", ret: 3, vol: 4 },
];

// -----------------------------------------------------------------------------
// Configuración por defecto
// -----------------------------------------------------------------------------

function newGoalId(): string {
  return `g-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function defaultConfig(): ParametricConfig {
  return {
    currentAge: 40,
    retirementAge: 65,
    endAge: 90,
    initialCapital: 50_000,
    goals: [
      {
        id: "default-contrib",
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
    accumulationReturn: 7,
    accumulationVol: 13,
    distributionReturn: 5,
    distributionVol: 7,
    glidePathYears: 5,
    inflationAnnualPct: 2.5,
    taxMode: "none",
    numPaths: 1000,
  };
}

// -----------------------------------------------------------------------------
// Página principal
// -----------------------------------------------------------------------------

export default function SimuladorRetiroPage() {
  const [config, setConfig] = useState<ParametricConfig>(defaultConfig());
  const [results, setResults] = useState<ParametricResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(() => {
    setIsLoading(true);
    setError(null);
    // setTimeout para no bloquear el thread del UI durante el cálculo
    setTimeout(() => {
      try {
        const r = runParametricRetirement(config);
        setResults(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setResults(null);
      } finally {
        setIsLoading(false);
      }
    }, 30);
  }, [config]);

  // PostMessage de altura al padre — para que el iframe se autodimensione
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const sendHeight = () => {
      const h = rootRef.current?.scrollHeight ?? document.body.scrollHeight;
      window.parent.postMessage({ type: "epk-iframe-height", height: h }, "*");
    };
    sendHeight();
    const ro = new ResizeObserver(sendHeight);
    if (rootRef.current) ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, [results]);

  return (
    <div ref={rootRef} className="bg-slate-50 min-h-screen">
      <div className="max-w-[1200px] mx-auto p-4 sm:p-6 space-y-6">
        <Header />
        <ConfigPanel
          config={config}
          onChange={setConfig}
          onRun={handleRun}
          isLoading={isLoading}
        />
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-900 text-sm">
            ⚠ {error}
          </div>
        )}
        {results && <ResultsPanel results={results} />}
        <Footer />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Header del widget
// -----------------------------------------------------------------------------

function Header() {
  return (
    <header className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-serif">
        Simulador de retiro
      </h1>
      <p className="text-sm text-slate-600 mt-1 leading-relaxed">
        Estima si tu plan de jubilación va a aguantar usando Monte Carlo
        paramétrico log-normal. Tú defines la rentabilidad y volatilidad
        esperadas; la simulación genera 1.000 escenarios y te dice la
        probabilidad de éxito + tasas de retirada seguras (SWR/PWR).
      </p>
    </header>
  );
}

function Footer() {
  return (
    <footer className="text-center text-xs text-slate-500 py-4">
      Esta herramienta es educativa. Los resultados son escenarios estadísticos,
      no asesoramiento financiero personalizado.{" "}
      <a
        href="https://elproyectok.com"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-slate-700"
      >
        Hecho en El Proyecto K ↗
      </a>
    </footer>
  );
}

// -----------------------------------------------------------------------------
// Panel de configuración
// -----------------------------------------------------------------------------

function ConfigPanel({
  config,
  onChange,
  onRun,
  isLoading,
}: {
  config: ParametricConfig;
  onChange: (c: ParametricConfig) => void;
  onRun: () => void;
  isLoading: boolean;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="bg-slate-900 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-white font-semibold font-serif text-lg">
          Configura tu plan
        </h2>
        <button
          onClick={onRun}
          disabled={isLoading}
          className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {isLoading ? "Calculando…" : "▶ Simular"}
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Edades */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NumberField
            label="Edad actual"
            value={config.currentAge}
            onChange={(v) => onChange({ ...config, currentAge: v })}
            min={18}
            max={90}
          />
          <NumberField
            label="Edad de jubilación"
            value={config.retirementAge}
            onChange={(v) => onChange({ ...config, retirementAge: v })}
            min={config.currentAge + 1}
            max={90}
          />
          <NumberField
            label="Edad fin del plan"
            value={config.endAge}
            onChange={(v) => onChange({ ...config, endAge: v })}
            min={config.retirementAge + 1}
            max={110}
          />
        </div>

        {/* Capital inicial */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField
            label="Capital inicial (€)"
            value={config.initialCapital}
            onChange={(v) => onChange({ ...config, initialCapital: v })}
            min={0}
            step={1000}
          />
          <NumberField
            label="Inflación anual (%)"
            value={config.inflationAnnualPct}
            onChange={(v) => onChange({ ...config, inflationAnnualPct: v })}
            min={-5}
            max={15}
            step={0.1}
          />
        </div>

        {/* Cartera de acumulación */}
        <PortfolioParams
          title="Cartera de ACUMULACIÓN"
          subtitle="Más agresiva — buscas crecer el capital"
          retValue={config.accumulationReturn}
          volValue={config.accumulationVol}
          onChange={(ret, vol) =>
            onChange({ ...config, accumulationReturn: ret, accumulationVol: vol })
          }
        />

        {/* Cartera de distribución */}
        <PortfolioParams
          title="Cartera de DISTRIBUCIÓN"
          subtitle="Más conservadora — proteges lo acumulado"
          retValue={config.distributionReturn}
          volValue={config.distributionVol}
          onChange={(ret, vol) =>
            onChange({
              ...config,
              distributionReturn: ret,
              distributionVol: vol,
            })
          }
        />

        {/* Glide path */}
        <NumberField
          label="Glide path (años antes de jubilarse para transicionar A→B)"
          value={config.glidePathYears}
          onChange={(v) => onChange({ ...config, glidePathYears: v })}
          min={0}
          max={20}
          hint="0 = cambio instantáneo el día de la jubilación. 5 años es lo típico."
        />

        {/* Goals */}
        <FinancialGoalsEditor
          goals={config.goals}
          onChange={(g) => onChange({ ...config, goals: g })}
        />
      </div>
    </section>
  );
}

function PortfolioParams({
  title,
  subtitle,
  retValue,
  volValue,
  onChange,
}: {
  title: string;
  subtitle: string;
  retValue: number;
  volValue: number;
  onChange: (ret: number, vol: number) => void;
}) {
  const handlePreset = (p: Preset) => onChange(p.ret, p.vol);
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <NumberField
          label="Retorno esperado (% anual)"
          value={retValue}
          onChange={(v) => onChange(v, volValue)}
          min={-5}
          max={25}
          step={0.1}
        />
        <NumberField
          label="Volatilidad (% anual)"
          value={volValue}
          onChange={(v) => onChange(retValue, v)}
          min={0}
          max={40}
          step={0.1}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-slate-500 mr-1">Presets:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handlePreset(p)}
            className="text-xs px-2 py-1 rounded-md bg-white border border-slate-200 hover:border-rose-400 hover:bg-rose-50 transition-colors"
          >
            {p.label}{" "}
            <span className="text-slate-500">
              ({p.ret}/{p.vol})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Editor de Goals
// -----------------------------------------------------------------------------

function FinancialGoalsEditor({
  goals,
  onChange,
}: {
  goals: FinancialGoal[];
  onChange: (g: FinancialGoal[]) => void;
}) {
  const update = (id: string, patch: Partial<FinancialGoal>) =>
    onChange(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)));
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

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Objetivos financieros
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Aportaciones, retiradas fijas o porcentuales. Por defecto ajustadas
            por inflación.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="px-3 py-1.5 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
        >
          + Añadir
        </button>
      </div>
      <div className="space-y-3">
        {goals.length === 0 && (
          <p className="text-sm text-slate-500 italic text-center py-4">
            Sin objetivos. Añade al menos uno.
          </p>
        )}
        {goals.map((g, idx) => (
          <div
            key={g.id}
            className="p-3 bg-slate-50 border border-slate-200 rounded-lg"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
              <SmallSelect
                value={g.type}
                onChange={(v) => update(g.id, { type: v as GoalType })}
                options={[
                  { v: "contribution", l: "Aportación" },
                  { v: "fixedWithdrawal", l: "Retirada fija (€)" },
                  { v: "percentageWithdrawal", l: "Retirada % anual" },
                ]}
              />
              {g.type === "percentageWithdrawal" ? (
                <SmallNum
                  value={g.percentagePct ?? 0}
                  onChange={(v) => update(g.id, { percentagePct: v })}
                  min={0}
                  max={20}
                  step={0.1}
                  suffix="%/año"
                />
              ) : (
                <SmallNum
                  value={g.amount ?? 0}
                  onChange={(v) => update(g.id, { amount: v })}
                  min={0}
                  step={50}
                  suffix="€/mes"
                />
              )}
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={g.inflationAdjusted}
                  onChange={(e) =>
                    update(g.id, { inflationAdjusted: e.target.checked })
                  }
                  className="w-3.5 h-3.5"
                />
                Inflación
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <SmallSelect
                value={g.start}
                onChange={(v) => update(g.id, { start: v as GoalStart })}
                options={[
                  { v: "immediately", l: "Empieza ahora" },
                  { v: "atRetirement", l: "En jubilación" },
                  { v: "yearsFromNow", l: "Dentro de X años" },
                ]}
              />
              {g.start === "yearsFromNow" && (
                <SmallNum
                  value={g.startYearsFromNow ?? 0}
                  onChange={(v) => update(g.id, { startYearsFromNow: v })}
                  min={0}
                  max={50}
                  step={1}
                  suffix="años"
                />
              )}
              <SmallSelect
                value={g.durationType}
                onChange={(v) => update(g.id, { durationType: v as GoalDuration })}
                options={[
                  { v: "untilEnd", l: "Hasta el final" },
                  { v: "untilRetirement", l: "Hasta jubilación" },
                  { v: "yearsAfterStart", l: "X años" },
                ]}
              />
              {g.durationType === "yearsAfterStart" && (
                <SmallNum
                  value={g.durationYears ?? 1}
                  onChange={(v) => update(g.id, { durationYears: v })}
                  min={1}
                  max={80}
                  step={1}
                  suffix="años"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Panel de resultados
// -----------------------------------------------------------------------------

function ResultsPanel({ results }: { results: ParametricResult }) {
  const {
    successProbability,
    medianFinalValueReal,
    medianDepletionAge,
    depletionProbability,
    yearByYear,
    representativeMedianPath,
    sequenceRisk,
    withdrawalRates,
    warnings,
    config,
  } = results;

  // Fan data (con punto inicial)
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
  const fanData = [
    initialPoint,
    ...yearByYear.map((y) => ({
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
    })),
  ];

  const probColor =
    successProbability >= 90
      ? "emerald"
      : successProbability >= 70
      ? "amber"
      : "red";

  return (
    <div className="space-y-6">
      {/* Warnings */}
      {warnings.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1 text-xs">
          {warnings.map((w, i) => (
            <p key={i} className="text-amber-900">
              ⚠ {w}
            </p>
          ))}
        </section>
      )}

      {/* KPIs */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div
            className={`rounded-xl p-5 border ${
              probColor === "emerald"
                ? "bg-emerald-50 border-emerald-200"
                : probColor === "amber"
                ? "bg-amber-50 border-amber-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Probabilidad de éxito
            </p>
            <p
              className={`text-5xl font-bold font-serif ${
                probColor === "emerald"
                  ? "text-emerald-700"
                  : probColor === "amber"
                  ? "text-amber-700"
                  : "text-red-700"
              }`}
            >
              {successProbability.toFixed(1)}%
            </p>
            <p className="text-xs mt-2 text-slate-600">
              {successProbability >= 90
                ? "Plan sólido — aguanta en la inmensa mayoría de escenarios."
                : successProbability >= 70
                ? "Plan razonable — algo de riesgo de quedarte corto."
                : "Plan frágil — considera aumentar aportes o reducir retiradas."}
            </p>
          </div>
          <div className="rounded-xl p-5 bg-slate-50 border border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Patrimonio final mediano (€ reales)
            </p>
            <p className="text-3xl font-bold font-serif text-slate-900">
              {fmtEUR(medianFinalValueReal)}
            </p>
            <p className="text-xs mt-2 text-slate-600">
              Lo que el 50% de los paths te deja a los {config.endAge} años.
            </p>
          </div>
          <div className="rounded-xl p-5 bg-slate-50 border border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Edad mediana de agotamiento
            </p>
            <p className="text-3xl font-bold font-serif text-slate-900">
              {medianDepletionAge !== undefined
                ? `${medianDepletionAge.toFixed(1)} años`
                : "—"}
            </p>
            <p className="text-xs mt-2 text-slate-600">
              Entre los {depletionProbability.toFixed(1)}% que se agotan.
            </p>
          </div>
        </div>
      </section>

      {/* Fan chart */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 font-serif mb-1">
          Evolución del patrimonio (€ reales)
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Bandas año a año: p10-p25, p25-p50 (mediana), p50-p75, p75-p90. La
          línea es la mediana. Cuanto más estrecha la banda, más consistente.
        </p>
        <div className="h-80 sm:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fanData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickFormatter={(v) => fmtEUR(v as number)}
                width={80}
              />
              <RechartsTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0]?.payload as {
                    p10: number;
                    p25: number;
                    p50: number;
                    p75: number;
                    p90: number;
                  };
                  if (!d) return null;
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
                      <div className="font-semibold text-slate-900 mb-1.5">
                        Edad {label}
                      </div>
                      <div className="space-y-0.5">
                        <Row label="p90 (mejor)" v={d.p90} color="text-blue-700" />
                        <Row label="p75" v={d.p75} color="text-blue-600" />
                        <div className="border-t border-slate-200 my-0.5" />
                        <Row
                          label="p50 (mediana)"
                          v={d.p50}
                          color="text-slate-900"
                          bold
                        />
                        <div className="border-t border-slate-200 my-0.5" />
                        <Row label="p25" v={d.p25} color="text-red-600" />
                        <Row
                          label="p10 (peor)"
                          v={d.p10}
                          color="text-red-700"
                        />
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Area
                type="monotone"
                dataKey="p10"
                stackId="1"
                stroke="none"
                fill="transparent"
              />
              <Area
                type="monotone"
                dataKey="p10_25_band"
                stackId="1"
                stroke="none"
                fill="#e11d48"
                fillOpacity={0.15}
                name="p10-p25"
              />
              <Area
                type="monotone"
                dataKey="p25_50_band"
                stackId="1"
                stroke="none"
                fill="#e11d48"
                fillOpacity={0.3}
                name="p25-p50"
              />
              <Area
                type="monotone"
                dataKey="p50_75_band"
                stackId="1"
                stroke="none"
                fill="#2563eb"
                fillOpacity={0.3}
                name="p50-p75"
              />
              <Area
                type="monotone"
                dataKey="p75_90_band"
                stackId="1"
                stroke="none"
                fill="#2563eb"
                fillOpacity={0.15}
                name="p75-p90"
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke="#1d4ed8"
                strokeWidth={2.5}
                dot={false}
                name="Mediana"
              />
              <ReferenceLine
                y={0}
                stroke="#dc2626"
                strokeDasharray="4 4"
              />
              <ReferenceLine
                x={config.retirementAge}
                stroke="#0f172a"
                strokeDasharray="3 3"
                label={{
                  value: "Jubilación",
                  position: "top",
                  fontSize: 10,
                  fill: "#0f172a",
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* SWR/PWR */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 font-serif">
          ¿Cuánto puedes retirar al mes?
        </h3>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
          Capital REAL mediano al jubilarte:{" "}
          <strong>{fmtEUR(withdrawalRates.capitalAtRetirementReal)}</strong>.
          Tasas calculadas path-por-path sobre{" "}
          {withdrawalRates.pathsAnalyzed} simulaciones.{" "}
          <strong className="text-emerald-700">SWR</strong> = retiro máx. sin
          agotar antes de los {config.endAge} años (acepta acabar en €0).
        </p>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-2 pr-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">
                  Escenario
                </th>
                <th className="text-left py-2 px-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">
                  Prob. éxito
                </th>
                <th className="text-right py-2 px-3 font-semibold text-emerald-700 uppercase text-xs tracking-wider border-l border-slate-200">
                  SWR €/mes
                </th>
                <th className="text-right py-2 pl-3 font-semibold text-emerald-700 uppercase text-xs tracking-wider">
                  SWR % anual
                </th>
              </tr>
            </thead>
            <tbody>
              {withdrawalRates.scenarios.map((s) => {
                const palette =
                  s.key === "bengen"
                    ? {
                        bg: "bg-emerald-100/60",
                        dot: "🛡️",
                        label: "text-emerald-800",
                      }
                    : s.key === "agorero"
                    ? {
                        bg: "bg-emerald-50/60",
                        dot: "🟢",
                        label: "text-emerald-700",
                      }
                    : s.key === "conservador"
                    ? {
                        bg: "bg-emerald-50/30",
                        dot: "🟢",
                        label: "text-emerald-600",
                      }
                    : s.key === "medio"
                    ? {
                        bg: "bg-amber-50/40",
                        dot: "🟡",
                        label: "text-amber-700",
                      }
                    : {
                        bg: "bg-red-50/30",
                        dot: "🔴",
                        label: "text-red-600",
                      };
                return (
                  <tr
                    key={s.key}
                    className={`${palette.bg} border-b border-slate-100`}
                  >
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{palette.dot}</span>
                        <span className={`font-semibold ${palette.label}`}>
                          {s.label}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      <strong>{s.successRatePct}%</strong>{" "}
                      <span className="text-[10px] text-slate-500">
                        (p{s.percentile})
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right border-l border-slate-200 font-mono font-bold text-emerald-700">
                      {fmtEUR(s.swr.eurPerMonth)}
                    </td>
                    <td className="py-3 pl-3 text-right text-emerald-700">
                      {fmtPct(s.swr.pctAnnual)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          💡 <strong>Bengen</strong> sobrevive en el 99% de los escenarios
          simulados. <strong>Optimista</strong> sólo si te toca el 25% mejor.
          Si el plan que ves &quot;aguanta&quot; pero quieres dormir tranquilo,
          fija tus retiros en la cifra Bengen.
        </p>

        {/* PWR perpetua — sección dedicada */}
        <div className="mt-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="text-2xl">♾️</div>
            <div className="flex-1">
              <h4 className="text-base font-bold text-indigo-900 font-serif">
                PWR — Tasa perpetua para preservar capital
              </h4>
              <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
                Si tu objetivo es mantener el capital indefinidamente (legado o
                independencia perpetua), retira hasta esta tasa. Depende{" "}
                <strong>solo</strong> de tu cartera de distribución (su
                rentabilidad real esperada), NO del capital ni de las
                aportaciones.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div className="bg-white/70 rounded-lg p-3 border border-indigo-100">
              <div className="text-[10px] uppercase tracking-wider text-indigo-500 font-semibold">
                Conservador (p25)
              </div>
              <div className="text-xl font-bold text-indigo-700 font-mono mt-1">
                {fmtEUR(withdrawalRates.pwrPerpetual.eurPerMonthP25)}
                <span className="text-xs font-normal text-indigo-500">
                  {" "}
                  /mes
                </span>
              </div>
              <div className="text-xs text-indigo-600 mt-0.5">
                {fmtPct(withdrawalRates.pwrPerpetual.pctAnnualP25)} real anual
              </div>
            </div>
            <div className="bg-indigo-100 rounded-lg p-3 border-2 border-indigo-300 shadow-sm">
              <div className="text-[10px] uppercase tracking-wider text-indigo-700 font-bold">
                Mediana (p50) ⭐
              </div>
              <div className="text-2xl font-bold text-indigo-800 font-mono mt-1">
                {fmtEUR(withdrawalRates.pwrPerpetual.eurPerMonthMedian)}
                <span className="text-xs font-normal text-indigo-600">
                  {" "}
                  /mes
                </span>
              </div>
              <div className="text-xs text-indigo-700 mt-0.5 font-semibold">
                {fmtPct(withdrawalRates.pwrPerpetual.pctAnnualMedian)} real
                anual
              </div>
            </div>
            <div className="bg-white/70 rounded-lg p-3 border border-indigo-100">
              <div className="text-[10px] uppercase tracking-wider text-indigo-500 font-semibold">
                Optimista (p75)
              </div>
              <div className="text-xl font-bold text-indigo-700 font-mono mt-1">
                {fmtEUR(withdrawalRates.pwrPerpetual.eurPerMonthP75)}
                <span className="text-xs font-normal text-indigo-500">
                  {" "}
                  /mes
                </span>
              </div>
              <div className="text-xs text-indigo-600 mt-0.5">
                {fmtPct(withdrawalRates.pwrPerpetual.pctAnnualP75)} real anual
              </div>
            </div>
          </div>

          <p className="text-[11px] text-indigo-600/80 mt-3 leading-relaxed">
            ℹ️ Cálculo: PWR = K × CAGR_real_geométrico / 12, donde K es tu
            capital al jubilarte y CAGR_real es el rendimiento real anualizado
            de la cartera de distribución sobre el horizonte de la simulación.
            La mediana representa &quot;si tu cartera rinde como se espera&quot;;
            el rango p25-p75 cubre la mitad central de escenarios. Para
            escenarios MÁS adversos (p1, p5) la cartera puede no preservar
            capital — eso es información que la columna SWR ya captura (tasa
            que aguanta sin agotar).
          </p>
        </div>
      </section>

      {/* Sequence risk */}
      <section className="bg-white rounded-2xl border border-red-200 shadow-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="text-2xl">⚠️</div>
          <div>
            <h3 className="text-lg font-semibold text-red-700 font-serif">
              Riesgo de secuencia
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
              Escenario <strong>p1</strong> (1 entre 100): qué pasaría si los
              peores {(sequenceRisk.windowMonths / 12).toFixed(0)} años de la
              simulación ocurrieran <strong>justo al jubilarte</strong>. Un
              crash al inicio del retiro puede arruinar un plan que la media
              aprobaría con creces. No es el peor caso absoluto (eso sería un
              outlier 1 entre mil) sino la convención del sector para
              &quot;peor caso plausible&quot;.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <KpiBox
            label="Peor ventana"
            value={`${fmtPctSigned(sequenceRisk.worstWindowCumulativeReturn)}`}
            sub={`acumulado en ${(sequenceRisk.windowMonths / 12).toFixed(0)} años`}
            tone="red"
          />
          <KpiBox
            label="Resultado"
            value={sequenceRisk.success ? "Aguanta" : "Arruinado"}
            sub={
              sequenceRisk.success
                ? "Sobrevive incluso con sequence risk"
                : sequenceRisk.depletionAge !== undefined
                ? `Agotado a los ${sequenceRisk.depletionAge.toFixed(0)} años`
                : "El plan no llega al final"
            }
            tone={sequenceRisk.success ? "amber" : "red"}
          />
          <KpiBox
            label="Patrimonio final"
            value={fmtEUR(sequenceRisk.finalValueReal)}
            sub={
              medianFinalValueReal > 0
                ? `${((sequenceRisk.finalValueReal / medianFinalValueReal) * 100).toFixed(0)}% de la mediana`
                : "—"
            }
            tone="slate"
          />
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sequenceRisk.monthlyValuesReal
                .filter((_, i) => i % 6 === 0)
                .map((v, i) => {
                  const monthIdx = i * 6;
                  return {
                    age: config.currentAge + monthIdx / 12,
                    seq: Math.max(0, v),
                    rep: Math.max(
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
                tickFormatter={(v) => fmtEUR(v as number)}
                width={70}
              />
              <RechartsTooltip
                formatter={(value: number) => fmtEUR(value)}
                labelFormatter={(l) => `Edad ${Math.round(l as number)}`}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <ReferenceLine
                x={config.retirementAge}
                stroke="#e11d48"
                strokeDasharray="3 3"
                label={{
                  value: "Jubilación",
                  position: "top",
                  fontSize: 10,
                  fill: "#e11d48",
                }}
              />
              <Line
                type="monotone"
                dataKey="rep"
                stroke="#1d4ed8"
                strokeWidth={2}
                dot={false}
                name="Trayectoria típica"
              />
              <Line
                type="monotone"
                dataKey="seq"
                stroke="#dc2626"
                strokeWidth={2.5}
                dot={false}
                name="Con sequence risk"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Captura de lead — descarga PDF */}
      <DownloadReportSection config={config} results={results} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sección de descarga PDF — pide email + nombre, suscribe a Beehiiv y descarga
// -----------------------------------------------------------------------------

function DownloadReportSection({
  config,
  results,
}: {
  config: ParametricConfig;
  results: ParametricResult;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !consent) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // 1) Suscribir lead a Beehiiv (server-side)
      const res = await fetch("/api/simulador-retiro/informe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          consent: true,
          planSummary: {
            capitalInicial: config.initialCapital,
            edadActual: config.currentAge,
            edadJubilacion: config.retirementAge,
            probExito: results.successProbability,
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      // 2) Generar PDF en cliente y forzar descarga
      const { generateInformePdf } = await import(
        "@/lib/pdf-informe-retiro-client"
      );
      const doc = generateInformePdf({
        subscriberName: name.trim() || undefined,
        config,
        results,
      });
      const fileName = `Informe_Jubilacion_K_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      doc.save(fileName);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo generar el informe: ${err.message}`
          : "Error desconocido"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (done) {
    return (
      <section className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 sm:p-8 text-center">
        <div className="text-4xl mb-2">✅</div>
        <h3 className="text-lg font-semibold text-emerald-800 font-serif mb-1">
          Tu informe ya está descargado
        </h3>
        <p className="text-sm text-emerald-900 max-w-md mx-auto leading-relaxed">
          Si no lo encuentras, revisa la carpeta de descargas del navegador.
          También te llegará por email contenido educativo cada semana — el
          siguiente paso para hacer este plan realidad.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-gradient-to-br from-rose-50 via-white to-amber-50 border-2 border-rose-200 rounded-2xl p-6 sm:p-8 shadow-sm">
      <div className="text-center mb-5">
        <div className="text-4xl mb-2">📄</div>
        <h3 className="text-xl sm:text-2xl font-bold text-slate-900 font-serif">
          Llévate este análisis en PDF
        </h3>
        <p className="text-sm text-slate-600 mt-2 max-w-2xl mx-auto leading-relaxed">
          Tu plan con todos los gráficos, las tablas de retiros seguros y un
          resumen ejecutivo — para guardar, revisar con calma o compartir con
          tu pareja. Y entrarás a la newsletter de El Proyecto K para seguir
          construyendo tu plan.
        </p>
      </div>

      <form
        onSubmit={handleDownload}
        className="max-w-xl mx-auto space-y-3"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre (opcional)"
          disabled={isSubmitting}
          className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400 disabled:bg-slate-50"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          placeholder="Tu email *"
          required
          disabled={isSubmitting}
          className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
            error
              ? "border-red-300 bg-red-50 focus:ring-red-300"
              : "border-slate-300 focus:ring-rose-300 focus:border-rose-400"
          } disabled:bg-slate-50`}
        />
        <label className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={isSubmitting}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-300"
          />
          <span>
            Acepto recibir el informe en PDF y la newsletter de El Proyecto K
            con contenido educativo sobre inversión indexada. Puedo darme de
            baja en cualquier momento.{" "}
            <a
              href="https://elproyectok.com/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-600 hover:underline"
            >
              Política de privacidad
            </a>
            .
          </span>
        </label>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900">
            ⚠ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !email.trim() || !consent}
          className={`w-full py-3 text-sm font-semibold rounded-lg transition-colors ${
            isSubmitting || !email.trim() || !consent
              ? "bg-slate-200 text-slate-500 cursor-not-allowed"
              : "bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
          }`}
        >
          {isSubmitting ? "Generando informe…" : "📥 Descargar informe PDF"}
        </button>

        <p className="text-[10px] text-slate-500 text-center">
          Generamos el PDF al instante. Sin spam, sin compartir tu email con
          terceros.
        </p>
      </form>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Utilities UI
// -----------------------------------------------------------------------------

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
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
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
      />
      {hint && <span className="block text-[10px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

function SmallNum({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
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
        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-rose-300"
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

function SmallSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-2 focus:ring-rose-300"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

function KpiBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "red" | "amber" | "slate";
}) {
  const t =
    tone === "red"
      ? "bg-red-50 border-red-200 text-red-700"
      : tone === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-slate-50 border-slate-200 text-slate-900";
  return (
    <div className={`rounded-lg p-3 border ${t}`}>
      <p className="text-[10px] font-semibold uppercase text-slate-500 mb-1">
        {label}
      </p>
      <p className="text-base font-bold font-serif">{value}</p>
      <p className="text-[10px] mt-1 text-slate-600">{sub}</p>
    </div>
  );
}

function Row({
  label,
  v,
  color,
  bold,
}: {
  label: string;
  v: number;
  color: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`${color} ${bold ? "font-semibold" : ""}`}>{label}</span>
      <span
        className={`font-mono ${color} ${bold ? "font-bold" : ""}`}
      >
        {fmtEUR(v)}
      </span>
    </div>
  );
}
