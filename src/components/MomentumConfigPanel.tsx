"use client";

// =============================================================================
// MOMENTUM CONFIG PANEL — Replica el panel "Model Configuration" de PV
// =============================================================================

import { useState } from "react";
import { Tooltip } from "./Tooltip";
import type { MomentumConfig, MomentumAsset } from "@/lib/momentum-types";

interface Props {
  config: MomentumConfig;
  onChange: (next: MomentumConfig) => void;
  onRun: () => void;
  isLoading: boolean;
  /** Lado para comparación A/B. Si está definido, cambia el color del header
   *  y oculta el botón Ejecutar (que pasa a controlarse desde la página). */
  side?: "a" | "b";
  /** Nombre legible de la estrategia, mostrado en el header A/B. */
  strategyName?: string;
  /** Callback para renombrar la estrategia. */
  onStrategyNameChange?: (next: string) => void;
}

// Colores por lado, alineados con los del PortfolioBuilder de la página de
// backtest (azul navy para A, coral rosa para B). Así A y B son
// inmediatamente reconocibles entre páginas.
const SIDE_HEADER_BG: Record<"a" | "b", string> = {
  a: "bg-brand-navy",
  b: "bg-brand-coral",
};

export function MomentumConfigPanel({
  config,
  onChange,
  onRun,
  isLoading,
  side,
  strategyName,
  onStrategyNameChange,
}: Props) {
  const [newTicker, setNewTicker] = useState("");

  function update<K extends keyof MomentumConfig>(key: K, value: MomentumConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  function addAsset() {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;
    if (config.assets.some((a) => a.ticker.toUpperCase() === ticker)) return;
    update("assets", [...config.assets, { ticker }]);
    setNewTicker("");
  }

  function removeAsset(ticker: string) {
    update(
      "assets",
      config.assets.filter((a) => a.ticker !== ticker)
    );
  }

  function loadPreset(
    preset:
      | "kx-sectorial"
      | "play-money-acciones"
      | "spdr-sectors"
      | "mag7"
      | "global-tactical"
  ) {
    if (preset === "kx-sectorial") {
      // Cartera curada por el usuario — 6 sectores SPDR + Oro como activo
      // defensivo / descorrelacionado. Pensada para Momentum.
      update("assets", [
        { ticker: "XLK", displayName: "Tecnología" },
        { ticker: "XLV", displayName: "Salud" },
        { ticker: "XLP", displayName: "Consumo Bás." },
        { ticker: "XLU", displayName: "Utilities" },
        { ticker: "XLE", displayName: "Energía" },
        { ticker: "VNQ", displayName: "Real Estate" },
        { ticker: "GLD", displayName: "Oro" },
      ]);
    } else if (preset === "play-money-acciones") {
      // Cartera curada por el usuario — mezcla amplia de acciones (tech, large
      // caps US/EU, mid caps especulativas) + algunos ETFs sectoriales/refugio
      // como diversificación.
      update("assets", [
        // Tech / software / cloud
        { ticker: "ZS", displayName: "Zscaler" },
        { ticker: "PLTR", displayName: "Palantir" },
        { ticker: "NOW", displayName: "ServiceNow" },
        { ticker: "INTU", displayName: "Intuit" },
        { ticker: "MDB", displayName: "MongoDB" },
        { ticker: "META", displayName: "Meta" },
        { ticker: "TSLA", displayName: "Tesla" },
        { ticker: "RELX", displayName: "RELX" },
        { ticker: "AMD", displayName: "AMD" },
        { ticker: "MSFT", displayName: "Microsoft" },
        { ticker: "AVGO", displayName: "Broadcom" },
        { ticker: "NVDA", displayName: "NVIDIA" },
        { ticker: "NFLX", displayName: "Netflix" },
        { ticker: "IBM", displayName: "IBM" },
        { ticker: "CRM", displayName: "Salesforce" },
        { ticker: "CSCO", displayName: "Cisco" },
        { ticker: "BABA", displayName: "Alibaba" },
        { ticker: "AMZN", displayName: "Amazon" },
        { ticker: "ORCL", displayName: "Oracle" },
        { ticker: "SAP", displayName: "SAP" },
        // Finance & other
        { ticker: "BAC", displayName: "Bank of America" },
        { ticker: "GOOG", displayName: "Alphabet" },
        { ticker: "ROOT", displayName: "Root Inc." },
        { ticker: "PANW", displayName: "Palo Alto Nw" },
        { ticker: "VRT", displayName: "Vertiv" },
        { ticker: "LLY", displayName: "Eli Lilly" },
        { ticker: "VLO", displayName: "Valero" },
        { ticker: "LOGI", displayName: "Logitech" },
        { ticker: "DELL", displayName: "Dell" },
        { ticker: "LPL", displayName: "LG Display" },
        { ticker: "CRWD", displayName: "CrowdStrike" },
        { ticker: "SMCI", displayName: "Super Micro" },
        // ETFs sectoriales / refugio
        { ticker: "XLE", displayName: "Energía" },
        { ticker: "GLD", displayName: "Oro" },
        { ticker: "VNQ", displayName: "Real Estate" },
        { ticker: "XLP", displayName: "Consumo Bás." },
        { ticker: "XLV", displayName: "Salud" },
        { ticker: "QQQ", displayName: "Nasdaq-100" },
      ]);
    } else if (preset === "spdr-sectors") {
      update("assets", [
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
      ]);
    } else if (preset === "mag7") {
      update("assets", [
        { ticker: "AAPL", displayName: "Apple" },
        { ticker: "MSFT", displayName: "Microsoft" },
        { ticker: "GOOGL", displayName: "Alphabet" },
        { ticker: "AMZN", displayName: "Amazon" },
        { ticker: "META", displayName: "Meta" },
        { ticker: "NVDA", displayName: "NVIDIA" },
        { ticker: "TSLA", displayName: "Tesla" },
      ]);
    } else if (preset === "global-tactical") {
      update("assets", [
        { ticker: "SPY", displayName: "S&P 500" },
        { ticker: "EFA", displayName: "Desarrollados ex-US" },
        { ticker: "EEM", displayName: "Emergentes" },
        { ticker: "AGG", displayName: "RF USA Agregada" },
        { ticker: "GLD", displayName: "Oro" },
        { ticker: "VNQ", displayName: "REITs USA" },
      ]);
    }
  }

  // Color del header: si estamos en modo A/B usamos el color del lado;
  // si no, mantenemos el azul navy clásico.
  const headerBg = side ? SIDE_HEADER_BG[side] : "bg-brand-navy";

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className={`${headerBg} px-6 py-4 flex items-center justify-between gap-4`}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {side && (
            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">
              {side.toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {side && onStrategyNameChange ? (
              <input
                type="text"
                value={strategyName ?? ""}
                onChange={(e) => onStrategyNameChange(e.target.value)}
                className="bg-transparent text-white font-semibold font-serif text-lg w-full focus:outline-none focus:bg-white/10 rounded px-1 -mx-1 placeholder-white/50"
                placeholder="Nombre de la estrategia"
              />
            ) : (
              <h3 className="text-white font-semibold font-serif text-lg">
                {strategyName ?? "Configuración del modelo"}
              </h3>
            )}
            <p className="text-xs text-white/70 mt-0.5">
              Relative Strength · tactical asset allocation
            </p>
          </div>
        </div>
        {/* El botón Ejecutar SOLO se muestra cuando NO estamos en modo A/B
            (el modo A/B usa un único botón "Ejecutar comparación" en la
            página, que dispara las dos estrategias en paralelo). */}
        {!side && (
          <button
            onClick={onRun}
            disabled={isLoading || config.assets.length < 2}
            className="px-5 py-2 bg-brand-coral text-white text-sm font-semibold rounded-lg hover:bg-brand-coral/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Ejecutando..." : "Ejecutar"}
          </button>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Universo de activos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-brand-navy uppercase tracking-wider flex items-center gap-1.5">
              Universo de activos
              <Tooltip content="Lista de tickers candidatos. Cada periodo se rankean por momentum y se eligen los top-K. Usa tickers de Yahoo (SPY, NVDA, XLE...) o ISIN si está en la base.">
                <InfoIcon />
              </Tooltip>
            </h4>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-brand-tertiary">Presets:</span>
              <button
                onClick={() => loadPreset("kx-sectorial")}
                className="text-[11px] font-medium px-2 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                title="6 sectores SPDR (XLK, XLV, XLP, XLU, XLE) + VNQ (REITs) + GLD (Oro)"
              >
                KX Sectorial
              </button>
              <button
                onClick={() => loadPreset("play-money-acciones")}
                className="text-[11px] font-medium px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                title="32 acciones (mayormente tech) + 6 ETFs sectoriales/refugio (XLE, GLD, VNQ, XLP, XLV, QQQ)"
              >
                Play Money Acciones
              </button>
              <button
                onClick={() => loadPreset("spdr-sectors")}
                className="text-[11px] font-medium px-2 py-1 rounded bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
              >
                Sectores SPDR
              </button>
              <button
                onClick={() => loadPreset("mag7")}
                className="text-[11px] font-medium px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
              >
                Mag 7
              </button>
              <button
                onClick={() => loadPreset("global-tactical")}
                className="text-[11px] font-medium px-2 py-1 rounded bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors"
              >
                Global Tactical
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[60px]">
            {config.assets.map((a) => (
              <span
                key={a.ticker}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-brand-navy"
              >
                <span className="font-mono font-semibold">{a.ticker}</span>
                {a.displayName && <span className="text-brand-tertiary">· {a.displayName}</span>}
                <button
                  onClick={() => removeAsset(a.ticker)}
                  className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                  aria-label={`Quitar ${a.ticker}`}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </span>
            ))}
            {config.assets.length === 0 && (
              <span className="text-xs text-brand-tertiary italic self-center">
                Añade al menos 2 tickers para empezar.
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAsset())}
              placeholder="Añade un ticker (p.ej. NVDA, SPY, IWDA.AS)..."
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral"
            />
            <button
              onClick={addAsset}
              className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy/90 transition-colors"
            >
              + Añadir
            </button>
          </div>
        </div>

        {/* Grid de parámetros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field
            label="Fecha inicio"
            tooltip="Primer mes a considerar. Si el lookback no cabe, se ajustará automáticamente."
          >
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => update("startDate", e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30"
            />
          </Field>

          <Field
            label="Fecha fin"
            tooltip="Último mes a considerar. Por defecto hoy."
          >
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => update("endDate", e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30"
            />
          </Field>

          <Field
            label="Capital inicial"
            tooltip="Importe en EUR (o la divisa de los activos). El motor no convierte FX entre activos."
          >
            <div className="relative">
              <input
                type="number"
                value={config.initialAmount}
                onChange={(e) => update("initialAmount", parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-tertiary text-sm">€</span>
            </div>
          </Field>

          <Field
            label="Lookback (meses)"
            tooltip="Periodo histórico que se usa para calcular el momentum. 12 meses es el clásico académico (Jegadeesh & Titman 1993)."
          >
            <input
              type="number"
              min={1}
              max={60}
              value={config.lookbackMonths}
              onChange={(e) => update("lookbackMonths", parseInt(e.target.value) || 12)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30"
            />
          </Field>

          <Field
            label="Excluir último mes"
            tooltip="Si activado, el lookback termina en t-1 en lugar de t. Evita el efecto de reversión a corto plazo que rompe el momentum (Jegadeesh 1990). Recomendado: Sí."
          >
            <select
              value={config.excludePreviousMonth ? "yes" : "no"}
              onChange={(e) => update("excludePreviousMonth", e.target.value === "yes")}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 bg-white"
            >
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </Field>

          <Field
            label="Método de ranking"
            tooltip="Cómo se ordenan los activos para elegir los top-N:&#10;• Momentum: solo retorno acumulado en el lookback (relative strength clásico).&#10;• Sharpe-like: retorno / volatilidad. Premia rentabilidad ajustada al riesgo y penaliza activos con buenos retornos pero muy volátiles. Es el ratio que usa el modelo 'Adaptive Asset Allocation' de Portfoliovisualizer."
          >
            <select
              value={config.rankingMethod ?? "momentum"}
              onChange={(e) =>
                update("rankingMethod", e.target.value as MomentumConfig["rankingMethod"])
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 bg-white"
            >
              <option value="momentum">Momentum (solo retorno)</option>
              <option value="sharpe">Sharpe-like (retorno / volatilidad)</option>
            </select>
          </Field>

          <Field
            label="Periodo volatilidad (meses)"
            tooltip="Ventana en meses para calcular la volatilidad anualizada. Se usa para:&#10;• El denominador del ratio Sharpe-like del ranking (si el método de ranking es Sharpe).&#10;• La ponderación inverse-volatility (si está activa).&#10;Recomendado: 3 meses (como en Portfoliovisualizer). Más corto = más reactivo, más largo = más estable."
          >
            <input
              type="number"
              min={2}
              max={36}
              value={config.volatilityPeriodMonths ?? 3}
              onChange={(e) =>
                update("volatilityPeriodMonths", Math.max(2, parseInt(e.target.value) || 3))
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30"
            />
          </Field>

          <Field
            label="Top N activos a mantener"
            tooltip="Cuántos activos se mantienen en la cartera. 1 = el más fuerte. 3 = los 3 más fuertes ponderados según el esquema elegido."
          >
            <input
              type="number"
              min={1}
              max={config.assets.length}
              value={config.assetsToHold}
              onChange={(e) =>
                update("assetsToHold", Math.max(1, parseInt(e.target.value) || 1))
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30"
            />
          </Field>

          <Field
            label="Ponderación"
            tooltip="Cómo distribuir el capital entre los top-N. Equal = mismo peso. Rank = el primero pesa más. Volatility = peso inverso a la volatilidad reciente (low-vol)."
          >
            <select
              value={config.weighting}
              onChange={(e) => update("weighting", e.target.value as MomentumConfig["weighting"])}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 bg-white"
            >
              <option value="equal">Equal weight</option>
              <option value="rank">Rank weight</option>
              <option value="volatility">Inverse volatility</option>
            </select>
          </Field>

          <Field
            label="Frecuencia"
            tooltip="Cada cuánto se re-evalúa la cartera. Mensual es el estándar. Trimestral reduce turnover (y costes) pero captura menos rotaciones rápidas."
          >
            <select
              value={config.frequency}
              onChange={(e) => update("frequency", e.target.value as MomentumConfig["frequency"])}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 bg-white"
            >
              <option value="monthly">Mensual</option>
              <option value="quarterly">Trimestral</option>
            </select>
          </Field>

          <Field
            label="Ejecución del trade"
            tooltip="Cuándo se materializa la rotación:&#10;• Último cierre del mes: ejecución instantánea al cierre del último día hábil del mes que se calcula la señal. Más optimista (no admite gap entre señal y trade).&#10;• Primer cierre del mes siguiente: la señal se calcula al cierre del mes y la orden se ejecuta el siguiente día hábil. Es el default de Portfoliovisualizer y refleja la imposibilidad real de operar exactamente en el cierre de hoy."
          >
            <select
              value={config.tradeExecution ?? "nextClose"}
              onChange={(e) =>
                update("tradeExecution", e.target.value as MomentumConfig["tradeExecution"])
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30 bg-white"
            >
              <option value="nextClose">Primer cierre del mes siguiente (PV)</option>
              <option value="lastClose">Último cierre del mes</option>
            </select>
          </Field>

          <Field
            label="Filtro MA (meses)"
            tooltip="Si > 0, solo se entra en un activo si su precio supera su media móvil de N meses. Filtro de tendencia clásico (10 meses funciona bien). 0 = sin filtro. Si todos los top-N fallan el filtro, va a CASH."
          >
            <input
              type="number"
              min={0}
              max={24}
              value={config.movingAverageMonths ?? 0}
              onChange={(e) => update("movingAverageMonths", parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30"
            />
          </Field>

          <Field
            label="Slippage por trade (%)"
            tooltip="Coste estimado por operación (spread + comisión broker). Se aplica al porcentaje de cartera rotado en cada rebalanceo. Recomendado: 0,05% para ETFs líquidos, 0,1-0,2% para acciones."
          >
            <input
              type="number"
              step={0.01}
              min={0}
              max={2}
              value={config.slippagePercent ?? 0}
              onChange={(e) => update("slippagePercent", parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/30"
            />
          </Field>

          <Field
            label="Benchmark"
            tooltip="Ticker para comparar la estrategia. Por defecto SPY (S&P 500). Dejar vacío para no mostrar benchmark."
          >
            <input
              type="text"
              value={config.benchmarkTicker ?? ""}
              onChange={(e) => update("benchmarkTicker", e.target.value.toUpperCase() || undefined)}
              placeholder="Ej. SPY"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-coral/30"
            />
          </Field>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-medium text-brand-tertiary uppercase tracking-wider mb-1.5">
        {label}
        <Tooltip content={tooltip}>
          <InfoIcon />
        </Tooltip>
      </label>
      {children}
    </div>
  );
}

function InfoIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
  );
}
