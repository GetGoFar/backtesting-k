// =============================================================================
// TESTS UNITARIOS — Liga de Fondos Basura
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  aniosEntre,
  calcularCAGR,
  calcularAlfa,
  dineroQuemado,
  asignarCategoria,
  generarSnapshot,
  type NavPoint,
  type FondoCsv,
  type SnapshotLiga,
  type ResultadoFondo,
} from "./liga-engine";

// -----------------------------------------------------------------------------
// Cálculos puros
// -----------------------------------------------------------------------------

describe("aniosEntre", () => {
  it("calcula años entre dos fechas exactas", () => {
    expect(aniosEntre("2020-01-01", "2025-01-01")).toBeCloseTo(5, 2);
  });
  it("maneja años bisiestos", () => {
    expect(aniosEntre("2020-01-01", "2021-01-01")).toBeCloseTo(1, 2);
  });
});

describe("calcularCAGR", () => {
  it("calcula CAGR correctamente", () => {
    // 100 → 200 en 5 años = 14.87%
    expect(calcularCAGR(100, 200, 5)).toBeCloseTo(0.1487, 3);
  });
  it("CAGR negativo cuando hay pérdida", () => {
    expect(calcularCAGR(100, 50, 2)).toBeCloseTo(-0.2929, 3);
  });
  it("null si los inputs son inválidos", () => {
    expect(calcularCAGR(0, 100, 5)).toBeNull();
    expect(calcularCAGR(100, 0, 5)).toBeNull();
    expect(calcularCAGR(100, 100, 0)).toBeNull();
  });
});

describe("dineroQuemado (fórmula publicada)", () => {
  // Fórmula del widget: dq(α,n) = 100000 * (1 - (1+α/100)^n)
  it("alfa cero ⇒ dq cero (fondo iguala benchmark)", () => {
    expect(dineroQuemado(0, 10)).toBeCloseTo(0, 5);
  });
  it("alfa negativa ⇒ dq positivo (perdiste dinero)", () => {
    // alfa = -2% anual durante 10 años → 100000 * (1 - 0.98^10) ≈ 18293
    expect(dineroQuemado(-2, 10)).toBeCloseTo(18293.05, 0);
  });
  it("alfa positiva ⇒ dq negativo (ganaste extra)", () => {
    expect(dineroQuemado(2, 10)).toBeLessThan(0);
  });
  it("inversión personalizable", () => {
    expect(dineroQuemado(-2, 10, 50_000)).toBeCloseTo(9146.52, 0);
  });

  // Reproduce el primer fondo de la liga real (febrero 2026):
  // Santander GO RV Norteamerica A → dq10 ≈ 81440
  it("reproduce dq10 del peor fondo de la liga (Santander GO RV)", () => {
    // El α implícito a 10 años para 81440€ de dq sobre 100k:
    // 81440 = 100000 * (1 - (1+α/100)^10)
    // ⇒ (1+α/100)^10 = 0.1856
    // ⇒ α ≈ -15.55% anual
    // (Esto es brutal pero coherente con un fondo bancario thematic en USA
    // que se ha quedado MUY por detrás del S&P 500.)
    const alfaImplicita = (Math.pow(1 - 81440 / 100000, 1 / 10) - 1) * 100;
    expect(alfaImplicita).toBeCloseTo(-15.5, 0);
    // Aplicando esa misma alfa, recuperamos dq10
    expect(dineroQuemado(alfaImplicita, 10)).toBeCloseTo(81440, 0);
    // Y dq3, dq5 deberían ser coherentes (positivos, monotónicos)
    expect(dineroQuemado(alfaImplicita, 3)).toBeGreaterThan(0);
    expect(dineroQuemado(alfaImplicita, 3)).toBeLessThan(dineroQuemado(alfaImplicita, 5));
    expect(dineroQuemado(alfaImplicita, 5)).toBeLessThan(dineroQuemado(alfaImplicita, 10));
  });
});

describe("calcularAlfa", () => {
  // Helper: genera serie de NAVs con CAGR fijo (composición diaria proporcional)
  function generarSerie(
    nav0: number,
    cagrAnual: number,
    fechaIni: string,
    fechaFin: string,
  ): NavPoint[] {
    const ini = new Date(fechaIni + "T00:00:00Z");
    const fin = new Date(fechaFin + "T00:00:00Z");
    const dias = Math.round((fin.getTime() - ini.getTime()) / (24 * 3600 * 1000));
    const cagrDiario = Math.pow(1 + cagrAnual, 1 / 365.25) - 1;
    const out: NavPoint[] = [];
    for (let i = 0; i <= dias; i++) {
      const d = new Date(ini.getTime() + i * 24 * 3600 * 1000);
      const fecha = d.toISOString().slice(0, 10);
      const nav = nav0 * Math.pow(1 + cagrDiario, i);
      out.push({ date: fecha, nav });
    }
    return out;
  }

  it("alfa = 0 si fondo y benchmark crecen al mismo ritmo", () => {
    const f = generarSerie(100, 0.07, "2018-01-01", "2025-01-01");
    const b = generarSerie(50, 0.07, "2018-01-01", "2025-01-01");
    const r = calcularAlfa(f, b);
    expect(r).not.toBeNull();
    expect(r!.alfaPct).toBeCloseTo(0, 4);
  });

  it("alfa negativa si fondo rinde menos que benchmark", () => {
    const f = generarSerie(100, 0.04, "2018-01-01", "2025-01-01"); // 4%
    const b = generarSerie(100, 0.07, "2018-01-01", "2025-01-01"); // 7%
    const r = calcularAlfa(f, b);
    expect(r).not.toBeNull();
    expect(r!.alfaPct).toBeCloseTo(-3, 1);
  });

  it("alfa positiva si fondo bate al benchmark", () => {
    const f = generarSerie(100, 0.10, "2018-01-01", "2025-01-01");
    const b = generarSerie(100, 0.07, "2018-01-01", "2025-01-01");
    const r = calcularAlfa(f, b);
    expect(r).not.toBeNull();
    expect(r!.alfaPct).toBeGreaterThan(0);
  });

  it("usa solo el rango común de fechas", () => {
    const f = generarSerie(100, 0.07, "2018-01-01", "2025-01-01");
    const b = generarSerie(100, 0.07, "2020-01-01", "2024-01-01");
    const r = calcularAlfa(f, b);
    expect(r).not.toBeNull();
    expect(r!.fechaInicio).toBe("2020-01-01");
    expect(r!.fechaFin).toBe("2024-01-01");
    expect(r!.anos).toBeCloseTo(4, 1);
  });

  it("null si rango común < 1 año", () => {
    const f = generarSerie(100, 0.07, "2024-01-01", "2024-06-01");
    const b = generarSerie(100, 0.07, "2024-01-01", "2024-06-01");
    expect(calcularAlfa(f, b)).toBeNull();
  });

  it("null con series demasiado cortas", () => {
    expect(calcularAlfa([], [])).toBeNull();
    expect(calcularAlfa([{ date: "2024-01-01", nav: 100 }], [])).toBeNull();
  });

  it("ventana 3y aísla los últimos 3 años aunque la serie completa sea más larga", () => {
    // Fondo crece 4% en 2018-2022 (mal vs bench 7%) y luego 10% en 2022-2025 (bate al 7%).
    // El benchmark crece 7% todo el período.
    // Una alfa "rango completo" sale negativa (~ -1%); una alfa de 3y debe ser positiva (~+3%).
    const f1 = generarSerie(100, 0.04, "2018-01-01", "2022-01-01");
    const navInter = f1[f1.length - 1]!.nav;
    const f2 = generarSerie(navInter, 0.10, "2022-01-01", "2025-01-01");
    const fondo = [...f1.slice(0, -1), ...f2];
    const bench = generarSerie(100, 0.07, "2018-01-01", "2025-01-01");

    const alfaCompleta = calcularAlfa(fondo, bench);
    const alfa3y = calcularAlfa(fondo, bench, 3);

    expect(alfaCompleta).not.toBeNull();
    expect(alfa3y).not.toBeNull();
    expect(alfaCompleta!.alfaPct).toBeLessThan(0);   // alfa histórica negativa
    expect(alfa3y!.alfaPct).toBeGreaterThan(0);      // alfa últimos 3 años positiva
    expect(alfa3y!.anos).toBeCloseTo(3, 0);
  });

  it("ventana 10y null si solo hay 7 años de datos comunes", () => {
    const f = generarSerie(100, 0.05, "2018-01-01", "2025-01-01");
    const b = generarSerie(100, 0.07, "2018-01-01", "2025-01-01");
    expect(calcularAlfa(f, b, 10)).toBeNull();
  });
});

describe("asignarCategoria (cuartiles)", () => {
  // 100 fondos, posiciones 1..100
  it("posición 1 → champions", () => {
    expect(asignarCategoria(1, 100)).toBe("champions");
  });
  it("posición 25 → champions", () => {
    expect(asignarCategoria(25, 100)).toBe("champions");
  });
  it("posición 26 → europa", () => {
    expect(asignarCategoria(26, 100)).toBe("europa");
  });
  it("posición 50 → europa", () => {
    expect(asignarCategoria(50, 100)).toBe("europa");
  });
  it("posición 51 → permanencia", () => {
    expect(asignarCategoria(51, 100)).toBe("permanencia");
  });
  it("posición 75 → permanencia", () => {
    expect(asignarCategoria(75, 100)).toBe("permanencia");
  });
  it("posición 76 → descenso", () => {
    expect(asignarCategoria(76, 100)).toBe("descenso");
  });
  it("posición 100 → descenso", () => {
    expect(asignarCategoria(100, 100)).toBe("descenso");
  });
});

// -----------------------------------------------------------------------------
// generarSnapshot — integración con fetcher mockeado
// -----------------------------------------------------------------------------

describe("generarSnapshot", () => {
  function generarSerieFija(cagr: number, fechaIni: string, fechaFin: string): NavPoint[] {
    const ini = new Date(fechaIni + "T00:00:00Z");
    const fin = new Date(fechaFin + "T00:00:00Z");
    const dias = Math.round((fin.getTime() - ini.getTime()) / (24 * 3600 * 1000));
    const cagrDiario = Math.pow(1 + cagr, 1 / 365.25) - 1;
    const out: NavPoint[] = [];
    for (let i = 0; i <= dias; i += 1) {
      const d = new Date(ini.getTime() + i * 24 * 3600 * 1000);
      out.push({ date: d.toISOString().slice(0, 10), nav: 100 * Math.pow(1 + cagrDiario, i) });
    }
    return out;
  }

  const fondoMalo: FondoCsv = {
    isin: "ES0000000001",
    nombre: "Fondo Malo",
    gestora: "Banco X",
    tipo: "Bancario",
    categoria: "RV Global",
    ter_pct: 2.0,
    benchmark_isin: "IE00B4L5Y983",
    benchmark_ticker: "IWDA.AS",
    benchmark_notas: "MSCI World",
    ref_dq3: 0,
    ref_dq5: 0,
    ref_dq10: 0,
  };
  const fondoBueno: FondoCsv = {
    ...fondoMalo,
    isin: "ES0000000002",
    nombre: "Fondo Bueno",
  };

  it("calcula dq y asigna categorías a partir de NAVs mockeados", async () => {
    const serieMala = generarSerieFija(0.04, "2018-01-01", "2025-01-01"); // 4%
    const serieBuena = generarSerieFija(0.08, "2018-01-01", "2025-01-01"); // 8%
    const serieBench = generarSerieFija(0.07, "2018-01-01", "2025-01-01"); // 7%

    const fetcher = async (sim: string): Promise<NavPoint[]> => {
      if (sim === "ES0000000001.EUFUND") return serieMala;
      if (sim === "ES0000000002.EUFUND") return serieBuena;
      if (sim === "IWDA.AS") return serieBench;
      return [];
    };

    const snap = await generarSnapshot([fondoMalo, fondoBueno], {
      apiToken: "test",
      fetcher,
    });

    expect(snap.totalFondos).toBe(2);
    expect(snap.fondosOk).toBe(2);
    expect(snap.fondosStale).toBe(0);

    const malo = snap.fondos.find((f) => f.isin === "ES0000000001")!;
    const bueno = snap.fondos.find((f) => f.isin === "ES0000000002")!;

    expect(malo.alfa).toBeCloseTo(-3, 1);     // 4% - 7%
    expect(bueno.alfa).toBeCloseTo(1, 1);     // 8% - 7%
    expect(malo.dq5).toBeGreaterThan(0);
    expect(bueno.dq5).toBeLessThan(0);

    // Ranking: el malo debe estar el primero (mayor dq5), bueno segundo
    expect(snap.fondos[0]?.isin).toBe("ES0000000001");
    expect(snap.fondos[1]?.isin).toBe("ES0000000002");
    // Con 2 fondos: pos 1/2 = 50% → europa, pos 2/2 = 100% → descenso
    expect(malo.liga).toBe("europa");
    expect(bueno.liga).toBe("descenso");
  });

  it("marca como stale los fondos sin datos EODHD", async () => {
    const serieBench = generarSerieFija(0.07, "2018-01-01", "2025-01-01");
    const fetcher = async (sim: string): Promise<NavPoint[]> => {
      if (sim === "IWDA.AS") return serieBench;
      return []; // todos los fondos fallan
    };

    const fondoConRef: FondoCsv = { ...fondoMalo, ref_dq3: 1000, ref_dq5: 5000, ref_dq10: 20000 };
    const snap = await generarSnapshot([fondoConRef], { apiToken: "test", fetcher });

    expect(snap.fondosOk).toBe(0);
    expect(snap.fondosStale).toBe(1);
    expect(snap.fondos[0]?.stale).toBe(true);
    expect(snap.fondos[0]?.dq5).toBe(5000);   // valor de referencia conservado
    expect(snap.fondos[0]?.alfa).toBeNull();
    expect(snap.fondos[0]?.liga).toBeNull();
  });

  it("deduplica benchmarks (una sola llamada por benchmark único)", async () => {
    const llamadas: string[] = [];
    const serie = generarSerieFija(0.07, "2018-01-01", "2025-01-01");
    const fetcher = async (sim: string): Promise<NavPoint[]> => {
      llamadas.push(sim);
      return serie;
    };

    const fondos = [
      { ...fondoMalo, isin: "ES0000000001" },
      { ...fondoMalo, isin: "ES0000000002" },
      { ...fondoMalo, isin: "ES0000000003" },
    ];
    await generarSnapshot(fondos, { apiToken: "test", fetcher });

    // 3 fondos + 1 benchmark único = 4 llamadas, no 6
    const llamadasBench = llamadas.filter((s) => s === "IWDA.AS");
    expect(llamadasBench.length).toBe(1);
    expect(llamadas.length).toBe(4);
  });

  it("sin snapshot previo, todas las tendencias son sin_ref", async () => {
    const serie = generarSerieFija(0.04, "2018-01-01", "2025-01-01");
    const bench = generarSerieFija(0.07, "2018-01-01", "2025-01-01");
    const fetcher = async (sim: string): Promise<NavPoint[]> => {
      if (sim === "IWDA.AS") return bench;
      return serie;
    };
    const snap = await generarSnapshot([fondoMalo], { apiToken: "test", fetcher });
    expect(snap.fondos[0]?.tendencia).toBe("sin_ref");
    expect(snap.fondos[0]?.dq5Anterior).toBeNull();
    expect(snap.fondos[0]?.deltaDq5).toBeNull();
  });

  it("compara dq5 con snapshot previo y asigna mejorando/empeorando/estable/nuevo", async () => {
    const bench = generarSerieFija(0.07, "2018-01-01", "2025-01-01");
    // Tres fondos: uno empeora, otro mejora, otro estable, uno nuevo (sin previo)
    const fondoEmpeora: FondoCsv = { ...fondoMalo, isin: "ES0000000001" };
    const fondoMejora: FondoCsv = { ...fondoMalo, isin: "ES0000000002" };
    const fondoEstable: FondoCsv = { ...fondoMalo, isin: "ES0000000003" };
    const fondoNuevo: FondoCsv = { ...fondoMalo, isin: "ES0000000099" };

    // CAGR: 4% → α=-3% → dq5 ≈ 14127 (vs previo 12000 → empeora, Δ>500)
    // CAGR: 5% → α=-2% → dq5 ≈  9608 (vs previo 12000 → mejora, Δ<-500)
    // CAGR: 4.5% → α=-2.5% → dq5 ≈ 11890 (vs previo 11900 → estable, |Δ|<500)
    const fetcher = async (sim: string): Promise<NavPoint[]> => {
      if (sim === "IWDA.AS") return bench;
      if (sim === "ES0000000001.EUFUND") return generarSerieFija(0.04, "2018-01-01", "2025-01-01");
      if (sim === "ES0000000002.EUFUND") return generarSerieFija(0.05, "2018-01-01", "2025-01-01");
      if (sim === "ES0000000003.EUFUND") return generarSerieFija(0.045, "2018-01-01", "2025-01-01");
      if (sim === "ES0000000099.EUFUND") return generarSerieFija(0.04, "2018-01-01", "2025-01-01");
      return [];
    };

    // Construyo un snapshot previo manualmente con valores fijos para los 3 primeros fondos
    const previo: SnapshotLiga = {
      generadoEn: "2026-04-23T06:00:00Z",
      totalFondos: 3,
      fondosOk: 3,
      fondosStale: 0,
      inversionRef: 100_000,
      fondos: [
        mockResultado("ES0000000001", 12_000),  // dq5 anterior 12k → ahora ~13.8k → empeoró
        mockResultado("ES0000000002", 12_000),  // dq5 anterior 12k → ahora ~9.2k → mejoró
        mockResultado("ES0000000003", 11_900),  // dq5 anterior 11.9k → ahora ~11.89k → estable (|Δ|<500)
      ],
    };

    const snap = await generarSnapshot(
      [fondoEmpeora, fondoMejora, fondoEstable, fondoNuevo],
      { apiToken: "test", fetcher, snapshotPrevio: previo },
    );

    const get = (isin: string) => snap.fondos.find((f) => f.isin === isin)!;
    expect(get("ES0000000001").tendencia).toBe("empeorando");
    expect(get("ES0000000001").deltaDq5).toBeGreaterThan(0);
    expect(get("ES0000000002").tendencia).toBe("mejorando");
    expect(get("ES0000000002").deltaDq5).toBeLessThan(0);
    expect(get("ES0000000003").tendencia).toBe("estable");
    expect(Math.abs(get("ES0000000003").deltaDq5!)).toBeLessThanOrEqual(500);
    expect(get("ES0000000099").tendencia).toBe("nuevo");
    expect(get("ES0000000099").dq5Anterior).toBeNull();
  });

  it("fondos stale tienen tendencia sin_ref aunque haya previo", async () => {
    const bench = generarSerieFija(0.07, "2018-01-01", "2025-01-01");
    const fetcher = async (sim: string): Promise<NavPoint[]> => {
      if (sim === "IWDA.AS") return bench;
      return []; // fondo sin datos
    };
    const previo: SnapshotLiga = {
      generadoEn: "2026-04-23T06:00:00Z",
      totalFondos: 1,
      fondosOk: 1,
      fondosStale: 0,
      inversionRef: 100_000,
      fondos: [mockResultado("ES0000000001", 5_000)],
    };
    const snap = await generarSnapshot([fondoMalo], {
      apiToken: "test", fetcher, snapshotPrevio: previo,
    });
    expect(snap.fondos[0]?.stale).toBe(true);
    expect(snap.fondos[0]?.tendencia).toBe("sin_ref");
  });
});

function mockResultado(isin: string, dq5: number): ResultadoFondo {
  return {
    isin,
    nombre: "Mock " + isin,
    gestora: "Mock",
    tipo: "Bancario",
    categoria: "RV Global",
    ter: 1.0,
    alfa: -2,
    alfa3: -2,
    alfa5: -2,
    alfa10: -2,
    dq3: dq5 * 0.6,
    dq5,
    dq10: dq5 * 1.6,
    dq5Proyectado: false,
    dq10Proyectado: false,
    liga: "europa",
    fechaInicio: "2018-01-01",
    fechaFin: "2025-01-01",
    anosObservados: 7,
    stale: false,
    tendencia: "sin_ref",
    dq5Anterior: null,
    deltaDq5: null,
  };
}
