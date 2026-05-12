// =============================================================================
// BENCHMARKS — Definición de índices de referencia para comparación
// =============================================================================
//
// Los benchmarks se construyen como "mini-carteras" sobre fondos existentes
// en la base de datos. Esto evita tener que mantener series de índices
// separadas y aprovecha todo el motor de backtesting existente.
//
// =============================================================================

import type { BenchmarkDefinition, BenchmarkId } from "./types";

const BENCHMARKS: BenchmarkDefinition[] = [
  {
    id: "msci-world",
    name: "MSCI World",
    shortName: "MSCI World",
    description: "Renta variable de países desarrollados (iShares Core MSCI World, EUR Acc). Sin emergentes.",
    composition: [{ fundId: "ishares-msci-world", weight: 100 }],
  },
  {
    id: "msci-acwi",
    name: "MSCI ACWI (proxy)",
    shortName: "MSCI ACWI",
    description: "Proxy del MSCI All Country World Index: 88% MSCI World (desarrollados) + 12% MSCI Emerging Markets. Equivalente a FTSE All-World en composición.",
    composition: [
      { fundId: "ishares-msci-world", weight: 88 },
      { fundId: "amundi-emerging", weight: 12 },
    ],
  },
  {
    id: "sp500-eur",
    name: "S&P 500 (EUR)",
    shortName: "S&P 500",
    description: "500 mayores empresas USA (iShares Core S&P 500 UCITS, EUR Acc).",
    composition: [{ fundId: "vanguard-sp500", weight: 100 }],
  },
  {
    id: "msci-em",
    name: "MSCI Emerging Markets",
    shortName: "MSCI EM",
    description: "Renta variable de mercados emergentes (Amundi MSCI EM, EUR Acc).",
    composition: [{ fundId: "amundi-emerging", weight: 100 }],
  },
  {
    id: "euro-stoxx",
    name: "MSCI Europe",
    shortName: "Europa",
    description: "Renta variable europea (iShares Core MSCI Europe, EUR Acc).",
    composition: [{ fundId: "ishares-europe", weight: 100 }],
  },
  {
    id: "global-60-40",
    name: "Cartera 60/40 (Global)",
    shortName: "60/40",
    description: "60% MSCI World + 40% Bonos gobierno EUR. Benchmark clásico de cartera equilibrada.",
    composition: [
      { fundId: "ishares-msci-world", weight: 60 },
      { fundId: "vanguard-eur-bond", weight: 40 },
    ],
  },
  {
    id: "global-80-20",
    name: "Cartera 80/20 (Global)",
    shortName: "80/20",
    description: "80% MSCI World + 20% Bonos gobierno EUR. Benchmark de cartera agresiva moderada.",
    composition: [
      { fundId: "ishares-msci-world", weight: 80 },
      { fundId: "vanguard-eur-bond", weight: 20 },
    ],
  },
  {
    id: "vanguard-global",
    name: "FTSE All-World",
    shortName: "All-World",
    description: "Renta variable global incluyendo emergentes (Vanguard FTSE All-World, EUR Acc).",
    composition: [{ fundId: "vanguard-global", weight: 100 }],
  },
  {
    id: "cash-eur",
    name: "Bonos EUR corto plazo",
    shortName: "Cash EUR",
    description: "Bonos gobierno eurozona 0-1 año (Amundi Prime Euro Gov 0-1Y).",
    composition: [{ fundId: "amundi-gov-0-1y", weight: 100 }],
  },
];

const BENCHMARKS_BY_ID = new Map<BenchmarkId, BenchmarkDefinition>(
  BENCHMARKS.map((b) => [b.id, b])
);

export function getAllBenchmarks(): BenchmarkDefinition[] {
  return BENCHMARKS;
}

export function getBenchmarkById(id: BenchmarkId): BenchmarkDefinition | undefined {
  return BENCHMARKS_BY_ID.get(id);
}
