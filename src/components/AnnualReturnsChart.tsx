"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import type { BacktestResponse } from "@/lib/types";
import { formatNumber } from "@/lib/formatters";

// Colores para las carteras
const COLORS = {
  a: "#2563eb", // Azul
  b: "#e11d48", // Rojo/Rosa
};

interface AnnualReturnsChartProps {
  results: BacktestResponse;
  isLoading: boolean;
}

// Formatear porcentaje con signo (valor ya es porcentaje, no decimal)
const formatPct = (value: number): string => {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}%`;
};

// Tooltip personalizado
interface TooltipPayload {
  value: number;
  dataKey: string;
  color: string;
  name: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-3 min-w-[180px]">
      <p className="text-sm font-medium text-slate-600 mb-2 border-b border-slate-100 pb-2">
        Año {label}
      </p>
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-slate-700 truncate max-w-[100px]">
                {entry.name}
              </span>
            </div>
            <span
              className={`text-sm font-semibold ${
                entry.value >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {formatPct(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnnualReturnsChart({ results, isLoading }: AnnualReturnsChartProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Rentabilidades anuales
        </h3>
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Verificar que tenemos resultados válidos
  if (!results.resultA || !results.resultB) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Rentabilidades anuales
        </h3>
        <p className="text-slate-500 text-center py-8">No hay datos suficientes.</p>
      </div>
    );
  }

  // Destructurar después de la verificación de null (ahora TypeScript sabe que no son null)
  const resultA = results.resultA;
  const resultB = results.resultB;

  // Combinar datos de ambas carteras por año
  const dataMap = new Map<number, Record<string, number>>();

  for (const annual of resultA.annualReturns) {
    dataMap.set(annual.year, {
      year: annual.year,
      [resultA.portfolioName]: annual.returnPct,
    });
  }

  for (const annual of resultB.annualReturns) {
    const entry = dataMap.get(annual.year);
    if (entry) {
      entry[resultB.portfolioName] = annual.returnPct;
    } else {
      dataMap.set(annual.year, {
        year: annual.year,
        [resultB.portfolioName]: annual.returnPct,
      });
    }
  }

  const chartData = Array.from(dataMap.values()).sort(
    (a, b) => (a.year ?? 0) - (b.year ?? 0)
  );

  // Calcular el rango del eje Y
  const allReturns = [
    ...resultA.annualReturns.map((r) => r.returnPct),
    ...resultB.annualReturns.map((r) => r.returnPct),
  ];
  const minReturn = Math.min(...allReturns, 0);
  const maxReturn = Math.max(...allReturns, 0);
  const padding = Math.max(Math.abs(minReturn), Math.abs(maxReturn)) * 0.1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Rentabilidades anuales
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fill: "#64748b", fontSize: 12 }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
            />
            <YAxis
              tickFormatter={(v) => formatPct(v)}
              tick={{ fill: "#64748b", fontSize: 12 }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
              domain={[Math.floor(minReturn - padding), Math.ceil(maxReturn + padding)]}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: "0.5rem" }}
              iconType="circle"
              formatter={(value) => (
                <span className="text-sm text-slate-700">{value}</span>
              )}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
            <Bar
              dataKey={resultA.portfolioName}
              name={resultA.portfolioName}
              fill={COLORS.a}
              radius={[4, 4, 0, 0]}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-a-${index}`}
                  fill={
                    (entry[resultA.portfolioName] ?? 0) >= 0
                      ? COLORS.a
                      : "#93c5fd"
                  }
                />
              ))}
            </Bar>
            <Bar
              dataKey={resultB.portfolioName}
              name={resultB.portfolioName}
              fill={COLORS.b}
              radius={[4, 4, 0, 0]}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-b-${index}`}
                  fill={
                    (entry[resultB.portfolioName] ?? 0) >= 0
                      ? COLORS.b
                      : "#fda4af"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
