// =============================================================================
// API ROUTE: /api/campus/cartera-backtest
// =============================================================================
// Panel del alumno — Fase 1 (Backtest).
// Recibe el PERFIL de riesgo (1-10) del alumno y un ETF de REFERENCIA, resuelve
// la "Cartera K del perfil" (preset k-inbestme-N) y la backtestea contra el ETF
// elegido, reutilizando el motor existente (runBacktest). Devuelve dos
// resultados (cartera del alumno + benchmark) listos para pintar.
//
// Es una comparación de ESTRATEGIA (suma global, sin aportaciones): TWR puro,
// que es lo correcto para comparar contra un índice/ETF. Las aportaciones del
// alumno llegan en la Fase 3 (Seguimiento).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest-engine";
import { getDailyPrices } from "@/lib/data-fetcher";
import { getPresetById } from "@/lib/portfolio-presets";
import { getFundById, getFundByIsin } from "@/lib/fund-database";
import { runWithContext } from "@/lib/request-context";
import type { BacktestConfig, Fund, FundCategory } from "@/lib/types";

const BACKTEST_TIMEOUT_MS = 60000;

// ETFs de referencia permitidos (acumulación, en EUR) — clave -> fundId BD.
const BENCHMARKS: Record<string, string> = {
  vwce: "vanguard-global", // Vanguard FTSE All-World Acc (proxy ACWI)
  world: "ishares-msci-world", // iShares Core MSCI World Acc
  sp500: "vanguard-sp500", // iShares Core S&P 500 Acc (SXR8)
};

// -----------------------------------------------------------------------------
// Resolución de ISIN NO catalogados (p.ej. ETFs de renta fija) a su símbolo
// EODHD, para incluirlos como fondo dinámico en vez de descartarlos. Esto evita
// que una cartera conservadora pierda su renta fija y se infle al reescalar.
// -----------------------------------------------------------------------------
const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN || "";
const EX_SUFFIX: Record<string, string> = {
  AS: ".AS", PA: ".PA", XETRA: ".DE", F: ".F", LSE: ".L", L: ".L",
  MI: ".MI", MC: ".MC", BR: ".BR", ST: ".ST", US: "", EUFUND: ".EUFUND",
};
// Preferencia de bolsa: primero las de datos más largos/fiables.
const EX_PREF = ["XETRA", "AS", "MI", "PA", "LSE", "L", "MC", "BR", "ST", "F", "US"];

type EodhdHit = { Code?: string; Exchange?: string; Name?: string; ISIN?: string; Currency?: string };

function buildTicker(code: string, exchange: string): string {
  return `${code}${EX_SUFFIX[exchange] ?? "." + exchange}`;
}

function mapCategoria(c?: string): FundCategory {
  switch (c) {
    case "Global": return "RV Global";
    case "Emergente": return "RV Emergentes";
    case "Largo Plazo": return "RF EUR Gov Largo";
    case "Medio Plazo": return "RF EUR Gov Medio";
    case "Corto Plazo": return "RF EUR Gov Corto";
    case "Corporativa": return "RF EUR Corp";
    case "High Yield": return "RF EUR Corp";
    case "Oro": return "Oro";
    default:
      if (c && c.startsWith("MSCI")) return "RV Sectorial";
      if (c === "Global Real Estate") return "RV REITs";
      return "RF EUR";
  }
}

async function resolveEodhdFund(isin: string, categoria?: string): Promise<Fund | null> {
  if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") return null;
  try {
    const url = `https://eodhd.com/api/search/${encodeURIComponent(isin)}?api_token=${EODHD_API_TOKEN}&limit=30`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as EodhdHit[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const exact = data.filter((r) => r?.ISIN === isin);
    const pool = exact.length ? exact : data;
    pool.sort((a, b) => {
      const ia = EX_PREF.indexOf(a?.Exchange ?? ""); const ib = EX_PREF.indexOf(b?.Exchange ?? "");
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const best = pool[0];
    if (!best?.Code || !best?.Exchange) return null;
    const name = best.Name || isin;
    return {
      id: `eodhd-${isin}`,
      name,
      shortName: name.length > 40 ? name.slice(0, 37) + "…" : name,
      isin,
      ticker: buildTicker(best.Code, best.Exchange),
      ter: 0,
      category: mapCategoria(categoria),
      type: "index",
      currency: best.Currency || "EUR",
    };
  } catch {
    return null;
  }
}

type Period = "1y" | "3y" | "5y" | "max" | "ytd";

function isoDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

/** Calcula [startDate, endDate] (YYYY-MM-DD) a partir del periodo solicitado. */
function rangeForPeriod(period: Period): { startDate: string; endDate: string } {
  const today = new Date();
  const endDate = isoDate(today);
  if (period === "ytd") {
    return { startDate: `${today.getFullYear()}-01-01`, endDate };
  }
  if (period === "max") {
    // Inicio generoso; el motor recorta al rango común disponible y avisa.
    return { startDate: "2010-01-01", endDate };
  }
  const years = period === "1y" ? 1 : period === "3y" ? 3 : 5;
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - years);
  return { startDate: isoDate(start), endDate };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runWithContext({ dataSource: "eodhd" }, async () => {
    try {
      let body: {
        profile?: number;
        benchmark?: string;
        period?: Period;
        rebalanceFrequency?: BacktestConfig["rebalanceFrequency"];
        // Cartera real del alumno (instrumentos por ISIN + pesos objetivo).
        // Si viene y resuelve, se backtestea ESTA en vez del modelo del perfil.
        holdings?: Array<{ isin: string; weight: number; categoria?: string }>;
        carteraName?: string;
        // Estrategia del alumno (para la referencia "Cartera K de tu perfil"):
        // "geo" -> K Geográfica UCIT, "sector" -> K Inbestme.
        carteraKStrategy?: "geo" | "sector";
      };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "JSON inválido", message: "El cuerpo no es JSON válido." },
          { status: 400 }
        );
      }

      // --- Perfil (para el modelo y la etiqueta; opcional si vienen holdings) ---
      const profileRaw = Math.round(Number(body.profile));
      const profile =
        Number.isFinite(profileRaw) && profileRaw >= 1 && profileRaw <= 10 ? profileRaw : null;

      // --- Referencia de comparación: la Cartera K del perfil del alumno
      //     (geográfica o sectorial) o un ETF indexado. ---
      const benchKey = (body.benchmark || "carterak").toLowerCase();
      let benchHoldings: { fundId: string; weight: number }[];
      let benchName: string;
      if (benchKey === "carterak") {
        const fam = body.carteraKStrategy === "geo" ? "k-geografica-ucit" : "k-inbestme";
        const kp = profile !== null ? getPresetById(`${fam}-${profile}`) : null;
        if (!kp) {
          return NextResponse.json(
            { error: "Sin Cartera K", message: "No hay Cartera K para ese perfil/estrategia (indica perfil 1-10)." },
            { status: 400 }
          );
        }
        benchHoldings = kp.holdings.map((h) => ({ fundId: h.fundId, weight: h.weight }));
        benchName = kp.name;
      } else {
        const benchFundId = BENCHMARKS[benchKey];
        if (!benchFundId) {
          return NextResponse.json(
            { error: "Benchmark inválido", message: `Referencia no permitida: '${body.benchmark}'.` },
            { status: 400 }
          );
        }
        const benchFund = getFundById(benchFundId);
        if (!benchFund) {
          return NextResponse.json(
            { error: "Benchmark no encontrado", message: `El ETF '${benchFundId}' no existe en la base de datos.` },
            { status: 500 }
          );
        }
        benchHoldings = [{ fundId: benchFundId, weight: 100 }];
        benchName = benchFund.shortName || benchFund.name;
      }

      // --- Cartera A: la del alumno (holdings por ISIN) o el modelo del perfil ---
      let portfolioAName: string;
      let portfolioAHoldings: { fundId: string; weight: number; fund?: Fund }[];
      let source: "cartera" | "modelo";
      let presetName: string | null = null;
      let presetDescription: string | null = null;
      const droppedIsins: string[] = [];
      let droppedWeight = 0;

      const userHoldings = (Array.isArray(body.holdings) ? body.holdings : []).filter(
        (h) => h && String(h.isin || "").trim() && Number(h.weight) > 0
      );
      const totalReqWeight = userHoldings.reduce((s, h) => s + Number(h.weight), 0);

      // Resolver cada ISIN: 1) BD del motor; 2) EODHD (fondo dinámico por su
      // símbolo de bolsa); 3) descartar. El paso 2 es lo que rescata la renta
      // fija (ETFs reales que EODHD sí tiene pero no están catalogados).
      const resolvedParts = await Promise.all(
        userHoldings.map(async (h) => {
          const isin = String(h.isin).trim();
          const w = Number(h.weight);
          const local = getFundByIsin(isin);
          if (local) return { fundId: local.id, weight: w } as { fundId: string; weight: number; fund?: Fund };
          const dyn = await resolveEodhdFund(isin, h.categoria);
          if (dyn) return { fundId: dyn.id, weight: w, fund: dyn };
          return { dropped: isin, weight: w };
        })
      );

      const okParts = resolvedParts.filter(
        (p): p is { fundId: string; weight: number; fund?: Fund } => "fundId" in p
      );
      for (const p of resolvedParts) {
        if ("dropped" in p) { droppedIsins.push(p.dropped); droppedWeight += p.weight; }
      }

      if (okParts.length > 0) {
        // Combinar pesos por fundId, conservando el fondo dinámico si lo lleva.
        const byFund = new Map<string, { weight: number; fund?: Fund }>();
        for (const p of okParts) {
          const ex = byFund.get(p.fundId);
          byFund.set(p.fundId, { weight: (ex?.weight || 0) + p.weight, fund: p.fund ?? ex?.fund });
        }
        portfolioAHoldings = [...byFund.entries()].map(([fundId, v]) =>
          v.fund ? { fundId, weight: v.weight, fund: v.fund } : { fundId, weight: v.weight }
        );
        portfolioAName = body.carteraName || "Mi Cartera";
        source = "cartera";
      } else {
        // Fallback: Cartera K modelo del perfil.
        if (profile === null) {
          return NextResponse.json(
            { error: "Sin cartera", message: "Indica un perfil de riesgo (1-10) o una cartera con instrumentos válidos." },
            { status: 400 }
          );
        }
        const preset = getPresetById(`k-inbestme-${profile}`);
        if (!preset) {
          return NextResponse.json(
            { error: "Sin cartera", message: `No existe una Cartera K para el perfil ${profile}.` },
            { status: 400 }
          );
        }
        portfolioAHoldings = preset.holdings.map((h) => ({ fundId: h.fundId, weight: h.weight }));
        portfolioAName = preset.name;
        presetName = preset.name;
        presetDescription = preset.description;
        source = "modelo";
      }

      // Fiabilidad: si se descarta peso material de la cartera del alumno, el
      // resultado reescalado NO es representativo (caso típico: renta fija sin
      // datos). Lo marcamos para que la UI no muestre cifras engañosas.
      const droppedWeightPct = totalReqWeight > 0 ? (droppedWeight / totalReqWeight) * 100 : 0;
      const reliable = source !== "cartera" || droppedWeightPct < 5;

      // Normalizar pesos a 100% (cubre instrumentos descartados y redondeos).
      const sumW = portfolioAHoldings.reduce((s, h) => s + h.weight, 0);
      if (sumW > 0 && Math.abs(sumW - 100) > 0.01) {
        portfolioAHoldings = portfolioAHoldings.map((h) => ({ ...h, weight: (h.weight / sumW) * 100 }));
      }

      // Metadatos de los instrumentos de la cartera (para luego identificar cuál
      // limita la ventana histórica y nombrarlo en la UI).
      const carteraMeta =
        source === "cartera"
          ? portfolioAHoldings.map((h) => {
              const f = h.fund ?? getFundById(h.fundId);
              return {
                fundId: h.fundId,
                name: f?.shortName || f?.name || h.fundId,
                ticker: f?.ticker,
                isin: f?.isin,
              };
            })
          : [];

      // --- Periodo ---
      const period: Period = (["1y", "3y", "5y", "max", "ytd"] as Period[]).includes(
        body.period as Period
      )
        ? (body.period as Period)
        : "max";
      const { startDate, endDate } = rangeForPeriod(period);

      const rebalanceFrequency = body.rebalanceFrequency || "annual";

      const config: BacktestConfig = {
        portfolioA: { name: portfolioAName, holdings: portfolioAHoldings },
        portfolioB: { name: benchName, holdings: benchHoldings },
        startDate,
        endDate,
        initialAmount: 10000,
        rebalanceFrequency,
        displayGranularity: "monthly",
        // Comparación JUSTA: ambas series se recortan a la ventana común donde
        // cartera y benchmark tienen datos. Sin esto, el ETF de referencia
        // (más joven) cubriría menos años y la rentabilidad total no sería
        // comparable con la de la cartera.
        useCommonDateRange: true,
      };

      const result = await Promise.race([
        runBacktest(config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), BACKTEST_TIMEOUT_MS)
        ),
      ]);

      if (!result.a) {
        return NextResponse.json(
          {
            error: "Sin datos",
            message:
              "No hay datos históricos suficientes para esta cartera en el periodo elegido. Prueba un periodo más corto.",
          },
          { status: 400 }
        );
      }

      const eff = result.a.timeSeries;
      const effectiveDateRange =
        eff && eff.length
          ? { startDate: eff[0]?.exactDate ?? eff[0]?.date, endDate: eff[eff.length - 1]?.exactDate ?? eff[eff.length - 1]?.date }
          : undefined;

      // Identificar el instrumento de la cartera que LIMITA la ventana: aquel
      // cuyo histórico empieza más tarde y coincide con el inicio efectivo.
      // (getDailyPrices ya está cacheado tras el backtest → coste marginal.)
      let windowLimitedBy: { name: string; start: string } | null = null;
      if (source === "cartera" && carteraMeta.length > 0 && effectiveDateRange?.startDate) {
        const effYM = effectiveDateRange.startDate.slice(0, 7);
        const firsts = await Promise.all(
          carteraMeta.map(async (m) => {
            try {
              const { prices } = await getDailyPrices(m.fundId, m.ticker, m.isin);
              const keys = prices ? [...prices.keys()] : [];
              const start = keys.length ? keys.reduce((a, b) => (a < b ? a : b)) : undefined;
              return start ? { name: m.name, start } : null;
            } catch {
              return null;
            }
          })
        );
        const valid = firsts.filter((x): x is { name: string; start: string } => !!x);
        valid.sort((a, b) => (a.start < b.start ? 1 : -1)); // el de inicio más tardío primero
        const latest = valid[0];
        // Solo es "el que ata la ventana" si su inicio coincide con el efectivo
        // (si todos empiezan antes, manda el ETF de referencia, no la cartera).
        if (latest && latest.start.slice(0, 7) >= effYM) windowLimitedBy = latest;
      }

      return NextResponse.json({
        profile,
        period,
        source,
        carteraName: portfolioAName,
        cartera: result.a,
        benchmark: result.b,
        presetName,
        presetDescription,
        benchmarkName: benchName,
        benchmarkKey: benchKey,
        droppedIsins,
        droppedWeightPct: Math.round(droppedWeightPct),
        reliable,
        requestedStart: startDate,
        windowLimitedBy,
        effectiveDateRange,
        warnings: result.warnings,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "TIMEOUT") {
        return NextResponse.json(
          { error: "Tiempo agotado", message: "El backtest tardó demasiado. Prueba un periodo más corto." },
          { status: 408 }
        );
      }
      const msg = error instanceof Error ? error.message : "Error desconocido";
      console.error("[API /campus/cartera-backtest] Error:", error);
      return NextResponse.json(
        { error: "Error en el backtest", message: msg },
        { status: 500 }
      );
    }
  });
}
