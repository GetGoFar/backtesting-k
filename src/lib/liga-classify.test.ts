// =============================================================================
// TESTS — liga-classify
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  classifyFund,
  inferirBenchmark,
  isinValido,
  posicionEnRanking,
  type ClassifyResult,
} from "./liga-classify";
import type { NavPoint, SnapshotLiga, ResultadoFondo } from "./liga-engine";

// -----------------------------------------------------------------------------
// inferirBenchmark
// -----------------------------------------------------------------------------

describe("inferirBenchmark", () => {
  it("USA → S&P 500", () => {
    const r = inferirBenchmark("Santander GO RV Norteamerica A", "RV USA");
    expect(r.benchmark.ticker).toBe("VUSA.AS");
  });
  it("Nasdaq → S&P 500", () => {
    const r = inferirBenchmark("Bankinter EE.UU. Nasdaq 100", "RV Tech");
    expect(r.benchmark.ticker).toBe("VUSA.AS");
  });
  it("Europa → MSCI Europe", () => {
    const r = inferirBenchmark("Sabadell Europa Bolsa Futuro", "RV Europa");
    expect(r.benchmark.ticker).toBe("IMEU.AS");
  });
  it("España / IBEX → BBVAI", () => {
    const r = inferirBenchmark("Bankinter Bolsa España R", "RV España");
    expect(r.benchmark.ticker).toBe("BBVAI.MC");
  });
  it("Emergentes → MSCI EM", () => {
    const r = inferirBenchmark("Kutxabank Bolsa Emergentes", "RV Emergentes");
    expect(r.benchmark.ticker).toBe("AEEM.PA");
  });
  it("Latinoamérica → MSCI EM (proxy)", () => {
    const r = inferirBenchmark("Santander Acciones Latinoamericanas", "");
    expect(r.benchmark.ticker).toBe("AEEM.PA");
  });
  it("RF → Vanguard EUR Gov Bond", () => {
    const r = inferirBenchmark("Santander Renta Fija Privada", "Renta Fija EUR");
    expect(r.benchmark.ticker).toBe("VGEA.AS");
  });
  it("Default sin región específica → MSCI World", () => {
    const r = inferirBenchmark("Santander Sostenible Acciones A", "RV Global");
    expect(r.benchmark.ticker).toBe("IWDA.AS");
  });
  it("Devuelve siempre razón legible", () => {
    const r = inferirBenchmark("Cualquier fondo random", "");
    expect(r.razon).toContain("Default");
  });
});

// -----------------------------------------------------------------------------
// isinValido
// -----------------------------------------------------------------------------

describe("isinValido", () => {
  it("ISIN español válido", () => {
    expect(isinValido("ES0174930000")).toBe(true);
  });
  it("ISIN irlandés válido", () => {
    expect(isinValido("IE00B4L5Y983")).toBe(true);
  });
  it("Rechaza si demasiado corto", () => {
    expect(isinValido("ES01749300")).toBe(false);
  });
  it("Rechaza si formato no es 2 letras + 9 alfanum + 1 dígito", () => {
    expect(isinValido("XXXXXXXXXXXX")).toBe(false);
    expect(isinValido("12ABCDEFGHIJ")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// posicionEnRanking
// -----------------------------------------------------------------------------

function mockSnapshot(dq5s: (number | null)[]): SnapshotLiga {
  const fondos: ResultadoFondo[] = dq5s.map((dq5, i) => ({
    isin: `ES${String(i).padStart(10, "0")}`,
    nombre: `Fondo ${i}`,
    gestora: "Mock",
    tipo: "Bancario",
    categoria: "RV Global",
    ter: 1.5,
    alfa: -2,
    alfa3: -2,
    alfa5: -2,
    alfa10: -2,
    dq3: dq5 != null ? dq5 * 0.6 : null,
    dq5,
    dq10: dq5 != null ? dq5 * 1.6 : null,
    dq3Proyectado: false,
    dq5Proyectado: false,
    dq10Proyectado: false,
    liga: "europa",
    fechaInicio: "2018-01-01",
    fechaFin: "2025-01-01",
    anosObservados: 7,
    stale: dq5 == null,
    tendencia: "sin_ref",
    dq5Anterior: null,
    deltaDq5: null,
  }));
  return {
    generadoEn: "2026-04-30T00:00:00Z",
    totalFondos: dq5s.length,
    fondosOk: dq5s.filter((d) => d != null).length,
    fondosStale: dq5s.filter((d) => d == null).length,
    inversionRef: 100_000,
    fondos,
  };
}

describe("posicionEnRanking", () => {
  // El ranking es por dq3. El mock fija dq3 = dq5 * 0.6, así que con
  // dq5 = [50000, 30000, 10000, -20000] la lista de dq3 (desc) es
  // [30000, 18000, 6000, -12000].
  const snap = mockSnapshot([50000, 30000, 10000, -20000]);

  it("dq3 más alto → posición 1 (champions)", () => {
    const r = posicionEnRanking(40000, snap); // > 30000 (el mayor dq3)
    expect(r.posicion).toBe(1);
    expect(r.zona).toBe("champions");
  });
  it("dq3 entre el 1º y el 2º → posición 2", () => {
    const r = posicionEnRanking(24000, snap); // entre 30000 y 18000
    expect(r.posicion).toBe(2);
  });
  it("dq3 más bajo → última posición (descenso)", () => {
    const r = posicionEnRanking(-30000, snap); // por debajo de -12000
    expect(r.posicion).toBe(5); // 4 existentes + el nuevo
    expect(r.zona).toBe("descenso");
  });
});

// -----------------------------------------------------------------------------
// classifyFund (integración con fetcher mockeado)
// -----------------------------------------------------------------------------

describe("classifyFund", () => {
  function generarSerie(cagr: number, ini: string, fin: string): NavPoint[] {
    const i = new Date(ini + "T00:00:00Z");
    const f = new Date(fin + "T00:00:00Z");
    const dias = Math.round((f.getTime() - i.getTime()) / 86400000);
    const cagrDiario = Math.pow(1 + cagr, 1 / 365.25) - 1;
    const out: NavPoint[] = [];
    for (let n = 0; n <= dias; n++) {
      out.push({
        date: new Date(i.getTime() + n * 86400000).toISOString().slice(0, 10),
        nav: 100 * Math.pow(1 + cagrDiario, n),
      });
    }
    return out;
  }

  it("isin inválido → error 'isin_invalido'", async () => {
    const r = await classifyFund("INVALIDO", {
      apiToken: "x",
      wordpressUrl: "http://example.com",
      snapshot: mockSnapshot([10000, 5000]),
      fetcher: async () => [],
    });
    expect(r.error).toBe("isin_invalido");
  });

  it("ISIN en la liga → fast path con datos del snapshot", async () => {
    const snap = mockSnapshot([10000, 5000]);
    snap.fondos[0]!.isin = "ES0174930000"; // forzar un ISIN concreto
    const r = await classifyFund("ES0174930000", {
      apiToken: "x",
      wordpressUrl: "http://example.com",
      snapshot: snap,
      fetcher: async () => { throw new Error("no debería llamarse"); },
      fondosCsv: [], // skip disk I/O
    });
    expect(r.enLaLiga).toBe(true);
    expect(r.dq5).toBe(10000);
    expect(r.posicionTeorica).toBe(1);
  });

  it("ISIN en la liga → resuelve benchmarkUsado desde CSV inyectado", async () => {
    const snap = mockSnapshot([10000, 5000]);
    snap.fondos[0]!.isin = "ES0174930000";
    const r = await classifyFund("ES0174930000", {
      apiToken: "x",
      wordpressUrl: "http://example.com",
      snapshot: snap,
      fetcher: async () => { throw new Error("no debería llamarse"); },
      fondosCsv: [{
        isin: "ES0174930000",
        nombre: "Test", gestora: "Test", tipo: "Bancario", categoria: "RV EEUU",
        ter_pct: 2, benchmark_isin: "IE00B3XXRP09", benchmark_ticker: "VUSA.AS",
        benchmark_notas: "Vanguard S&P 500", ref_dq3: 0, ref_dq5: 0, ref_dq10: 0,
      }],
    });
    expect(r.benchmarkUsado).not.toBeNull();
    expect(r.benchmarkUsado?.ticker).toBe("VUSA.AS");
    expect(r.benchmarkUsado?.nombre).toContain("Vanguard");
  });
});
