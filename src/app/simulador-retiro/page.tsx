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
  { label: "Cartera K10", ret: 8, vol: 11 },
  { label: "Cartera K4", ret: 5.5, vol: 7 },
  { label: "100% RV global", ret: 8, vol: 16 },
  { label: "80/20 (agresiva)", ret: 7.2, vol: 13 },
  { label: "60/40 (clásica)", ret: 6, vol: 10 },
  { label: "40/60 (moderada)", ret: 5, vol: 7 },
  { label: "20/80 (conservadora)", ret: 4, vol: 5 },
  { label: "100% RF", ret: 3, vol: 4 },
];

// -----------------------------------------------------------------------------
// Perfiles de riesgo K1-K10 (Carteras K)
// -----------------------------------------------------------------------------
// Rentabilidades NOMINALES esperadas (el simulador descuenta la inflación del
// 2.5% por separado). Curva calculada con supuestos RV 9% / RF 3.5% / Oro 5%
// por composición de cada perfil. Volatilidad estimada según exposición a RV.
// El perfil 4 (5.5%/7%) y el 10 (8.2%/13.5%) son coherentes con los presets
// "Cartera K4" y "Cartera K10".

interface KProfile {
  level: number; // 1-10
  name: string;
  ret: number; // % nominal anual
  vol: number; // % anual
}

const K_PROFILES: KProfile[] = [
  { level: 1, name: "Muy Conservador", ret: 4.3, vol: 5 },
  { level: 2, name: "Conservador", ret: 4.6, vol: 5.5 },
  { level: 3, name: "Moderado-Conservador", ret: 5.1, vol: 6 },
  { level: 4, name: "Moderado", ret: 5.5, vol: 7 },
  { level: 5, name: "Moderado-Dinámico", ret: 6.3, vol: 8 },
  { level: 6, name: "Dinámico", ret: 7.1, vol: 10 },
  { level: 7, name: "Dinámico-Agresivo", ret: 7.4, vol: 10.5 },
  { level: 8, name: "Agresivo", ret: 7.7, vol: 11.5 },
  { level: 9, name: "Muy Agresivo", ret: 7.9, vol: 12.5 },
  { level: 10, name: "Máximo Riesgo", ret: 8.2, vol: 13.5 },
];

// Perfil que se usa SIEMPRE en la fase de distribución (jubilación): K4.
const RETIREMENT_PROFILE: KProfile = K_PROFILES[3]!; // Moderado (5.5% / 7%)
// Inflación fija asumida en el modo guiado.
const GUIDED_INFLATION = 2.5;
// Horizonte del plan en el modo guiado (esperanza de vida prudente).
const GUIDED_END_AGE = 95;
// Años de transición (glide path) del perfil actual al K4 antes de jubilarse.
const GUIDED_GLIDE_YEARS = 5;
// URL del test de perfil de riesgo de El Proyecto K.
const TEST_PERFIL_URL = "https://elproyectok.com/test-perfil/";
// CTAs del final del funnel.
const TALLER_URL = "https://elproyectok.com/inscripcion/";
const CARTERAS_K_URL = "https://elproyectok.com/carteras-k/";

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
  const [mode, setMode] = useState<"guided" | "advanced">("guided");
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

    // Medir la altura REAL del contenido (no afectada por min-h-screen).
    // El root tiene `min-h-screen` (100vh) para verse bien standalone; pero
    // dentro de un iframe ese 100vh es la altura del iframe, lo que crea
    // un acoplamiento: el padre ajusta la altura → 100vh cambia → root
    // crece → se vuelve a notificar. Para romperlo, medimos el bounding
    // del primer hijo (el wrapper interno que NO tiene min-h-screen).
    const measure = (): number => {
      const inner = rootRef.current?.firstElementChild as HTMLElement | null;
      if (inner) {
        // `offsetTop + offsetHeight` da la posición Y del final del wrapper,
        // que es la altura real del contenido sin contar el min-h-screen.
        return inner.offsetTop + inner.offsetHeight;
      }
      return document.documentElement.scrollHeight;
    };

    let lastSent = 0;
    let rafId = 0;
    const sendHeight = () => {
      // Coalesce: requestAnimationFrame evita ráfagas durante reflows.
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const h = measure();
        // Solo notificar si el delta es significativo (evita loops por
        // diferencias subpíxel y rebotes del ResizeObserver).
        if (Math.abs(h - lastSent) < 4) return;
        lastSent = h;
        window.parent.postMessage(
          { type: "epk-iframe-height", height: h },
          "*"
        );
      });
    };

    sendHeight();
    // Observamos el WRAPPER INTERNO, no el root con min-h-screen. Cambios
    // del root debido al 100vh del iframe ya no disparan rebotes.
    const inner = rootRef.current?.firstElementChild as HTMLElement | null;
    const ro = new ResizeObserver(sendHeight);
    if (inner) ro.observe(inner);
    // Repetir varias veces durante el primer segundo: hay assets, fuentes
    // y layout shifts que cambian la altura final.
    const t1 = setTimeout(sendHeight, 200);
    const t2 = setTimeout(sendHeight, 600);
    const t3 = setTimeout(sendHeight, 1200);
    return () => {
      ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [results]);

  return (
    <div ref={rootRef} className="bg-slate-50 min-h-screen">
      <div className="max-w-[1200px] mx-auto p-4 sm:p-6 space-y-6">
        <Header />
        <ModeToggle mode={mode} onChange={setMode} />
        {mode === "guided" ? (
          <GuidedWizard
            onSwitchToAdvanced={(c) => {
              if (c) setConfig(c);
              setMode("advanced");
            }}
          />
        ) : (
          <>
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
          </>
        )}
        <Footer />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Toggle modo guiado / avanzado
// -----------------------------------------------------------------------------

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "guided" | "advanced";
  onChange: (m: "guided" | "advanced") => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-1.5 flex gap-1.5">
      <button
        onClick={() => onChange("guided")}
        className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-colors ${
          mode === "guided"
            ? "bg-rose-600 text-white shadow-sm"
            : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        🧭 Guiado
        <span className="hidden sm:inline font-normal opacity-80">
          {" "}
          — respondo unas preguntas
        </span>
      </button>
      <button
        onClick={() => onChange("advanced")}
        className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-colors ${
          mode === "advanced"
            ? "bg-slate-900 text-white shadow-sm"
            : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        ⚙️ Avanzado
        <span className="hidden sm:inline font-normal opacity-80">
          {" "}
          — controlo todos los parámetros
        </span>
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Lógica de cálculo del modo guiado
// -----------------------------------------------------------------------------

interface GuidedInputs {
  currentAge: number;
  retirementAge: number;
  initialCapital: number;
  monthlyContribution: number;
  profile: KProfile;
}

/** Construye una ParametricConfig completa a partir de las respuestas del
 *  wizard. Toda la complejidad (cartera de jubilación K4, glide path,
 *  inflación, horizonte) queda oculta y fijada aquí. */
function buildGuidedConfig(args: GuidedInputs): ParametricConfig {
  const goals: FinancialGoal[] =
    args.monthlyContribution > 0
      ? [
          {
            id: "guided-contrib",
            type: "contribution",
            amount: args.monthlyContribution,
            start: "immediately",
            durationType: "untilRetirement",
            inflationAdjusted: true,
          },
        ]
      : [];
  return {
    currentAge: args.currentAge,
    retirementAge: args.retirementAge,
    endAge: GUIDED_END_AGE,
    initialCapital: args.initialCapital,
    goals,
    accumulationReturn: args.profile.ret,
    accumulationVol: args.profile.vol,
    distributionReturn: RETIREMENT_PROFILE.ret,
    distributionVol: RETIREMENT_PROFILE.vol,
    glidePathYears: GUIDED_GLIDE_YEARS,
    inflationAnnualPct: GUIDED_INFLATION,
    taxMode: "none",
    numPaths: 1000,
  };
}

/** Estrategia de retiro elegida en el wizard:
 *  - "spend-all": vivirlo todo / morir con cero (SWR de Bengen, p1)
 *  - "preserve":  dejar herencia / conservar el capital (PWR perpetua) */
type WithdrawalStrategy = "spend-all" | "preserve";

/** €/mes que puede retirar según la estrategia.
 *  - SWR: escenario Bengen (p1, "peor caso plausible"). El criterio es no
 *    agotar el capital antes del final — aceptando acabar cerca de 0.
 *  - PWR: tasa perpetua mediana (CAGR real esperado). Preservar capital ya
 *    lleva un margen de seguridad incorporado, por eso usamos la mediana y
 *    no el peor 1% (la literatura de PWR lo respalda). */
function getWithdrawalValue(
  result: ParametricResult,
  strategy: WithdrawalStrategy
): number {
  if (strategy === "spend-all") {
    const s = result.withdrawalRates.scenarios.find((x) => x.key === "bengen");
    return s ? s.swr.eurPerMonth : 0;
  }
  return result.withdrawalRates.pwrPerpetual?.eurPerMonthMedian ?? 0;
}

/** Probabilidad de que el plan aguante (capital > 0 al final) si se retira
 *  `monthlyWithdrawal` €/mes. Corre una simulación adicional con la retirada
 *  como objetivo fijo. */
function computeSuccessProbability(
  config: ParametricConfig,
  monthlyWithdrawal: number
): { successProb: number; legacyMedian: number } {
  if (monthlyWithdrawal <= 0) {
    const r = runParametricRetirement(config);
    return {
      successProb: r.successProbability,
      legacyMedian: r.medianFinalValueReal,
    };
  }
  const withWithdrawal: ParametricConfig = {
    ...config,
    goals: [
      ...config.goals,
      {
        id: "guided-withdrawal",
        type: "fixedWithdrawal",
        amount: monthlyWithdrawal,
        start: "atRetirement",
        durationType: "untilEnd",
        inflationAdjusted: true,
      },
    ],
  };
  const r = runParametricRetirement(withWithdrawal);
  return {
    successProb: r.successProbability,
    legacyMedian: r.medianFinalValueReal,
  };
}

/** Modo A: cuánto podrá gastar al mes según la estrategia elegida. */
function computeMaxSpending(
  inputs: GuidedInputs,
  strategy: WithdrawalStrategy
): {
  maxMonthly: number;
  successProb: number;
  legacyMedian: number;
  config: ParametricConfig;
} {
  const config = buildGuidedConfig(inputs);
  const r = runParametricRetirement(config);
  const maxMonthly = getWithdrawalValue(r, strategy);
  const { successProb, legacyMedian } = computeSuccessProbability(
    config,
    maxMonthly
  );
  return { maxMonthly, successProb, legacyMedian, config };
}

/** Modo B: cuánto necesita aportar al mes para asegurar un gasto objetivo.
 *  Búsqueda binaria sobre la aportación (el retiro sostenible crece
 *  monótonamente con la aportación). */
function computeRequiredContribution(
  base: Omit<GuidedInputs, "monthlyContribution">,
  targetMonthly: number,
  strategy: WithdrawalStrategy
): {
  contribution: number;
  achievable: boolean;
  successProb: number;
  config: ParametricConfig;
} {
  const valueFor = (contribution: number) =>
    getWithdrawalValue(
      runParametricRetirement(
        buildGuidedConfig({ ...base, monthlyContribution: contribution })
      ),
      strategy
    );

  // ¿El capital inicial ya basta sin aportar nada?
  if (valueFor(0) >= targetMonthly) {
    const config = buildGuidedConfig({ ...base, monthlyContribution: 0 });
    const { successProb } = computeSuccessProbability(config, targetMonthly);
    return { contribution: 0, achievable: true, successProb, config };
  }

  // Techo de búsqueda
  const HI = 15000;
  if (valueFor(HI) < targetMonthly) {
    const config = buildGuidedConfig({ ...base, monthlyContribution: HI });
    return { contribution: HI, achievable: false, successProb: 0, config };
  }

  let lo = 0;
  let hi = HI;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (valueFor(mid) < targetMonthly) lo = mid;
    else hi = mid;
  }
  const contribution = Math.ceil(hi / 10) * 10;
  const config = buildGuidedConfig({ ...base, monthlyContribution: hi });
  const { successProb } = computeSuccessProbability(config, targetMonthly);
  return { contribution, achievable: true, successProb, config };
}

// -----------------------------------------------------------------------------
// Wizard guiado
// -----------------------------------------------------------------------------

type GuidedGoal = "spend" | "contribute"; // A = spend, B = contribute

interface GuidedResult {
  goal: GuidedGoal;
  strategy: WithdrawalStrategy;
  // Modo A
  maxMonthly?: number;
  legacyMedian?: number;
  // Modo B
  requiredContribution?: number;
  achievable?: boolean;
  // Común
  successProb: number;
  config: ParametricConfig;
  inputs: GuidedInputs;
  targetMonthly?: number;
}

function GuidedWizard({
  onSwitchToAdvanced,
}: {
  onSwitchToAdvanced: (config?: ParametricConfig) => void;
}) {
  const [goal, setGoal] = useState<GuidedGoal | null>(null);
  const [step, setStep] = useState(0); // 0..N
  const [currentAge, setCurrentAge] = useState("40");
  const [retirementAge, setRetirementAge] = useState("67");
  const [initialCapital, setInitialCapital] = useState("30000");
  const [monthlyAmount, setMonthlyAmount] = useState(""); // aportación (A) u objetivo (B)
  const [profileLevel, setProfileLevel] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<WithdrawalStrategy | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<GuidedResult | null>(null);

  const reset = () => {
    setGoal(null);
    setStep(0);
    setMonthlyAmount("");
    setProfileLevel(null);
    setStrategy(null);
    setResult(null);
  };

  // Pasos: 0=objetivo, 1=edad, 2=jubilación, 3=capital, 4=cantidad,
  //        5=perfil, 6=estrategia (vivirlo todo / dejar herencia)
  const STEPS = 7;

  const runCalc = () => {
    const strat: WithdrawalStrategy = strategy ?? "spend-all";
    const inputs: GuidedInputs = {
      currentAge: Math.round(Number(currentAge) || 0),
      retirementAge: Math.round(Number(retirementAge) || 0),
      initialCapital: Math.max(0, Number(initialCapital) || 0),
      monthlyContribution: goal === "contribute" ? 0 : Number(monthlyAmount) || 0,
      profile: K_PROFILES[(profileLevel ?? 4) - 1] ?? RETIREMENT_PROFILE,
    };
    setCalculating(true);
    setTimeout(() => {
      try {
        if (goal === "spend") {
          const { maxMonthly, successProb, legacyMedian, config } =
            computeMaxSpending(inputs, strat);
          setResult({
            goal: "spend",
            strategy: strat,
            maxMonthly,
            legacyMedian,
            successProb,
            config,
            inputs,
          });
        } else {
          const target = Number(monthlyAmount) || 0;
          const { contribution, achievable, successProb, config } =
            computeRequiredContribution(inputs, target, strat);
          setResult({
            goal: "contribute",
            strategy: strat,
            requiredContribution: contribution,
            achievable,
            successProb,
            config,
            inputs,
            targetMonthly: target,
          });
        }
      } finally {
        setCalculating(false);
      }
    }, 30);
  };

  // ---- Pantalla de resultado ----
  if (result) {
    return (
      <GuidedResultScreen
        result={result}
        onRestart={reset}
        onAdvanced={() => onSwitchToAdvanced(result.config)}
      />
    );
  }

  // ---- Pantalla de cálculo ----
  if (calculating) {
    return (
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
        <div className="animate-spin text-4xl mb-4">⏳</div>
        <p className="text-slate-700 font-semibold">
          Calculando 1.000 escenarios de mercado…
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {goal === "contribute"
            ? "Buscando la aportación exacta que necesitas."
            : "Estimando tu retiro seguro."}
        </p>
      </section>
    );
  }

  // ---- Wizard de preguntas ----
  const canNext = (): boolean => {
    if (step === 0) return goal !== null;
    if (step === 1) {
      const a = Number(currentAge);
      return a >= 18 && a <= 75;
    }
    if (step === 2) {
      const r = Number(retirementAge);
      return r > Number(currentAge) && r <= 80;
    }
    if (step === 3) return Number(initialCapital) >= 0 && initialCapital !== "";
    if (step === 4) return Number(monthlyAmount) > 0;
    if (step === 5) return profileLevel !== null;
    if (step === 6) return strategy !== null;
    return false;
  };

  const next = () => {
    if (step === STEPS - 1) {
      runCalc();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-8">
      {/* Barra de progreso */}
      <div className="flex items-center gap-1.5 mb-6">
        {Array.from({ length: STEPS }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-rose-500" : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      <div className="min-h-[260px] flex flex-col">
        {step === 0 && (
          <GuidedStepGoal goal={goal} onSelect={setGoal} />
        )}
        {step === 1 && (
          <GuidedStepNumber
            emoji="🎂"
            question="¿Qué edad tienes?"
            value={currentAge}
            onChange={setCurrentAge}
            suffix="años"
            hint="Tu edad actual."
          />
        )}
        {step === 2 && (
          <GuidedStepNumber
            emoji="🏖️"
            question="¿A qué edad esperas jubilarte?"
            value={retirementAge}
            onChange={setRetirementAge}
            suffix="años"
            hint="La edad en la que dejarás de aportar y empezarás a vivir de la cartera."
          />
        )}
        {step === 3 && (
          <GuidedStepNumber
            emoji="💰"
            question="¿Con qué capital inicial cuentas?"
            value={initialCapital}
            onChange={setInitialCapital}
            suffix="€"
            hint="Lo que ya tienes invertido o listo para invertir hoy. Pon 0 si empiezas de cero."
          />
        )}
        {step === 4 && goal === "spend" && (
          <GuidedStepNumber
            emoji="📥"
            question="¿Cuánto quieres aportar al mes?"
            value={monthlyAmount}
            onChange={setMonthlyAmount}
            suffix="€/mes"
            hint="Tu aportación mensual a la inversión. La ajustamos automáticamente con la inflación (2,5%) cada año."
          />
        )}
        {step === 4 && goal === "contribute" && (
          <GuidedStepNumber
            emoji="🎯"
            question="¿Cuánto quieres poder gastar al mes cuando te jubiles?"
            value={monthlyAmount}
            onChange={setMonthlyAmount}
            suffix="€/mes"
            hint="Tu objetivo de gasto mensual en la jubilación, en dinero de hoy. Calcularemos cuánto necesitas aportar para lograrlo."
          />
        )}
        {step === 5 && (
          <GuidedStepProfile
            level={profileLevel}
            onSelect={setProfileLevel}
          />
        )}
        {step === 6 && (
          <GuidedStepStrategy strategy={strategy} onSelect={setStrategy} />
        )}
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between mt-6 pt-5 border-t border-slate-100">
        <button
          onClick={() => (step === 0 ? undefined : setStep((s) => s - 1))}
          disabled={step === 0}
          className={`text-sm font-medium px-4 py-2 rounded-lg ${
            step === 0
              ? "text-slate-300 cursor-not-allowed"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          ← Atrás
        </button>
        <span className="text-xs text-slate-400">
          {step + 1} / {STEPS}
        </span>
        <button
          onClick={next}
          disabled={!canNext()}
          className={`text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors ${
            canNext()
              ? "bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {step === STEPS - 1 ? "Ver resultado →" : "Siguiente →"}
        </button>
      </div>
    </section>
  );
}

// ---- Paso: elegir objetivo ----
function GuidedStepGoal({
  goal,
  onSelect,
}: {
  goal: GuidedGoal | null;
  onSelect: (g: GuidedGoal) => void;
}) {
  return (
    <div>
      <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-serif mb-1">
        ¿Qué quieres averiguar?
      </h2>
      <p className="text-sm text-slate-500 mb-5">
        Elige por dónde empezar. Luego te haré unas pocas preguntas.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => onSelect("spend")}
          className={`text-left p-4 rounded-xl border-2 transition-colors ${
            goal === "spend"
              ? "border-rose-400 bg-rose-50"
              : "border-slate-200 hover:border-rose-200"
          }`}
        >
          <div className="text-2xl mb-1">🏖️</div>
          <div className="font-semibold text-slate-900">
            ¿Cuánto podré gastar al mes?
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Me dices lo que aportas y te digo el gasto mensual que podrás
            permitirte en la jubilación.
          </div>
        </button>
        <button
          onClick={() => onSelect("contribute")}
          className={`text-left p-4 rounded-xl border-2 transition-colors ${
            goal === "contribute"
              ? "border-rose-400 bg-rose-50"
              : "border-slate-200 hover:border-rose-200"
          }`}
        >
          <div className="text-2xl mb-1">🎯</div>
          <div className="font-semibold text-slate-900">
            ¿Cuánto necesito aportar?
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Me dices cuánto quieres gastar al mes en la jubilación y te digo lo
            que tienes que aportar para lograrlo.
          </div>
        </button>
      </div>
    </div>
  );
}

// ---- Paso: pregunta numérica genérica ----
function GuidedStepNumber({
  emoji,
  question,
  value,
  onChange,
  suffix,
  hint,
}: {
  emoji: string;
  question: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  hint: string;
}) {
  return (
    <div className="flex-1 flex flex-col justify-center">
      <div className="text-3xl mb-2">{emoji}</div>
      <h2 className="text-lg sm:text-2xl font-bold text-slate-900 font-serif mb-4">
        {question}
      </h2>
      <div className="relative max-w-xs">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          className="w-full text-2xl font-bold text-slate-900 px-4 py-3 pr-16 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-rose-400"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">
          {suffix}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-3 max-w-md leading-relaxed">
        {hint}
      </p>
    </div>
  );
}

// ---- Paso: perfil de riesgo ----
function GuidedStepProfile({
  level,
  onSelect,
}: {
  level: number | null;
  onSelect: (l: number) => void;
}) {
  return (
    <div className="flex-1">
      <div className="text-3xl mb-2">📊</div>
      <h2 className="text-lg sm:text-2xl font-bold text-slate-900 font-serif mb-1">
        ¿Cuál es tu perfil de riesgo?
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Define cómo invertirás durante los años de acumulación.{" "}
        <a
          href={TEST_PERFIL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-rose-600 font-medium hover:underline"
        >
          ¿No lo sabes? Haz el test primero →
        </a>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
        {K_PROFILES.map((p) => (
          <button
            key={p.level}
            onClick={() => onSelect(p.level)}
            className={`text-left px-3 py-2 rounded-lg border transition-colors flex items-center justify-between ${
              level === p.level
                ? "border-rose-400 bg-rose-50"
                : "border-slate-200 hover:border-rose-200"
            }`}
          >
            <span className="text-sm">
              <span className="font-bold text-slate-700">{p.level}</span>
              <span className="text-slate-600"> · {p.name}</span>
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {p.ret.toFixed(1).replace(".", ",")}%
            </span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
        Al jubilarte pasaremos automáticamente tu cartera al perfil 4
        (Moderado), bajando de forma gradual durante los 5 años previos para
        proteger lo acumulado.
      </p>
    </div>
  );
}

// ---- Paso: estrategia de retiro (vivirlo todo / dejar herencia) ----
function GuidedStepStrategy({
  strategy,
  onSelect,
}: {
  strategy: WithdrawalStrategy | null;
  onSelect: (s: WithdrawalStrategy) => void;
}) {
  return (
    <div className="flex-1">
      <div className="text-3xl mb-2">🤔</div>
      <h2 className="text-lg sm:text-2xl font-bold text-slate-900 font-serif mb-1">
        Cuando te jubiles, ¿qué prefieres?
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Esto cambia cuánto puedes retirar: exprimir tu dinero da más margen;
        conservarlo deja un legado pero pide más.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => onSelect("spend-all")}
          className={`text-left p-4 rounded-xl border-2 transition-colors ${
            strategy === "spend-all"
              ? "border-rose-400 bg-rose-50"
              : "border-slate-200 hover:border-rose-200"
          }`}
        >
          <div className="text-2xl mb-1">🏖️</div>
          <div className="font-semibold text-slate-900">Vivirlo todo</div>
          <div className="text-xs text-slate-500 mt-1">
            Aprovechas tu dinero al máximo. Puede agotarse justo al final de tu
            vida — &quot;morir con cero&quot;.
          </div>
        </button>
        <button
          onClick={() => onSelect("preserve")}
          className={`text-left p-4 rounded-xl border-2 transition-colors ${
            strategy === "preserve"
              ? "border-indigo-400 bg-indigo-50"
              : "border-slate-200 hover:border-indigo-200"
          }`}
        >
          <div className="text-2xl mb-1">🎁</div>
          <div className="font-semibold text-slate-900">Dejar herencia</div>
          <div className="text-xs text-slate-500 mt-1">
            No tocas el capital: vives de los rendimientos y lo conservas
            intacto para tus herederos.
          </div>
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
        &quot;Vivirlo todo&quot; usa la regla de Bengen (retiro seguro sin
        agotarte antes de los {GUIDED_END_AGE}). &quot;Dejar herencia&quot; usa
        la tasa perpetua que mantiene tu capital en términos reales.
      </p>
    </div>
  );
}

// ---- Pantalla de resultado ----
function GuidedResultScreen({
  result,
  onRestart,
  onAdvanced,
}: {
  result: GuidedResult;
  onRestart: () => void;
  onAdvanced: () => void;
}) {
  const { inputs } = result;
  const profile = inputs.profile;
  const yearsToRet = inputs.retirementAge - inputs.currentAge;

  return (
    <section className="bg-gradient-to-br from-emerald-50 via-white to-rose-50 rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-10">
      {result.goal === "spend" ? (
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
            {result.strategy === "spend-all"
              ? "Vivirlo todo (morir con cero)"
              : "Dejar herencia (conservar el capital)"}
          </p>
          <p className="text-sm text-slate-600 mb-1">Podrás gastar hasta</p>
          <p className="text-4xl sm:text-6xl font-bold text-emerald-700 font-serif">
            {fmtEUR(result.maxMonthly ?? 0)}
            <span className="text-xl sm:text-2xl text-slate-400 font-normal">
              {" "}
              /mes
            </span>
          </p>
          <p className="text-sm text-slate-600 mt-3 max-w-lg mx-auto leading-relaxed">
            {result.strategy === "spend-all"
              ? `Durante toda tu jubilación (hasta los ${GUIDED_END_AGE} años), en dinero de hoy, exprimiendo tu capital hasta el final — incluso si te toca uno de los peores arranques de mercado.`
              : `Viviendo solo de los rendimientos, sin tocar tu capital, que se mantiene intacto en términos reales para dejarlo en herencia. En dinero de hoy.`}
          </p>
        </div>
      ) : (
        <div className="text-center">
          {result.achievable ? (
            <>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
                Para gastar {fmtEUR(result.targetMonthly ?? 0)}/mes en tu
                jubilación
              </p>
              <p className="text-sm text-slate-600 mb-1">
                {result.requiredContribution === 0
                  ? "Con tu capital actual ya te llega"
                  : "Necesitas aportar"}
              </p>
              {result.requiredContribution === 0 ? (
                <p className="text-4xl sm:text-5xl font-bold text-emerald-700 font-serif">
                  ¡Ya lo tienes! 🎉
                </p>
              ) : (
                <p className="text-4xl sm:text-6xl font-bold text-rose-600 font-serif">
                  {fmtEUR(result.requiredContribution ?? 0)}
                  <span className="text-xl sm:text-2xl text-slate-400 font-normal">
                    {" "}
                    /mes
                  </span>
                </p>
              )}
              <p className="text-sm text-slate-600 mt-3 max-w-lg mx-auto leading-relaxed">
                {result.requiredContribution === 0
                  ? `Tu capital inicial de ${fmtEUR(inputs.initialCapital)} es suficiente para ese nivel de gasto, incluso en el peor escenario. No necesitas aportar más (aunque hacerlo te daría margen extra).`
                  : `Aportando esa cantidad al mes (ajustada con la inflación) durante ${yearsToRet} años, podrás gastar ${fmtEUR(result.targetMonthly ?? 0)}/mes en tu jubilación incluso en el peor 1% de escenarios de mercado.`}
              </p>
            </>
          ) : (
            <>
              <div className="text-4xl mb-2">😬</div>
              <p className="text-2xl sm:text-3xl font-bold text-rose-700 font-serif">
                Objetivo muy ambicioso
              </p>
              <p className="text-sm text-slate-600 mt-3 max-w-lg mx-auto leading-relaxed">
                Para gastar {fmtEUR(result.targetMonthly ?? 0)}/mes harían falta
                aportaciones por encima de 15.000 €/mes con tus datos actuales.
                Prueba a retrasar la jubilación, reducir el objetivo de gasto, o
                empezar con más capital.
              </p>
            </>
          )}
        </div>
      )}

      {/* Probabilidad de éxito */}
      {!(result.goal === "contribute" && !result.achievable) && (
        <div className="mt-6 max-w-md mx-auto">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-slate-600">
              Probabilidad de que el plan aguante
            </span>
            <span
              className={`font-bold ${
                result.successProb >= 90
                  ? "text-emerald-700"
                  : result.successProb >= 75
                  ? "text-amber-600"
                  : "text-red-600"
              }`}
            >
              {result.successProb.toFixed(0)}%
            </span>
          </div>
          <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                result.successProb >= 90
                  ? "bg-emerald-500"
                  : result.successProb >= 75
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${Math.min(100, result.successProb)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 text-center">
            En {result.successProb.toFixed(0)} de cada 100 escenarios de mercado
            simulados, tu dinero llega hasta los {GUIDED_END_AGE} años
            {result.strategy === "preserve"
              ? " conservando tu capital"
              : ""}
            .
          </p>
        </div>
      )}

      {/* Resumen del plan */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div className="bg-white/70 rounded-lg p-2.5 border border-slate-100">
          <div className="text-[10px] uppercase text-slate-400 font-semibold">
            Edad / Jubilación
          </div>
          <div className="text-sm font-bold text-slate-700 mt-0.5">
            {inputs.currentAge} → {inputs.retirementAge}
          </div>
        </div>
        <div className="bg-white/70 rounded-lg p-2.5 border border-slate-100">
          <div className="text-[10px] uppercase text-slate-400 font-semibold">
            Capital inicial
          </div>
          <div className="text-sm font-bold text-slate-700 mt-0.5">
            {fmtEUR(inputs.initialCapital)}
          </div>
        </div>
        <div className="bg-white/70 rounded-lg p-2.5 border border-slate-100">
          <div className="text-[10px] uppercase text-slate-400 font-semibold">
            Tu perfil
          </div>
          <div className="text-sm font-bold text-slate-700 mt-0.5">
            {profile.level} · {profile.ret.toFixed(1).replace(".", ",")}%
          </div>
        </div>
        <div className="bg-white/70 rounded-lg p-2.5 border border-slate-100">
          <div className="text-[10px] uppercase text-slate-400 font-semibold">
            En jubilación
          </div>
          <div className="text-sm font-bold text-slate-700 mt-0.5">
            Perfil 4
          </div>
        </div>
      </div>

      {/* CTA — cierre del funnel hacia el taller / Carteras K */}
      <div className="mt-7 bg-slate-900 rounded-xl p-5 sm:p-6 text-center">
        <h3 className="text-lg sm:text-xl font-bold text-white font-serif">
          {result.goal === "contribute" && !result.achievable
            ? "Hablemos de tu plan"
            : "¿Y ahora cómo lo hago realidad?"}
        </h3>
        <p className="text-sm text-slate-300 mt-2 max-w-xl mx-auto leading-relaxed">
          Tener el número es el primer paso. El siguiente es construir la
          cartera, mantener la disciplina y no pagar comisiones que se coman tu
          rentabilidad. En El Proyecto K te enseñamos a hacerlo — o lo hacemos
          contigo.
        </p>
        <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={TALLER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
          >
            🎓 Apúntate al taller
          </a>
          <a
            href={CARTERAS_K_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 text-sm font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors"
          >
            Descubre las Carteras K →
          </a>
        </div>
      </div>

      {/* Acciones secundarias */}
      <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={onRestart}
          className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          ↺ Probar otros números
        </button>
        <button
          onClick={onAdvanced}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
        >
          Ver el análisis completo →
        </button>
      </div>

      <p className="text-[11px] text-slate-400 mt-5 text-center max-w-2xl mx-auto leading-relaxed">
        Cálculo sobre 1.000 simulaciones de mercado (Monte Carlo), inflación
        2,5%, horizonte hasta los {GUIDED_END_AGE} años. &quot;Peor
        escenario&quot; = peor 1% de las simulaciones. Esto es una estimación
        educativa, no asesoramiento financiero personalizado.
      </p>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Header del widget
// -----------------------------------------------------------------------------

function Header() {
  return (
    <header className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6">
      <h1 className="text-xl sm:text-3xl font-bold text-slate-900 font-serif">
        Simulador de retiro
      </h1>
      <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
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
      <div className="bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-white font-semibold font-serif text-base sm:text-lg">
          Configura tu plan
        </h2>
        <button
          onClick={onRun}
          disabled={isLoading}
          className="px-4 sm:px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {isLoading ? "Calculando…" : "▶ Simular"}
        </button>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
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

  // -----------------------------------------------------------------
  // Cálculo del retiro real planificado (suma de goals de retirada
  // activos al jubilarse). Se usa para comparar con el SWR Bengen y
  // dar contexto: "estás retirando X vs lo sostenible (SWR Bengen)".
  // -----------------------------------------------------------------
  const retiroPlanificadoEurMes = (() => {
    const K = withdrawalRates.capitalAtRetirementReal;
    let total = 0;
    for (const g of config.goals) {
      if (g.type === "contribution") continue;
      // Solo contamos goals que estén activos en jubilación
      const empezaEnJub =
        g.start === "atRetirement" ||
        g.start === "immediately" ||
        (g.start === "yearsFromNow" &&
          (g.startYearsFromNow ?? 0) <=
            config.retirementAge - config.currentAge);
      if (!empezaEnJub) continue;
      if (g.type === "fixedWithdrawal") {
        total += g.amount ?? 0;
      } else if (g.type === "percentageWithdrawal") {
        total += (K * (g.percentagePct ?? 0)) / 100 / 12;
      }
    }
    return total;
  })();

  const swrBengen =
    withdrawalRates.scenarios.find((s) => s.key === "bengen")?.swr
      .eurPerMonth ?? 0;
  const overdraw =
    retiroPlanificadoEurMes > 0 &&
    swrBengen > 0 &&
    retiroPlanificadoEurMes > swrBengen;

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
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
          <div
            className={`rounded-xl p-4 sm:p-5 border ${
              probColor === "emerald"
                ? "bg-emerald-50 border-emerald-200"
                : probColor === "amber"
                ? "bg-amber-50 border-amber-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 sm:mb-2">
              Probabilidad de éxito
            </p>
            <p
              className={`text-4xl sm:text-5xl font-bold font-serif ${
                probColor === "emerald"
                  ? "text-emerald-700"
                  : probColor === "amber"
                  ? "text-amber-700"
                  : "text-red-700"
              }`}
            >
              {successProbability.toFixed(1)}%
            </p>
            <p className="text-xs mt-1.5 sm:mt-2 text-slate-600">
              {successProbability >= 90
                ? "Plan sólido — aguanta en la inmensa mayoría de escenarios."
                : successProbability >= 70
                ? "Plan razonable — algo de riesgo de quedarte corto."
                : "Plan frágil — considera aumentar aportes o reducir retiradas."}
            </p>
          </div>
          <div className="rounded-xl p-4 sm:p-5 bg-slate-50 border border-slate-200">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 sm:mb-2">
              Patrimonio final mediano (€ reales)
            </p>
            <p className="text-2xl sm:text-3xl font-bold font-serif text-slate-900 break-all">
              {fmtEUR(medianFinalValueReal)}
            </p>
            <p className="text-xs mt-1.5 sm:mt-2 text-slate-600">
              Lo que el 50% de los paths te deja a los {config.endAge} años.
            </p>
          </div>
          <div className="rounded-xl p-4 sm:p-5 bg-slate-50 border border-slate-200">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 sm:mb-2">
              Edad mediana de agotamiento
            </p>
            <p className="text-2xl sm:text-3xl font-bold font-serif text-slate-900">
              {medianDepletionAge !== undefined
                ? `${medianDepletionAge.toFixed(1)} años`
                : "—"}
            </p>
            <p className="text-xs mt-1.5 sm:mt-2 text-slate-600">
              Entre los {depletionProbability.toFixed(1)}% que se agotan.
            </p>
          </div>
        </div>
      </section>

      {/* Fan chart */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 font-serif mb-1">
          Evolución del patrimonio (€ reales)
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Bandas año a año: p10-p25, p25-p50 (mediana), p50-p75, p75-p90. La
          línea es la mediana. Cuanto más estrecha la banda, más consistente.
        </p>
        <div className="h-72 sm:h-96 -mx-1 sm:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fanData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="age"
                tick={{ fontSize: 10, fill: "#64748b" }}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickFormatter={(v) => {
                  const n = v as number;
                  if (Math.abs(n) >= 1_000_000)
                    return `${(n / 1_000_000).toFixed(1)}M`;
                  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
                  return `${n}`;
                }}
                width={50}
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
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 font-serif">
          ¿Cuánto puedes retirar al mes?
        </h3>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
          Capital REAL mediano al jubilarte:{" "}
          <strong>{fmtEUR(withdrawalRates.capitalAtRetirementReal)}</strong>.
          Tasas calculadas path-por-path sobre{" "}
          {withdrawalRates.pathsAnalyzed} simulaciones.{" "}
          <strong className="text-emerald-700">SWR</strong> = retiro máximo que
          tu cartera puede sostener sin agotarse antes de los {config.endAge}{" "}
          años. <em>No es lo que vas a retirar — es lo máximo seguro.</em>
        </p>

        {/* Comparación: tu retiro real vs SWR Bengen */}
        {retiroPlanificadoEurMes > 0 && (
          <div
            className={`mt-4 rounded-xl border p-3 sm:p-4 ${
              overdraw
                ? "bg-red-50 border-red-200"
                : "bg-emerald-50 border-emerald-200"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p
                  className={`text-xs uppercase tracking-wider font-semibold ${
                    overdraw ? "text-red-700" : "text-emerald-700"
                  }`}
                >
                  {overdraw
                    ? "Tu retiro planificado supera lo sostenible"
                    : "Tu retiro planificado está dentro de lo sostenible"}
                </p>
                <p className="text-sm text-slate-700 mt-1 leading-relaxed">
                  {overdraw ? (
                    <>
                      Estás planeando retirar{" "}
                      <strong className="text-red-700">
                        {fmtEUR(retiroPlanificadoEurMes)}/mes
                      </strong>{" "}
                      pero tu cartera solo sostiene con seguridad (Bengen 99%)
                      hasta{" "}
                      <strong className="text-emerald-700">
                        {fmtEUR(swrBengen)}/mes
                      </strong>
                      . Por eso ves esa probabilidad de éxito. Para que
                      aguante: <strong>bájalo</strong>, <strong>aporta más</strong>,{" "}
                      o <strong>retrasa la jubilación</strong>.
                    </>
                  ) : (
                    <>
                      Estás planeando retirar{" "}
                      <strong className="text-emerald-700">
                        {fmtEUR(retiroPlanificadoEurMes)}/mes
                      </strong>{" "}
                      y tu cartera sostiene con seguridad (Bengen 99%) hasta{" "}
                      <strong className="text-emerald-700">
                        {fmtEUR(swrBengen)}/mes
                      </strong>
                      . Tienes margen.
                    </>
                  )}
                </p>
              </div>
              {overdraw && (
                <div className="bg-white rounded-lg border border-red-200 px-3 py-2 text-right whitespace-nowrap">
                  <p className="text-[10px] uppercase text-red-600 font-semibold">
                    Exceso
                  </p>
                  <p className="text-lg font-bold text-red-700 font-mono">
                    {(
                      (retiroPlanificadoEurMes / swrBengen - 1) *
                      100
                    ).toFixed(0)}
                    %
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Tabla SWR — tabla en desktop, cards en móvil */}
        {(() => {
          const getPalette = (key: string) => {
            if (key === "bengen")
              return { bg: "bg-emerald-100/60", dot: "🛡️", label: "text-emerald-800" };
            if (key === "agorero")
              return { bg: "bg-emerald-50/60", dot: "🟢", label: "text-emerald-700" };
            if (key === "conservador")
              return { bg: "bg-emerald-50/30", dot: "🟢", label: "text-emerald-600" };
            if (key === "medio")
              return { bg: "bg-amber-50/40", dot: "🟡", label: "text-amber-700" };
            return { bg: "bg-red-50/30", dot: "🔴", label: "text-red-600" };
          };
          return (
            <>
              {/* Versión tabla — md+ */}
              <div className="hidden md:block overflow-x-auto mt-4">
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
                      const palette = getPalette(s.key);
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
              {/* Versión cards — móvil */}
              <div className="md:hidden mt-4 space-y-2">
                {withdrawalRates.scenarios.map((s) => {
                  const palette = getPalette(s.key);
                  return (
                    <div
                      key={s.key}
                      className={`${palette.bg} rounded-lg border border-slate-200 p-3`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base">{palette.dot}</span>
                          <span className={`font-semibold ${palette.label}`}>
                            {s.label}
                          </span>
                        </div>
                        <span className="text-xs text-slate-600 whitespace-nowrap">
                          <strong>{s.successRatePct}%</strong>{" "}
                          <span className="text-[10px] text-slate-500">
                            (p{s.percentile})
                          </span>
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between border-t border-slate-200/60 pt-2">
                        <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
                          SWR
                        </span>
                        <div className="text-right">
                          <span className="font-mono font-bold text-emerald-700 text-base">
                            {fmtEUR(s.swr.eurPerMonth)}
                          </span>
                          <span className="text-xs text-emerald-700 ml-1">
                            /mes · {fmtPct(s.swr.pctAnnual)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          💡 <strong>Bengen</strong> sobrevive en el 99% de los escenarios
          simulados. <strong>Optimista</strong> sólo si te toca el 25% mejor.
          Si el plan que ves &quot;aguanta&quot; pero quieres dormir tranquilo,
          fija tus retiros en la cifra Bengen.
        </p>

        {/* PWR perpetua — sección dedicada
            Solo se muestra si el plan tiene posibilidades reales de durar
            (éxito >= 50%). En escenarios de ruina, hablar de "preservar
            capital" no tiene sentido conceptual — primero hay que conseguir
            que el plan no agote. */}
        {successProbability >= 50 && (
        <div className="mt-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-4 sm:p-5">
          <div className="flex items-start gap-2 sm:gap-3 mb-3">
            <div className="text-xl sm:text-2xl">♾️</div>
            <div className="flex-1">
              <h4 className="text-sm sm:text-base font-bold text-indigo-900 font-serif leading-tight">
                PWR — Tasa perpetua para preservar capital
              </h4>
              <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
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
        )}

        {/* Aviso si la PWR no se muestra por plan en ruina */}
        {successProbability < 50 && (
          <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-800">
              No se muestra la PWR (tasa perpetua para preservar capital)
            </strong>{" "}
            porque tu plan actual no alcanza el {config.endAge} con margen
            ({successProbability.toFixed(1)}% de éxito). Antes de pensar en
            preservar capital indefinidamente, primero hay que conseguir que
            el plan no se agote — ajusta retiros, aportes o edad de jubilación
            usando la cifra <strong>SWR Bengen</strong> de arriba como
            referencia.
          </div>
        )}
      </section>

      {/* Sequence risk */}
      <section className="bg-white rounded-2xl border border-red-200 shadow-sm p-4 sm:p-6">
        <div className="flex items-start gap-2 sm:gap-3 mb-4">
          <div className="text-xl sm:text-2xl">⚠️</div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-red-700 font-serif">
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
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickFormatter={(v) => {
                  const n = v as number;
                  if (Math.abs(n) >= 1_000_000)
                    return `${(n / 1_000_000).toFixed(1)}M`;
                  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
                  return `${n}`;
                }}
                width={45}
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
      <section className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 sm:p-8 text-center">
        <div className="text-3xl sm:text-4xl mb-2">✅</div>
        <h3 className="text-base sm:text-lg font-semibold text-emerald-800 font-serif mb-1">
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
    <section className="bg-gradient-to-br from-rose-50 via-white to-amber-50 border-2 border-rose-200 rounded-2xl p-4 sm:p-8 shadow-sm">
      <div className="text-center mb-4 sm:mb-5">
        <div className="text-3xl sm:text-4xl mb-2">📄</div>
        <h3 className="text-lg sm:text-2xl font-bold text-slate-900 font-serif leading-tight">
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
  // Estado local de texto para permitir borrar todos los dígitos sin que
  // React revierta al valor numérico previo. El input siempre puede quedar
  // vacío temporalmente. Cuando pierde el foco se normaliza al value externo.
  const [text, setText] = useState(String(value));
  const lastSentRef = useRef(value);
  useEffect(() => {
    if (value !== lastSentRef.current) {
      setText(String(value));
      lastSentRef.current = value;
    }
  }, [value]);
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const v = parseFloat(t);
          if (!isNaN(v)) {
            lastSentRef.current = v;
            onChange(v);
          }
        }}
        onBlur={() => {
          if (text === "" || isNaN(parseFloat(text))) {
            setText(String(value));
          }
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
  // Estado local de texto: permite borrar todo el contenido temporalmente.
  // Sin esto, parseFloat("") = NaN no propaga, React revierte al value
  // previo, y queda atrapado el primer dígito sin poder borrarse.
  const [text, setText] = useState(String(value));
  const lastSentRef = useRef(value);
  useEffect(() => {
    if (value !== lastSentRef.current) {
      setText(String(value));
      lastSentRef.current = value;
    }
  }, [value]);
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const v = parseFloat(t);
          if (!isNaN(v)) {
            lastSentRef.current = v;
            onChange(v);
          }
        }}
        onBlur={() => {
          if (text === "" || isNaN(parseFloat(text))) {
            setText(String(value));
          }
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
