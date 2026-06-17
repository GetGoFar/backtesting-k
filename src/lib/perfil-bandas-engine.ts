// =============================================================================
// PERFIL-BANDAS ENGINE — Estudio CNMV de deriva de perfil bajo rebalanceo
// por bandas
// =============================================================================
//
// Objetivo regulatorio: cuantificar, mes a mes, qué perfil de riesgo IMPLICA
// la cartera de un cliente cuando se rebalancea por bandas (no de forma
// continua), para defender ante la CNMV que las bandas (incl. ±50%) preservan
// el riesgo REAL del cliente mientras optimizan su fiscalidad.
//
// Metodología (validada con datos reales, prototipo en scripts/perfil_bandas_*):
//
//  1) CALIBRACIÓN. Cada uno de los 10 perfiles de las Carteras K se reduce a
//     pesos por CLASE DE ACTIVO (RV / RF / Oro / Alt). Con una covarianza
//     estable de retornos mensuales de cada clase, se calcula la VOLATILIDAD
//     EX-ANTE de cada perfil objetivo → σ₁<σ₂<…<σ₁₀. Las fronteras entre
//     perfiles son los puntos medios. (= la "regla" perfil↔riesgo, derivada de
//     las propias Carteras K, como exige el marco de idoneidad.)
//
//  2) SIMULACIÓN. Para cada perfil se simula la cartera mes a mes: las clases
//     derivan con sus retornos y SOLO se rebalancea cuando una clase supera la
//     banda (relativa o absoluta). Cada mes se calcula:
//       · vol EX-ANTE de los pesos vigentes  → perfil implícito (MÉTRICA OFICIAL)
//       · vol REALIZADA trailing 12m          → perfil implícito (ANEXO, ruido
//         de régimen de mercado; se reporta solo como contraste)
//
//  3) FISCALIDAD. Cada rebalanceo de ETFs realiza plusvalía y tributa (IRPF del
//     ahorro). Se acumula el impuesto pagado para comparar el coste fiscal de
//     bandas anchas (±50%) vs estrechas → el beneficio que justifica la banda.
//
// El nivel CLASE DE ACTIVO es deliberado: es transparente, auditable y es el
// lente que usa el test de idoneidad (la mezcla RV/RF/Oro determina el riesgo).
// =============================================================================

import { getDailyPrices } from "./data-fetcher";
import { getFundById } from "./fund-database";
import { getPresetById } from "./portfolio-presets";
import { spanishIrpfTax } from "./tax-utils";
import type { FundCategory } from "./types";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export type AssetClass = "RV" | "RF" | "Oro" | "Alt";
export const ASSET_CLASSES: AssetClass[] = ["RV", "RF", "Oro", "Alt"];

export type BandMode = "rel" | "abs";

export interface PerfilBandasConfig {
  /** Familia de Carteras K por perfil (presets `${family}-1..10`). */
  family: string;
  /** Banda principal del estudio. width en fracción (0.5 = ±50%) o pp (0.05). */
  band: { mode: BandMode; width: number };
  /** Capital inicial (para cuantificar el impuesto en €). */
  initialAmount: number;
  /** Régimen fiscal de los rebalanceos (ETFs → realizan plusvalía). */
  taxMode: "none" | "spain-irpf" | "flat";
  taxRate?: number;
  /** Ventana (meses) de la volatilidad realizada del anexo. Default 12. */
  realizedWindowMonths?: number;
  /** Bandas adicionales para la tabla de sensibilidad (coste fiscal/estabilidad). */
  sensitivityBands?: Array<{ mode: BandMode; width: number; label: string }>;
}

/** Proxy de retornos por clase de activo. */
interface ClassProxy {
  fundId?: string;
  ticker?: string;
  isin?: string;
  name: string;
}

/** Proxies por defecto (validados contra EODHD 2026-06). Histórico común
 *  limitado por el oro EUR (8PSG.F, desde 2012-11). RF en USD (AGG): el motor
 *  no convierte FX, pero la clase RF aporta poca vol — refinable. */
export const DEFAULT_PROXIES: Record<AssetClass, ClassProxy> = {
  // Ticker directo (sin fundId) para que la serie sea determinista y no la
  // sobrescriba el ticker del fondo de la BD. IWDA = MSCI World (desde 2009).
  RV: { ticker: "IWDA.AS", name: "MSCI World (IWDA)" },
  RF: { ticker: "AGG.US", name: "Bloomberg US Agg (AGG)" },
  Oro: { ticker: "8PSG.F", name: "Oro físico EUR (8PSG)" },
  Alt: { ticker: "8PSG.F", name: "(sin clase Alt en esta familia)" },
};

export interface PerfilBandasResult {
  family: string;
  band: { mode: BandMode; width: number; label: string };
  /** Ventana de datos usada. */
  window: { firstMonth: string; lastMonth: string; months: number };
  proxies: Record<string, { name: string }>;
  /** Calibración: perfil → pesos objetivo + vol ex-ante + frontera superior. */
  ladder: Array<{
    profile: number;
    weights: Record<AssetClass, number>; // %
    volExante: number; // % anualizado
    upperBound: number | null; // frontera con el perfil siguiente (% vol)
  }>;
  /** Por cada perfil: serie mensual + estadísticas + fiscalidad. */
  profiles: PerfilDriftResult[];
  /** Tabla de sensibilidad por banda (media de los 10 perfiles). */
  sensitivity: Array<{
    label: string;
    pctOnProfile: number;
    pctWithin1: number;
    avgRebalances: number;
    totalTax: number;
    avgFinalValue: number;
  }>;
  warnings: string[];
}

export interface PerfilDriftResult {
  profile: number;
  targetWeights: Record<AssetClass, number>; // %
  targetVol: number; // % ex-ante del objetivo
  series: Array<{
    month: string;
    weights: Record<AssetClass, number>; // %
    volExante: number; // %
    impliedExante: number;
    volRealized: number | null; // %
    impliedRealized: number | null;
    rebalanced: boolean;
  }>;
  stats: {
    pctOnProfile: number; // % meses perfil implícito == objetivo (ex-ante)
    pctWithin1: number; // % meses |implícito - objetivo| <= 1
    maxDriftUp: number; // máxima desviación al alza (perfiles)
    rebalances: number;
    minVol: number; // % — rango de vol ex-ante real
    maxVol: number;
    maxRvWeight: number; // % — RV máximo alcanzado
    taxPaid: number; // € impuesto por rebalanceos
    finalValue: number; // €
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function assetClassOf(cat: FundCategory): AssetClass {
  if (cat.startsWith("RV")) return "RV";
  if (cat.startsWith("RF")) return "RF";
  if (cat === "Oro") return "Oro";
  return "Alt";
}

/** Extrae los pesos por clase de activo (en fracción) de un preset por perfil. */
function profileClassWeights(family: string, p: number): Record<AssetClass, number> | null {
  const preset = getPresetById(`${family}-${p}`);
  if (!preset) return null;
  const w: Record<AssetClass, number> = { RV: 0, RF: 0, Oro: 0, Alt: 0 };
  for (const h of preset.holdings) {
    const fund = h.fund ?? (h.fundId ? getFundById(h.fundId) : undefined);
    const cat = fund?.category ?? "RV Global";
    w[assetClassOf(cat)] += h.weight / 100;
  }
  return w;
}

/** Precios diarios → serie mensual (último día hábil de cada mes). */
function toMonthly(prices: Map<string, number>): Map<string, number> {
  const monthly = new Map<string, number>();
  for (const date of Array.from(prices.keys()).sort()) {
    const px = prices.get(date)!;
    monthly.set(date.substring(0, 7), px); // sobrescribe → queda el último del mes
  }
  return monthly;
}

// -----------------------------------------------------------------------------
// Motor principal
// -----------------------------------------------------------------------------

export async function runPerfilBandasStudy(
  config: PerfilBandasConfig,
  proxies: Record<AssetClass, ClassProxy> = DEFAULT_PROXIES
): Promise<PerfilBandasResult> {
  const warnings: string[] = [];
  const realizedWindow = config.realizedWindowMonths ?? 12;

  // 1. Qué clases usa esta familia (las que tienen peso en algún perfil)
  const ladderRaw: Array<{ profile: number; w: Record<AssetClass, number> }> = [];
  for (let p = 1; p <= 10; p++) {
    const w = profileClassWeights(config.family, p);
    if (w) ladderRaw.push({ profile: p, w });
  }
  if (ladderRaw.length < 2) {
    throw new Error(`No se encontraron perfiles para la familia ${config.family}`);
  }
  const usedClasses = ASSET_CLASSES.filter((c) =>
    ladderRaw.some((r) => r.w[c] > 1e-9)
  );

  // 2. Series mensuales de cada clase usada
  const monthlyByClass: Partial<Record<AssetClass, Map<string, number>>> = {};
  for (const c of usedClasses) {
    const px = proxies[c];
    const { prices } = await getDailyPrices(px.fundId ?? px.ticker ?? c, px.ticker, px.isin);
    if (prices.size === 0) {
      warnings.push(`Proxy de ${c} (${px.name}) sin datos.`);
      continue;
    }
    monthlyByClass[c] = toMonthly(prices);
  }
  // Ventana común
  let commonMonths: string[] | null = null;
  for (const c of usedClasses) {
    const m = monthlyByClass[c];
    if (!m) continue;
    const keys = Array.from(m.keys());
    commonMonths = commonMonths
      ? commonMonths.filter((k) => m.has(k))
      : keys;
  }
  commonMonths = (commonMonths ?? []).sort();
  if (commonMonths.length < 24) {
    throw new Error("Histórico común insuficiente para el estudio (mín. 24 meses).");
  }

  // 3. Retornos mensuales por clase
  const retMonths = commonMonths.slice(1);
  const n = retMonths.length;
  const rets: Partial<Record<AssetClass, number[]>> = {};
  for (const c of usedClasses) {
    const m = monthlyByClass[c]!;
    const arr: number[] = [];
    for (let i = 1; i < commonMonths.length; i++) {
      const p0 = m.get(commonMonths[i - 1]!)!;
      const p1 = m.get(commonMonths[i]!)!;
      arr.push(p1 / p0 - 1);
    }
    rets[c] = arr;
  }

  // 4. Covarianza anualizada + función de vol ex-ante
  const mean: Partial<Record<AssetClass, number>> = {};
  for (const c of usedClasses) mean[c] = rets[c]!.reduce((a, b) => a + b, 0) / n;
  const cov = (a: AssetClass, b: AssetClass): number => {
    const ra = rets[a]!;
    const rb = rets[b]!;
    let s = 0;
    for (let i = 0; i < n; i++) s += (ra[i]! - mean[a]!) * (rb[i]! - mean[b]!);
    return (s / (n - 1)) * 12; // anualizada
  };
  const S: Record<string, number> = {};
  for (const a of usedClasses) for (const b of usedClasses) S[`${a}|${b}`] = cov(a, b);
  const volExante = (w: Record<AssetClass, number>): number => {
    let v = 0;
    for (const a of usedClasses) for (const b of usedClasses) v += w[a] * w[b] * S[`${a}|${b}`]!;
    return Math.sqrt(Math.max(0, v));
  };

  // 5. Calibración: vol ex-ante de cada perfil objetivo → fronteras
  const sigma: Record<number, number> = {};
  for (const r of ladderRaw) sigma[r.profile] = volExante(r.w);
  const profilesSorted = ladderRaw.map((r) => r.profile).sort((a, b) => a - b);
  const bounds: number[] = []; // bounds[i] = frontera entre profilesSorted[i] y [i+1]
  for (let i = 0; i < profilesSorted.length - 1; i++) {
    bounds.push((sigma[profilesSorted[i]!]! + sigma[profilesSorted[i + 1]!]!) / 2);
  }
  const impliedProfile = (vol: number): number => {
    let p = profilesSorted[0]!;
    for (let i = 0; i < bounds.length; i++) if (vol > bounds[i]!) p = profilesSorted[i + 1]!;
    return p;
  };

  // 6. Simulación de un perfil bajo una banda (con fiscalidad)
  function simulate(p0: number, band: { mode: BandMode; width: number }): PerfilDriftResult {
    const tgt = ladderRaw.find((r) => r.profile === p0)!.w;
    const val: Record<AssetClass, number> = {} as Record<AssetClass, number>;
    const cost: Record<AssetClass, number> = {} as Record<AssetClass, number>;
    for (const c of usedClasses) {
      val[c] = config.initialAmount * tgt[c];
      cost[c] = val[c];
    }
    const series: PerfilDriftResult["series"] = [];
    const portRets: number[] = [];
    let rebalances = 0;
    let taxPaid = 0;
    let annualRealized = 0;
    let taxYear = -1;
    const taxOn = config.taxMode === "spain-irpf" || (config.taxMode === "flat" && (config.taxRate ?? 0) > 0);

    for (let i = 0; i < n; i++) {
      // retorno del mes con los pesos vigentes
      const totBefore = usedClasses.reduce((s, c) => s + val[c], 0);
      let rp = 0;
      for (const c of usedClasses) rp += (val[c] / totBefore) * rets[c]![i]!;
      portRets.push(rp);
      for (const c of usedClasses) val[c] *= 1 + rets[c]![i]!;

      let tot = usedClasses.reduce((s, c) => s + val[c], 0);
      const wObj: Record<AssetClass, number> = {} as Record<AssetClass, number>;
      for (const c of usedClasses) wObj[c] = val[c] / tot;

      // ¿alguna clase rompe la banda?
      const breach = usedClasses.some((c) => {
        if (tgt[c] <= 1e-9) return false;
        return band.mode === "rel"
          ? Math.abs(wObj[c] - tgt[c]) / tgt[c] > band.width
          : Math.abs(wObj[c] - tgt[c]) > band.width;
      });

      let rebalanced = false;
      if (breach) {
        rebalanced = true;
        rebalances++;
        // fiscalidad: vender lo sobreponderado realiza plusvalía
        if (taxOn) {
          const yr = parseInt(retMonths[i]!.substring(0, 4), 10);
          if (yr !== taxYear) {
            taxYear = yr;
            annualRealized = 0;
          }
          let gain = 0;
          for (const c of usedClasses) {
            const target = tot * tgt[c];
            if (val[c] - target > 1e-9) {
              const sold = val[c] - target;
              const cbSold = cost[c] * (sold / val[c]);
              gain += sold - cbSold;
              cost[c] -= cbSold;
            }
          }
          let tax = 0;
          if (gain > 0) {
            tax =
              config.taxMode === "spain-irpf"
                ? spanishIrpfTax(annualRealized + gain) - spanishIrpfTax(Math.max(0, annualRealized))
                : gain * (config.taxRate ?? 0);
            annualRealized += gain;
          }
          tot -= tax;
          taxPaid += tax;
        }
        // redepliegue a objetivo; coste base de lo comprado = importe desplegado
        for (const c of usedClasses) {
          const target = tot * tgt[c];
          if (target - val[c] > 1e-9) cost[c] += target - val[c];
          val[c] = target;
        }
        for (const c of usedClasses) wObj[c] = tgt[c];
      }

      const ve = volExante(wObj);
      let vr: number | null = null;
      if (portRets.length >= realizedWindow) {
        const win = portRets.slice(-realizedWindow);
        const mu = win.reduce((a, b) => a + b, 0) / win.length;
        const variance = win.reduce((a, b) => a + (b - mu) ** 2, 0) / win.length;
        vr = Math.sqrt(variance) * Math.sqrt(12);
      }
      const wPct: Record<AssetClass, number> = {} as Record<AssetClass, number>;
      for (const c of usedClasses) wPct[c] = wObj[c] * 100;
      series.push({
        month: retMonths[i]!,
        weights: wPct,
        volExante: ve * 100,
        impliedExante: impliedProfile(ve),
        volRealized: vr !== null ? vr * 100 : null,
        impliedRealized: vr !== null ? impliedProfile(vr) : null,
        rebalanced,
      });
    }

    const onProfile = series.filter((s) => s.impliedExante === p0).length;
    const within1 = series.filter((s) => Math.abs(s.impliedExante - p0) <= 1).length;
    const maxDriftUp = Math.max(...series.map((s) => s.impliedExante - p0));
    const vols = series.map((s) => s.volExante);
    const finalValue = usedClasses.reduce((s, c) => s + val[c], 0);
    const tgtPct: Record<AssetClass, number> = {} as Record<AssetClass, number>;
    for (const c of usedClasses) tgtPct[c] = tgt[c] * 100;

    return {
      profile: p0,
      targetWeights: tgtPct,
      targetVol: sigma[p0]! * 100,
      series,
      stats: {
        pctOnProfile: (onProfile / series.length) * 100,
        pctWithin1: (within1 / series.length) * 100,
        maxDriftUp,
        rebalances,
        minVol: Math.min(...vols),
        maxVol: Math.max(...vols),
        maxRvWeight: Math.max(...series.map((s) => s.weights.RV ?? 0)),
        taxPaid,
        finalValue,
      },
    };
  }

  // 7. Simular los 10 perfiles con la banda principal
  const profiles = profilesSorted.map((p) => simulate(p, config.band));

  // 8. Tabla de sensibilidad (media de los 10 perfiles por banda)
  const sensBands = config.sensitivityBands ?? [
    { mode: "rel" as BandMode, width: 0.1, label: "±10% rel" },
    { mode: "rel" as BandMode, width: 0.2, label: "±20% rel" },
    { mode: "rel" as BandMode, width: 0.25, label: "±25% rel" },
    { mode: "rel" as BandMode, width: 0.5, label: "±50% rel" },
    { mode: "abs" as BandMode, width: 0.05, label: "±5 pp abs" },
  ];
  const sensitivity = sensBands.map((b) => {
    const res = profilesSorted.map((p) => simulate(p, b));
    return {
      label: b.label,
      pctOnProfile: res.reduce((s, r) => s + r.stats.pctOnProfile, 0) / res.length,
      pctWithin1: res.reduce((s, r) => s + r.stats.pctWithin1, 0) / res.length,
      avgRebalances: res.reduce((s, r) => s + r.stats.rebalances, 0) / res.length,
      totalTax: res.reduce((s, r) => s + r.stats.taxPaid, 0),
      /** Valor final medio neto de impuestos del camino — el beneficio real
       *  para el cliente (más diferimiento → más capital compuesto). */
      avgFinalValue: res.reduce((s, r) => s + r.stats.finalValue, 0) / res.length,
    };
  });

  const bandLabel =
    config.band.mode === "rel"
      ? `±${Math.round(config.band.width * 100)}% rel`
      : `±${(config.band.width * 100).toFixed(0)} pp abs`;

  return {
    family: config.family,
    band: { ...config.band, label: bandLabel },
    window: {
      firstMonth: retMonths[0]!,
      lastMonth: retMonths[retMonths.length - 1]!,
      months: n,
    },
    proxies: Object.fromEntries(usedClasses.map((c) => [c, { name: proxies[c].name }])),
    ladder: profilesSorted.map((p, i) => ({
      profile: p,
      weights: Object.fromEntries(
        usedClasses.map((c) => [c, (ladderRaw.find((r) => r.profile === p)!.w[c]) * 100])
      ) as Record<AssetClass, number>,
      volExante: sigma[p]! * 100,
      upperBound: i < bounds.length ? bounds[i]! * 100 : null,
    })),
    profiles,
    sensitivity,
    warnings,
  };
}
