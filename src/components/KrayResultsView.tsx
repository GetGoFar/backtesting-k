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

      {/* Asset class */}
      {results.byAssetClass.length > 0 && (
        <SliceSection
          id="section-asset-class"
          title="Por clase de activo"
          description="Cuánto de la cartera es RV (equity), RF (bond), efectivo y otros — agregando lo que cada fondo lleva por dentro."
          slices={results.byAssetClass}
          coverage={coveredPct}
        />
      )}

      {/* Sectores */}
      {results.bySector.length > 0 && (
        <SliceSection
          id="section-sectors"
          title="Composición sectorial"
          description="Suma ponderada de los sectores que llevan TODOS los fondos por dentro. Útil para ver tu exposición real a Tech, Salud, Energía, etc."
          slices={results.bySector}
          coverage={coveredPct}
        />
      )}

      {/* Regiones */}
      {results.byRegion.length > 0 && (
        <SliceSection
          id="section-regions"
          title="Composición por región"
          description="Continente / región del mundo donde está expuesta la cartera (US, Europa Desarrollada, Emergentes Asia, etc.)."
          slices={results.byRegion}
          coverage={coveredPct}
        />
      )}

      {/* Países */}
      {results.byCountry.length > 0 && (
        <SliceSection
          id="section-countries"
          title="Composición por país"
          description="Países individuales. La mayoría de carteras globales tienen un peso enorme en US — útil para detectar concentración por país."
          slices={results.byCountry}
          coverage={coveredPct}
          limit={15}
        />
      )}

      {/* Top 10 holdings */}
      {results.topHoldings.length > 0 && (
        <section
          id="section-top-holdings"
          className="scroll-mt-24 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
        >
          <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
            Top 10 posiciones agregadas
          </h3>
          <p className="text-xs text-brand-tertiary mb-4">
            Las 10 acciones / activos con MAYOR peso en tu cartera, sumando
            su aportación en cada fondo. Si ves Apple aquí con 4%, eso significa
            que entre todos los fondos que la llevan, te expones a Apple un 4% del total.
          </p>
          <HoldingsTable holdings={results.topHoldings} />
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
  limit = 10,
}: {
  id: string;
  title: string;
  description: string;
  slices: KraySlice[];
  coverage: number;
  limit?: number;
}) {
  const visible = slices.slice(0, limit);
  const rest = slices.slice(limit);
  const restWeight = rest.reduce((s, x) => s + x.weight, 0);

  // Normalizar barras: cada barra ocupa proporcionalmente al máximo (no a 100)
  // para que se vean bien aunque el sector más grande sea 30 %.
  const maxWeight = visible.length > 0 ? visible[0]!.weight : 1;

  // Coverage helper: peso del sector sobre lo CUBIERTO (no sobre 100). Útil
  // para que la suma de sectores cuadre cuando no toda la cartera tiene datos.
  // Si coverage es muy bajo, mostramos también el % "ajustado a cubierto".
  const showAdjusted = coverage > 0 && coverage < 99;

  return (
    <section
      id={id}
      className="scroll-mt-24 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
    >
      <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">
        {title}
      </h3>
      <p className="text-xs text-brand-tertiary mb-4">{description}</p>
      <div className="space-y-1.5">
        {visible.map((s, i) => {
          const adjusted = coverage > 0 ? (s.weight / coverage) * 100 : 0;
          const barWidth = (s.weight / maxWeight) * 100;
          return (
            <div key={s.label} className="group">
              <div className="flex items-center gap-3 mb-0.5">
                <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                <span className="text-sm font-medium text-brand-navy flex-1 truncate">
                  {s.label}
                </span>
                <span className="text-sm font-mono font-semibold text-brand-navy">
                  {pct(s.weight, 2)}
                </span>
                {showAdjusted && (
                  <span
                    className="text-[10px] font-mono text-brand-tertiary w-16 text-right hidden sm:inline"
                    title="Ajustado al peso CUBIERTO por datos"
                  >
                    {pct(adjusted, 1)} aj.
                  </span>
                )}
              </div>
              <div className="h-2 bg-slate-100 rounded overflow-hidden ml-6">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                  }}
                />
              </div>
            </div>
          );
        })}
        {rest.length > 0 && (
          <p className="text-xs text-brand-tertiary mt-3 italic">
            +{rest.length} categoría{rest.length === 1 ? "" : "s"} más con un
            peso combinado de {pct(restWeight, 2)}.
          </p>
        )}
      </div>
    </section>
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
              <td className="py-2 px-3 text-xs font-mono text-brand-tertiary">{idx + 1}</td>
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
