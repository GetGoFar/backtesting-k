import { describe, expect, it } from "vitest";
import { activosParaBacktest, firmaBacktest } from "./backtest-spec";
import type { Posicion } from "./cartera";

const pos = (id: string, isin: string, valor: number, nombre = id, parte: Posicion["parte"] = "nucleo"): Posicion => ({
  id,
  nombre,
  isin,
  categoria: "rv",
  parte,
  valor,
});

describe("activosParaBacktest", () => {
  it("convierte euros en pesos sobre el total de lo que tiene ISIN, con dos decimales", () => {
    const { activos, excluidos } = activosParaBacktest([pos("a", "IE00A", 6000), pos("b", "IE00B", 2000), pos("c", "IE00C", 1000)]);
    expect(activos.map((a) => a.peso)).toEqual([66.67, 22.22, 11.11]);
    expect(activos.map((a) => a.isin)).toEqual(["IE00A", "IE00B", "IE00C"]);
    expect(excluidos).toEqual([]);
    // Nunca viajan euros.
    for (const a of activos) expect(Object.keys(a).sort()).toEqual(["isin", "nombre", "peso"]);
  });

  it("entran todas las partes: Núcleo, Satélite y Play Money", () => {
    const { activos } = activosParaBacktest([pos("a", "IE00A", 5000, "A", "nucleo"), pos("b", "IE00B", 3000, "B", "satelite"), pos("c", "IE00C", 2000, "C", "play")]);
    expect(activos.map((a) => a.peso)).toEqual([50, 30, 20]);
  });

  it("la liquidez y lo sin ISIN quedan fuera, por su nombre, y no cuentan en el total", () => {
    const { activos, excluidos } = activosParaBacktest([pos("a", "IE00A", 8000), pos("liq", "", 2000, "Liquidez"), pos("p", "  ", 500, "Pendiente: oro")]);
    expect(activos).toEqual([{ isin: "IE00A", nombre: "a", peso: 100 }]);
    expect(excluidos).toEqual(["Liquidez", "Pendiente: oro"]);
  });

  it("las posiciones a cero no cuentan ni se listan como excluidas; el ISIN sale en mayúsculas y sin espacios", () => {
    const { activos, excluidos } = activosParaBacktest([pos("a", " ie00a ", 1000), pos("b", "IE00B", 0), pos("liq", "", 0, "Liquidez")]);
    expect(activos).toEqual([{ isin: "IE00A", nombre: "a", peso: 100 }]);
    expect(excluidos).toEqual([]);
  });

  it("sin nada con ISIN no hay activos", () => {
    expect(activosParaBacktest([pos("liq", "", 3000, "Liquidez")])).toEqual({ activos: [], excluidos: ["Liquidez"] });
    expect(activosParaBacktest([])).toEqual({ activos: [], excluidos: [] });
  });
});

describe("firmaBacktest", () => {
  it("es isin:peso de cada posición, ordenada, e ignora el orden y la liquidez", () => {
    const f1 = firmaBacktest([pos("a", "IE00A", 6000), pos("b", "IE00B", 2000)]);
    const f2 = firmaBacktest([pos("b", "IE00B", 2000), pos("a", "IE00A", 6000), pos("liq", "", 999, "Liquidez")]);
    expect(f1).toBe("IE00A:75|IE00B:25");
    expect(f2).toBe(f1);
  });

  it("cambia cuando cambian los pesos y es vacía sin posiciones con ISIN", () => {
    const f1 = firmaBacktest([pos("a", "IE00A", 6000), pos("b", "IE00B", 2000)]);
    const f2 = firmaBacktest([pos("a", "IE00A", 6000), pos("b", "IE00B", 6000)]);
    expect(f2).not.toBe(f1);
    // Mismo reparto con más euros → misma firma: al Backtest solo le importan los pesos.
    expect(firmaBacktest([pos("a", "IE00A", 12000), pos("b", "IE00B", 4000)])).toBe(f1);
    expect(firmaBacktest([pos("liq", "", 3000, "Liquidez")])).toBe("");
  });
});
