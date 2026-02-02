"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { BacktestResponse } from "@/lib/types";
import { formatDateLabel, formatNumber } from "@/lib/formatters";

// Colores para las carteras (con transparencia para áreas)
const COLORS = {
  a: { stroke: "#2563eb", fill: "#3b82f6" }, // Azul
  b: { stroke: "#e11d48", fill: "#f43f5e" }, // Rojo/Rosa
};

interface DrawdownChartProps {
  results: BacktestResponse;
  isLoading: boolean;
}

// Extraer año de una fecha YYYY-MM
const getYear = (date: string): string => date.slice(0, 4);

// Formatear porcentaje (valor ya es porcentaje)
const formatPct = (value: number): string => {
  return `${formatNumber(value, 1)}%`;
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
            <span
              className={`text-sm font-semibold ${
                entry.value === 0 ? "text-slate-500" : "text-red-600"
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

export function DrawdownChart({ results, isLoading }: DrawdownChartProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Drawdowns (caídas desde máximos)
        </h3>
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Combinar datos de ambas carteras por fecha
  const dataMap = new Map<string, Record<string, number | string>>();

  for (const point of results.resultA.drawdowns) {
    dataMap.set(point.date, {
      date: point.date,
      [results.resultA.portfolioName]: point.drawdown,
    });
  }

  for (const point of results.resultB.drawdowns) {
    const entry = dataMap.get(point.date);
    if (entry) {
      entry[results.resultB.portfolioName] = point.drawdown;
    } else {
      dataMap.set(point.date, {
        date: point.date,
        [results.resultB.portfolioName]: point.drawdown,
      });
    }
  }

  const chartData = Array.from(dataMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  );

  // Calcular el mínimo drawdown para el dominio del eje Y
  const allDrawdowns = [
    ...results.resultA.drawdowns.map((d) => d.drawdown),
    ...results.resultB.drawdowns.map((d) => d.drawdown),
  ];
  const minDrawdown = Math.min(...allDrawdowns, 0);

  // Determinar qué años mostrar en el eje X
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
        Drawdowns (caídas desde máximos)
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="gradientA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.a.fill} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.a.fill} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gradientB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.b.fill} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.b.fill} stopOpacity={0.05} />
              </linearGradient>
            </defs>
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
              tickFormatter={(v) => formatPct(v)}
              tick={{ fill: "#64748b", fontSize: 12 }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
              domain={[Math.floor(minDrawdown * 1.1), 0]}
              width={55}
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
            <Area
              type="monotone"
              dataKey={results.resultA.portfolioName}
              name={results.resultA.portfolioName}
              stroke={COLORS.a.stroke}
              fill="url(#gradientA)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey={results.resultB.portfolioName}
              name={results.resultB.portfolioName}
              stroke={COLORS.b.stroke}
              fill="url(#gradientB)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
