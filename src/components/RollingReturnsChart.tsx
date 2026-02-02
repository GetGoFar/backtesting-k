"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
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

// Colores para las carteras
const COLORS = {
  a: "#2563eb", // Azul
  b: "#e11d48", // Rojo/Rosa
};

// Opciones de ventana temporal
type RollingWindow = "1" | "3" | "5";

const WINDOW_OPTIONS: { value: RollingWindow; label: string }[] = [
  { value: "1", label: "1 año" },
  { value: "3", label: "3 años" },
  { value: "5", label: "5 años" },
];

interface RollingReturnsChartProps {
  results: BacktestResponse;
  isLoading: boolean;
}

// Extraer año de una fecha YYYY-MM
const getYear = (date: string): string => date.slice(0, 4);

// Formatear porcentaje con signo (valor ya es porcentaje)
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
  window: RollingWindow;
}

function CustomTooltip({ active, payload, label, window }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-3 min-w-[220px]">
      <p className="text-sm font-medium text-slate-600 mb-2 border-b border-slate-100 pb-2">
        {formatDateLabel(label || "")} — Ventana {window} año{window !== "1" ? "s" : ""}
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

export function RollingReturnsChart({ results, isLoading }: RollingReturnsChartProps) {
  const [selectedWindow, setSelectedWindow] = useState<RollingWindow>("3");

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Rentabilidad móvil anualizada
        </h3>
        <div className="h-80 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Obtener los datos según la ventana seleccionada
  const getWindowData = (window: RollingWindow) => {
    switch (window) {
      case "1":
        return {
          a: results.resultA.rollingReturns.oneYear,
          b: results.resultB.rollingReturns.oneYear,
        };
      case "3":
        return {
          a: results.resultA.rollingReturns.threeYear,
          b: results.resultB.rollingReturns.threeYear,
        };
      case "5":
        return {
          a: results.resultA.rollingReturns.fiveYear,
          b: results.resultB.rollingReturns.fiveYear,
        };
    }
  };

  const windowData = getWindowData(selectedWindow);

  // Combinar datos de ambas carteras por fecha
  const dataMap = new Map<string, Record<string, number | string>>();

  for (const point of windowData.a) {
    dataMap.set(point.date, {
      date: point.date,
      [results.resultA.portfolioName]: point.value * 100, // Convertir a porcentaje
    });
  }

  for (const point of windowData.b) {
    const entry = dataMap.get(point.date);
    if (entry) {
      entry[results.resultB.portfolioName] = point.value * 100;
    } else {
      dataMap.set(point.date, {
        date: point.date,
        [results.resultB.portfolioName]: point.value * 100,
      });
    }
  }

  const chartData = Array.from(dataMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  );

  // Calcular el rango del eje Y
  const allValues = [
    ...windowData.a.map((p) => p.value * 100),
    ...windowData.b.map((p) => p.value * 100),
  ];
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues, 0);
  const padding = Math.max(Math.abs(minValue), Math.abs(maxValue), 5) * 0.15;

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

  // Si no hay datos para la ventana seleccionada
  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            Rentabilidad móvil anualizada
          </h3>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedWindow(option.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  selectedWindow === option.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <svg
              className="w-12 h-12 mx-auto mb-2 text-slate-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <p>No hay datos suficientes para ventana de {selectedWindow} año{selectedWindow !== "1" ? "s" : ""}</p>
            <p className="text-sm text-slate-400 mt-1">Selecciona una ventana más corta</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">
          Rentabilidad móvil anualizada
        </h3>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedWindow(option.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                selectedWindow === option.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72">
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
              tickFormatter={(v) => formatPct(v)}
              tick={{ fill: "#64748b", fontSize: 12 }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={{ stroke: "#e2e8f0" }}
              domain={[Math.floor(minValue - padding), Math.ceil(maxValue + padding)]}
              width={60}
            />
            <Tooltip
              content={<CustomTooltip window={selectedWindow} />}
            />
            <Legend
              wrapperStyle={{ paddingTop: "0.5rem" }}
              iconType="circle"
              formatter={(value) => (
                <span className="text-sm text-slate-700">{value}</span>
              )}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
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
      <p className="text-xs text-slate-500 mt-3 text-center">
        Rentabilidad anualizada calculada sobre ventanas móviles de {selectedWindow} año{selectedWindow !== "1" ? "s" : ""}
      </p>
    </div>
  );
}
