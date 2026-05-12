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

  // Calcular skew y kurtosis interpretativos para el subtítulo
  const { skewness, excessKurtosis } = result.metrics;
  const skewText = skewness > 0.2 ? "asimetría positiva (cola derecha)"
    : skewness < -0.2 ? "asimetría negativa (cola izquierda — más pérdidas extremas)"
    : "distribución prácticamente simétrica";
  const kurtText = excessKurtosis > 1 ? "colas más gordas que la normal (más eventos extremos)"
    : excessKurtosis < -0.5 ? "colas más finas que la normal (eventos extremos menos probables)"
    : "colas similares a una distribución normal";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className={`text-base font-semibold ${headerColor} font-serif`}>
          Distribución de retornos por {hist.periodLabel} — {result.portfolioName}
        </h4>
        <p className="text-xs text-brand-tertiary mt-0.5">
          Barras = frecuencia observada; línea negra = lo que predeciría una distribución
          normal con la misma media y volatilidad. Esta cartera tiene{" "}
          <strong>{skewText}</strong> y <strong>{kurtText}</strong>.
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
