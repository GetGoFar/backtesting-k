"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { BacktestResponse } from "@/lib/types";
import { formatEUR, formatDateLabel } from "@/lib/formatters";

// Colores para las carteras
const COLORS = {
  a: "#2563eb", // Azul
  b: "#e11d48", // Rojo/Rosa
};

interface PerformanceChartProps {
  results: BacktestResponse;
  isLoading: boolean;
}

// Extraer año de una fecha YYYY-MM
const getYear = (date: string): string => date.slice(0, 4);

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
    <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-3 min-w-[200px]">
      <p className="text-sm font-medium text-slate-600 mb-2 border-b border-slate-100 pb-2">
        {formatDateLabel(label || "")}
      </p>
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-slate-700 truncate max-w-[120px]">
                {entry.name}
              </span>
            </div>
            <span className="text-sm font-semibold text-slate-900">
              {formatEUR(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PerformanceChart({ results, isLoading }: PerformanceChartProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Evolución del patrimonio
        </h3>
        <div className="h-80 flex items-center justify-center">
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
          Evolución del patrimonio
        </h3>
        <p className="text-slate-500 text-center py-8">No hay datos suficientes para mostrar el gráfico.</p>
      </div>
    );
  }

  // Combinar datos de ambas carteras por fecha
  const dataMap = new Map<string, Record<string, number | string>>();

  for (const point of results.resultA.timeSeries) {
    dataMap.set(point.date, {
      date: point.date,
      [results.resultA.portfolioName]: point.value,
    });
  }

  for (const point of results.resultB.timeSeries) {
    const entry = dataMap.get(point.date);
    if (entry) {
      entry[results.resultB.portfolioName] = point.value;
    } else {
      dataMap.set(point.date, {
        date: point.date,
        [results.resultB.portfolioName]: point.value,
      });
    }
  }

  const chartData = Array.from(dataMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  );

  // Calcular el dominio del eje Y con margen
  const allValues = [
    ...results.resultA.timeSeries.map((p) => p.value),
    ...results.resultB.timeSeries.map((p) => p.value),
  ];
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const padding = (maxValue - minValue) * 0.05;

  // Determinar qué años mostrar en el eje X (solo enero de cada año)
  const yearTicks: string[] = [];
  const seenYears = new Set<string>();
  chartData.forEach((point) => {
    const year = getYear(point.date as string);
    if (!seenYears.has(year)) {
      seenYears.add(year);
      yearTicks.push(`${year}-01`);
    }
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Evolución del patrimonio
      </h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tickFormatter={getYear}
              tick={{ fill: "#64748b", fontSize: 12 }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
              ticks={yearTicks}
            />
            <YAxis
              tickFormatter={(value) => formatEUR(value)}
              tick={{ fill: "#64748b", fontSize: 12 }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
              domain={[Math.floor(minValue - padding), Math.ceil(maxValue + padding)]}
              width={85}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: "1rem" }}
              iconType="circle"
              formatter={(value) => (
                <span className="text-sm text-slate-700">{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey={results.resultA.portfolioName}
              name={results.resultA.portfolioName}
              stroke={COLORS.a}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: COLORS.a }}
            />
            <Line
              type="monotone"
              dataKey={results.resultB.portfolioName}
              name={results.resultB.portfolioName}
              stroke={COLORS.b}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: COLORS.b }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
