// =============================================================================
// API ROUTE: /api/ataraxia/carteras-k
// =============================================================================
// Resultados históricos de las Carteras K para el copiloto de Ataraxia
// (repo GetGoFar/ataraxia-bot, api/ask.js). El copiloto NUNCA envía
// composiciones: pide (familia, perfil, periodo) y esta ruta resuelve el preset
// oficial y ejecuta el motor de backtest. Así, si Pablo cambia una cartera en
// portfolio-presets.ts, Ataraxia lo ve sola.
//
//   GET  /api/ataraxia/carteras-k            -> lista de familias y perfiles
//   POST /api/ataraxia/carteras-k
//        { familia, perfil, startDate?, endDate?, periodo?, comparar? }
//        comparar: otra familia (mismo perfil) o un benchmark de la tool
//                  (msci-world, sp500-eur, global-60-40…) o un ISIN (el fondo del
//                  miembro, resuelto en la base local o en EODHD) para comparar en el tramo común
//        familia: "k-inbestme" (K Sectorial UCITS, con Utilities — la oficial)
//                 "k-geografica-ucit" (K Geográfica UCITS)
//                 "k-sectorial-usa" | "k-geografica-usa" (simulación larga con
//                   activos USA; para preguntas de 2000/2008)
//                 "indexa" (roboadvisor tradicional UCITS: sin oro, misma RF)
//                 "indexa-usa" (idem, simulación larga USA)
//        perfil: 1-10
//        periodo: "ytd" | "1y" | "3y" | "5y" | "10y" | "max" (si no hay fechas)
//
// Reglas fijas (decisión de Pablo, sept 2026): rebalanceo anual, con el TER de
// los fondos incluido, sin comisiones de transacción ni custodia, bruto de
// impuestos, 10.000 € iniciales, sin aportaciones. Devuelve un resumen compacto (no la serie completa) pensado
// para que un modelo de lenguaje lo redacte sin calcular nada.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest-engine";
import { getPresetById } from "@/lib/portfolio-presets";
import { getFundById, getFundByIsin } from "@/lib/fund-database";
import { getAllBenchmarks, getBenchmarkById } from "@/lib/benchmarks";
import type { BenchmarkId } from "@/lib/types";
import { runWithContext } from "@/lib/request-context";
import type { BacktestConfig, BacktestResult, Fund, PortfolioHolding } from "@/lib/types";

const BACKTEST_TIMEOUT_MS = 60000;

const FAMILIAS: Record<string, { nombre: string; nota: string; simulada: boolean }> = {
  "k-inbestme": {
    nombre: "Cartera K Sectorial (UCITS)",
    nota: "Cartera oficial de El Proyecto K con ETFs UCITS reales (sectoriales con Utilities, bono con duración ≈ perfil y oro). Histórico desde 2016-2017.",
    simulada: false,
  },
  "k-geografica-ucit": {
    nombre: "Cartera K Geográfica (UCITS)",
    nota: "Versión geográfica (global + emergentes) con ETFs UCITS reales.",
    simulada: false,
  },
  "k-sectorial-usa": {
    nombre: "Cartera K Sectorial (simulación USA)",
    nota: "Simulación con fondos/ETFs USA de histórico largo para ver 2000 y 2008. No es la cartera real; sirve para estudiar caídas y recuperaciones.",
    simulada: true,
  },
  "k-geografica-usa": {
    nombre: "Cartera K Geográfica (simulación USA)",
    nota: "Simulación con fondos USA de histórico largo. No es la cartera real.",
    simulada: true,
  },
  indexa: {
    nombre: "Roboadvisor tradicional (UCITS)",
    nota: "Cartera tipo roboadvisor con ETFs UCITS reales (proxies de los fondos de Indexa Capital): sin oro y misma renta fija para todos los perfiles. Comparable con las Carteras K UCITS.",
    simulada: false,
  },
  "indexa-usa": {
    nombre: "Roboadvisor tradicional (simulación USA)",
    nota: "Cartera tipo roboadvisor: sin oro y misma renta fija para todos los perfiles. Simulación con fondos USA de histórico largo.",
    simulada: true,
  },
};

type Periodo = "ytd" | "1y" | "3y" | "5y" | "10y" | "max";

// --- Fondo del miembro por ISIN: base local primero; si no, búsqueda en EODHD ---
const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN || "";
const EX_SUFFIX: Record<string, string> = { AS: ".AS", PA: ".PA", XETRA: ".DE", F: ".F", LSE: ".L", L: ".L", MI: ".MI", MC: ".MC", BR: ".BR", ST: ".ST", US: "", EUFUND: ".EUFUND" };
const EX_PREF = ["XETRA", "AS", "MI", "PA", "LSE", "L", "MC", "BR", "ST", "F", "EUFUND", "US"];
type EodhdHit = { Code?: string; Exchange?: string; Name?: string; ISIN?: string; Currency?: string };
const ES_ISIN = (s: string) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s);

async function fondoPorIsin(isin: string): Promise<Fund | null> {
  const local = getFundByIsin(isin);
  if (local) return local;
  if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") return null;
  try {
    const res = await fetch(`https://eodhd.com/api/search/${encodeURIComponent(isin)}?api_token=${EODHD_API_TOKEN}&limit=30`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as EodhdHit[];
    if (!Array.isArray(data) || !data.length) return null;
    const exact = data.filter((r) => r?.ISIN === isin);
    const pool = (exact.length ? exact : data).sort((a, b) => {
      const ia = EX_PREF.indexOf(a?.Exchange ?? ""), ib = EX_PREF.indexOf(b?.Exchange ?? "");
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const best = pool[0];
    if (!best?.Code || !best?.Exchange) return null;
    const name = best.Name || isin;
    return { id: `eodhd-${isin}`, name, shortName: name.length > 40 ? name.slice(0, 37) + "…" : name, isin,
      ticker: `${best.Code}${EX_SUFFIX[best.Exchange] ?? "." + best.Exchange}`, ter: 0, category: "RV Global", type: "active", currency: best.Currency || "EUR" };
  } catch { return null; }
}

function iso(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function rangoDe(periodo: Periodo): { startDate: string; endDate: string } {
  const hoy = new Date();
  const endDate = iso(hoy);
  if (periodo === "ytd") return { startDate: `${hoy.getFullYear()}-01-01`, endDate };
  if (periodo === "max") return { startDate: "1990-01-01", endDate };
  const años = periodo === "1y" ? 1 : periodo === "3y" ? 3 : periodo === "5y" ? 5 : 10;
  const ini = new Date(hoy);
  ini.setFullYear(ini.getFullYear() - años);
  return { startDate: iso(ini), endDate };
}

const pct = (x: number | null | undefined, dec = 1) =>
  x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100 * 10 ** dec) / 10 ** dec;

/** Resumen compacto para el modelo: solo cifras ya calculadas, en porcentaje. */
function resumen(r: BacktestResult, inicioReal?: string) {
  const ts = r.timeSeries;
  const m = r.metrics;
  // La serie es mensual y su primer punto es el CIERRE del primer mes; el backtest
  // arranca el primer día de ese mes con 10.000 €. "inicio" es ese arranque real.
  const primerMes = String(ts[0]?.date ?? "").slice(0, 7);
  return {
    inicio: inicioReal ?? (primerMes ? `${primerMes}-01` : null),
    fin: ts[ts.length - 1]?.exactDate ?? ts[ts.length - 1]?.date ?? null,
    meses: ts.length,
    rentabilidad_total_pct: pct(m.totalReturn),
    rentabilidad_anualizada_pct: pct(m.cagr),
    volatilidad_anual_pct: pct(m.volatility),
    caida_maxima_pct: pct(m.maxDrawdown),
    sharpe: Math.round(m.sharpe * 100) / 100,
    mejor_mes_pct: pct(m.bestMonth),
    peor_mes_pct: pct(m.worstMonth),
    meses_positivos_pct: pct(m.positiveMonthsRatio, 0),
    rentabilidad_por_año: r.annualReturns.map((a) => ({ año: a.year, pct: Math.round(a.returnPct * 10) / 10 })),
    mayores_caidas: r.topDrawdowns.slice(0, 5).map((d) => ({
      caida_pct: pct(d.drawdownPct),
      pico: d.peakDate,
      suelo: d.troughDate,
      recuperado: d.recoveryDate,
      meses_cayendo: d.lengthMonths,
      meses_recuperando: d.recoveryMonths,
      meses_bajo_el_agua: d.underwaterMonths,
    })),
    periodos_de_estres: r.stressPeriods
      .filter((s) => s.hasFullData)
      .map((s) => ({ nombre: s.name, desde: s.start, hasta: s.end, rentabilidad_pct: pct(s.totalReturn), caida_maxima_pct: pct(s.maxDrawdown) })),
    ventanas_rodantes: (["oneYear", "threeYear", "fiveYear", "tenYear"] as const)
      .map((k) => r.rollingStats[k])
      .filter((b) => b && b.count > 0)
      .map((b) => ({
        años: b.years,
        ventanas: b.count,
        anualizada_media_pct: pct(b.avgCagr),
        mejor_pct: pct(b.bestCagr),
        peor_pct: pct(b.worstCagr),
        peor_termina: b.worstEndDate,
        ventanas_positivas_pct: pct(b.positiveRatio, 0),
      })),
    valor_final_de_10000: Math.round(r.finalValue),
    ter_medio_pct: Math.round(r.fees.weightedTer * 100) / 100,
    // Serie mensual (fecha YYYY-MM, valor de 10.000 €) para pintar la evolución en la portada.
    serie: ts.map((p) => [String(p.date).slice(0, 7), Math.round(p.value)]),
    // Rentabilidad de cada mes (YYYY-MM, %), derivada de la serie: permite responder "¿y agosto de 2026?".
    rentabilidad_por_mes: ts.slice(1).map((p, i) => { const prev = ts[i]?.value || p.value; return [String(p.date).slice(0, 7), Math.round((p.value / prev - 1) * 1000) / 10]; }),
  };
}

export function GET(): NextResponse {
  const familias = Object.entries(FAMILIAS).map(([id, f]) => {
    const perfiles = Array.from({ length: 10 }, (_, i) => i + 1).filter((p) => getPresetById(`${id}-${p}`));
    return { id, ...f, perfiles };
  });
  return NextResponse.json({
    reglas: "Rebalanceo anual, con el TER de los fondos incluido, sin comisiones de transacción ni custodia, bruto de impuestos, 10.000 € iniciales, sin aportaciones. Rentabilidades pasadas no garantizan rentabilidades futuras.",
    periodos: ["ytd", "1y", "3y", "5y", "10y", "max"],
    familias,
    benchmarks: getAllBenchmarks().map((b) => ({ id: b.id, nombre: b.name, descripcion: b.description })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runWithContext({ dataSource: "eodhd" }, async () => {
    try {
      let body: { familia?: string; perfil?: number; startDate?: string; endDate?: string; periodo?: Periodo; comparar?: string };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "JSON inválido", message: "El cuerpo no es JSON válido." }, { status: 400 });
      }

      const familia = String(body.familia || "k-inbestme").toLowerCase();
      const fam = FAMILIAS[familia];
      if (!fam) {
        return NextResponse.json(
          { error: "Familia inválida", message: `Usa una de: ${Object.keys(FAMILIAS).join(", ")}.` },
          { status: 400 }
        );
      }
      const perfil = Math.round(Number(body.perfil));
      if (!Number.isFinite(perfil) || perfil < 1 || perfil > 10) {
        return NextResponse.json({ error: "Perfil inválido", message: "El perfil debe ser 1-10." }, { status: 400 });
      }
      const preset = getPresetById(`${familia}-${perfil}`);
      if (!preset) {
        return NextResponse.json({ error: "Sin preset", message: `No existe ${familia}-${perfil}.` }, { status: 404 });
      }

      // Comparador opcional: otra familia con el MISMO perfil, en el tramo común de datos.
      const comparar = body.comparar ? String(body.comparar).toLowerCase() : "";
      const famB = comparar ? FAMILIAS[comparar] : null;
      const esUSA = (f: string) => /-usa$/.test(f);
      // Comparador: familia (mismo perfil) o benchmark de la tool (índice / cartera clásica, ETFs UCITS).
      const bench = comparar && !famB ? getBenchmarkById(comparar as BenchmarkId) : undefined;
      const isinB = comparar && !famB && !bench && ES_ISIN(comparar.toUpperCase()) ? comparar.toUpperCase() : null;
      const fondoB = isinB ? await fondoPorIsin(isinB) : null;
      if (isinB && !fondoB) {
        return NextResponse.json({ error: "ISIN no encontrado", message: `No encuentro datos históricos para el ISIN ${isinB}.` }, { status: 404 });
      }
      if (comparar && !famB && !bench && !isinB) {
        return NextResponse.json(
          { error: "Comparador inválido", message: `Usa una familia (${Object.keys(FAMILIAS).join(", ")}), un benchmark (${getAllBenchmarks().map((b) => b.id).join(", ")}) o un ISIN.` },
          { status: 400 }
        );
      }
      if (comparar && esUSA(comparar) !== esUSA(familia)) {
        return NextResponse.json(
          { error: "Comparación incoherente", message: "No se mezclan carteras UCITS reales con simulaciones USA: compara UCITS con UCITS o USA con USA. Los benchmarks son UCITS." },
          { status: 400 }
        );
      }
      let presetB: { name: string; description?: string; holdings: PortfolioHolding[] } | undefined;
      if (famB) {
        const pb = getPresetById(`${comparar}-${perfil}`);
        if (!pb) return NextResponse.json({ error: "Sin preset", message: `No existe ${comparar}-${perfil}.` }, { status: 404 });
        presetB = pb;
      } else if (bench) {
        presetB = { name: bench.name, description: bench.description, holdings: bench.composition.map((c) => ({ fundId: c.fundId, weight: c.weight })) };
      } else if (fondoB) {
        const local = !fondoB.id.startsWith("eodhd-");
        presetB = { name: fondoB.shortName || fondoB.name, description: `Fondo del miembro · ISIN ${fondoB.isin}`, holdings: [local ? { fundId: fondoB.id, weight: 100 } : { fundId: fondoB.id, weight: 100, fund: fondoB }] };
      }
      const famBInfo = famB ?? (bench ? { nombre: bench.name, nota: `Índice de referencia (${bench.description}). ETFs UCITS reales.`, simulada: false }
        : fondoB ? { nombre: `${fondoB.shortName || fondoB.name} (${fondoB.isin})`, nota: `Fondo indicado por el miembro (ISIN ${fondoB.isin}). Precios de EODHD; comisiones del fondo incluidas en su valor liquidativo.`, simulada: false } : null);

      const fechaOk = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
      let startDate: string, endDate: string;
      if (fechaOk(body.startDate)) {
        startDate = body.startDate as string;
        endDate = fechaOk(body.endDate) ? (body.endDate as string) : iso(new Date());
      } else {
        const p: Periodo = (["ytd", "1y", "3y", "5y", "10y", "max"] as Periodo[]).includes(body.periodo as Periodo)
          ? (body.periodo as Periodo)
          : "max";
        ({ startDate, endDate } = rangoDe(p));
      }
      if (startDate >= endDate) {
        return NextResponse.json({ error: "Fechas inválidas", message: "startDate debe ser anterior a endDate." }, { status: 400 });
      }

      const config: BacktestConfig = {
        portfolioA: { name: preset.name, holdings: preset.holdings.map((h) => ({ fundId: h.fundId, weight: h.weight })) },
        portfolioB: presetB ? { name: presetB.name, holdings: presetB.holdings.map((h) => ({ fundId: h.fundId, weight: h.weight })) } : undefined,
        startDate,
        endDate,
        initialAmount: 10000,
        rebalanceFrequency: "annual",
        displayGranularity: "monthly",
        useCommonDateRange: true,
      };

      const result = await Promise.race([
        runBacktest(config),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), BACKTEST_TIMEOUT_MS)),
      ]);

      if (!result.a) {
        return NextResponse.json(
          { error: "Sin datos", message: "No hay datos históricos suficientes para esa cartera en ese periodo." },
          { status: 400 }
        );
      }

      const composicion = preset.holdings.map((h) => {
        const f = getFundById(h.fundId);
        return { nombre: f?.shortName || f?.name || h.fundId, isin: f?.isin ?? null, peso_pct: Math.round(h.weight * 100) / 100 };
      });

      return NextResponse.json({
        familia,
        cartera: fam.nombre,
        simulada: fam.simulada,
        nota: fam.nota,
        perfil,
        preset: preset.name,
        descripcion: preset.description,
        pedido: { startDate, endDate },
        reglas: "Rebalanceo anual, con el TER de los fondos incluido, sin comisiones de transacción ni custodia, bruto de impuestos. Rentabilidades pasadas no garantizan rentabilidades futuras.",
        resultado: resumen(result.a, result.commonDateRange?.start),
        comparado: presetB && famBInfo && result.b ? {
          familia: comparar, cartera: famBInfo.nombre, simulada: famBInfo.simulada, nota: famBInfo.nota,
          preset: presetB.name, descripcion: presetB.description ?? null, resultado: resumen(result.b, result.commonDateRange?.start),
        } : null,
        composicion,
        avisos: result.warnings,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "TIMEOUT") {
        return NextResponse.json({ error: "Tiempo agotado", message: "El backtest tardó demasiado." }, { status: 408 });
      }
      const msg = error instanceof Error ? error.message : "Error desconocido";
      console.error("[API /ataraxia/carteras-k] Error:", error);
      return NextResponse.json({ error: "Error en el backtest", message: msg }, { status: 500 });
    }
  });
}
