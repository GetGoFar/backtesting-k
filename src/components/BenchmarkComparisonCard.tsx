"use client";

import type { BacktestResponse, BacktestResult, BenchmarkComparison } from "@/lib/types";
import { formatPct, formatRatio } from "@/lib/formatters";
import { Tooltip } from "./Tooltip";

interface BenchmarkComparisonCardProps {
  results: BacktestResponse;
  isLoading: boolean;
}

// ===========================================================================
// HELPERS — Interpretación cualitativa de cada métrica
// ===========================================================================

function interpretAlpha(alpha: number): string {
  if (alpha > 0.02) return `Bates al benchmark en ${formatPct(alpha)} anual ajustado por beta. Buena gestión.`;
  if (alpha > 0) return `Rentabilidad ligeramente superior al benchmark (${formatPct(alpha)}). Margen estrecho.`;
  if (alpha > -0.02) return `Rentabilidad prácticamente igual al benchmark ajustado por riesgo.`;
  return `Pierdes ${formatPct(Math.abs(alpha))} anual contra el benchmark. No compensas el riesgo asumido.`;
}

function interpretBeta(beta: number): string {
  if (beta > 1.2) return `Cartera AMPLIFICADA: cuando el benchmark sube 1%, tú sueles subir ${beta.toFixed(2)}% (y caer igual de fuerte).`;
  if (beta > 0.9) return `Te mueves prácticamente igual que el benchmark (β ≈ 1).`;
  if (beta > 0.5) return `Cartera AMORTIGUADA: cuando el benchmark se mueve 1%, tú solo te mueves ${beta.toFixed(2)}%.`;
  if (beta > 0) return `Cartera muy poco sensible al benchmark (β ${beta.toFixed(2)}). Diversifica mucho fuera del índice.`;
  return `Cartera INVERSA al benchmark (β negativo). Sube cuando el índice cae.`;
}

function interpretInformationRatio(ir: number): string {
  if (ir > 0.5) return "Excelente — bates al benchmark de forma consistente.";
  if (ir > 0.2) return "Bueno — bates al benchmark con cierta consistencia.";
  if (ir > 0) return "Modesto — apenas bates al benchmark, alta dependencia del azar.";
  if (ir > -0.2) return "Pierdes contra el benchmark sin ser muy consistente.";
  return "Pierdes contra el benchmark de forma consistente — cambia de estrategia.";
}

function interpretRSquared(r2: number): string {
  const pct = (r2 * 100).toFixed(0);
  if (r2 > 0.9) return `${pct}% de tus retornos los explica el benchmark. Eres casi un índice encubierto.`;
  if (r2 > 0.7) return `${pct}% explicado por el benchmark. Diversificación moderada.`;
  if (r2 > 0.5) return `${pct}% explicado por el benchmark. Cartera con identidad propia.`;
  return `Solo ${pct}% de los retornos explicados por el benchmark. Cartera muy independiente.`;
}

function interpretUpDownCapture(up: number, down: number): string {
  const upPct = (up * 100).toFixed(0);
  const downPct = (down * 100).toFixed(0);
  const ratio = down !== 0 ? up / down : 0;
  if (ratio > 1.1) return `Capturas ${upPct}% de las subidas y ${downPct}% de las caídas. Asimetría favorable.`;
  if (ratio > 0.9) return `Capturas ${upPct}% de las subidas y ${downPct}% de las caídas. Comportamiento simétrico.`;
  return `Capturas solo ${upPct}% de las subidas pero ${downPct}% de las caídas. Asimetría DESFAVORABLE.`;
}

function classifyAlpha(alpha: number): string {
  if (alpha > 0.005) return "text-emerald-600";
  if (alpha > -0.005) return "text-slate-600";
  return "text-red-600";
}

function classifyIR(ir: number): string {
  if (ir > 0.2) return "text-emerald-600";
  if (ir > -0.2) return "text-slate-600";
  return "text-red-600";
}

// ===========================================================================
// COMPONENTE
// ===========================================================================

function PortfolioBenchmarkPanel({
  result,
  colorClass,
}: {
  result: BacktestResult;
  colorClass: "blue" | "rose";
}) {
  const bm: BenchmarkComparison | undefined = result.benchmark;
  if (!bm) return null;

  const headerColor = colorClass === "blue" ? "text-blue-600" : "text-rose-600";
  const portfolioExcess = result.metrics.cagr - bm.benchmarkCagr;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className={`text-base font-semibold ${headerColor} font-serif`}>
          {result.portfolioName} vs {bm.benchmarkName}
        </h4>
        <p className="text-xs text-brand-tertiary mt-0.5">
          Comparación relativa al benchmark. Tooltips con explicación de cada ratio.
        </p>
      </div>

      {/* Resumen de rentabilidad relativa */}
      <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50/50">
        <div>
          <p className="text-xs font-medium text-brand-tertiary uppercase tracking-wider mb-1">
            Tu cartera (CAGR)
          </p>
          <p className="text-2xl font-bold font-serif text-brand-navy">{formatPct(result.metrics.cagr)}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-brand-tertiary uppercase tracking-wider mb-1">
            Benchmark (CAGR)
          </p>
          <p className="text-2xl font-bold font-serif text-brand-navy">{formatPct(bm.benchmarkCagr)}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-brand-tertiary uppercase tracking-wider mb-1">
            Exceso anualizado
          </p>
          <p className={`text-2xl font-bold font-serif ${portfolioExcess >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {portfolioExcess >= 0 ? "+" : ""}{formatPct(portfolioExcess)}
          </p>
        </div>
      </div>

      {/* Métricas relativas con tooltips e interpretación */}
      <div className="divide-y divide-slate-50">
        {/* Alpha de Jensen */}
        <MetricRow
          label="Alpha de Jensen (anual)"
          tooltip="Alpha de Jensen = (CAGR cartera - Rf) - Beta × (CAGR benchmark - Rf). Mide cuánta rentabilidad genera la cartera POR ENCIMA de lo que predice su nivel de riesgo (beta). Es la métrica reina para evaluar gestión activa. Positivo = añades valor; negativo = lo destruyes."
          value={formatPct(bm.alpha, 2)}
          interpretation={interpretAlpha(bm.alpha)}
          valueClass={classifyAlpha(bm.alpha)}
        />

        {/* Beta */}
        <MetricRow
          label="Beta"
          tooltip="Beta mide la sensibilidad de tu cartera al benchmark. Beta = 1.0 → te mueves igual que el índice. Beta > 1 → amplificas movimientos (más riesgo y más rentabilidad cuando sube). Beta < 1 → amortiguas (menos riesgo, menos rentabilidad en subidas)."
          value={bm.beta.toFixed(2)}
          interpretation={interpretBeta(bm.beta)}
        />

        {/* Tracking Error */}
        <MetricRow
          label="Tracking Error (anual)"
          tooltip="Desviación estándar anualizada de la diferencia (retorno cartera - retorno benchmark). Mide cuánto se separa tu cartera del benchmark, independientemente de la dirección. Un TE alto puede deberse a gestión activa, exposición a factores distintos, geografía diferente, o ser otro índice (ej: ACWI vs World incluye emergentes)."
          value={formatPct(bm.trackingError, 2).replace("+", "")}
          interpretation={
            bm.trackingError < 0.01
              ? `Diferencia ≈ 0% anual entre cartera y benchmark — composición prácticamente idéntica.`
              : bm.trackingError < 0.03
              ? `La cartera se desvía ${formatPct(bm.trackingError, 2).replace("+", "")} anual del benchmark — composición algo distinta (puede ser por ligera diferencia de índice o pesos).`
              : bm.trackingError < 0.08
              ? `La cartera se desvía ${formatPct(bm.trackingError, 2).replace("+", "")} anual del benchmark — perfil de exposición claramente distinto (otro índice, factores, geografía o sectores).`
              : `La cartera se desvía ${formatPct(bm.trackingError, 2).replace("+", "")} anual del benchmark — exposiciones muy diferentes. El benchmark elegido probablemente no es el más adecuado para compararla.`
          }
        />

        {/* Information Ratio */}
        <MetricRow
          label="Information Ratio"
          tooltip="Information Ratio = (CAGR cartera - CAGR benchmark) / Tracking Error. Mide la rentabilidad excedente por unidad de riesgo activo. >0.5 es excelente, >0.2 es bueno, <0 significa que pierdes contra el benchmark."
          value={formatRatio(bm.informationRatio)}
          interpretation={interpretInformationRatio(bm.informationRatio)}
          valueClass={classifyIR(bm.informationRatio)}
        />

        {/* R² */}
        <MetricRow
          label="R² (coeficiente determinación)"
          tooltip="R² mide qué porcentaje de la varianza de los retornos de tu cartera se explica por el benchmark. R² = 1 significa que la cartera es prácticamente el benchmark. R² bajo significa que la cartera tiene mucha rentabilidad ajena al benchmark — útil para confirmar diversificación o detectar 'closet indexing'."
          value={`${(bm.rSquared * 100).toFixed(1)}%`}
          interpretation={interpretRSquared(bm.rSquared)}
        />

        {/* Correlación */}
        <MetricRow
          label="Correlación con benchmark"
          tooltip="Correlación de Pearson entre los retornos de tu cartera y los del benchmark. 1 = se mueven exactamente igual. 0 = independientes. -1 = se mueven en sentido contrario."
          value={`${(bm.correlation * 100).toFixed(1)}%`}
          interpretation={
            bm.correlation > 0.9
              ? "Tu cartera se mueve casi idéntica al benchmark."
              : bm.correlation > 0.7
              ? "Alta correlación — buena parte del riesgo es sistemático del benchmark."
              : bm.correlation > 0.3
              ? "Correlación moderada — diversificación efectiva."
              : "Baja correlación — comportamiento muy independiente del benchmark."
          }
        />

        {/* Up/Down Capture */}
        <MetricRow
          label="Up / Down Capture"
          tooltip="Up Capture: cuando el benchmark sube, ¿qué % de la subida capturas? Down Capture: cuando el benchmark baja, ¿qué % de la caída sufres? El ideal es Up Capture alto (>100%) y Down Capture bajo (<100%). Cualquier cartera que tenga Down Capture > Up Capture es una mala combinación riesgo/rentabilidad."
          value={`${(bm.upCapture * 100).toFixed(0)}% / ${(bm.downCapture * 100).toFixed(0)}%`}
          interpretation={interpretUpDownCapture(bm.upCapture, bm.downCapture)}
        />
      </div>

      {/* Nota al pie: fuente de los datos */}
      <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100">
        <p className="text-xs text-brand-tertiary leading-relaxed">
          <span className="font-semibold text-brand-secondary">Fuente del benchmark:</span>{" "}
          el &quot;{bm.benchmarkName}&quot; se calcula a partir de uno o varios ETFs reales (datos EODHD).
          Los precios incluyen el TER descontado del NAV, así que las métricas reflejan lo que
          obtendrías invirtiendo en el ETF, no el índice teórico sin costes. Por eso pueden diferir
          ligeramente (~10-20 pb anuales) de fuentes como Portfolio Visualizer o Morningstar que
          usan series del índice puras.
        </p>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  tooltip,
  value,
  interpretation,
  valueClass,
}: {
  label: string;
  tooltip: string;
  value: string;
  interpretation: string;
  valueClass?: string;
}) {
  return (
    <div className="px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:bg-slate-50/30 transition-colors">
      <div className="flex items-center gap-2 sm:w-64 flex-shrink-0">
        <span className="text-sm font-medium text-brand-navy">{label}</span>
        <Tooltip content={tooltip}>
          <svg className="w-3.5 h-3.5 text-slate-300 hover:text-brand-coral transition-colors" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
          </svg>
        </Tooltip>
      </div>
      <div className="flex-shrink-0 sm:w-32">
        <span className={`text-lg font-bold font-serif tabular-nums ${valueClass ?? "text-brand-navy"}`}>
          {value}
        </span>
      </div>
      <div className="flex-1 text-xs text-brand-tertiary italic leading-snug">
        {interpretation}
      </div>
    </div>
  );
}

export function BenchmarkComparisonCard({ results, isLoading }: BenchmarkComparisonCardProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <div className="h-32 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-coral/30 border-t-brand-coral rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const { resultA, resultB } = results;
  const hasBenchmarkA = resultA?.benchmark !== undefined;
  const hasBenchmarkB = resultB?.benchmark !== undefined;

  if (!hasBenchmarkA && !hasBenchmarkB) return null;

  return (
    <div className="space-y-4">
      {hasBenchmarkA && <PortfolioBenchmarkPanel result={resultA!} colorClass="blue" />}
      {hasBenchmarkB && <PortfolioBenchmarkPanel result={resultB!} colorClass="rose" />}
    </div>
  );
}
