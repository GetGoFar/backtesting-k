"use client";

// =============================================================================
// K-RAY RESULTS VIEW — Radiografía completa de cartera
// =============================================================================
//
// Renderiza el output de runKray:
//   - Resumen: nº fondos, cobertura, # holdings agregados
//   - Asset class (Equity / Bond / Cash / Other)
//   - Sectores (con barras)
//   - Regiones del mundo
//   - Países (top 15)
//   - Top 10 posiciones agregadas
//   - Duplicidades (mismo stock en 2+ fondos)
//   - Detalle por fondo (collapsible)
// =============================================================================

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { KrayFundamentales } from "@/components/KrayFundamentales";
import type { KrayResult, KraySlice, KrayHolding, KrayDuplicate } from "@/lib/kray-types";
import { formatNumber } from "@/lib/formatters";

interface Props {
  results: KrayResult;
}

function pct(v: number, decimals = 2): string {
  return `${formatNumber(v, decimals)}%`;
}

// Paleta de colores para barras horizontales (sectores, regiones).
// Cycla por todas las posiciones; orden ≠ semántica.
const BAR_COLORS = [
  "#1d4ed8", "#e11d48", "#059669", "#d97706", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#dc2626", "#0284c7",
  "#9333ea", "#16a34a", "#ea580c", "#4f46e5", "#be185d",
];

export function KrayResultsView({ results }: Props) {
  const coveredPct = results.totalCoverage;
  const fundsWithData = results.funds.filter((f) => f.available).length;
  const fundsWithoutData = results.funds.length - fundsWithData;

  return (
    <div className="space-y-8">
      {/* Avisos */}
      {results.warnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-semibold text-amber-900 mb-2">
            Fondos sin datos de composición ({results.warnings.length})
          </p>
          <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
            {results.warnings.map((w, i) => (
              <li key={i}>
                <span className="font-medium">{w.fundName}:</span> {w.message}
              </li>
            ))}
          </ul>
          {results.uncoveredWeight > 0 && (
            <p className="text-xs text-amber-700 mt-2">
              {formatNumber(results.uncoveredWeight, 1)}% de la cartera queda
              sin radiografiar. El resto del análisis se calcula sobre el{" "}
              {formatNumber(coveredPct, 1)}% que sí tiene datos.
            </p>
          )}
        </div>
      )}

      {/* Resumen */}
      <section
        id="section-overview"
        className="scroll-mt-24 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
      >
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-4">
          Resumen de la radiografía
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Cartera" value={results.portfolioName} small />
          <Stat
            label="Fondos analizados"
            value={`${fundsWithData}${
              fundsWithoutData > 0 ? ` (+${fundsWithoutData} sin datos)` : ""
            }`}
          />
          <Stat
            label="Cobertura de datos"
            value={pct(coveredPct, 1)}
            color={coveredPct >= 80 ? "emerald" : coveredPct >= 50 ? "amber" : "red"}
          />
          <Stat
            label="Posiciones únicas"
            value={results.topHoldings.length > 0 ? `${results.duplicates.length} duplicadas` : "—"}
          />
        </div>
      </section>

      {/* Fundamentales de EODHD (beta): TER, duración y TIR de la RF, valoración de la bolsa, ficha por ETF */}
      {results.fundamentales && <KrayFundamentales datos={results.fundamentales} />}

      {/* Composición: cuatro anillos, dos por fila */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {results.byAssetClass.length > 0 && (
          <SliceSection
            id="section-asset-class"
            title="Clase de activo"
            description="Bolsa, renta fija, efectivo, materias primas… sumando lo que cada fondo lleva por dentro."
            slices={results.byAssetClass}
            coverage={coveredPct}
            limit={6}
          />
        )}
        {results.bySector.length > 0 && (
          <SliceSection
            id="section-sectors"
            title="Sectores"
            description="Exposición real a tecnología, salud, energía… ponderando todos los fondos."
            slices={results.bySector}
            coverage={coveredPct}
          />
        )}
        {results.byRegion.length > 0 && (
          <SliceSection
            id="section-regions"
            title="Regiones"
            description="Dónde está invertida la cartera: Norteamérica, Europa, emergentes…"
            slices={results.byRegion}
            coverage={coveredPct}
          />
        )}
        {results.byCountry.length > 0 && (
          <SliceSection
            id="section-countries"
            title="Países"
            description="Concentración por país. En una cartera global, Estados Unidos suele pesar mucho."
            slices={results.byCountry}
            coverage={coveredPct}
            limit={9}
          />
        )}
      </div>

      {/* Top 10 posiciones: anillo (qué parte de la cartera son) + tabla */}
      {results.topHoldings.length > 0 && (
        <section
          id="section-top-holdings"
          className="scroll-mt-24 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
        >
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h3 className="text-lg font-semibold text-brand-navy font-serif">Top 10 posiciones</h3>
            <span className="text-xs text-brand-tertiary">
              {pct(results.topHoldings.reduce((sum, h) => sum + h.totalWeight, 0), 1)} de la cartera
            </span>
          </div>
          <p className="text-xs text-brand-tertiary mb-4">
            Las diez empresas o activos con más peso real, sumando lo que aportan desde cada fondo.
            Solo se conocen las diez mayores posiciones de cada fondo, así que es el suelo de la exposición, no el techo.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 items-start">
            <HoldingsDonut holdings={results.topHoldings} />
            <HoldingsTable holdings={results.topHoldings} />
          </div>
        </section>
      )}

      {/* Duplicidades */}
      <section
        id="section-duplicates"
        className="scroll-mt-24 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
      >
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
          Duplicidades entre fondos
        </h3>
        <p className="text-xs text-brand-tertiary mb-4">
          Posiciones que aparecen en MÁS DE UN fondo de tu cartera. La duplicidad
          en sí no es mala (puede ser legítima diversificación), pero conviene
          saberla — si un mismo stock pesa 5% por dos fondos, tu exposición real
          a esa empresa puede ser mucho mayor de lo que parece mirando los
          fondos por separado.
        </p>
        {results.duplicates.length === 0 ? (
          <p className="text-sm text-brand-tertiary italic">
            No se han detectado duplicidades entre los top 10 holdings de tus fondos.
          </p>
        ) : (
          <DuplicatesTable duplicates={results.duplicates} />
        )}
      </section>

      {/* Detalle por fondo */}
      <section
        id="section-funds"
        className="scroll-mt-24 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
      >
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
          Detalle por fondo
        </h3>
        <p className="text-xs text-brand-tertiary mb-4">
          Top 10 holdings de cada fondo individual. Útil para ver el contenido
          de cada fondo sin agregaciones.
        </p>
        <div className="space-y-3">
          {results.funds.map((f) => (
            <FundDetail key={f.fundId} fund={f} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  small,
}: {
  label: string;
  value: string;
  color?: "emerald" | "amber" | "red";
  small?: boolean;
}) {
  const colorClass =
    color === "emerald"
      ? "text-emerald-600"
      : color === "amber"
      ? "text-amber-600"
      : color === "red"
      ? "text-red-600"
      : "text-brand-navy";
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-[10px] sm:text-[11px] font-medium text-brand-tertiary uppercase tracking-wider mb-1">
        {label}
      </p>
      <p
        className={`${
          small ? "text-sm sm:text-base" : "text-lg sm:text-xl"
        } font-bold font-serif ${colorClass} break-words`}
      >
        {value}
      </p>
    </div>
  );
}

function SliceSection({
  id,
  title,
  description,
  slices,
  coverage,
  limit = 8,
}: {
  id: string;
  title: string;
  description: string;
  slices: KraySlice[];
  coverage: number;
  limit?: number;
}) {
  // Tarjeta de media fila: anillo a la izquierda, leyenda compacta a la derecha. Las `limit` categorías
  // mayores con color propio; el resto, agrupado en "Otros".
  const positivas = slices.filter((x) => x.weight > 0);
  const visible = positivas.slice(0, limit);
  const rest = positivas.slice(limit);
  const restWeight = rest.reduce((sum, x) => sum + x.weight, 0);
  const data = visible.map((x, i) => ({ name: x.label, value: x.weight, color: BAR_COLORS[i % BAR_COLORS.length] ?? "#94a3b8", fondos: x.contributors.length }));
  if (restWeight > 0) data.push({ name: `Otros (${rest.length})`, value: restWeight, color: "#cbd5e1", fondos: 0 });
  const total = data.reduce((sum, x) => sum + x.value, 0);
  const showAdjusted = coverage > 0 && coverage < 99;

  return (
    <section
      id={id}
      className="scroll-mt-24 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6 flex flex-col"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-brand-navy font-serif">{title}</h3>
        <span className="text-[10px] uppercase tracking-wider text-brand-tertiary whitespace-nowrap">{positivas.length} categorías</span>
      </div>
      <p className="text-[11px] text-brand-tertiary mt-0.5 mb-3 leading-snug">{description}</p>
      <div className="grid grid-cols-1 sm:grid-cols-[190px_1fr] gap-4 items-center flex-1">
        <div className="h-48 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} innerRadius={56} paddingAngle={1.5} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                formatter={(value: number, name: string) => [pct(value, 2), name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-semibold font-serif text-brand-navy leading-none">{pct(total, 0)}</span>
            <span className="text-[9px] uppercase tracking-wider text-brand-tertiary mt-1">cubierto</span>
          </div>
        </div>
        <div className="min-w-0">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2.5 py-1 border-b border-slate-50 last:border-b-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-xs font-medium text-brand-navy flex-1 truncate" title={d.name}>{d.name}</span>
              <span className="text-xs font-mono font-semibold text-brand-navy w-16 text-right">{pct(d.value, 1)}</span>
              {showAdjusted && (
                <span className="text-[10px] font-mono text-brand-tertiary w-12 text-right hidden md:inline" title="Sobre la parte de la cartera con datos">
                  {pct((d.value / coverage) * 100, 0)}
                </span>
              )}
            </div>
          ))}
          {showAdjusted && (
            <p className="text-[10px] text-brand-tertiary italic pt-1.5 hidden md:block">
              Segunda cifra: reparto del {pct(coverage, 0)} con datos como si fuera el total.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Anillo del top 10: cada posición con su color y, en gris, el resto de la cartera. */
function HoldingsDonut({ holdings }: { holdings: KrayHolding[] }) {
  const top = holdings.slice(0, 10);
  const sumaTop = top.reduce((sum, h) => sum + h.totalWeight, 0);
  const data = top.map((h, i) => ({ name: h.name, value: h.totalWeight, color: BAR_COLORS[i % BAR_COLORS.length] ?? "#94a3b8" }));
  if (sumaTop < 100) data.push({ name: "Resto de la cartera", value: 100 - sumaTop, color: "#e2e8f0" });
  return (
    <div className="h-60 relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={108} innerRadius={70} paddingAngle={1} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
            formatter={(value: number, name: string) => [pct(value, 2), name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-semibold font-serif text-brand-navy leading-none">{pct(sumaTop, 1)}</span>
        <span className="text-[9px] uppercase tracking-wider text-brand-tertiary mt-1">en las 10 mayores</span>
      </div>
    </div>
  );
}

function HoldingsTable({ holdings }: { holdings: KrayHolding[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200">
          <tr>
            <th className="text-left text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3">
              #
            </th>
            <th className="text-left text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3">
              Posición
            </th>
            <th className="text-left text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3 hidden sm:table-cell">
              Sector
            </th>
            <th className="text-right text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3">
              % en cartera
            </th>
            <th className="text-right text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3 hidden lg:table-cell">
              Vía
            </th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h, idx) => (
            <tr
              key={`${h.name}-${idx}`}
              className="border-b border-slate-100 hover:bg-slate-50/50"
            >
              <td className="py-2 px-3 text-xs font-mono text-brand-tertiary">
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }} />{idx + 1}</span>
              </td>
              <td className="py-2 px-3 text-xs">
                <div className="font-medium text-brand-navy">{h.name}</div>
                {h.code && (
                  <div className="text-[10px] font-mono text-brand-tertiary">{h.code}</div>
                )}
              </td>
              <td className="py-2 px-3 text-xs text-brand-secondary hidden sm:table-cell">
                {h.sector ?? "—"}
              </td>
              <td className="py-2 px-3 text-xs text-right font-mono font-bold text-brand-navy">
                {pct(h.totalWeight, 2)}
              </td>
              <td className="py-2 px-3 text-[11px] text-brand-tertiary hidden lg:table-cell">
                {h.inFunds.length === 1
                  ? h.inFunds[0]!.fundName
                  : `${h.inFunds.length} fondos`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DuplicatesTable({ duplicates }: { duplicates: KrayDuplicate[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200">
          <tr>
            <th className="text-left text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3">
              Posición
            </th>
            <th className="text-center text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3">
              En fondos
            </th>
            <th className="text-right text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3">
              Peso total
            </th>
            <th className="text-left text-[11px] font-semibold text-brand-tertiary uppercase tracking-wider py-2 px-3 hidden md:table-cell">
              Detalle por fondo
            </th>
          </tr>
        </thead>
        <tbody>
          {duplicates.map((d, idx) => (
            <tr
              key={`${d.name}-${idx}`}
              className="border-b border-slate-100 hover:bg-slate-50/50"
            >
              <td className="py-2 px-3 text-xs">
                <div className="font-medium text-brand-navy">{d.name}</div>
                {d.code && (
                  <div className="text-[10px] font-mono text-brand-tertiary">{d.code}</div>
                )}
              </td>
              <td className="py-2 px-3 text-xs text-center">
                <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                  {d.fundCount}
                </span>
              </td>
              <td className="py-2 px-3 text-xs text-right font-mono font-bold text-brand-navy">
                {pct(d.totalWeight, 2)}
              </td>
              <td className="py-2 px-3 text-[11px] hidden md:table-cell">
                <div className="flex flex-wrap gap-1">
                  {d.inFunds.map((f) => (
                    <span
                      key={f.fundId}
                      className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-brand-secondary"
                      title={`${f.weightInFund.toFixed(1)}% del fondo · ${f.contribution.toFixed(2)}% del total`}
                    >
                      {f.fundName} <strong>{pct(f.contribution, 2)}</strong>
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FundDetail({ fund }: { fund: KrayResult["funds"][0] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`rounded-lg border ${
        fund.available ? "border-slate-200" : "border-amber-200 bg-amber-50/30"
      } overflow-hidden`}
    >
      <button
        onClick={() => fund.available && setExpanded(!expanded)}
        disabled={!fund.available}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors disabled:cursor-not-allowed"
      >
        <div className="text-left min-w-0 flex-1">
          <p className="text-sm font-medium text-brand-navy truncate">
            {fund.fundName}
          </p>
          {fund.isin && (
            <p className="text-[10px] font-mono text-brand-tertiary">
              {fund.isin}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-mono font-semibold text-brand-navy">
            {pct(fund.weight, 2)}
          </span>
          {fund.available ? (
            <svg
              className={`w-4 h-4 text-brand-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
              Sin datos
            </span>
          )}
        </div>
      </button>
      {expanded && fund.available && fund.topHoldings.length > 0 && (
        <div className="px-4 pb-3 border-t border-slate-100">
          <p className="text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider mt-2 mb-1.5">
            Top 10 del fondo
          </p>
          <table className="w-full text-xs">
            <tbody>
              {fund.topHoldings.map((h, i) => (
                <tr key={`${h.name}-${i}`} className="border-b border-slate-50 last:border-b-0">
                  <td className="py-1 pr-3 text-brand-tertiary w-6">{i + 1}</td>
                  <td className="py-1 pr-3">
                    <span className="text-brand-navy font-medium">{h.name}</span>
                    {h.sector && (
                      <span className="text-[10px] text-brand-tertiary ml-2">· {h.sector}</span>
                    )}
                  </td>
                  <td className="py-1 text-right font-mono text-brand-navy">{pct(h.weight, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
