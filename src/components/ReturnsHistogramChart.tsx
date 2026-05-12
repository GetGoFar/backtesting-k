"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { BacktestResponse, BacktestResult } from "@/lib/types";
import { formatPct } from "@/lib/formatters";

interface ReturnsHistogramChartProps {
  results: BacktestResponse;
  isLoading: boolean;
}

function PortfolioHistogram({
  result,
  colorClass,
}: {
  result: BacktestResult;
  colorClass: "blue" | "rose";
}) {
  const hist = result.returnsHistogram;
  if (!hist || hist.bins.length === 0) return null;

  const headerColor = colorClass === "blue" ? "text-blue-600" : "text-rose-600";
  const barColor = colorClass === "blue" ? "#1d4ed8" : "#e11d48";

  // Preparar datos para Recharts
  const data = hist.bins.map((bin) => ({
    label: formatPct(bin.binMid, 1),
    binMid: bin.binMid,
    observado: bin.count,
    normal: parseFloat(bin.normalExpected.toFixed(2)),
  }));

  // Calcular skew y kurtosis interpretativos para el subtítulo.
  // Umbrales de Bulmer (1979): <0.5 simétrica, 0.5-1 moderada, >=1 fuerte.
  const { skewness, excessKurtosis } = result.metrics;
  const absSkew = Math.abs(skewness);
  const skewText = absSkew < 0.5
    ? `aproximadamente simétrica (skew ${skewness.toFixed(2)}, |·| < 0.5): comportamiento cercano al de una distribución normal`
    : absSkew < 1
    ? skewness < 0
      ? `moderadamente asimétrica negativa (skew ${skewness.toFixed(2)}): la cola izquierda tiene algo más de peso, sin ser extremo`
      : `moderadamente asimétrica positiva (skew ${skewness.toFixed(2)}): la cola derecha tiene algo más de peso, sin ser extremo`
    : skewness < 0
      ? `muy asimétrica negativa (skew ${skewness.toFixed(2)}, |·| ≥ 1): las pérdidas extremas pesan claramente más que las ganancias extremas`
      : `muy asimétrica positiva (skew ${skewness.toFixed(2)}, |·| ≥ 1): las ganancias extremas pesan claramente más que las pérdidas extremas`;
  const absKurt = Math.abs(excessKurtosis);
  const kurtText = absKurt < 0.5
    ? `colas similares a una distribución normal (kurtosis exceso ${excessKurtosis.toFixed(2)})`
    : absKurt < 1
    ? excessKurtosis > 0
      ? `ligeramente leptocúrtica (kurtosis exceso ${excessKurtosis.toFixed(2)}): eventos extremos un poco más frecuentes que en una normal`
      : `ligeramente platocúrtica (kurtosis exceso ${excessKurtosis.toFixed(2)}): eventos extremos un poco menos frecuentes`
    : absKurt < 3
    ? excessKurtosis > 0
      ? `moderadamente leptocúrtica (kurtosis exceso ${excessKurtosis.toFixed(2)}): colas gordas, eventos extremos notablemente más frecuentes que en una normal`
      : `moderadamente platocúrtica (kurtosis exceso ${excessKurtosis.toFixed(2)}): colas finas, eventos extremos poco frecuentes`
    : excessKurtosis > 0
      ? `MUY leptocúrtica (kurtosis exceso ${excessKurtosis.toFixed(2)}): colas extremadamente gordas — la volatilidad SUBESTIMA seriamente el riesgo de tail`
      : `muy platocúrtica (kurtosis exceso ${excessKurtosis.toFixed(2)}): casi sin colas, todos los retornos cerca de la media`;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className={`text-base font-semibold ${headerColor} font-serif`}>
          Distribución de retornos por {hist.periodLabel} — {result.portfolioName}
        </h4>
        <p className="text-xs text-brand-tertiary mt-0.5 leading-relaxed">
          Barras = frecuencia observada; línea negra = lo que predeciría una distribución
          normal con la misma media y volatilidad. Comparar ambos te dice si la cartera
          se comporta como una normal o tiene asimetría / colas anómalas.
        </p>
        <p className="text-xs text-brand-tertiary mt-2 leading-relaxed">
          <span className="font-semibold text-brand-secondary">Esta cartera presenta:</span>{" "}
          {skewText}. <br />
          <span className="font-semibold text-brand-secondary">Curtosis:</span>{" "}
          {kurtText}.
        </p>
        <p className="text-xs text-brand-tertiary mt-2 leading-relaxed italic">
          Nota: el skewness se calcula elevando las desviaciones de la media al cubo,
          así que pocos meses muy negativos (p.ej. crash de marzo 2020) pueden hacer que
          salga claramente negativo aunque visualmente el histograma parezca simétrico
          o incluso ladeado a la derecha.
        </p>
      </div>
      <div className="p-4 sm:p-6">
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
              angle={-45}
              textAnchor="end"
              height={60}
              interval={Math.max(0, Math.floor(data.length / 12))}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
              label={{
                value: `Nº de ${hist.periodLabel}s`,
                angle: -90,
                position: "insideLeft",
                style: { fill: "#64748b", fontSize: 11 },
              }}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => {
                if (name === "observado") return [`${value} ${hist.periodLabel}s`, "Frecuencia observada"];
                return [value.toFixed(2), "Frecuencia esperada (normal)"];
              }}
              labelFormatter={(label) => `Retorno: ${label}`}
            />
            <ReferenceLine x={formatPct(hist.mean, 1)} stroke="#94a3b8" strokeDasharray="5 5" label={{ value: "media", fill: "#64748b", fontSize: 10 }} />
            <Bar dataKey="observado" fill={barColor} fillOpacity={0.75} radius={[2, 2, 0, 0]} />
            <Line
              type="monotone"
              dataKey="normal"
              stroke="#0f172a"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-brand-tertiary">Media:</span>{" "}
            <span className="font-semibold text-brand-navy">{formatPct(hist.mean, 2)} por {hist.periodLabel}</span>
          </div>
          <div>
            <span className="text-brand-tertiary">Desv. estándar:</span>{" "}
            <span className="font-semibold text-brand-navy">{formatPct(hist.stdDev, 2).replace("+", "")}</span>
          </div>
          <div>
            <span className="text-brand-tertiary">Total observaciones:</span>{" "}
            <span className="font-semibold text-brand-navy">{hist.totalCount} {hist.periodLabel}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReturnsHistogramChart({ results, isLoading }: ReturnsHistogramChartProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-coral/30 border-t-brand-coral rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const { resultA, resultB } = results;
  if (!resultA && !resultB) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {resultA && <PortfolioHistogram result={resultA} colorClass="blue" />}
      {resultB && <PortfolioHistogram result={resultB} colorClass="rose" />}
    </div>
  );
}
