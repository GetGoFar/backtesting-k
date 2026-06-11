"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import type { BacktestResponse, AllocationSlice, PortfolioAllocation } from "@/lib/types";
import { formatPctNoSign } from "@/lib/formatters";

interface AllocationPieChartProps {
  results: BacktestResponse;
  isLoading: boolean;
}

type AllocationView = "byAssetClass" | "byCategory" | "byManagement";

const VIEW_OPTIONS: Array<{ value: AllocationView; label: string }> = [
  { value: "byAssetClass", label: "Por clase de activo" },
  { value: "byCategory", label: "Por categoría detallada" },
  { value: "byManagement", label: "Por tipo de gestión" },
];

// Paleta de colores por categoría / familia. Se asigna por orden cuando no hay match.
const CATEGORY_COLORS: Record<string, string> = {
  // Familias
  "Renta Variable": "#1d4ed8",
  "Renta Fija": "#64748b",
  "Oro": "#eab308",
  "Alternativos": "#a855f7",
  // Tipo gestión
  "Indexada": "#1d4ed8",
  "Gestión activa": "#e11d48",
  // Categorías detalladas RV
  "RV Global": "#1d4ed8",
  "RV EEUU": "#3b82f6",
  "RV Europa": "#06b6d4",
  "RV España": "#0ea5e9",
  "RV Emergentes": "#10b981",
  "RV Japón": "#ec4899",
  "RV Sectorial": "#8b5cf6",
  "RV Small Cap": "#14b8a6",
  "RV REITs": "#f97316",
  // Categorías detalladas RF
  "RF EUR Gov": "#475569",
  "RF EUR Gov Corto": "#64748b",
  "RF EUR Gov Medio": "#94a3b8",
  "RF EUR Gov Largo": "#475569",
  "RF EUR Corp": "#334155",
  "RF EUR": "#1e293b",
  "RF Inflation EUR": "#cbd5e1",
  "RF USD Gov": "#78716c",
  "RF USD Corp": "#57534e",
  "RF Flexible": "#a8a29e",
  // Otros
  "Alternativo": "#a855f7",
  "Momentum": "#7c3aed",
};

const FALLBACK_PALETTE = [
  "#1d4ed8", "#e11d48", "#10b981", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#a855f7",
];

function colorFor(label: string, idx: number): string {
  return CATEGORY_COLORS[label] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]!;
}

function PortfolioPie({
  name,
  allocation,
  view,
  colorClass,
}: {
  name: string;
  allocation: PortfolioAllocation | undefined;
  view: AllocationView;
  colorClass: "blue" | "rose" | "purple";
}) {
  const slices: AllocationSlice[] = allocation?.[view] ?? [];
  if (slices.length === 0) return null;

  const headerColor =
    colorClass === "blue" ? "text-blue-600"
    : colorClass === "rose" ? "text-rose-600"
    : "text-purple-600";

  // Preparar datos para Recharts (valores en %)
  const data = slices.map((s, idx) => ({
    name: s.label,
    value: parseFloat((s.weight * 100).toFixed(2)),
    fundShortNames: s.fundShortNames,
    color: colorFor(s.label, idx),
  }));

  // Total para verificar suma
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className={`text-base font-semibold ${headerColor} font-serif`}>
          Composición — {name}
        </h4>
        <p className="text-xs text-brand-tertiary mt-0.5">
          {slices.length} {slices.length === 1 ? "porción" : "porciones"} · Total: {total.toFixed(1)}%
        </p>
      </div>
      <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        {/* Pie chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={40}
                paddingAngle={1}
                stroke="#fff"
                strokeWidth={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number, _name: string, props: { payload?: { fundShortNames?: string[] } }) => {
                  const funds = props.payload?.fundShortNames ?? [];
                  return [
                    `${value.toFixed(2)}% (${funds.length} fondo${funds.length !== 1 ? "s" : ""})`,
                    "Peso",
                  ];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Leyenda con tabla */}
        <div className="text-sm">
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-2">
            {data.map((d) => (
              <div key={d.name} className="flex items-center justify-between gap-3 py-1 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-xs font-medium text-brand-navy truncate" title={d.fundShortNames.join(", ")}>
                    {d.name}
                  </span>
                </div>
                <span className="text-xs font-semibold text-brand-navy tabular-nums flex-shrink-0">
                  {formatPctNoSign(d.value / 100)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AllocationPieChart({ results, isLoading }: AllocationPieChartProps) {
  const [view, setView] = useState<AllocationView>("byAssetClass");

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

  // Benchmark (si lo hay): su allocation viene propagada en benchmarkAllocation.
  // Se pinta como una "cartera más" en púrpura, igual que en el resto de la app.
  const bm = resultA?.benchmark ?? resultB?.benchmark;
  const bmAllocation = bm?.benchmarkAllocation;
  const hasBenchmarkPie = !!bmAllocation &&
    (bmAllocation.byAssetClass?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Selector de vista */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-brand-navy font-serif">
            Composición de las carteras
          </h3>
          <p className="text-xs text-brand-tertiary">
            Visualiza la diversificación agrupando los fondos por clase de activo, categoría o tipo de gestión.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setView(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === opt.value
                  ? "bg-white text-brand-navy shadow-sm"
                  : "text-brand-tertiary hover:text-brand-navy"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pie charts en grid (2 cols; 3 si hay benchmark) */}
      <div className={`grid grid-cols-1 gap-4 ${hasBenchmarkPie ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {resultA && (
          <PortfolioPie
            name={resultA.portfolioName}
            allocation={resultA.allocation}
            view={view}
            colorClass="blue"
          />
        )}
        {resultB && (
          <PortfolioPie
            name={resultB.portfolioName}
            allocation={resultB.allocation}
            view={view}
            colorClass="rose"
          />
        )}
        {hasBenchmarkPie && (
          <PortfolioPie
            name={bm!.benchmarkName ?? "Benchmark"}
            allocation={bmAllocation}
            view={view}
            colorClass="purple"
          />
        )}
      </div>
    </div>
  );
}
