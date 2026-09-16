"use client";

// =============================================================================
// KrayFundamentales — los fundamentales de EODHD dentro de Radiografía K (beta)
// =============================================================================
//
// Dos secciones:
//   1. "Fundamentales de la cartera": TER medio ponderado, duración y TIR de la
//      parte de renta fija, PER / precio-valor contable / dividendo de la parte
//      de bolsa. Todo ponderado por el peso de cada ETF (ver kray-engine.ts).
//   2. "Ficha de cada ETF": coste, patrimonio, índice, estrellas Morningstar,
//      rentabilidades y volatilidad, tal como los da EODHD.
//
// Solo se pinta si el motor devolvió `fundamentales` (ETFs con datos). Los
// fondos bancarios (sin fundamentales en EODHD) salen en la tabla con lo que
// hay: peso y TER de nuestra base.
// =============================================================================

import type { KrayFicha, KrayFundamentales as Datos } from "@/lib/kray-types";

function n(v: number | null | undefined, dec = 2, sufijo = ""): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + sufijo;
}
function millones(v: number | undefined): string {
  if (!v || !Number.isFinite(v)) return "—";
  if (v >= 1e9) return n(v / 1e9, 1, " mil M");
  return n(v / 1e6, 0, " M");
}
function estrellas(k: number | undefined): string {
  if (!k) return "—";
  return "★".repeat(Math.max(0, Math.min(5, Math.round(k))));
}

function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: "emerald" | "amber" | "sky" | "red" }) {
  const col = color === "emerald" ? "text-emerald-700" : color === "amber" ? "text-amber-700" : color === "sky" ? "text-sky-700" : color === "red" ? "text-red-700" : "text-brand-navy";
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-tertiary">{label}</p>
      <p className={`text-xl font-semibold font-serif mt-1 ${col}`}>{value}</p>
      {hint && <p className="text-[10px] text-brand-tertiary mt-0.5">{hint}</p>}
    </div>
  );
}

export function KrayFundamentales({ datos }: { datos: Datos }) {
  const { costes, rentaFija, valoracion, fichas, saqueo } = datos;
  const is = saqueo.indice;
  const isTexto = is === null ? "—" : !Number.isFinite(is) ? "∞" : n(is, 1, " %");
  const isColor: "emerald" | "amber" | "red" | undefined = is === null ? undefined : !Number.isFinite(is) || is > 25 ? "red" : is > 10 ? "amber" : "emerald";
  const conFicha = fichas.filter((f) => f.conDatos).length;

  return (
    <>
      <section
        id="section-fundamentales"
        className="scroll-mt-24 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
      >
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h3 className="text-lg font-semibold text-brand-navy font-serif">Fundamentales de la cartera</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-100">beta</span>
        </div>
        <p className="text-xs text-brand-tertiary mb-4">
          Datos de EODHD por ETF, ponderados por su peso en la cartera. {conFicha} de {fichas.length} fondos con ficha.
          Los ratios de valoración se agregan con media armónica (como Morningstar); la renta fija, sobre la parte de bonos de cada fondo.
          El Índice de Saqueo es la fórmula de la app: TER medio entre la rentabilidad esperada (mín(volatilidad, 15 %) × 0,75). Los fondos europeos toman su TER de la ficha pública de FT.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <Kpi label="TER medio" value={n(costes.terMedio, 2, " %")} hint={`sobre el ${n(costes.pesoConTer, 0)} % con dato`} color="emerald" />
          <Kpi
            label="Índice de Saqueo"
            value={isTexto}
            hint={saqueo.vol === null ? "falta la volatilidad" : `vol. ${n(saqueo.vol * 100, 1, " %")} ${saqueo.volFuente === "backtest" ? "del backtest" : "media EODHD (aprox.)"}`}
            color={isColor}
          />
          <Kpi label="Duración RF" value={rentaFija ? n(rentaFija.duracion, 1, " años") : "—"} hint={rentaFija ? `bonos: ${n(rentaFija.peso, 0)} % de la cartera` : "sin renta fija con datos"} color="amber" />
          <Kpi label="TIR de la RF" value={rentaFija ? n(rentaFija.ytm, 2, " %") : "—"} hint={rentaFija && rentaFija.cupon !== null ? `cupón medio ${n(rentaFija.cupon, 2, " %")}` : undefined} color="amber" />
          <Kpi label="PER (bolsa)" value={valoracion ? n(valoracion.per, 1) : "—"} hint={valoracion ? `bolsa: ${n(valoracion.peso, 0)} % de la cartera` : "sin bolsa con datos"} color="sky" />
          <Kpi label="Precio / valor contable" value={valoracion ? n(valoracion.pb, 2) : "—"} hint={valoracion && valoracion.ps !== null ? `precio/ventas ${n(valoracion.ps, 2)}` : undefined} color="sky" />
          <Kpi label="Rent. por dividendo" value={valoracion ? n(valoracion.dividendo, 2, " %") : "—"} color="sky" />
        </div>
      </section>

      <section
        id="section-fichas"
        className="scroll-mt-24 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
      >
        <h3 className="text-lg font-semibold text-brand-navy font-serif mb-1">Ficha de cada ETF</h3>
        <p className="text-xs text-brand-tertiary mb-4">
          Lo que EODHD sabe de cada pieza: coste, patrimonio, índice que replica, estrellas Morningstar, rentabilidades anualizadas y volatilidad.
          Los fondos de inversión americanos traen ficha (sin índice, volatilidad ni duración: en su lugar, la categoría); los europeos no tienen ficha en EODHD y salen con el TER de nuestra base.
        </p>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-brand-tertiary border-b border-slate-100">
                <th className="text-left py-2 px-2 font-semibold">Fondo</th>
                <th className="text-right py-2 px-2 font-semibold">Peso</th>
                <th className="text-right py-2 px-2 font-semibold">TER</th>
                <th className="text-right py-2 px-2 font-semibold">Patrimonio</th>
                <th className="text-left py-2 px-2 font-semibold">Índice</th>
                <th className="text-center py-2 px-2 font-semibold" title="Estrellas Morningstar">★</th>
                <th className="text-right py-2 px-2 font-semibold">1 año</th>
                <th className="text-right py-2 px-2 font-semibold">3 años</th>
                <th className="text-right py-2 px-2 font-semibold">5 años</th>
                <th className="text-right py-2 px-2 font-semibold">Vol. 3a</th>
                <th className="text-right py-2 px-2 font-semibold" title="Índice de Saqueo del fondo: TER / (min(vol 3a, 15 %) × 0,75)">I. Saqueo</th>
                <th className="text-right py-2 px-2 font-semibold">Dur. / PER</th>
              </tr>
            </thead>
            <tbody>
              {fichas.map((f: KrayFicha) => (
                <tr key={f.fundId} className={`border-b border-slate-50 last:border-b-0 ${f.conDatos ? "" : "text-brand-tertiary"}`}>
                  <td className="py-2 px-2">
                    <span className="font-medium text-brand-navy">{f.fundName}</span>
                    {f.isin && <span className="block text-[10px] font-mono text-brand-tertiary">{f.isin}{f.listado ? ` · ${f.listado}` : ""}</span>}
                    {!f.conDatos && <span className="block text-[10px] text-amber-700">sin ficha en EODHD ni FT</span>}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">{n(f.weight, 2, " %")}</td>
                  <td className="py-2 px-2 text-right font-mono" title={f.listado === "FT" ? "gastos corrientes según FT" : undefined}>{n(f.ter, 2, " %")}{f.listado === "FT" ? <span className="text-[9px] text-brand-tertiary ml-0.5">FT</span> : null}</td>
                  <td className="py-2 px-2 text-right font-mono">{millones(f.aum)}</td>
                  <td className="py-2 px-2 max-w-[220px] truncate" title={f.indice ?? f.categoria ?? ""}>{f.indice ?? (f.categoria ? <span className="text-brand-tertiary">{f.categoria}</span> : "—")}</td>
                  <td className="py-2 px-2 text-center text-amber-500 whitespace-nowrap" title={f.categoria ?? ""}>{estrellas(f.estrellas)}</td>
                  <td className="py-2 px-2 text-right font-mono">{n(f.rentab?.a1, 1, " %")}</td>
                  <td className="py-2 px-2 text-right font-mono">{n(f.rentab?.a3, 1, " %")}</td>
                  <td className="py-2 px-2 text-right font-mono">{n(f.rentab?.a5, 1, " %")}</td>
                  <td className="py-2 px-2 text-right font-mono">{n(f.vol3, 1, " %")}</td>
                  <td className={`py-2 px-2 text-right font-mono ${f.saqueo === undefined ? "" : !Number.isFinite(f.saqueo) || f.saqueo > 25 ? "text-red-700" : f.saqueo > 10 ? "text-amber-700" : "text-emerald-700"}`}>{f.saqueo === undefined ? "—" : !Number.isFinite(f.saqueo) ? "∞" : n(f.saqueo, 1, " %")}</td>
                  <td className="py-2 px-2 text-right font-mono">
                    {f.rf?.duracion !== undefined ? `${n(f.rf.duracion, 1)} a · TIR ${n(f.rf.ytm, 2, " %")}` : f.valor?.per !== undefined ? `PER ${n(f.valor.per, 1)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-brand-tertiary mt-3 italic">
          Rentabilidades anualizadas en la divisa de la cotización que usa EODHD; el patrimonio, en la divisa del fondo. Un mismo ETF puede cotizar en varias bolsas: se indica la que respondió.
        </p>
      </section>
    </>
  );
}
